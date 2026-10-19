const fs = require('fs');
const path = require('path');
const { dialog, shell, BrowserWindow } = require('electron');
const { resolveSaveAsDirectory, copyToSaveDirectory, exportVaultFolder } = require('../../vault/fileExport');
const { walkFilesEntries } = require('./vaultShared');

function registerTransferHandlers(ipcMain, ctx, requireVault, guardUpload) {
  ipcMain.handle('vault:pickUploadFiles', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return { ok: true, paths: [] };
    return { ok: true, paths: result.filePaths };
  });

  ipcMain.handle('vault:pickUploadFolder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: true, paths: [] };
    return { ok: true, paths: [result.filePaths[0]] };
  });

  ipcMain.handle('vault:uploadPaths', async (_evt, { localPaths, destFolder }) => {
    try {
      const vault = requireVault();
      const folder = destFolder || '/';
      const queued = [];
      let skipped = 0;
      for (const localPath of localPaths || []) {
        if (!fs.existsSync(localPath)) continue;
        const stat = fs.statSync(localPath);
        if (stat.isDirectory()) {
          const base = path.basename(localPath);
          for (const { rel, full } of walkFilesEntries(localPath)) {
            const dest = `${folder}${base}/${rel}`.replace(/\/+/g, '/');
            if (!(await guardUpload(dest))) {
              return { ok: false, error: 'free_trial_expired', count: queued.length, skipped };
            }
            const result = await vault.enqueueUpload(full, dest);
            if (result.skipped) skipped += 1;
            else queued.push(dest);
          }
        } else {
          const dest = `${folder}${path.basename(localPath)}`.replace(/\/+/g, '/');
          if (!(await guardUpload(dest))) {
            return { ok: false, error: 'free_trial_expired', count: queued.length, skipped };
          }
          const result = await vault.enqueueUpload(localPath, dest);
          if (result.skipped) skipped += 1;
          else queued.push(dest);
        }
      }
      return { ok: true, count: queued.length, skipped };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:download', async (_evt, { messageId }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };

      const saveDir = await resolveSaveAsDirectory(db);
      if (!saveDir) return { ok: false, cancelled: true };

      const { done } = vault.enqueueDownload(entry);
      const localPath = await done;
      const fileName = entry.path.split('/').pop() || 'download';
      const destPath = copyToSaveDirectory(localPath, saveDir, fileName);
      shell.showItemInFolder(destPath);
      return { ok: true, path: destPath, saveDir };
    } catch (e) {
      console.error('[vault:download]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:downloadFolder', async (evt, { folderPath }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      if (!folderPath?.endsWith('/')) return { ok: false, error: 'invalid_folder' };

      const result = await exportVaultFolder({
        db,
        vault,
        folderPrefix: folderPath,
        onProgress: (current, total, name) => {
          evt.sender.send('vault:downloadFolderProgress', { current, total, name, folderPath });
        },
      });
      if (!result) return { ok: false, cancelled: true };
      if (fs.existsSync(result.destRoot)) shell.showItemInFolder(result.destRoot);
      return { ok: true, ...result };
    } catch (e) {
      console.error('[vault:downloadFolder]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:saveAs', async (_evt, { messageId }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      const win = BrowserWindow.getFocusedWindow();
      const defaultDir = db.getSaveAsDirectory() || undefined;
      const fileName = entry.path.split('/').pop() || 'download';
      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultDir ? path.join(defaultDir, fileName) : fileName,
      });
      if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
      const { done } = vault.enqueueDownload(entry);
      const localPath = await done;
      fs.copyFileSync(localPath, result.filePath);
      db.setSaveAsDirectory(path.dirname(result.filePath));
      return { ok: true, path: result.filePath };
    } catch (e) {
      console.error('[vault:saveAs]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:openFile', async (_evt, { messageId }) => {
    try {
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      let localPath = entry.localPath;
      if (!localPath || !fs.existsSync(localPath)) {
        const vault = requireVault();
        const { done } = vault.enqueueDownload(entry);
        localPath = await done;
      }
      db.touchLastUsed(messageId);
      await shell.openPath(localPath);
      return { ok: true, localPath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:readFileText', (_evt, { messageId }) => {
    try {
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry?.localPath) return { ok: false, error: 'not_cached' };
      const text = fs.readFileSync(entry.localPath, 'utf8');
      return { ok: true, text };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:getLocalPath', async (_evt, { messageId }) => {
    try {
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      let localPath = entry.localPath;
      if (!localPath || !fs.existsSync(localPath)) {
        const vault = requireVault();
        const { done } = vault.enqueueDownload(entry);
        localPath = await done;
      }
      return { ok: true, localPath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:getTransfers', () => {
    const queue = ctx.getQueue();
    if (!queue) return { ok: false, tasks: [] };
    return { ok: true, tasks: queue.snapshot() };
  });

  ipcMain.handle('vault:cancelTransfer', (_evt, { taskId }) => {
    ctx.getQueue()?.cancel(taskId);
    return { ok: true };
  });

  ipcMain.handle('vault:clearFinishedTransfers', () => {
    ctx.getVault()?.clearFinishedTransfers();
    return { ok: true };
  });

  ipcMain.handle('vault:retryTransfer', (_evt, { taskId }) => {
    const vault = ctx.getVault();
    const queue = ctx.getQueue();
    if (!vault || !queue) return { ok: false, error: 'not_ready' };
    const task = queue.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: 'not_found' };
    vault.retryTransfer(task);
    return { ok: true };
  });

  ipcMain.handle('vault:resumeTransfer', (_evt, { taskId }) => {
    const vault = ctx.getVault();
    const queue = ctx.getQueue();
    if (!vault || !queue) return { ok: false, error: 'not_ready' };
    const task = queue.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, error: 'not_found' };
    vault.resumeTransfer(task);
    return { ok: true };
  });

  ipcMain.handle('settings:get', () => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    return {
      ok: true,
      locale: db.getSetting('locale', 'vi'),
      theme: db.getSetting('theme', 'light'),
      themePreset: db.getSetting('theme_preset', 'violet'),
      maxConcurrentTransfers: Number(db.getSetting('max_concurrent_transfers', '2')),
      cacheLimitGb: Number(db.getSetting('cache_limit_gb', '2')),
      autoResumeTransfers: db.getAutoResumeTransfers(),
      saveAsDirectory: db.getSaveAsDirectory(),
    };
  });

  ipcMain.handle('settings:pickSaveAsDirectory', async () => {
    if (!ctx.isReady()) return { ok: false };
    const db = ctx.getDb();
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
    db.setSaveAsDirectory(result.filePaths[0]);
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('settings:clearSaveAsDirectory', () => {
    if (!ctx.isReady()) return { ok: false };
    ctx.getDb().clearSaveAsDirectory();
    return { ok: true };
  });

  ipcMain.handle('settings:set', (_evt, settings) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    if (settings.locale != null) db.setSetting('locale', settings.locale);
    if (settings.theme != null) db.setSetting('theme', settings.theme);
    if (settings.themePreset != null) db.setSetting('theme_preset', settings.themePreset);
    if (settings.maxConcurrentTransfers != null) {
      db.setSetting('max_concurrent_transfers', String(settings.maxConcurrentTransfers));
      ctx.getQueue()?.setMaxConcurrent(settings.maxConcurrentTransfers);
    }
    if (settings.cacheLimitGb != null) {
      db.setSetting('cache_limit_gb', String(settings.cacheLimitGb));
      db.setCacheLimitBytes(settings.cacheLimitGb * 1024 * 1024 * 1024);
    }
    if (settings.autoResumeTransfers != null) {
      db.setAutoResumeTransfers(Boolean(settings.autoResumeTransfers));
    }
    if (settings.saveAsDirectory != null) {
      if (settings.saveAsDirectory === '') db.clearSaveAsDirectory();
      else db.setSaveAsDirectory(settings.saveAsDirectory);
    }
    return { ok: true };
  });
}

module.exports = { registerTransferHandlers };
