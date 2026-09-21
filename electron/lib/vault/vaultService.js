const fs = require('fs');
const path = require('path');
const {
  encodeCaption,
  decodeCaption,
  dirMarker,
  copyEntry,
  isDir,
  K_TRASH_FOLDER,
  isTrashFolder,
  isInTrash,
  pathInTrash,
  pathFromTrash,
  uniqueVaultPath,
  planFolderRename,
  planFolderDelete,
  planTagRename,
  planTagDelete,
  resolvePathConflicts,
  normalizeFolderTags,
  entryName,
} = require('@televault/core');
const { inputMessageDocument, shouldDisableContentTypeDetection } = require('../telegram/tdApiBuilders');
const { TransferTask } = require('../transfer/transferQueue');
const { sha256Stream } = require('./streamHash');
const { withHashLock } = require('./hashSemaphore');
const { needsSplit } = require('./splitPlanner');
const { runMultiPartUpload } = require('./multiPartUpload');
const { runMultiPartDownload } = require('./multiPartDownload');
const { evictCacheIfNeeded } = require('./cacheEvictor');

/** Stall timeout ported from TeleVault-elpideus upload.py */
const STALL_TIMEOUT_MS = 120 * 1000;

class FolderMoveException extends Error {
  /** @param {'intoDescendant'} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function isMessageNotFoundError(e) {
  if (!e) return false;
  const code = e?.code;
  const msg = String(e?.message || e || '').toLowerCase();
  return (
    code === 404 ||
    (code === 400 && (msg.includes('not found') || msg.includes('message_id_invalid') || msg.includes('message_deleted'))) ||
    msg.includes('message not found') ||
    msg.includes('message_id_invalid') ||
    msg.includes('message deleted') ||
    msg.includes('message_deleted')
  );
}

class VaultService {
  /**
   * @param {{ client: import('tdl').Client, db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>, channel: import('../telegram/channelService').ChannelService, queue: import('../transfer/transferQueue').TransferQueue, chatId: number, onChange?: () => void }} opts
   */
  constructor({ client, db, channel, queue, chatId, onChange, onUploadDone, editPacingMs }) {
    this.client = client;
    this.db = db;
    this.channel = channel;
    this.queue = queue;
    this.chatId = chatId;
    this.onChange = onChange || (() => {});
    this.onUploadDone = onUploadDone || null;
    this.queue.onStatusChange = (task) => {
      this._onTransferStatusChange(task);
      if (
        task.kind === 'upload' &&
        task.status === 'done' &&
        task.destPath &&
        typeof this.onUploadDone === 'function'
      ) {
        void this.onUploadDone(task.destPath);
      }
    };
    /** @type {Set<number>} */
    this._pendingTrashTempIds = new Set();
    /** @type {AbortController | null} */
    this._activeJournalController = null;
    this.editPacingMs = editPacingMs !== undefined
      ? editPacingMs
      : (process.env.NODE_ENV === 'test' ? 0 : 2500);
    this._lastEditTime = 0;
  }

  async handleMessageSendSucceeded(oldId, newId) {
    if (!this._pendingTrashTempIds.has(oldId)) return;
    this._pendingTrashTempIds.delete(oldId);
    if (newId > 0) await this.trashEntries([newId]);
  }

  handleMessageSendFailed(oldId) {
    this._pendingTrashTempIds.delete(oldId);
  }

  _onTransferStatusChange(task) {
    const pid = task.persistId;
    if (pid == null) return;
    if (task.status === 'done' || task.status === 'cancelled') this.db.transferRemove(pid);
    else if (task.status === 'failed') {
      this.db.transferUpdate(pid, {
        status: task.status,
        error: task.error ? String(task.error.message || task.error) : null,
      });
    } else if (task.status === 'running') {
      this.db.transferUpdate(pid, { status: 'running' });
    }
  }

  _tdId(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number.parseInt(v, 10) || -1;
    return -1;
  }

  async _paceEdit(signal) {
    if (!this.editPacingMs || this.editPacingMs <= 0) return;
    const now = Date.now();
    const elapsed = now - this._lastEditTime;
    if (elapsed < this.editPacingMs && this._lastEditTime > 0) {
      const waitMs = this.editPacingMs - elapsed;
      await new Promise((resolve) => {
        const t = setTimeout(resolve, waitMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          resolve();
        }, { once: true });
      });
    }
    this._lastEditTime = Date.now();
  }

  async _editCaption(messageId, caption, signal) {
    if (!messageId || messageId <= 0) return;
    await this._paceEdit(signal);
    if (signal?.aborted) return;
    await this.client.invoke({
      _: 'editMessageCaption',
      chat_id: this.chatId,
      message_id: messageId,
      caption: { _: 'formattedText', text: caption },
    });
  }

  async _editMessageText(messageId, text, signal) {
    if (!messageId || messageId <= 0) return;
    await this._paceEdit(signal);
    if (signal?.aborted) return;
    await this.client.invoke({
      _: 'editMessageText',
      chat_id: this.chatId,
      message_id: messageId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text },
      },
    });
  }

  /** @param {import('@televault/core').VaultEntry} entry */
  async _syncEntryMetadata(entry) {
    if (!entry || !entry.messageId || entry.messageId <= 0) return;
    const payload = encodeCaption(entry);
    if (isDir(entry)) await this._editMessageText(entry.messageId, payload);
    else await this._editCaption(entry.messageId, payload);
  }

  async renameFile(messageId, newPath) {
    const entry = this.db.getAll().find((e) => e.messageId === messageId);
    if (!entry) throw new Error('Entry not found');
    const updated = copyEntry(entry, { path: newPath });
    try {
      await this._syncEntryMetadata(updated);
      this.db.upsert(updated);
    } catch (e) {
      if (isMessageNotFoundError(e)) {
        console.warn(`[VaultService renameFile] Message ${messageId} not found on Telegram. Removing stale entry.`);
        this.db.delete(messageId);
      } else {
        throw e;
      }
    }
    this.onChange();
  }

  async ensureFolderMarker(folderPath, tags) {
    const existing = this.db.getAll().find((e) => isDir(e) && e.path === folderPath);
    if (existing) return existing;
    const normalized = normalizeFolderTags(tags);
    if (normalized.length === 0) return null;
    const marker = dirMarker({ messageId: 0, path: folderPath, tags: normalized });
    await this.client.invoke({
      _: 'sendMessage',
      chat_id: this.chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text: encodeCaption(marker) },
      },
    });
    return null;
  }

  async setFolderTags(folderPath, tags) {
    const normalized = normalizeFolderTags(tags);
    this.db.setFolderTags(folderPath, normalized);
    const marker = this.db.getAll().find((e) => isDir(e) && e.path === folderPath);
    if (marker) {
      const updated = copyEntry(marker, { tags: normalized });
      await this._syncEntryMetadata(updated);
      this.db.upsert(updated);
    } else if (normalized.length > 0) {
      await this.ensureFolderMarker(folderPath, normalized);
    }
    this.onChange();
  }

  _telegramIdsForEntry(entry) {
    const ids = [entry.messageId];
    if (Array.isArray(entry.parts)) {
      for (const part of entry.parts) {
        if (part?.messageId > 0 && !ids.includes(part.messageId)) {
          ids.push(part.messageId);
        }
      }
    }
    return ids;
  }

  async deleteEntries(messageIds, onProgress) {
    if (!messageIds || messageIds.length === 0) {
      return { ok: true, deletedCount: 0, failedCount: 0, deletedIds: [], failedIds: [], error: null };
    }

    const all = this.db.getAll();
    const entryMap = new Map();
    for (const e of all) {
      entryMap.set(e.messageId, e);
    }

    // Map each messageId to its required Telegram IDs (including multipart pieces)
    const items = messageIds.map((id) => {
      const entry = entryMap.get(id);
      const tgIds = entry ? this._telegramIdsForEntry(entry) : [id];
      return { entryId: id, telegramIds: tgIds };
    });

    // Chunk into batches with at most CHUNK_SIZE Telegram IDs (staying well under Telegram's 100 limit)
    const CHUNK_SIZE = 50;
    /** @type {Array<{ entryIds: number[], telegramIds: number[] }>} */
    const chunks = [];
    let curEntryIds = [];
    let curTgIds = [];

    for (const item of items) {
      if (curTgIds.length + item.telegramIds.length > CHUNK_SIZE && curTgIds.length > 0) {
        chunks.push({ entryIds: curEntryIds, telegramIds: [...new Set(curTgIds)] });
        curEntryIds = [];
        curTgIds = [];
      }
      curEntryIds.push(item.entryId);
      curTgIds.push(...item.telegramIds);
    }
    if (curEntryIds.length > 0) {
      chunks.push({ entryIds: curEntryIds, telegramIds: [...new Set(curTgIds)] });
    }

    const total = messageIds.length;
    const deletedIds = [];
    const failedIds = [];
    const errors = [];

    onProgress?.({
      done: 0,
      total,
      percent: 0,
    });

    for (const chunk of chunks) {
      const journalId = this.db.journalAdd('deleteBatch', {
        messageIds: chunk.entryIds,
        telegramIds: chunk.telegramIds,
      });

      try {
        if (chunk.telegramIds.length > 0) {
          await this.client.invoke({
            _: 'deleteMessages',
            chat_id: this.chatId,
            message_ids: chunk.telegramIds,
            revoke: true,
          });
        }
        for (const id of chunk.entryIds) {
          this.db.delete(id);
          deletedIds.push(id);
        }
        this.db.journalRemove(journalId);
      } catch (err) {
        this.db.journalRemove(journalId);
        const errMsg = String(err?.message || err || 'Delete error');
        errors.push(errMsg);
        failedIds.push(...chunk.entryIds);
      }

      onProgress?.({
        done: deletedIds.length,
        total,
        percent: total > 0 ? Math.round((deletedIds.length / total) * 100) : 100,
      });
    }

    if (deletedIds.length > 0) {
      this.onChange();
    }

    return {
      ok: failedIds.length === 0,
      deletedCount: deletedIds.length,
      failedCount: failedIds.length,
      deletedIds,
      failedIds,
      error: errors.length > 0 ? errors.join('; ') : null,
    };
  }

  async ensureTrashFolder() {
    const all = this.db.getAll();
    if (all.some((e) => isDir(e) && e.path === K_TRASH_FOLDER)) return;
    await this.createFolder(K_TRASH_FOLDER);
  }

  async trashEntries(messageIds) {
    if (messageIds.length === 0) return;
    await this.ensureTrashFolder();
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    for (const id of messageIds) {
      const entry = all.find((e) => e.messageId === id);
      if (!entry || isInTrash(entry.path)) continue;
      if (id < 0) {
        this._pendingTrashTempIds.add(id);
        continue;
      }
      const dest = uniqueVaultPath(pathInTrash(entry.path), paths);
      paths.push(dest);
      await this.renameFile(id, dest);
    }
  }

  async trashFolder(folder) {
    if (isTrashFolder(folder) || isInTrash(folder)) {
      await this.deleteFolderPermanently(folder);
      return;
    }
    await this.ensureTrashFolder();
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    const dest = uniqueVaultPath(pathInTrash(folder), paths);
    await this.renameFolder(folder, dest);
  }

  async deleteFolderPermanently(folder) {
    const steps = planFolderDelete(this.db.getAll(), folder);
    await this._runJournaled(steps.map((s) => ['delete', { messageId: s.messageId }]));
  }

  async restoreEntries(messageIds) {
    if (messageIds.length === 0) return;
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    for (const id of messageIds) {
      const entry = all.find((e) => e.messageId === id);
      if (!entry || !isInTrash(entry.path) || isDir(entry)) continue;
      const dest = uniqueVaultPath(pathFromTrash(entry.path), paths);
      paths.push(dest);
      await this.renameFile(id, dest);
    }
  }

  async restoreFolder(folder) {
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    let dest = uniqueVaultPath(pathFromTrash(folder), paths);
    if (!dest.endsWith('/')) dest = `${dest}/`;
    await this.renameFolder(folder, dest);
  }

  async createFolder(folderPath) {
    const marker = dirMarker({ messageId: 0, path: folderPath });
    await this.client.invoke({
      _: 'sendMessage',
      chat_id: this.chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text: encodeCaption(marker) },
      },
    });
  }

  checkDuplicate(sha256) {
    return this.db.findBySha(sha256);
  }

  async _runJournaled(steps, onProgress, signal) {
    const total = steps.length;
    const ids = steps.map(([op, args]) => this.db.journalAdd(op, args));
    let completed = 0;
    let cancelled = false;

    for (let i = 0; i < steps.length; i += 1) {
      if (signal?.aborted) {
        cancelled = true;
        for (let j = i; j < ids.length; j += 1) {
          this.db.journalRemove(ids[j]);
        }
        break;
      }

      const [op, args] = steps[i];
      let itemName = '';
      if (args.caption) {
        const decoded = decodeCaption(args.messageId, args.caption);
        if (decoded) itemName = entryName(decoded);
      }

      onProgress?.({
        current: completed + 1,
        total,
        name: itemName,
        phase: 'moving',
      });

      try {
        await this._applyJournalStep(op, args, signal);
      } catch (e) {
        if (isMessageNotFoundError(e)) {
          console.warn('[VaultService _runJournaled] Message not found on Telegram, pruning local record:', args);
          if (args?.messageId) {
            this.db.delete(args.messageId);
          }
        } else {
          throw e;
        }
      }
      this.db.journalRemove(ids[i]);
      completed += 1;
    }

    this.onChange();
    return { ok: !cancelled, cancelled, completed, total };
  }

  async _applyJournalStep(op, args, signal) {
    switch (op) {
      case 'editCaption': {
        const messageId = args.messageId;
        const caption = args.caption;
        const decoded = decodeCaption(messageId, caption);
        try {
          if (messageId > 0) {
            if (decoded && isDir(decoded)) {
              try {
                await this._editMessageText(messageId, caption, signal);
              } catch (err) {
                const msg = String(err?.message || '').toLowerCase();
                if (msg.includes('content_type') || msg.includes('caption')) {
                  await this._editCaption(messageId, caption, signal);
                } else {
                  throw err;
                }
              }
            } else {
              try {
                await this._editCaption(messageId, caption, signal);
              } catch (err) {
                const msg = String(err?.message || '').toLowerCase();
                if (msg.includes('content_type') || msg.includes('text') || msg.includes('message is not')) {
                  await this._editMessageText(messageId, caption, signal);
                } else {
                  throw err;
                }
              }
            }
          }
          if (decoded) this.db.upsert(decoded);
        } catch (e) {
          if (isMessageNotFoundError(e)) {
            console.warn(`[VaultService] Message ${messageId} not found on Telegram, pruning from local DB`);
            if (messageId) this.db.delete(messageId);
          } else {
            throw e;
          }
        }
        break;
      }
      case 'delete': {
        const entry = this.db.getAll().find((e) => e.messageId === args.messageId);
        const ids = entry ? this._telegramIdsForEntry(entry) : [args.messageId];
        try {
          await this.client.invoke({
            _: 'deleteMessages',
            chat_id: this.chatId,
            message_ids: ids,
            revoke: true,
          });
        } catch (e) {
          if (!isMessageNotFoundError(e)) {
            const code = e?.code;
            if (code !== 404 && code !== 400) throw e;
          }
        }
        this.db.delete(args.messageId);
        break;
      }
      case 'deleteBatch': {
        const telegramIds = args.telegramIds || [];
        if (telegramIds.length > 0) {
          try {
            await this.client.invoke({
              _: 'deleteMessages',
              chat_id: this.chatId,
              message_ids: telegramIds,
              revoke: true,
            });
          } catch (e) {
            if (!isMessageNotFoundError(e)) {
              const code = e?.code;
              if (code !== 404 && code !== 400) throw e;
            }
          }
        }
        for (const mid of (args.messageIds || [])) {
          this.db.delete(mid);
        }
        break;
      }
      default:
        break;
    }
  }

  cancelJournalResume({ prune = false } = {}) {
    if (this._activeJournalController) {
      if (prune) this._activeJournalController.pruneOnAbort = true;
      this._activeJournalController.abort();
      this._activeJournalController = null;
      return true;
    }
    return false;
  }

  async resumePendingJournal(onProgress, signal) {
    const internalController = signal ? null : new AbortController();
    if (internalController) this._activeJournalController = internalController;
    const activeSignal = signal || internalController?.signal;

    const items = this.db.journalPending();
    const total = items.length;
    let completed = 0;
    let cancelled = false;

    for (const item of items) {
      if (activeSignal?.aborted) {
        cancelled = true;
        if (activeSignal.pruneOnAbort || internalController?.pruneOnAbort) {
          for (const remaining of this.db.journalPending()) {
            this.db.journalRemove(remaining.id);
          }
        }
        break;
      }
      try {
        let name = '';
        if (item.args?.caption) {
          const decoded = decodeCaption(item.args.messageId, item.args.caption);
          if (decoded) name = entryName(decoded);
        }
        onProgress?.({ current: completed + 1, total, name, phase: 'resuming' });
        await this._applyJournalStep(item.op, item.args, activeSignal);
        this.db.journalRemove(item.id);
        completed += 1;
      } catch (e) {
        if (isMessageNotFoundError(e)) {
          console.warn('[VaultService resumePendingJournal] Message not found, pruning journal item and local entry:', item);
          this.db.journalRemove(item.id);
          if (item.args?.messageId) this.db.delete(item.args.messageId);
          completed += 1;
        } else {
          const code = e?.code;
          if (code === 404 || code === 400) this.db.journalRemove(item.id);
          else throw e;
        }
      }
    }
    if (this._activeJournalController === internalController) {
      this._activeJournalController = null;
    }
    if (completed > 0) this.onChange();
    return { ok: !cancelled, cancelled, completed, total };
  }

  async renameFolder(from, to, onProgress, signal) {
    const all = this.db.getAll();
    const steps = planFolderRename(all, from, to);
    const byId = Object.fromEntries(all.map((e) => [e.messageId, e]));
    this.db.renameFolderTagsPath(from, to);
    const journalSteps = [];
    for (const s of steps) {
      const entry = byId[s.messageId];
      if (!entry) continue;
      const updated = copyEntry(entry, { path: s.newPath });
      if (s.messageId <= 0) {
        this.db.upsert(updated);
      } else {
        journalSteps.push([
          'editCaption',
          {
            messageId: s.messageId,
            caption: encodeCaption(updated),
          },
        ]);
      }
    }
    if (journalSteps.length === 0) {
      this.onChange();
      return { ok: true, completed: 0, total: 0 };
    }
    return await this._runJournaled(journalSteps, onProgress, signal);
  }

  async moveFolder(folder, destParent, onProgress, signal) {
    return await this.moveEntries([], [folder], destParent, onProgress, signal);
  }

  async moveFile(messageId, destFolder, onProgress, signal) {
    return await this.moveEntries([messageId], [], destFolder, onProgress, signal);
  }

  async moveEntries(messageIds = [], folders = [], destFolder, onProgress, signal) {
    const all = this.db.getAll();
    const paths = all.map((e) => e.path);
    const byId = Object.fromEntries(all.map((e) => [e.messageId, e]));
    const normalizedDest = destFolder.endsWith('/') ? destFolder : `${destFolder}/`;
    const steps = [];

    for (const messageId of messageIds) {
      const entry = byId[messageId];
      if (!entry || isDir(entry)) continue;
      const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
      let dest = `${normalizedDest}${name}`;
      if (paths.includes(dest)) dest = uniqueVaultPath(dest, paths);
      paths.push(dest);
      const updated = copyEntry(entry, { path: dest });
      if (messageId <= 0) {
        this.db.upsert(updated);
      } else {
        steps.push([
          'editCaption',
          {
            messageId,
            caption: encodeCaption(updated),
          },
        ]);
      }
    }

    for (const folder of folders) {
      const name = folder.slice(0, -1).split('/').pop();
      let to = `${normalizedDest}${name}/`;
      if (to === folder) continue;
      if (to.startsWith(folder)) throw new FolderMoveException('intoDescendant');
      if (paths.includes(to)) {
        to = uniqueVaultPath(to, paths);
        if (!to.endsWith('/')) to = `${to}/`;
      }
      paths.push(to);
      this.db.renameFolderTagsPath(folder, to);
      const folderSteps = planFolderRename(all, folder, to);
      for (const s of folderSteps) {
        const entry = byId[s.messageId];
        if (!entry) continue;
        const updated = copyEntry(entry, { path: s.newPath });
        if (s.messageId <= 0) {
          this.db.upsert(updated);
        } else {
          steps.push([
            'editCaption',
            {
              messageId: s.messageId,
              caption: encodeCaption(updated),
            },
          ]);
        }
      }
    }

    if (steps.length === 0) {
      this.onChange();
      return { ok: true, completed: 0, total: 0 };
    }
    return await this._runJournaled(steps, onProgress, signal);
  }

  async renameTag(from, to) {
    const all = this.db.getAll();
    const steps = planTagRename(all, from, to);
    const byId = Object.fromEntries(all.map((e) => [e.messageId, e]));
    this.db.renameTagName(from, to);
    await this._runJournaled(
      steps.map((s) => [
        'editCaption',
        {
          messageId: s.messageId,
          caption: encodeCaption(copyEntry(byId[s.messageId], { tags: s.newTags })),
        },
      ]),
    );
  }

  async deleteTag(tag) {
    this.db.deleteTagName(tag);
    const all = this.db.getAll();
    const steps = planTagDelete(all, tag);
    const byId = Object.fromEntries(all.map((e) => [e.messageId, e]));
    await this._runJournaled(
      steps.map((s) => [
        'editCaption',
        {
          messageId: s.messageId,
          caption: encodeCaption(copyEntry(byId[s.messageId], { tags: s.newTags })),
        },
      ]),
    );
  }

  /**
   * Streaming SHA-256 with optional progress (hashing phase = first 5% of bar).
   * @param {string} filePath
   * @param {(f: number) => void} [report]
   * @param {AbortSignal} [signal]
   */
  async _sha256OfAsync(filePath, report, signal) {
    return withHashLock(() =>
      sha256Stream(filePath, {
        onProgress: (fraction) => report?.(fraction * 0.05),
        signal,
      }),
    );
  }

  async _isUploadAlreadyOnVault(p) {
    const { localPath, destPath } = p;
    if (!localPath || !destPath || !fs.existsSync(localPath)) return false;
    const entry = typeof this.db.getEntriesByPath === 'function'
      ? this.db.getEntriesByPath(destPath).find((e) => !isInTrash(e.path))
      : this.db.getAll().find((e) => e.path === destPath && !isInTrash(e.path));
    if (!entry) return false;
    const size = fs.statSync(localPath).size;
    if (entry.size !== size) return false;
    const sha = await this._sha256OfAsync(localPath);
    return entry.sha256 === sha;
  }

  async _isDownloadAlreadyComplete(entry) {
    if (!entry.localPath || !fs.existsSync(entry.localPath)) return false;
    const actual = await this._sha256OfAsync(entry.localPath);
    return actual === entry.sha256;
  }

  /**
   * @param {string} localPath
   * @param {string} destPath
   * @param {{ metadata?: Record<string, unknown> }} [options]
   */
  async enqueueUpload(localPath, destPath, options = {}) {
    if (!fs.existsSync(localPath)) {
      throw new Error(`File không tồn tại — thử chọn lại: ${localPath}`);
    }
    const size = fs.statSync(localPath).size;
    const existingEntries = typeof this.db.getEntriesByPath === 'function'
      ? this.db.getEntriesByPath(destPath).filter((e) => !isInTrash(e.path))
      : this.db.getAll().filter((e) => e.path === destPath && !isInTrash(e.path));
    const existingEntry = existingEntries[0] || null;
    const knownSha = options.sha256 || options.metadata?.sha256 || null;
    if (existingEntry && existingEntry.size === size && existingEntry.sha256) {
      const sha = knownSha || (await this._sha256OfAsync(localPath));
      if (sha === existingEntry.sha256) {
        return { skipped: true, reason: 'duplicate', task: null, done: Promise.resolve() };
      }
    }

    const label = path.basename(destPath);
    const persistId = this.db.transferAdd({
      kind: 'upload',
      label,
      localPath,
      destPath,
      size,
    });
    const task = new TransferTask({
      id: `up:${persistId}`,
      kind: 'upload',
      label,
      localPath,
      destPath,
      totalBytes: size,
      persistId,
      metadata: { vaultPath: destPath, sha256: knownSha, ...(options.metadata || {}) },
      run: async (report, signal) => this._runUpload(localPath, destPath, report, signal, task),
    });
    const done = this.queue.add(task);
    return { skipped: false, task, done };
  }

  async _runUpload(localPath, destPath, report, signal, task) {
    if (!fs.existsSync(localPath)) {
      throw new Error(`File không tồn tại — thử chọn lại: ${localPath}`);
    }
    const knownSha = task?.metadata?.sha256 || null;
    if (task && !knownSha) task.phase = 'hashing';
    const sha = knownSha || (await this._sha256OfAsync(localPath, report, signal));
    const stat = fs.statSync(localPath);

    const existingEntry = typeof this.db.getEntriesByPath === 'function'
      ? this.db.getEntriesByPath(destPath).find((e) => !isInTrash(e.path))
      : this.db.getAll().find((e) => e.path === destPath && !isInTrash(e.path));
    if (existingEntry && existingEntry.sha256 === sha && existingEntry.size === stat.size) {
      if (task) {
        task.phase = 'done';
        task.metadata = { ...(task.metadata || {}), duplicate: true };
      }
      report(1);
      return;
    }

    if (needsSplit(stat.size)) {
      await runMultiPartUpload({
        client: this.client,
        chatId: this.chatId,
        channel: this.channel,
        db: this.db,
        localPath,
        destPath,
        sha256: sha,
        size: stat.size,
        report,
        signal,
        task,
        awaitUploadComplete: (tempId, progressFn, uploadFileId, abortSignal) =>
          this._awaitUploadComplete(tempId, progressFn, uploadFileId, abortSignal),
        editCaption: (messageId, caption) => this._editCaption(messageId, caption),
        tdId: (v) => this._tdId(v),
        onChange: () => this.onChange(),
      });
      return;
    }

    const entry = {
      messageId: 0,
      path: destPath,
      size: stat.size,
      sha256: sha,
      mtime: new Date(),
      tags: [],
    };
    if (task) task.phase = 'uploading';
    this.channel.markUploadPath(destPath);
    let messageId = null;
    let tempId = null;
    try {
      const sent = await this.client.invoke({
        _: 'sendMessage',
        chat_id: this.chatId,
        input_message_content: inputMessageDocument({
          filePath: localPath,
          captionText: encodeCaption(entry),
          disableContentTypeDetection: shouldDisableContentTypeDetection(localPath),
        }),
      });
      tempId = this._tdId(sent.id ?? sent.message?.id);
      if (tempId < 0) throw new Error('sendMessage không trả message id');
      this.channel.markUploadPending(tempId);
      const uploadFileId = this.channel.tdFileIdFromMessage(
        /** @type {Record<string, unknown>} */ (sent.message ?? sent),
      );
      if (uploadFileId != null && uploadFileId > 0) {
        void this.client.invoke({
          _: 'setFilePriority',
          file_id: uploadFileId,
          priority: 32,
        }).catch(() => {});
      }
      messageId = await this._awaitUploadComplete(
        tempId,
        (f) => report(0.05 + 0.95 * f),
        uploadFileId,
        signal,
      );
      const msg = await this.client.invoke({
        _: 'getMessage',
        chat_id: this.chatId,
        message_id: messageId,
      });
      const indexed = this.channel.entryFromMessage(
        /** @type {Record<string, unknown>} */ (msg),
      );
      if (indexed) {
        this.db.upsert(indexed);
        this.onChange();
      }
      if (task) task.phase = 'done';
    } finally {
      this.channel.clearUploadPath(destPath);
      if (tempId != null) this.channel.clearUploadPending(tempId, messageId);
    }
  }

  /**
   * @param {number} tempMessageId
   * @param {(f: number) => void} report
   * @param {number | null} uploadFileId
   * @param {AbortSignal} [signal]
   * @returns {Promise<number>}
   */
  _awaitUploadComplete(tempMessageId, report, uploadFileId = null, signal = undefined) {
    return new Promise((resolve, reject) => {
      let realMessageId = null;
      let uploadComplete = false;
      let lastProgressAt = Date.now();
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(stallTimer);
        this.client.off('update', handler);
        if (signal) signal.removeEventListener('abort', onAbort);
      };

      const fail = (err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const onAbort = () => fail(new Error('Người dùng đã hủy quá trình tải lên'));

      const timeout = setTimeout(() => {
        fail(new Error('Upload timeout — kiểm tra kết nối mạng'));
      }, 30 * 60 * 1000);

      const stallTimer = setInterval(() => {
        if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
          fail(new Error('Upload stalled — no progress for 120s'));
        }
      }, 5000);

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort);
      }

      const tryFinish = () => {
        if (realMessageId != null && realMessageId > 0 && uploadComplete) {
          cleanup();
          report(1);
          resolve(realMessageId);
        }
      };

      /** @param {Record<string, unknown>} u */
      const handler = (u) => {
        switch (u._) {
          case 'updateFile': {
            const file = /** @type {Record<string, unknown>} */ (u.file);
            if (uploadFileId != null && this._tdId(file.id) !== uploadFileId) break;
            const remote = /** @type {Record<string, unknown>} */ (file.remote || {});
            const size = Number(file.size) || 0;
            const up = Number(remote.uploaded_size) || 0;
            if (size > 0) {
              lastProgressAt = Date.now();
              report(Math.min(1, up / size));
            }
            if (remote.is_uploading_completed) {
              uploadComplete = true;
              tryFinish();
            }
            break;
          }
          case 'updateMessageSendSucceeded': {
            if (this._tdId(u.old_message_id) === tempMessageId) {
              const msg = /** @type {Record<string, unknown>} */ (u.message || {});
              realMessageId = this._tdId(msg.id);
              lastProgressAt = Date.now();
              tryFinish();
            }
            break;
          }
          case 'updateMessageSendFailed':
            if (this._tdId(u.old_message_id) === tempMessageId) {
              const err = /** @type {Record<string, unknown>} */ (u.error || {});
              fail(new Error(String(err.message || u.error_message || 'Gửi Telegram thất bại')));
            }
            break;
          default:
            break;
        }
      };
      this.client.on('update', handler);
    });
  }

  /** @deprecated use _awaitUploadComplete */
  _awaitSendSucceeded(tempMessageId, report, uploadFileId = null) {
    return this._awaitUploadComplete(tempMessageId, report, uploadFileId);
  }

  enqueueDownload(entry) {
    /** @type {(v: string) => void} */
    let resolvePath;
    /** @type {(e: Error) => void} */
    let rejectPath;
    const pathPromise = new Promise((resolve, reject) => {
      resolvePath = resolve;
      rejectPath = reject;
    });
    const label = entry.path.slice(entry.path.lastIndexOf('/') + 1);
    const persistId = this.db.transferAdd({
      kind: 'download',
      label,
      messageId: entry.messageId,
      size: entry.size,
    });
    const task = new TransferTask({
      id: `down:${persistId}`,
      kind: 'download',
      label,
      messageId: entry.messageId,
      totalBytes: entry.size,
      persistId,
      metadata: { vaultPath: entry.path },
      run: async (report, signal) =>
        this._runDownload(entry, report, resolvePath, rejectPath, signal, task),
    });
    const done = this.queue.add(task);
    return { task, done: pathPromise };
  }

  _evictCacheAfterDownload() {
    try {
      const activeLocalPaths = new Set(
        this.queue.tasks
          .filter((t) => t.status === 'running' || t.status === 'queued')
          .map((t) => t.localPath)
          .filter(Boolean),
      );
      evictCacheIfNeeded({ db: this.db, activeLocalPaths });
    } catch (e) {
      console.warn('[VaultService] cache eviction failed:', e);
    }
  }

  async _runDownload(entry, report, resolvePath, rejectPath, signal, task) {
    try {
      if (Array.isArray(entry.parts) && entry.parts.length > 1) {
        const localPath = await runMultiPartDownload({
          client: this.client,
          chatId: this.chatId,
          channel: this.channel,
          entry,
          report,
          signal,
          task,
          tdId: (v) => this._tdId(v),
          sha256OfAsync: (filePath, progressFn, abortSignal) =>
            this._sha256OfAsync(filePath, progressFn, abortSignal),
          stallTimeoutMs: STALL_TIMEOUT_MS,
        });
        this.db.setLocalPath(entry.messageId, localPath);
        this.db.touchLastUsed?.(entry.messageId);
        this._evictCacheAfterDownload();
        resolvePath(localPath);
        return;
      }

      if (task) task.phase = 'downloading';
      const msg = await this.client.invoke({
        _: 'getMessage',
        chat_id: this.chatId,
        message_id: entry.messageId,
      });
      const fileId = this.channel.tdFileIdFromMessage(msg);
      if (fileId == null || fileId < 0) {
        throw new Error('Tin nhắn không có file đính kèm');
      }
      this.db.setTdFileId(entry.messageId, fileId);

      const fileInfo = await this.client.invoke({ _: 'getFile', file_id: fileId });
      const cached = fileInfo.local || {};
      if (cached.is_downloading_completed && cached.path && fs.existsSync(cached.path)) {
        if (task) task.phase = 'verifying';
        const actual = await this._sha256OfAsync(cached.path, report, signal);
        if (actual !== entry.sha256) {
          throw new Error(`SHA256 không khớp — file có thể bị hỏng`);
        }
        this.db.setLocalPath(entry.messageId, cached.path);
        this.db.touchLastUsed?.(entry.messageId);
        if (task) task.phase = 'done';
        report(1);
        this._evictCacheAfterDownload();
        resolvePath(cached.path);
        return;
      }

      const localPath = await new Promise((resolve, reject) => {
        let aborted = false;
        let lastProgressAt = Date.now();
        let settled = false;

        const cleanup = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          clearInterval(stallTimer);
          this.client.off('update', handler);
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
          if (!aborted && Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
            void this.client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
            fail(new Error('Download stalled — no progress for 120s'));
          }
        }, 5000);

        const onAbort = () => {
          aborted = true;
          void this.client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
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
          if (this._tdId(file.id) !== fileId) return;
          const local = /** @type {Record<string, unknown>} */ (file.local || {});
          const size = Number(file.size) || 0;
          const got = Number(local.downloaded_size) || 0;
          if (size > 0 && !aborted) {
            lastProgressAt = Date.now();
            report(Math.min(0.95, (got / size) * 0.95));
          }
          if (local.is_downloading_completed && local.path && !aborted) {
            cleanup();
            resolve(String(local.path));
          }
        };
        this.client.on('update', handler);
        void this.client.invoke({
          _: 'downloadFile',
          file_id: fileId,
          priority: 32,
          synchronous: false,
        });
      });

      if (!fs.existsSync(localPath)) {
        throw new Error(`TDLib cache không tồn tại: ${localPath}`);
      }
      if (task) task.phase = 'verifying';
      const actual = await this._sha256OfAsync(localPath, (f) => report(0.95 + 0.05 * f), signal);
      if (actual !== entry.sha256) {
        throw new Error(`SHA256 không khớp — file có thể bị hỏng`);
      }
      this.db.setLocalPath(entry.messageId, localPath);
      this.db.touchLastUsed?.(entry.messageId);
      if (task) task.phase = 'done';
      report(1);
      this._evictCacheAfterDownload();
      resolvePath(localPath);
    } catch (e) {
      rejectPath(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  async restorePendingTransfers({ autoStart }) {
    for (const p of this.db.transfersPending()) {
      if (p.status === 'cancelled') {
        this.db.transferRemove(p.id);
        continue;
      }
      if (p.status === 'running') this.db.transferUpdate(p.id, { status: 'queued' });

      if (p.kind === 'upload') {
        if (!p.localPath || !p.destPath) {
          this.db.transferRemove(p.id);
          continue;
        }
        // Failed rows: restore UI only — never re-hash large files during boot.
        if (p.status === 'failed') {
          this.queue.restorePaused(this._taskFromPending(p, 'failed'));
          continue;
        }
        if (!fs.existsSync(p.localPath)) {
          this.db.transferUpdate(p.id, { status: 'failed', error: 'File không tồn tại — thử chọn lại' });
          this.queue.restorePaused(this._taskFromPending(p, 'failed'));
          continue;
        }
        if (await this._isUploadAlreadyOnVault(p)) {
          this.db.transferRemove(p.id);
          continue;
        }
        const task = this._taskFromPending(
          p,
          'paused',
        );
        this.queue.restorePaused(task);
        if (autoStart) {
          this.db.transferUpdate(p.id, { status: 'queued' });
          void this.queue.startTask(task).catch(() => {});
        }
        continue;
      }

      if (p.kind === 'download' && p.messageId != null) {
        const entry = this.db.getAll().find((e) => e.messageId === p.messageId);
        if (!entry) {
          this.db.transferRemove(p.id);
          continue;
        }
        if (await this._isDownloadAlreadyComplete(entry)) {
          this.db.transferRemove(p.id);
          continue;
        }
        const task = this._taskFromPending(
          p,
          p.status === 'failed' ? 'failed' : 'paused',
          entry,
        );
        this.queue.restorePaused(task);
        if (autoStart && p.status !== 'failed') {
          this.db.transferUpdate(p.id, { status: 'queued' });
          void this.queue.startTask(task).catch(() => {});
        }
      }
    }
    const needsPanel = this.queue.tasks.some(
      (t) =>
        t.status === 'queued' ||
        t.status === 'running' ||
        t.status === 'paused' ||
        t.status === 'failed',
    );
    if (!needsPanel) this.queue.clearFinished();
  }

  _taskFromPending(p, status, entry) {
    const task = new TransferTask({
      id: p.kind === 'upload' ? `up:${p.id}` : `down:${p.id}`,
      kind: p.kind,
      label: p.label,
      localPath: p.localPath,
      destPath: p.destPath,
      messageId: p.messageId,
      totalBytes: p.size,
      persistId: p.id,
      run: async () => {},
    });
    task.status = status;
    if (p.error) task.error = new Error(p.error);
    if (p.kind === 'upload' && p.localPath && p.destPath) {
      task.run = (report, signal) => this._runUpload(p.localPath, p.destPath, report, signal, task);
    } else if (entry) {
      let resolvePath;
      let rejectPath;
      const pathPromise = new Promise((res, rej) => {
        resolvePath = res;
        rejectPath = rej;
      });
      task.run = (report, signal) =>
        this._runDownload(entry, report, resolvePath, rejectPath, signal, task);
    }
    return task;
  }

  retryTransfer(task) {
    this.queue.removeTask(task.id);
    if (task.persistId != null) this.db.transferRemove(task.persistId);
    if (task.kind === 'upload' && task.localPath && task.destPath) {
      void this.enqueueUpload(task.localPath, task.destPath)
        .then(({ done }) => done)
        .catch(() => {});
    } else if (task.kind === 'download' && task.messageId != null) {
      const entry = this.db.getAll().find((e) => e.messageId === task.messageId);
      if (entry) {
        const { done } = this.enqueueDownload(entry);
        void Promise.resolve(done).catch(() => {});
      }
    }
  }

  resumeTransfer(task) {
    if (task.persistId != null) this.db.transferUpdate(task.persistId, { status: 'queued' });
    void this.queue.startTask(task).catch(() => {});
  }

  clearFinishedTransfers() {
    for (const t of this.queue.tasks) {
      if ((t.status === 'failed' || t.status === 'done') && t.persistId != null) {
        this.db.transferRemove(t.persistId);
      }
    }
    this.queue.clearFinished();
  }

  /**
   * Rename duplicate vault paths.
   * @param {{ syncRemote?: boolean }} [opts] syncRemote=false keeps boot offline-fast
   *   (local DB only). Remote caption edits are expensive and flood Telegram on large vaults.
   */
  async resolveConflictsNow({ syncRemote = false } = {}) {
    const fixes = resolvePathConflicts(this.db.getAll());
    for (const fix of fixes) {
      try {
        const updated = copyEntry(fix.entry, { path: fix.newPath });
        if (syncRemote) {
          await this._editCaption(fix.entry.messageId, encodeCaption(updated));
        }
        this.db.upsert(updated);
      } catch (e) {
        const code = e?.code;
        if (code === 404 || code === 400) this.db.delete(fix.entry.messageId);
        else throw e;
      }
    }
    this.onChange();
  }
}

module.exports = { VaultService, FolderMoveException };
