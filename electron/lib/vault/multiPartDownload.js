const path = require('path');
const fs = require('fs');
const {
  allocateFile,
  writeAtOffset,
  createPartsTempDir,
  removeTempDir,
} = require('./partFiles');

/**
 * Download a multi-part vault entry and merge shards into one local file.
 *
 * @param {{
 *   client: import('tdl').Client,
 *   chatId: number,
 *   channel: { tdFileIdFromMessage: Function },
 *   entry: { messageId: number, size: number, sha256: string, parts: Array<{ messageId: number, offset: number, size: number }> },
 *   report: (f: number) => void,
 *   signal?: AbortSignal,
 *   task?: { phase: string },
 *   tdId: (v: unknown) => number,
 *   sha256OfAsync: Function,
 *   stallTimeoutMs?: number,
 * }} ctx
 * @returns {Promise<string>} merged local path
 */
async function runMultiPartDownload(ctx) {
  const {
    client,
    chatId,
    channel,
    entry,
    report,
    signal,
    task,
    tdId,
    sha256OfAsync,
    stallTimeoutMs = 120_000,
  } = ctx;

  const parts = entry.parts || [];
  if (parts.length === 0) {
    throw new Error('Multi-part entry has no parts');
  }

  const tmpRoot = createPartsTempDir('download');
  const mergedPath = path.join(tmpRoot, `merged-${entry.messageId}.bin`);
  allocateFile(mergedPath, entry.size);

  if (task) task.phase = 'downloading';

  let bytesDone = 0;
  try {
    for (let i = 0; i < parts.length; i += 1) {
      if (signal?.aborted) throw new Error('Người dùng đã hủy quá trình tải');
      const part = parts[i];
      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: part.messageId,
      });
      const fileId = channel.tdFileIdFromMessage(msg);
      if (fileId == null || fileId < 0) {
        throw new Error(`Part ${i} không có file đính kèm`);
      }

      const partLocalPath = await downloadTdFile({
        client,
        fileId,
        tdId,
        signal,
        stallTimeoutMs,
        onProgress: (fraction) => {
          const overall = (bytesDone + fraction * part.size) / entry.size;
          report(Math.min(0.95, overall * 0.95));
        },
      });

      await writeAtOffset(partLocalPath, mergedPath, part.offset);
      bytesDone += part.size;
      report(Math.min(0.95, (bytesDone / entry.size) * 0.95));
    }

    if (task) task.phase = 'verifying';
    const actual = await sha256OfAsync(mergedPath, (f) => report(0.95 + 0.05 * f), signal);
    if (actual !== entry.sha256) {
      throw new Error('SHA256 không khớp — file multi-part có thể bị hỏng');
    }

    // Move out of temp dir so cleanup does not delete the result.
    const finalPath = path.join(path.dirname(tmpRoot), `televault-file-${entry.messageId}-${Date.now()}.bin`);
    fs.renameSync(mergedPath, finalPath);
    if (task) task.phase = 'done';
    report(1);
    return finalPath;
  } finally {
    removeTempDir(tmpRoot);
  }
}

function downloadTdFile({ client, fileId, tdId, signal, stallTimeoutMs, onProgress }) {
  return new Promise((resolve, reject) => {
    let aborted = false;
    let lastProgressAt = Date.now();
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(stallTimer);
      client.off('update', handler);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    const fail = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const timeout = setTimeout(() => {
      fail(new Error('Download timeout — kiểm tra kết nối mạng'));
    }, 30 * 60 * 1000);

    const stallTimer = setInterval(() => {
      if (!aborted && Date.now() - lastProgressAt > stallTimeoutMs) {
        void client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
        fail(new Error('Download stalled — no progress for 120s'));
      }
    }, 5000);

    const onAbort = () => {
      aborted = true;
      void client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
      fail(new Error('Người dùng đã hủy quá trình tải'));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    /** @param {Record<string, unknown>} u */
    const handler = (u) => {
      if (u._ !== 'updateFile') return;
      const file = /** @type {Record<string, unknown>} */ (u.file);
      if (tdId(file.id) !== fileId) return;
      const local = /** @type {Record<string, unknown>} */ (file.local || {});
      const size = Number(file.size) || 0;
      const got = Number(local.downloaded_size) || 0;
      if (size > 0 && !aborted) {
        lastProgressAt = Date.now();
        onProgress(Math.min(1, got / size));
      }
      if (local.is_downloading_completed && local.path && !aborted) {
        cleanup();
        resolve(String(local.path));
      }
    };

    client.on('update', handler);

    void client
      .invoke({ _: 'getFile', file_id: fileId })
      .then((fileInfo) => {
        const cached = fileInfo.local || {};
        if (cached.is_downloading_completed && cached.path && require('fs').existsSync(cached.path)) {
          cleanup();
          resolve(String(cached.path));
          return;
        }
        return client.invoke({
          _: 'downloadFile',
          file_id: fileId,
          priority: 32,
          synchronous: false,
        });
      })
      .catch(fail);
  });
}

module.exports = { runMultiPartDownload };
