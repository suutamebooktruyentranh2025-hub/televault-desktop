const { BrowserWindow, dialog, shell, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { isInTrash } = require('@televault/core');
const { safeBroadcast } = require('./vaultHandlers');
const {
  importGdriveProgressFromAccountDir,
  exportGdriveProgressZip,
  importGdriveProgressZip,
} = require('../gdrive/gdriveProgressImport');

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   getDb: () => any,
 *   getGDriveSyncService: () => import('../gdrive/gdriveSyncService').GDriveSyncService | null,
 *   getSharedVaults?: () => import('../vault/sharedVaultManager').SharedVaultManager | null,
 *   getPersonalVaultChatId?: () => number | null,
 *   isReady: () => boolean,
 *   getActiveAccountId?: () => string | null,
 *   listAccounts?: () => Array<{ id: string, name?: string }>,
 *   getAccountDir?: (id: string) => string,
 *   getAppVersion?: () => string,
 * }} ctx
 */
function registerGDriveHandlers(ipcMain, ctx) {
  let broadcastTimer = null;
  let lastBroadcastTime = 0;

  function broadcastGDriveChanged(immediate = false) {
    const now = Date.now();
    const THROTTLE_MS = 200;

    if (immediate || now - lastBroadcastTime >= THROTTLE_MS) {
      if (broadcastTimer) {
        clearTimeout(broadcastTimer);
        broadcastTimer = null;
      }
      lastBroadcastTime = now;
      const svc = ctx.getGDriveSyncService();
      const snapshot = svc ? svc.getSnapshot() : null;
      safeBroadcast('gdrive:changed', snapshot);
    } else if (!broadcastTimer) {
      broadcastTimer = setTimeout(() => {
        broadcastTimer = null;
        broadcastGDriveChanged(true);
      }, THROTTLE_MS - (now - lastBroadcastTime));
    }
  }

  function broadcastGDriveProgress(payload) {
    safeBroadcast('gdrive:progress', payload);
  }

  ipcMain.handle('gdrive:getStatus', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc && typeof ctx.getDb === 'function') {
      const db = ctx.getDb();
      if (db) {
        const refreshToken = db.gdriveTokenGet?.('refresh_token');
        const accessToken = db.gdriveTokenGet?.('access_token');
        const clientId = db.gdriveTokenGet?.('client_id');
        const clientSecret = db.gdriveTokenGet?.('client_secret');
        const email = db.gdriveTokenGet?.('email');
        const connected = Boolean(refreshToken || accessToken);
        return {
          ok: true,
          connected,
          email: email || '',
          clientId: clientId || '',
          clientSecret: clientSecret || '',
          status: connected ? 'idle' : 'disconnected',
          isPaused: false,
          pendingCount: 0,
          totalCount: 0,
          syncedCount: 0,
          syncQueue: db.gdriveSyncQueueGetAll?.() || [],
          recentSynced: db.gdriveManifestRecent?.() || [],
        };
      }
    }
    if (!svc) return { ok: false, connected: false };
    return { ok: true, ...svc.getSnapshot() };
  });

  ipcMain.handle('gdrive:connect', async (_evt, { clientId, clientSecret }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    try {
      const result = await svc.connect(clientId, clientSecret);
      if (result.ok) svc.startPolling().catch((err) => console.error('[gdrive startPolling failed]', err));
      broadcastGDriveChanged();
      return result;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('gdrive:saveCredentials', (_evt, { clientId, clientSecret }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    const res = svc.saveCredentials(clientId, clientSecret);
    broadcastGDriveChanged();
    return res;
  });

  ipcMain.handle('gdrive:cancelConnect', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.cancelConnect();
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:disconnect', (_evt, opts) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.disconnect(opts);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:listFolder', async (_evt, { folderId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, files: [] };
    try {
      const files = await svc.listDriveFolder(folderId || 'root');
      return { ok: true, files };
    } catch (e) {
      return { ok: false, error: String(e.message || e), files: [] };
    }
  });

  ipcMain.handle('gdrive:addSubscription', async (_evt, sub) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.addSubscription(sub);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:removeSubscription', async (_evt, { driveId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.removeSubscription(driveId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:toggleSubscription', async (_evt, { driveId, enabled }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.toggleSubscription(driveId, enabled);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:getSubscriptions', () => {
    const db = ctx.getDb();
    if (!db) return { ok: false, subscriptions: [] };
    return { ok: true, subscriptions: db.gdriveSubscriptionsAll() };
  });

  ipcMain.handle('gdrive:scanNow', async (_evt, opts = {}) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    if (svc._syncInProgress) {
      return { ok: false, error: 'Đang trong quá trình quét hoặc đồng bộ Google Drive.' };
    }

    // Launch scan asynchronously in background so IPC does not block the UI
    svc.scanNow({ forceIndex: true, ...opts }).catch((e) => {
      console.error('[GDriveSyncService] background scan error:', e);
    });

    return { ok: true, started: true };
  });

  ipcMain.handle('gdrive:abortScan', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    if (typeof svc.abortScan === 'function') {
      svc.abortScan();
    }
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:retryFile', async (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    try {
      const res = await svc.retryFile(driveFileId);
      broadcastGDriveChanged();
      return res;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('gdrive:removeQueueItem', async (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    svc.removeQueueItem(driveFileId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:removeQueueBatch', async (_evt, { driveFileIds }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    if (typeof svc.removeQueueBatch === 'function') {
      svc.removeQueueBatch(driveFileIds);
    } else {
      for (const id of driveFileIds || []) {
        svc.removeQueueItem(id);
      }
    }
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:clearQueue', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    if (typeof svc.clearQueue === 'function') {
      svc.clearQueue();
    } else {
      const db = ctx.getDb();
      db?.gdriveSyncQueueClear?.();
    }
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:skipItem', async (_evt, { driveFileId }) => {
    const db = ctx.getDb();
    if (!db || !driveFileId) return { ok: false };
    db.gdriveSyncQueueRemove?.(driveFileId);
    broadcastGDriveChanged(true);
    return { ok: true };
  });

  ipcMain.handle('gdrive:checkConnection', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    const res = await svc.checkConnection();
    broadcastGDriveChanged();
    return res;
  });

  ipcMain.handle('gdrive:startSync', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    const res = svc.startSync();
    broadcastGDriveChanged();
    return res;
  });

  ipcMain.handle('gdrive:setAutoSyncAfterScan', async (_evt, { enabled }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    const res = svc.setAutoSyncAfterScan(enabled);
    broadcastGDriveChanged();
    return res;
  });

  ipcMain.handle('gdrive:setPaused', async (_evt, { paused }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.setPaused(paused);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setPollInterval', async (_evt, { intervalMs }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.setPollInterval(intervalMs);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setFilters', async (_evt, { ignored, allowed }) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    db.gdriveStateSet('ignored_extensions', ignored || '');
    db.gdriveStateSet('allowed_extensions', allowed || '');
    const svc = ctx.getGDriveSyncService();
    if (svc && typeof svc.purgeIgnoredQueueItems === 'function') {
      svc.purgeIgnoredQueueItems();
    }
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setTempDir', async (_evt, { tempDir }) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    db.gdriveStateSet('temp_download_dir', tempDir || '');
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:openDownloadFolder', async (_evt, { driveFileId, fileName } = {}) => {
    const db = ctx.getDb();
    const customTempDir = db?.gdriveStateGet?.('temp_download_dir', '') || '';
    const defaultTempRoot = app?.getPath ? app.getPath('temp') : (require('os').tmpdir?.() || '/tmp');
    const osTempDir = path.join(defaultTempRoot, 'gdrive-sync');

    // 1. If file name and ID provided, check if the file currently exists on disk
    if (driveFileId && fileName) {
      const safeName = String(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
      const targetFileName = `${driveFileId}_${safeName}`;

      // Check custom temp dir first if configured
      if (customTempDir) {
        try {
          const candidatePath = path.join(customTempDir, targetFileName);
          if (fs.existsSync(candidatePath)) {
            shell.showItemInFolder(candidatePath);
            return { ok: true, path: candidatePath, target: 'file' };
          }
        } catch {
          // ignore EACCES or other filesystem errors
        }
      }

      // Check default OS temp dir
      try {
        const osCandidatePath = path.join(osTempDir, targetFileName);
        if (fs.existsSync(osCandidatePath)) {
          shell.showItemInFolder(osCandidatePath);
          return { ok: true, path: osCandidatePath, target: 'file' };
        }
      } catch {
        // ignore
      }
    }

    // 2. If file not found or not provided, open the active download folder
    let targetFolder = null;
    if (customTempDir) {
      try {
        if (!fs.existsSync(customTempDir)) fs.mkdirSync(customTempDir, { recursive: true });
        targetFolder = customTempDir;
      } catch (err) {
        console.warn(`[gdrive:openDownloadFolder] Custom temp dir "${customTempDir}" inaccessible (${err.code || err.message}), falling back to OS temp dir`);
        targetFolder = null;
      }
    }

    if (!targetFolder) {
      try {
        if (!fs.existsSync(osTempDir)) fs.mkdirSync(osTempDir, { recursive: true });
        targetFolder = osTempDir;
      } catch {
        targetFolder = defaultTempRoot;
      }
    }

    if (targetFolder) {
      await shell.openPath(targetFolder);
      return { ok: true, path: targetFolder, target: 'folder' };
    }
    return { ok: false, error: 'Could not resolve download folder' };
  });

  ipcMain.handle('gdrive:setConflictPolicy', async (_evt, { policy }) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    const allowed_policies = new Set(['skip', 'overwrite', 'keep_both']);
    if (!allowed_policies.has(policy)) {
      return { ok: false, error: 'Invalid conflict policy' };
    }
    db.gdriveStateSet('conflict_policy', policy);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setPropagateDeletes', async (_evt, { enabled }) => {
    const current_db = ctx.getDb();
    if (!current_db) return { ok: false };
    current_db.gdriveStateSet('propagate_deletes', enabled ? '1' : '0');
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:clearErrors', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveSyncErrorsClear();
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:clearHistory', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveManifestClear();
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:removeErrorItem', (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveSyncErrorRemove(driveFileId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:removeHistoryItem', (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveManifestDelete(driveFileId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:listProgressImportSources', () => {
    const activeId = ctx.getActiveAccountId?.();
    const sources = (ctx.listAccounts?.() || [])
      .filter((a) => a.id !== activeId)
      .map((a) => ({ id: a.id, name: a.name || a.id }));
    return { ok: true, sources };
  });

  ipcMain.handle('gdrive:importProgressFromAccount', async (_evt, { sourceAccountId } = {}) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'gdrive_unavailable' };
    const activeId = ctx.getActiveAccountId?.();
    if (!sourceAccountId || sourceAccountId === activeId) {
      return { ok: false, error: 'invalid_source' };
    }
    const sourceDir = ctx.getAccountDir(sourceAccountId);
    const destDir = ctx.getAccountDir(activeId);
    if (!fs.existsSync(path.join(sourceDir, 'index.db'))) {
      return { ok: false, error: 'source_index_db_missing' };
    }
    const wasPaused = svc.isPaused;
    svc.setPaused(true);
    try {
      const result = importGdriveProgressFromAccountDir({
        sourceAccountDir: sourceDir,
        destAccountDir: destDir,
        destDb: svc.db,
      });
      await svc.setSyncTargetChatId(String(result.vaultChatId));
      broadcastGDriveChanged();
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    } finally {
      if (!wasPaused) svc.setPaused(false);
    }
  });

  ipcMain.handle('gdrive:exportProgress', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'gdrive_unavailable' };
    const activeId = ctx.getActiveAccountId?.();
    const sourceDir = ctx.getAccountDir(activeId);
    if (!fs.existsSync(path.join(sourceDir, 'index.db'))) {
      return { ok: false, error: 'source_index_db_missing' };
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const save_result = await dialog.showSaveDialog(win, {
      title: 'Export GDrive sync progress',
      defaultPath: `televault-gdrive-progress-${stamp}.televault-gdrive-progress.zip`,
      filters: [{ name: 'TeleVault GDrive Progress', extensions: ['televault-gdrive-progress.zip', 'zip'] }],
    });
    if (save_result.canceled || !save_result.filePath) {
      return { ok: false, cancelled: true };
    }
    let zip_path = save_result.filePath;
    if (!zip_path.endsWith('.zip')) {
      zip_path = `${zip_path}.televault-gdrive-progress.zip`;
    }

    try {
      const result = await exportGdriveProgressZip({
        sourceAccountDir: sourceDir,
        zipPath: zip_path,
        accountId: activeId,
        appVersion: ctx.getAppVersion?.(),
      });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('gdrive:importProgress', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'gdrive_unavailable' };
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const open_result = await dialog.showOpenDialog(win, {
      title: 'Import GDrive sync progress',
      properties: ['openFile'],
      filters: [{ name: 'TeleVault GDrive Progress', extensions: ['televault-gdrive-progress.zip', 'zip'] }],
    });
    if (open_result.canceled || !open_result.filePaths?.[0]) {
      return { ok: false, cancelled: true };
    }

    const zip_path = open_result.filePaths[0];
    const activeId = ctx.getActiveAccountId?.();
    const destDir = ctx.getAccountDir(activeId);
    const wasPaused = svc.isPaused;
    svc.setPaused(true);
    try {
      const result = await importGdriveProgressZip({
        zipPath: zip_path,
        destAccountDir: destDir,
        destDb: svc.db,
      });
      await svc.setSyncTargetChatId(String(result.vaultChatId));
      broadcastGDriveChanged();
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    } finally {
      if (!wasPaused) svc.setPaused(false);
    }
  });

  ipcMain.handle('gdrive:getSyncTargets', async () => {
    const personalChatId = ctx.getPersonalVaultChatId?.() ?? null;
    const targets = [{
      chatId: '',
      label: 'personal',
      titleKey: 'gdriveSyncTargetPersonal',
      isPersonal: true,
      personalChatId,
    }];
    const mgr = ctx.getSharedVaults?.();
    if (mgr) {
      for (const vault_item of mgr.getDiscoveredVaults()) {
        // Never offer the personal vault as a "shared" duplicate.
        if (personalChatId != null && Number(vault_item.chatId) === Number(personalChatId)) continue;
        targets.push({
          chatId: String(vault_item.chatId),
          label: vault_item.title || String(vault_item.chatId),
          titleKey: null,
          isPersonal: false,
          personalChatId: null,
        });
      }
    }
    const svc = ctx.getGDriveSyncService();
    return {
      ok: true,
      targets,
      selectedChatId: svc ? svc.getSyncTargetChatId() : '',
    };
  });

  ipcMain.handle('gdrive:setSyncTarget', async (_evt, { chatId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    try {
      await svc.setSyncTargetChatId(chatId == null || chatId === '' ? null : chatId);
      broadcastGDriveChanged();
      return { ok: true, syncTargetChatId: svc.getSyncTargetChatId() };
    } catch (e) {
      broadcastGDriveChanged();
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('gdrive:rescanSyncTargetVault', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    const wasPaused = svc.isPaused;
    if (!wasPaused) svc.setPaused(true);
    try {
      const target = svc.getSyncTargetChatId();
      const mgr = ctx.getSharedVaults?.();
      // Shared target: use manager forceRescan so session scanned-flag resets too.
      if (target && mgr && typeof mgr.forceRescanVault === 'function') {
        await svc.setSyncTargetChatId(target);
        svc.scanPhase = 'vault-scanning';
        svc.scanInfo = { messagesScanned: 0 };
        broadcastGDriveChanged();
        try {
          const scanned = await mgr.forceRescanVault(Number(target), (n) => {
            svc.scanInfo = { messagesScanned: n };
            broadcastGDriveChanged();
          });
          await svc.setSyncTargetChatId(target);
          const fileCount = svc._vaultEntries().filter(
            (entry) => !isInTrash(entry.path) && !String(entry.path).endsWith('/'),
          ).length;
          return { ok: true, scanned, fileCount, chatId: Number(target) };
        } finally {
          svc.scanPhase = null;
          svc.scanInfo = null;
          broadcastGDriveChanged();
        }
      }
      const result = await svc.rescanSyncTargetVault();
      broadcastGDriveChanged();
      return { ok: true, ...result };
    } catch (e) {
      broadcastGDriveChanged();
      return { ok: false, error: String(e.message || e) };
    } finally {
      if (!wasPaused) svc.setPaused(false);
    }
  });

  ipcMain.handle('gdrive:queryCacheFiles', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available', items: [], total: 0 };
    try {
      const res = db.gdriveCacheQueryFiles(opts);
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, error: err.message || String(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('gdrive:getCacheSummary', async () => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available' };
    try {
      const summary = db.gdriveCacheSummaryStats();
      return { ok: true, summary };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('gdrive:queryFolderTree', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available', folders: [] };
    try {
      const folders = db.gdriveCacheFolderTree(opts.parentId || null, opts);
      return { ok: true, folders };
    } catch (err) {
      return { ok: false, error: err.message || String(err), folders: [] };
    }
  });

  ipcMain.handle('gdrive:searchFolders', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available', folders: [] };
    try {
      const folders = db.gdriveCacheSearchFolders(opts.search || '', opts.limit || 100, opts);
      return { ok: true, folders };
    } catch (err) {
      return { ok: false, error: err.message || String(err), folders: [] };
    }
  });

  ipcMain.handle('gdrive:getFolderAncestors', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available', ancestors: [] };
    try {
      const ancestors = db.gdriveCacheFolderAncestors(opts.folderId || null);
      return { ok: true, ancestors };
    } catch (err) {
      return { ok: false, error: err.message || String(err), ancestors: [] };
    }
  });

  ipcMain.handle('gdrive:queryFolderChildren', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available', items: [], total: 0 };
    try {
      const res = db.gdriveCacheFolderChildren(opts);
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, error: err.message || String(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('gdrive:syncFolder', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available' };
    const { folderId, includeSubfolders = false } = opts;
    if (!folderId) return { ok: false, error: 'folderId is required' };

    try {
      const svc = ctx.getGDriveSyncService();
      const { files } = db.gdriveCacheSyncFolderFiles(folderId, includeSubfolders);

      // Filter by sync service's file extension rules
      const eligible = files.filter((f) => {
        if (svc && typeof svc._shouldSyncFile === 'function' && !svc._shouldSyncFile(f.name)) return false;
        return true;
      });

      const subs = db.gdriveSubscriptionsAll().filter((s) => s.enabled);
      const queueBatch = eligible.map((node) => {
        const { targetVaultPath, relativePath } = resolveTargetVaultPath(node, subs, db);
        return {
          driveFileId: node.id,
          fileName: node.name,
          drivePath: relativePath || node.name,
          vaultPath: targetVaultPath,
          size: node.size,
          modifiedTime: node.modifiedTime,
          md5Checksum: node.md5Checksum,
        };
      });

      let enqueuedCount = 0;
      if (queueBatch.length > 0) {
        if (typeof db.gdriveSyncQueueAddBatch === 'function') {
          enqueuedCount = db.gdriveSyncQueueAddBatch(queueBatch);
        } else {
          for (const item of queueBatch) {
            db.gdriveSyncErrorRemove(item.driveFileId);
            db.gdriveSyncQueueAdd(item);
            enqueuedCount += 1;
          }
        }
      }

      broadcastGDriveChanged();
      return { ok: true, enqueuedCount };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  function resolveTargetVaultPath(node, subs, db) {
    let targetVaultPath = null;
    let relativePath = null;

    const rawDrivePath = node.drivePath || node.name || '';
    const normalizedNodePath = rawDrivePath.startsWith('/') ? rawDrivePath : `/${rawDrivePath}`;

    for (const sub of subs) {
      if (sub.isFolder) {
        let subDrivePath = sub.drivePath;
        if (typeof db?.gdriveCacheNodesGet === 'function') {
          const folderNode = db.gdriveCacheNodesGet(sub.driveId);
          if (folderNode?.drivePath) subDrivePath = folderNode.drivePath;
        }
        if (subDrivePath) {
          if (!subDrivePath.startsWith('/')) subDrivePath = `/${subDrivePath}`;
          if (!subDrivePath.endsWith('/')) subDrivePath = `${subDrivePath}/`;
        }
        if (subDrivePath && normalizedNodePath.startsWith(subDrivePath)) {
          relativePath = normalizedNodePath.slice(subDrivePath.length);
          targetVaultPath = `${sub.vaultPath}${relativePath}`.replace(/\/+/g, '/');
          break;
        }
      } else if (sub.driveId === node.id) {
        relativePath = node.name;
        targetVaultPath = sub.vaultPath;
        break;
      }
    }

    if (!targetVaultPath) {
      targetVaultPath = `/GoogleDrive${normalizedNodePath}`.replace(/\/+/g, '/');
      relativePath = node.name;
    }

    return { targetVaultPath, relativePath: relativePath || node.name };
  }

  ipcMain.handle('gdrive:requeueCacheFile', async (_evt, { driveFileId } = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available' };
    if (!driveFileId) return { ok: false, error: 'driveFileId is required' };

    try {
      const node = db.gdriveCacheNodesGet(driveFileId);
      if (!node) return { ok: false, error: 'Node not found in cache' };
      if (node.isFolder) return { ok: false, error: 'Cannot enqueue a folder' };

      const svc = ctx.getGDriveSyncService();
      if (svc && typeof svc._shouldSyncFile === 'function' && !svc._shouldSyncFile(node.name)) {
        return { ok: false, error: `Định dạng tệp "${node.name}" nằm trong danh sách bỏ qua (Ignored formats)` };
      }

      const subs = db.gdriveSubscriptionsAll().filter((s) => s.enabled);
      const { targetVaultPath, relativePath } = resolveTargetVaultPath(node, subs, db);

      db.gdriveSyncErrorRemove(driveFileId);
      db.gdriveSyncQueueAdd({
        driveFileId: node.id,
        fileName: node.name,
        drivePath: relativePath || node.name,
        vaultPath: targetVaultPath,
        size: node.size,
        modifiedTime: node.modifiedTime,
        md5Checksum: node.md5Checksum,
      });

      broadcastGDriveChanged();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('gdrive:requeueAllPending', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available' };

    try {
      const svc = ctx.getGDriveSyncService();
      if (svc && typeof svc.reconcileExistingVaultFiles === 'function') {
        try {
          svc.reconcileExistingVaultFiles();
        } catch (recErr) {
          console.warn('[GDrive] Pre-requeue reconcile error:', recErr);
        }
      }

      const queryOpts = {
        limit: opts.limit || 100000,
        offset: 0,
        isFolder: 0,
        search: opts.search || '',
      };
      const pendingFiles = db.gdriveCacheQueryFiles(queryOpts);
      const eligible = pendingFiles.items.filter((item) => {
        if (item.status !== 'pending' && item.status !== 'error') return false;
        if (svc && typeof svc._shouldSyncFile === 'function' && !svc._shouldSyncFile(item.name)) return false;
        return true;
      });
      const subs = db.gdriveSubscriptionsAll().filter((s) => s.enabled);

      const queueBatch = eligible.map((node) => {
        const { targetVaultPath, relativePath } = resolveTargetVaultPath(node, subs, db);
        return {
          driveFileId: node.id,
          fileName: node.name,
          drivePath: relativePath || node.name,
          vaultPath: targetVaultPath,
          size: node.size,
          modifiedTime: node.modifiedTime,
          md5Checksum: node.md5Checksum,
        };
      });

      let enqueuedCount = 0;
      if (queueBatch.length > 0) {
        if (typeof db.gdriveSyncQueueAddBatch === 'function') {
          enqueuedCount = db.gdriveSyncQueueAddBatch(queueBatch);
        } else {
          for (const item of queueBatch) {
            db.gdriveSyncErrorRemove(item.driveFileId);
            db.gdriveSyncQueueAdd(item);
            enqueuedCount += 1;
          }
        }
      }

      broadcastGDriveChanged();
      return { ok: true, enqueuedCount };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('gdrive:exportCacheCsv', async (_evt, opts = {}) => {
    const db = ctx.getDb();
    if (!db) return { ok: false, error: 'Database not available' };
    try {
      const { items } = db.gdriveCacheQueryFiles({ limit: 100000, offset: 0, ...opts });
      const headers = ['ID', 'Tên', 'Đường dẫn Drive', 'Kích thước (Bytes)', 'Loại', 'Thời gian sửa đổi', 'Trạng thái', 'Đường dẫn Vault', 'Lỗi'];
      const rows = items.map((item) => [
        `"${String(item.id).replace(/"/g, '""')}"`,
        `"${String(item.name).replace(/"/g, '""')}"`,
        `"${String(item.drivePath).replace(/"/g, '""')}"`,
        item.size || 0,
        item.isFolder ? 'Thư mục' : 'Tệp',
        `"${String(item.modifiedTime || '').replace(/"/g, '""')}"`,
        `"${String(item.status).replace(/"/g, '""')}"`,
        `"${String(item.vaultPath || '').replace(/"/g, '""')}"`,
        `"${String(item.errorMessage || '').replace(/"/g, '""')}"`,
      ].join(','));
      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      return { ok: true, csvContent };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('gdrive:reconcileExisting', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'GDrive service unavailable' };
    try {
      const res = svc.reconcileExistingVaultFiles();
      broadcastGDriveChanged();
      return res;
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  return { broadcastGDriveChanged, broadcastGDriveProgress };
}

module.exports = { registerGDriveHandlers };
