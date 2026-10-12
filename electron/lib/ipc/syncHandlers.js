const { dialog, BrowserWindow } = require('electron');
const { safeBroadcast } = require('./vaultHandlers');

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   getDb: () => any,
 *   getSyncService: () => import('../sync/syncService').SyncService | null,
 *   isReady: () => boolean,
 * }} ctx
 */
function registerSyncHandlers(ipcMain, ctx) {
  function broadcastSyncChanged() {
    const sync = ctx.getSyncService();
    const snapshot = sync ? sync.getSnapshot() : null;
    safeBroadcast('sync:changed', snapshot);
  }

  ipcMain.handle('sync:getConfig', () => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    return { ok: true, ...db.getSyncConfig() };
  });

  ipcMain.handle('sync:setConfig', async (_evt, config) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    db.setSyncConfig(config);
    broadcastSyncChanged();
    return { ok: true };
  });

  ipcMain.handle('sync:pickFolder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('sync:getStatus', () => {
    const sync = ctx.getSyncService();
    if (!sync) return { ok: false, status: 'idle' };
    return { ok: true, ...sync.getSnapshot() };
  });

  ipcMain.handle('sync:start', async () => {
    const sync = ctx.getSyncService();
    if (!sync) return { ok: false, error: 'Sync service not available' };
    await sync.start();
    broadcastSyncChanged();
    return { ok: true };
  });

  ipcMain.handle('sync:stop', async () => {
    const sync = ctx.getSyncService();
    if (!sync) return { ok: false };
    await sync.stop();
    broadcastSyncChanged();
    return { ok: true };
  });

  ipcMain.handle('sync:runInitialSync', async (_evt, { strategy }) => {
    const sync = ctx.getSyncService();
    if (!sync) return { ok: false, error: 'Sync service not available' };
    try {
      await sync.runInitialSync(strategy);
      broadcastSyncChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('sync:getInitialCounts', async () => {
    const sync = ctx.getSyncService();
    if (!sync) return { ok: false, localCount: 0, remoteCount: 0 };
    const config = ctx.getDb().getSyncConfig();
    if (!config.syncFolder) return { ok: false, localCount: 0, remoteCount: 0 };

    try {
      const localFiles = sync._scanLocalFiles(config.syncFolder);
      const remoteFiles = sync._getRemoteFiles(config.syncVaultFolder);
      return { ok: true, localCount: localFiles.length, remoteCount: remoteFiles.length };
    } catch (e) {
      console.error('[SyncHandlers] getInitialCounts error:', e);
      return { ok: false, localCount: 0, remoteCount: 0 };
    }
  });

  return { broadcastSyncChanged };
}

module.exports = { registerSyncHandlers };
