const path = require('path');
const fs = require('fs');
const { shell } = require('electron');
const { resolveSaveAsDirectory, folderExportName, copyToSaveDirectory, uniqueDestPath } = require('../../vault/fileExport');
const { TransferTask } = require('../../transfer/transferQueue');

async function downloadSharedEntry(client, chatId, entry, report, signal, task) {
  if (Array.isArray(entry.parts) && entry.parts.length > 1) {
    const { runMultiPartDownload } = require('../../vault/multiPartDownload');
    const { sha256Stream } = require('../../vault/streamHash');
    return runMultiPartDownload({
      client,
      chatId,
      channel: {
        tdFileIdFromMessage: (m) => {
          const doc = m?.content?.document;
          const inner = doc?.document ?? doc;
          return inner?.id ?? doc?.id ?? null;
        },
      },
      entry,
      report,
      signal,
      task,
      tdId: (v) => (typeof v === 'number' ? v : Number.parseInt(v, 10) || -1),
      sha256OfAsync: (fp, rep, sig) => sha256Stream(fp, rep, sig),
      stallTimeoutMs: 120_000,
    });
  }

  const msg = await client.invoke({ _: 'getMessage', chat_id: chatId, message_id: entry.messageId });
  const doc = msg?.content?.document;
  const inner = doc?.document ?? doc;
  const fileId = inner?.id ?? doc?.id;
  if (fileId == null) throw new Error('Tin nhắn không có file đính kèm');

  const fileInfo = await client.invoke({ _: 'getFile', file_id: fileId });
  const cached = fileInfo.local || {};
  if (cached.is_downloading_completed && cached.path && fs.existsSync(cached.path)) {
    return cached.path;
  }

  return new Promise((resolve, reject) => {
    let aborted = false;
    const timeout = setTimeout(() => {
      client.off('update', handler);
      reject(new Error('Download timeout — kiểm tra kết nối mạng'));
    }, 30 * 60 * 1000);

    const onAbort = () => {
      aborted = true;
      void client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
      clearTimeout(timeout);
      client.off('update', handler);
      reject(new Error('Người dùng đã hủy quá trình tải'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort);
    }

    const handler = (u) => {
      if (u._ !== 'updateFile') return;
      const file = u.file;
      if (file.id !== fileId) return;
      const local = file.local || {};
      if (file.size > 0) report(local.downloaded_size / file.size);
      if (local.is_downloading_completed) {
        clearTimeout(timeout);
        client.off('update', handler);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(local.path);
      }
    };

    client.on('update', handler);
    client.invoke({ _: 'downloadFile', file_id: fileId, priority: 32, synchronous: false }).catch((e) => {
      clearTimeout(timeout);
      client.off('update', handler);
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(e);
    });
  });
}

function registerSharedVaultHandlers(ipcMain, ctx) {
  ipcMain.handle('sharedVault:list', () => {
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, vaults: [] };
    return { ok: true, vaults: mgr.getDiscoveredVaults() };
  });

  ipcMain.handle('sharedVault:discover', async () => {
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) return { ok: false, error: 'not_ready' };
      await mgr.discover();
      return { ok: true, vaults: mgr.getDiscoveredVaults() };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('sharedVault:scan', async (_evt, { chatId }) => {
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) return { ok: false, error: 'not_ready' };
      await mgr.scanVault(chatId);
      return { ok: true };
    } catch (e) {
      console.error('[TeleVault shared-vault scan error]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('sharedVault:getListing', (_evt, { chatId, folder, sortField, sortDirection }) => {
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, folders: [], files: [] };
    return mgr.getListing(chatId, folder, sortField, sortDirection);
  });

  ipcMain.handle('sharedVault:search', (_evt, { chatId, query }) => {
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, files: [] };
    return mgr.search(chatId, query);
  });

  ipcMain.handle('sharedVault:getStats', (_evt, { chatId }) => {
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, count: 0 };
    return mgr.getStats(chatId);
  });

  ipcMain.handle('sharedVault:downloadFolder', async (_evt, { chatId, folderPath }) => {
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) return { ok: false, error: 'not_ready' };
      if (!folderPath?.endsWith('/')) return { ok: false, error: 'invalid_folder' };

      const files = mgr.getFiles(chatId, folderPath);
      if (!files || files.length === 0) return { ok: false, error: 'Thư mục trống' };

      const db = ctx.getDb();
      const saveDir = await resolveSaveAsDirectory(db);
      if (!saveDir) return { ok: false, cancelled: true };

      const rootName = folderExportName(folderPath);
      const destRoot = path.join(saveDir, rootName);

      const client = ctx.getClient();
      const queue = ctx.getQueue();

      for (const entry of files) {
        const messageId = entry.messageId;
        const relUnderFolder = entry.path.slice(folderPath.length);
        const relativePath = path.join(rootName, relUnderFolder);

        const task = new TransferTask({
          id: `shared_down:${chatId}_${messageId}_${Date.now()}`,
          kind: 'download',
          label: entry.path.split('/').pop(),
          messageId: messageId,
          totalBytes: entry.size || 0,
          metadata: { vaultPath: entry.path },
          run: async (report, signal) => {
            report(0);
            const localPath = await downloadSharedEntry(client, chatId, entry, report, signal, task);
            if (!localPath) throw new Error('Không thể tải file về cục bộ');
            report(1);

            const destDir = path.dirname(relativePath) === '.' ? saveDir : path.join(saveDir, path.dirname(relativePath));
            fs.mkdirSync(destDir, { recursive: true });
            const dest = uniqueDestPath(destDir, path.basename(relativePath));
            fs.copyFileSync(localPath, dest);
          },
        });
        queue.add(task).catch(() => {});
      }

      shell.showItemInFolder(destRoot);
      return { ok: true, saved: files.length, failed: 0, destRoot, total: files.length };
    } catch (e) {
      console.error('[sharedVault:downloadFolder]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('sharedVault:download', async (_evt, { chatId, messageId }) => {
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) return { ok: false, error: 'not_ready' };
      const info = mgr.getDownloadInfo(chatId, messageId);
      if (!info) return { ok: false, error: 'not_found' };

      const db = ctx.getDb();
      const saveDir = await resolveSaveAsDirectory(db);
      if (!saveDir) return { ok: false, cancelled: true };

      const client = ctx.getClient();
      const fileName = info.entry.path.split('/').pop() || 'download';
      const queue = ctx.getQueue();

      const task = new TransferTask({
        id: `shared_down:${chatId}_${messageId}_${Date.now()}`,
        kind: 'download',
        label: fileName,
        messageId: messageId,
        totalBytes: info.entry.size || 0,
        metadata: { vaultPath: info.entry.path },
        run: async (report, signal) => {
          report(0);
          const localPath = await downloadSharedEntry(client, chatId, info.entry, report, signal, task);
          if (!localPath) throw new Error('Không thể tải file về cục bộ');

          report(1);
          const destPath = copyToSaveDirectory(localPath, saveDir, fileName);
          shell.showItemInFolder(destPath);
        },
      });

      queue.add(task).catch(() => {});
      return { ok: true, path: path.join(saveDir, fileName) };
    } catch (e) {
      console.error('[sharedVault:download]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });
}

module.exports = { registerSharedVaultHandlers };
