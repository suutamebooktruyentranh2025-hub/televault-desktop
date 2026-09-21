const { GDriveAuth } = require('./gdriveAuth');
const { GDriveApi } = require('./gdriveApi');
const { ApiRateLimiter } = require('./apiRateLimiter');
const { SyncThrottleController } = require('./syncThrottleController');
const { createSpeedTracker } = require('../transfer/transferMetrics');
const { isAuthError, FRIENDLY_AUTH_ERROR_MSG } = require('./gdriveFloodController');
const { buildVaultLookupIndex } = require('./gdriveDiscovery');

const { downloaderMethods } = require('./gdriveFileDownloader');
const { uploaderMethods } = require('./gdriveFileUploader');
const { queueWorkerMethods } = require('./gdriveQueueWorker');
const { scannerMethods } = require('./gdriveScanner');

/**
 * @typedef {'idle'|'syncing'|'error'|'disconnected'} GDriveSyncStatus
 */

class GDriveSyncService {
  /**
   * @param {{
   *   db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>,
   *   vault: import('../vault/vaultService').VaultService,
   *   onChange?: () => void,
   *   onProgress?: (payload: { currentSyncFile: string|null, currentSyncProgress: number, speedBps: number }) => void,
   *   resolveVault?: (chatId: string|null) => Promise<import('../vault/vaultService').VaultService>,
   *   getPersonalVault?: () => import('../vault/vaultService').VaultService,
   * }} opts
   */
  constructor({ db, vault, onChange, onProgress, resolveVault, getPersonalVault, throttleOpts = {} }) {
    this.db = db;
    this.vault = vault;
    this.onChange = onChange || (() => {});
    this.onProgress = onProgress || (() => {});
    this.resolveVault = resolveVault || (async () => this.vault);
    this.getPersonalVault = getPersonalVault || (() => this.vault);
    this.rateLimiter = new ApiRateLimiter();
    this.throttleController = new SyncThrottleController({
      minConcurrency: 1,
      maxConcurrency: 3,
      scaleUpAfter: 2,
      ...throttleOpts,
    });
    this.auth = new GDriveAuth({
      db,
      onAuthUrl: () => {
        if (typeof this.onChange === 'function') this.onChange();
      },
    });
    this.api = new GDriveApi({ auth: this.auth, rateLimiter: this.rateLimiter });
    /** @type {GDriveSyncStatus} */
    this.isPaused = this.db?.gdriveStateGet?.('is_paused') === '1';
    /** @type {GDriveSyncStatus | 'paused'} */
    this.status = this.isPaused ? 'paused' : (this.auth.isConnected() ? 'idle' : 'disconnected');
    this.lastSyncAt = null;
    this.pendingCount = 0;
    this.lastError = null;
    this.totalCount = 0;
    this.syncedCount = 0;
    this.currentSyncFile = null;
    this.currentSyncProgress = 0;
    this._currentSpeedBps = 0;
    /** @type {'download'|'hash'|'upload'|null} */
    this._syncPhase = null;
    /** @type {number} 0..1 Drive download fraction */
    this._downloadFraction = 0;
    /** @type {number} 0..1 Telegram upload fraction */
    this._uploadFraction = 0;
    this._downloadSpeedTracker = createSpeedTracker();
    this._lastProgressNotifyAt = 0;
    this.scanPhase = null; // 'scanning' | 'syncing' | null
    this.scanInfo = null;  // { currentFolder, filesFound }
    /** @type {NodeJS.Timeout | null} */
    this._pollTimer = null;
    this._lifecycleGeneration = 0;
    this._syncInProgress = false;
    this._queueWorkerRunning = false;
    this._activeWorkers = 0;
    this._workerIdSeq = 0;
    /** @type {Map<string, AbortController>} */
    this._workerControllers = new Map();
    /** @type {AbortController | null} */
    this._retryController = null;
    /** @type {Map<string, Set<string>>} */
    this._folderIdCache = new Map();
    /** @type {number} epoch ms — pause Drive queue/downloads until Telegram flood clears */
    this._telegramFloodUntil = 0;
    const savedPoll = this.db?.gdriveStateGet?.('poll_interval_ms');
    this._pollIntervalMs = savedPoll !== undefined && savedPoll !== null && savedPoll !== '' 
      ? parseInt(savedPoll, 10) 
      : 5 * 60 * 1000; // default 5 min

    if (this.auth.isConnected()) {
      this.pendingCount = this.db.gdriveSyncQueueCount();
      if (!this.isPaused && this.isAutoSyncEnabled()) {
        this._startQueueWorker();
      }
    }

    this._syncTargetReady = this._applySavedSyncTarget().catch((err) => {
      console.warn('[GDriveSyncService] apply sync target failed:', err?.message || err);
    });
  }

  isAutoSyncEnabled() {
    return typeof this.db?.gdriveStateGet === 'function'
      ? this.db.gdriveStateGet('auto_sync_after_scan', '1') !== '0'
      : true;
  }

  /** Vault file index for the active sync target (personal or shared). */
  _vaultEntries() {
    const vault_db = this.vault?.db;
    if (vault_db && typeof vault_db.getAll === 'function') return vault_db.getAll();
    if (typeof this.db?.getAll === 'function') return this.db.getAll();
    return [];
  }

  getSyncTargetChatId() {
    const raw = this.db?.gdriveStateGet?.('sync_target_chat_id', '');
    return raw ? String(raw) : '';
  }

  /**
   * @param {string|number|null|undefined} chatId empty/null = personal vault
   */
  async setSyncTargetChatId(chatId) {
    const normalized = chatId == null || chatId === '' ? '' : String(chatId);
    this.db.gdriveStateSet('sync_target_chat_id', normalized);
    try {
      const next_vault = await this.resolveVault(normalized || null);
      if (!next_vault) throw new Error('Vault target unavailable');
      this.vault = next_vault;
      this.lastError = null;
    } catch (e) {
      this.db.gdriveStateSet('sync_target_chat_id', '');
      this.vault = this.getPersonalVault();
      this.lastError = String(e.message || e);
      if (typeof this.onChange === 'function') this.onChange();
      throw e;
    }
    if (typeof this.onChange === 'function') this.onChange();
  }

  async _applySavedSyncTarget() {
    const saved = this.getSyncTargetChatId();
    if (!saved) {
      this.vault = this.getPersonalVault();
      return;
    }
    try {
      const next_vault = await this.resolveVault(saved);
      if (next_vault) this.vault = next_vault;
    } catch (e) {
      console.warn('[GDriveSyncService] saved sync target unavailable, using personal for this session:', e?.message || e);
      this.vault = this.getPersonalVault();
      this.lastError = String(e.message || e);
    }
  }

  setPaused(paused) {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.db.gdriveStateSet('is_paused', paused ? '1' : '0');
    
    if (paused) {
      this.status = 'paused';
      this._queueWorkerRunning = false;
      this._activeWorkers = 0;
      for (const active_controller of this._workerControllers.values()) {
        active_controller.abort();
      }
      this._workerControllers.clear();
      this.db.gdriveSyncQueueReleaseAllRunning();
      this.stopPolling();
    } else {
      this.status = this.auth.isConnected() ? 'idle' : 'disconnected';
      if (this.auth.isConnected()) {
        this._startQueueWorker();
        this.startPolling().catch((err) => console.error('[GDriveSyncService] startPolling failed:', err?.message || err));
      }
    }
    if (typeof this.onChange === 'function') this.onChange();
  }

  getSnapshot() {
    return {
      isPaused: this.isPaused,
      status: this.status,
      connected: this.auth?.isConnected?.() || false,
      email: this.auth?.email || '',
      lastSyncAt: this.lastSyncAt,
      pendingCount: this.pendingCount,
      totalCount: Math.max(this.totalCount || 0, this.pendingCount + (this.syncedCount || 0)),
      syncedCount: this.syncedCount || 0,
      currentSyncFile: this.currentSyncFile || null,
      currentSyncProgress: this.currentSyncProgress,
      speedBps: this._currentSpeedBps || 0,
      syncPhase: this._syncPhase || null,
      downloadProgress: this._downloadFraction || 0,
      uploadProgress: this._uploadFraction || 0,
      activeTasks: Array.from(this._activeWorkersMap?.values?.() || []).map((t) => ({
        workerId: t.workerId,
        driveFileId: t.driveFileId,
        fileName: t.fileName,
        size: t.size,
        drivePath: t.drivePath,
        vaultPath: t.vaultPath,
        phase: t.phase,
        progress: t.progress,
        downloadProgress: t.downloadProgress !== undefined ? t.downloadProgress : (t.phase === 'download' ? t.progress : 1),
        uploadProgress: t.uploadProgress !== undefined ? t.uploadProgress : (t.phase === 'upload' ? t.progress : 0),
        speedBps: t.speedBps || 0,
        startedAt: t.startedAt,
      })),
      syncQueue: this.db?.gdriveSyncQueueGetAll?.() || [],
      scanPhase: this.scanPhase,
      scanInfo: this.scanInfo,
      recentSynced: this.db?.gdriveManifestRecent?.() || [],
      lastError: this.lastError,
      pollIntervalMs: this._pollIntervalMs,
      subscriptions: this.db?.gdriveSubscriptionsAll?.() || [],
      syncErrors: this.db?.gdriveSyncErrorsAll?.() || [],
      ignoredExtensions: this.db?.gdriveStateGet?.('ignored_extensions', '') || '',
      allowedExtensions: this.db?.gdriveStateGet?.('allowed_extensions', '') || '',
      tempDownloadDir: this.db?.gdriveStateGet?.('temp_download_dir', '') || '',
      conflictPolicy: this.db?.gdriveStateGet?.('conflict_policy', 'skip') || 'skip',
      propagateDeletes: this.db?.gdriveStateGet?.('propagate_deletes', '0') === '1',
      autoSyncAfterScan: this.db?.gdriveStateGet?.('auto_sync_after_scan', '1') !== '0',
      syncTargetChatId: this.getSyncTargetChatId(),
      syncTargetChatIdNum: this.vault?.chatId ?? null,
      telegramFloodWaitSec: typeof this._telegramFloodWaitSecRemaining === 'function' ? this._telegramFloodWaitSecRemaining() : 0,
      throttleInfo: {
        concurrency: this.throttleController?.getConcurrency?.() || 1,
        throttled: this.rateLimiter?.isThrottled?.() || false,
        stats: this.rateLimiter?.getStats?.() || null,
        currentConcurrency: this.throttleController?.getConcurrency?.() || 1,
        isThrottled: this.rateLimiter?.isThrottled?.() || false,
        apiStats: this.rateLimiter?.getStats?.() || null,
        syncStats: this.throttleController?.getStats?.() || null,
      },
      clientId: this.auth?.clientId || '',
      clientSecret: this.auth?.clientSecret || '',
      authUrl: this.auth?.currentAuthUrl || null,
    };
  }

  purgeIgnoredQueueItems() {
    if (typeof this.db?.gdriveSyncQueueGetAll !== 'function') return 0;
    const queued = this.db.gdriveSyncQueueGetAll();
    let removed = 0;
    for (const item of queued) {
      const fileName = item.fileName || (item.drivePath ? String(item.drivePath).split('/').pop() : '');
      if (typeof this._shouldSyncFile === 'function' && !this._shouldSyncFile(fileName)) {
        this.db.gdriveSyncQueueRemove(item.driveFileId);
        removed += 1;
      }
    }
    if (removed > 0) {
      console.log(`[GDriveSyncService] Purged ${removed} ignored items from sync queue`);
      if (typeof this.db?.gdriveSyncQueueCount === 'function') {
        this.pendingCount = this.db.gdriveSyncQueueCount();
      }
      if (typeof this.onChange === 'function') this.onChange();
    }
    return removed;
  }

  saveCredentials(clientId, clientSecret) {
    if (this.auth && typeof this.auth.saveCredentials === 'function') {
      this.auth.saveCredentials(clientId, clientSecret);
    }
    if (typeof this.onChange === 'function') this.onChange();
    return { ok: true };
  }

  async connect(clientId, clientSecret, opts = {}) {
    this.auth.saveCredentials(clientId, clientSecret);
    const result = await this.auth.authorize({ force: opts.force !== false });
    if (result.ok) {
      this.status = 'idle';
      const { newStartPageToken } = await this.api.getChanges(null);
      this.db.gdriveStateSet('changes_page_token', newStartPageToken);
      if (!this.isPaused && this.isAutoSyncEnabled()) {
        this._startQueueWorker();
      }
      if (typeof this.onChange === 'function') this.onChange();
    }
    return result;
  }

  cancelConnect() {
    if (this.auth && typeof this.auth.cancelAuthorization === 'function') {
      this.auth.cancelAuthorization();
    }
    if (typeof this.onChange === 'function') this.onChange();
  }

  reconcileExistingVaultFiles() {
    const vaultEntries = this._vaultEntries();
    if (!vaultEntries || vaultEntries.length === 0) {
      return { ok: true, matchedCount: 0, totalChecked: 0 };
    }

    const vaultLookup = buildVaultLookupIndex(vaultEntries);
    const unlinkedNodes = typeof this.db?.gdriveCacheNodesUnlinkedFiles === 'function'
      ? this.db.gdriveCacheNodesUnlinkedFiles(100000)
      : [];

    if (unlinkedNodes.length === 0) {
      return { ok: true, matchedCount: 0, totalChecked: 0 };
    }

    const subs = typeof this.db?.gdriveSubscriptionsAll === 'function'
      ? this.db.gdriveSubscriptionsAll().filter((s) => s.enabled)
      : [];

    let matchedCount = 0;
    for (const node of unlinkedNodes) {
      let targetVaultPath = null;
      let relativePath = null;

      for (const sub of subs) {
        if (sub.isFolder) {
          const subDrivePath = sub.drivePath.endsWith('/') ? sub.drivePath : `${sub.drivePath}/`;
          if (node.drivePath && node.drivePath.startsWith(subDrivePath)) {
            relativePath = node.drivePath.slice(subDrivePath.length);
            targetVaultPath = `${sub.vaultPath}${relativePath}`.replace(/\/+/g, '/');
            break;
          }
        } else if (sub.driveId === node.id) {
          relativePath = node.name;
          targetVaultPath = sub.vaultPath;
          break;
        }
      }

      const match = vaultLookup.findMatch({
        targetPath: targetVaultPath,
        drivePath: node.drivePath,
        fileName: node.name,
        size: node.size,
      });

      if (match) {
        this.db.gdriveManifestUpsert({
          driveFileId: node.id,
          drivePath: relativePath || node.drivePath || node.name,
          vaultPath: match.path,
          md5: node.md5Checksum || null,
          sha256: match.sha256,
          size: Number(node.size),
          driveModifiedTime: node.modifiedTime || new Date().toISOString(),
        });
        this.db.gdriveSyncQueueRemove(node.id);
        this.db.gdriveSyncErrorRemove(node.id);
        matchedCount += 1;
      }
    }

    if (matchedCount > 0) {
      this.syncedCount = (this.syncedCount || 0) + matchedCount;
      this.pendingCount = Math.max(0, (this.pendingCount || 0) - matchedCount);
      if (typeof this.onChange === 'function') this.onChange();
    }

    return { ok: true, matchedCount, totalChecked: unlinkedNodes.length };
  }

  isSyncing() {
    return this._syncInProgress;
  }

  async checkConnection() {
    const start = Date.now();
    if (!this.auth?.clientId || !this.auth?.clientSecret) {
      return { ok: false, error: 'Chưa cấu hình Client ID và Client Secret' };
    }
    if (!this.auth?.refreshToken) {
      return { ok: false, error: 'Chưa đăng nhập Google Drive (thiếu Refresh Token)' };
    }

    try {
      const about = await this.api.getAbout();
      const latencyMs = Date.now() - start;
      const email = about?.user?.emailAddress || this.auth.email || '';
      const displayName = about?.user?.displayName || '';
      if (email && typeof this.db?.gdriveTokenSet === 'function') {
        this.db.gdriveTokenSet('email', email);
      }
      this.lastError = null;
      if (this.status === 'error') {
        this.status = 'idle';
      }
      if (typeof this.onChange === 'function') this.onChange();
      return {
        ok: true,
        email,
        displayName,
        storageQuota: about?.storageQuota || null,
        latencyMs,
      };
    } catch (e) {
      const rawMsg = String(e.message || e);
      let error = rawMsg;
      if (isAuthError(e)) {
        error = FRIENDLY_AUTH_ERROR_MSG;
      }
      this.status = 'error';
      this.lastError = error;
      if (this.scanPhase) {
        this.scanPhase = null;
        this.scanInfo = null;
        this._syncInProgress = false;
      }
      if (typeof this._stopActiveWorkersAndClaims === 'function') {
        this._stopActiveWorkersAndClaims();
      }
      if (typeof this.onChange === 'function') this.onChange();
      return { ok: false, error, rawError: rawMsg };
    }
  }

  disconnect({ keepCredentials = true } = {}) {
    this._lifecycleGeneration = (this._lifecycleGeneration || 0) + 1;
    this.stopPolling();
    this._queueWorkerRunning = false;
    this._activeWorkers = 0;
    if (this._workerControllers) {
      for (const active_controller of this._workerControllers.values()) {
        active_controller.abort();
      }
      this._workerControllers.clear();
    }
    this._retryController?.abort();
    this.auth?.disconnect?.({ keepCredentials });
    if (typeof this.db?.gdriveSubscriptionsAll === 'function') {
      for (const sub of this.db.gdriveSubscriptionsAll()) {
        this.db.gdriveSubscriptionRemove(sub.driveId);
      }
    }
    this.db?.gdriveManifestClear?.();
    this.db?.gdriveSyncQueueClear?.();
    this.db?.gdriveSyncErrorsClear?.();
    this.db?.gdriveStateSet?.('changes_page_token', '');
    this.pendingCount = 0;
    this.currentSyncFile = null;
    this.currentSyncProgress = 0;
    this._syncInProgress = false;
    this.status = 'disconnected';
    this.lastError = null;
    if (typeof this.onChange === 'function') this.onChange();
  }
}

// Assign modular methods to GDriveSyncService prototype
Object.assign(
  GDriveSyncService.prototype,
  downloaderMethods,
  uploaderMethods,
  queueWorkerMethods,
  scannerMethods,
);

module.exports = { GDriveSyncService };
