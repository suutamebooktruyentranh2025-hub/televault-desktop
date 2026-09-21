const path = require('path');
const { encodeCaption, encodePartCaption } = require('@televault/core');
const { inputMessageDocument, shouldDisableContentTypeDetection } = require('../telegram/tdApiBuilders');
const { planSplits } = require('./splitPlanner');
const { extractPartFile, createPartsTempDir, removeTempDir } = require('./partFiles');

/**
 * Two-phase multi-part upload: part 0 (manifest) first, then shards with partOf, then finalize caption.
 *
 * @param {{
 *   client: import('tdl').Client,
 *   chatId: number,
 *   channel: any,
 *   db: { upsert: Function },
 *   localPath: string,
 *   destPath: string,
 *   sha256: string,
 *   size: number,
 *   report: (f: number) => void,
 *   signal?: AbortSignal,
 *   task?: { phase: string, metadata: any },
 *   awaitUploadComplete: Function,
 *   editCaption: Function,
 *   tdId: (v: unknown) => number,
 *   onChange: () => void,
 * }} ctx
 */
async function runMultiPartUpload(ctx) {
  const {
    client,
    chatId,
    channel,
    db,
    localPath,
    destPath,
    sha256,
    size,
    report,
    signal,
    task,
    awaitUploadComplete,
    editCaption,
    tdId,
    onChange,
  } = ctx;

  const plans = planSplits(size);
  const tmpRoot = createPartsTempDir('upload');
  /** @type {string[]} */
  const partPaths = [];
  /** @type {number[]} */
  const uploadedIds = [];
  /** @type {number[]} */
  const pendingTempIds = [];

  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('Người dùng đã hủy quá trình tải lên');
  };

  try {
    if (task) task.phase = 'uploading';
    channel.markUploadPath(destPath);

    for (let i = 0; i < plans.length; i += 1) {
      throwIfAborted();
      const plan = plans[i];
      const partPath = path.join(tmpRoot, `part-${plan.partIndex}.bin`);
      await extractPartFile(localPath, plan.offset, plan.size, partPath);
      partPaths.push(partPath);
      report(0.05 + 0.1 * ((i + 1) / plans.length));
    }

    const provisionalParts = plans.map((plan) => ({
      messageId: 0,
      offset: plan.offset,
      size: plan.size,
    }));
    const entry = {
      messageId: 0,
      path: destPath,
      size,
      sha256,
      mtime: new Date(),
      tags: [],
      parts: provisionalParts,
    };

    // Phase A — upload manifest (part 0)
    {
      throwIfAborted();
      const sent = await client.invoke({
        _: 'sendMessage',
        chat_id: chatId,
        input_message_content: inputMessageDocument({
          filePath: partPaths[0],
          captionText: encodeCaption(entry),
          disableContentTypeDetection: shouldDisableContentTypeDetection(localPath),
        }),
      });
      const tempId = tdId(sent.id ?? sent.message?.id);
      if (tempId < 0) throw new Error('sendMessage không trả message id');
      channel.markUploadPending(tempId);
      pendingTempIds.push(tempId);
      const uploadFileId = channel.tdFileIdFromMessage(
        /** @type {Record<string, unknown>} */ (sent.message ?? sent),
      );
      if (uploadFileId != null && uploadFileId > 0) {
        void client.invoke({
          _: 'setFilePriority',
          file_id: uploadFileId,
          priority: 32,
        }).catch(() => {});
      }
      const messageId = await awaitUploadComplete(
        tempId,
        (f) => report(0.15 + (0.8 / plans.length) * f),
        uploadFileId,
        signal,
      );
      uploadedIds.push(messageId);
      channel.clearUploadPending(tempId, messageId);
    }

    const manifestId = uploadedIds[0];

    // Phase B — upload remaining shards
    for (let i = 1; i < plans.length; i += 1) {
      throwIfAborted();
      const sent = await client.invoke({
        _: 'sendMessage',
        chat_id: chatId,
        input_message_content: inputMessageDocument({
          filePath: partPaths[i],
          captionText: encodePartCaption(manifestId, i),
          disableContentTypeDetection: shouldDisableContentTypeDetection(localPath),
        }),
      });
      const tempId = tdId(sent.id ?? sent.message?.id);
      if (tempId < 0) throw new Error('sendMessage không trả message id');
      channel.markUploadPending(tempId);
      pendingTempIds.push(tempId);
      const uploadFileId = channel.tdFileIdFromMessage(
        /** @type {Record<string, unknown>} */ (sent.message ?? sent),
      );
      if (uploadFileId != null && uploadFileId > 0) {
        void client.invoke({
          _: 'setFilePriority',
          file_id: uploadFileId,
          priority: 32,
        }).catch(() => {});
      }
      const base = 0.15 + (0.8 * i) / plans.length;
      const span = 0.8 / plans.length;
      const messageId = await awaitUploadComplete(
        tempId,
        (f) => report(base + span * f),
        uploadFileId,
        signal,
      );
      uploadedIds.push(messageId);
      channel.clearUploadPending(tempId, messageId);
    }

    // Phase C — finalize manifest caption with real message ids
    const finalParts = plans.map((plan, index) => ({
      messageId: uploadedIds[index],
      offset: plan.offset,
      size: plan.size,
    }));
    const finalEntry = {
      messageId: manifestId,
      path: destPath,
      size,
      sha256,
      mtime: new Date(),
      tags: [],
      parts: finalParts,
    };
    await editCaption(manifestId, encodeCaption(finalEntry));
    db.upsert(finalEntry);
    onChange();
    if (task) {
      task.phase = 'done';
      task.metadata = { ...(task.metadata || {}), parts: finalParts.length };
    }
    report(1);
    return finalEntry;
  } catch (e) {
    if (uploadedIds.length > 0) {
      await client
        .invoke({
          _: 'deleteMessages',
          chat_id: chatId,
          message_ids: uploadedIds,
          revoke: true,
        })
        .catch(() => {});
    }
    throw e;
  } finally {
    for (const tempId of pendingTempIds) channel.clearUploadPending(tempId);
    channel.clearUploadPath(destPath);
    removeTempDir(tmpRoot);
  }
}

module.exports = { runMultiPartUpload };
