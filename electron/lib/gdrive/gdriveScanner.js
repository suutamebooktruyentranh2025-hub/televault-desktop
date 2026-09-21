const { isInTrash } = require('@televault/core');
const {
  nfcPath,
  matchChangeToSubscription,
  buildVaultPath,
  shouldEnqueueDriveFile,
  buildVaultLookupIndex,
} = require('./gdriveDiscovery');
const { fetchFullIndex } = require('./gdriveCacheIndexer');
const { applyChangesToCache, isTokenExpiredError } = require('./gdriveCacheDelta');
const { isAuthError, FRIENDLY_AUTH_ERROR_MSG } = require('./gdriveFloodController');

const scannerMethods = {
  setPollInterval(ms) {
    this._pollIntervalMs = ms;
    this.db.gdriveStateSet('poll_interval_ms', ms.toString());
    if (this._pollTimer) {
      this.stopPolling();
      if (ms > 0) this.startPolling().catch((err) => console.error('[GDriveSyncService] startPolling failed:', err?.message || err));
    }
  },

  async startPolling() {
    if (this._pollTimer || this._pollIntervalMs <= 0) return;
    if (!this.auth.isConnected() || this.isPaused) return;

    try {
      await this._syncTargetReady;
    } catch {
      // _applySavedSyncTarget already handles fallback
    }

    if (this._pollTimer || this._pollIntervalMs <= 0) return;
    if (!this.auth.isConnected() || this.isPaused) return;

    const requeued = this._requeueOrphanManifests();
    const isAutoSync = typeof this.isAutoSyncEnabled === 'function'
      ? this.isAutoSyncEnabled()
      : (typeof this.db?.gdriveStateGet === 'function' ? this.db.gdriveStateGet('auto_sync_after_scan', '1') !== '0' : true);
    if (requeued > 0) {
      this.pendingCount = this.db.gdriveSyncQueueCount();
      if (!this.isPaused && isAutoSync) {
        this._startQueueWorker();
      }
      if (typeof this.onChange === 'function') this.onChange();
    }

    void this._runPollSync();
    this._pollTimer = setInterval(() => void this._runPollSync(), this._pollIntervalMs);
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  _requeueOrphanManifests() {
    if (typeof this.db?.gdriveManifestAll !== 'function') return 0;
    const vault_paths = new Set(
      this._vaultEntries()
        .filter((entry_item) => !isInTrash(entry_item.path))
        .map((entry_item) => entry_item.path),
    );
    const already_queued = new Set(
      (typeof this.db.gdriveSyncQueueGetAll === 'function'
        ? this.db.gdriveSyncQueueGetAll()
        : []
      ).map((item) => item.driveFileId),
    );
    let requeued = 0;
    for (const manifest of this.db.gdriveManifestAll()) {
      if (vault_paths.has(manifest.vaultPath)) continue;
      this.db.gdriveManifestDelete(manifest.driveFileId);
      if (!already_queued.has(manifest.driveFileId)) {
        const leaf = String(manifest.drivePath || '').split('/').pop() || manifest.drivePath;
        if (typeof this._shouldSyncFile === 'function' && !this._shouldSyncFile(leaf)) {
          continue;
        }
        this.db.gdriveSyncQueueAdd({
          driveFileId: manifest.driveFileId,
          fileName: leaf,
          drivePath: manifest.drivePath,
          vaultPath: manifest.vaultPath,
          size: manifest.size,
          modifiedTime: manifest.driveModifiedTime,
          md5Checksum: manifest.md5 || null,
        });
        already_queued.add(manifest.driveFileId);
      }
      requeued += 1;
    }
    return requeued;
  },

  async rescanSyncTargetVault(onProgress) {
    try {
      await this._syncTargetReady;
    } catch {
      // Fallback handled in _applySavedSyncTarget
    }
    const vault = this.vault;
    if (!vault?.channel || typeof vault.channel.scanHistory !== 'function' || vault.chatId == null) {
      throw new Error('vault_unavailable');
    }
    const chatId = Number(vault.chatId);
    this.scanPhase = 'vault-scanning';
    this.scanInfo = { messagesScanned: 0 };
    if (typeof this.onChange === 'function') this.onChange();
    try {
      const scanned = await vault.channel.scanHistory(
        chatId,
        (n) => {
          this.scanInfo = { messagesScanned: n };
          if (typeof this.onChange === 'function') this.onChange();
          if (typeof onProgress === 'function') onProgress(n);
        },
        { forceFull: true },
      );
      const fileCount = this._vaultEntries().filter(
        (entry) => !isInTrash(entry.path) && !String(entry.path).endsWith('/'),
      ).length;
      return { scanned, fileCount, chatId };
    } finally {
      this.scanPhase = null;
      this.scanInfo = null;
      if (typeof this.onChange === 'function') this.onChange();
    }
  },

  async scanNow(opts = {}) {
    const { forceIndex = false } = opts;
    if (!this.auth.isConnected()) {
      const errMsg = 'Chưa kết nối tài khoản Google Drive hoặc phiên làm việc đã kết thúc. Vui lòng kết nối lại tài khoản.';
      this.status = 'disconnected';
      this.lastError = errMsg;
      this.scanPhase = null;
      this.scanInfo = null;
      this._syncInProgress = false;
      if (typeof this._stopActiveWorkersAndClaims === 'function') {
        this._stopActiveWorkersAndClaims();
      }
      if (typeof this.onChange === 'function') this.onChange();
      throw new Error(errMsg);
    }
    if (this._syncInProgress) {
      throw new Error('Đang trong quá trình quét hoặc đồng bộ Google Drive.');
    }
    if (this.isPaused && !forceIndex) {
      throw new Error('Đồng bộ Google Drive đang tạm dừng.');
    }

    // Validate token freshness before starting scan; halt immediately if expired
    try {
      if (typeof this.auth?.getValidToken === 'function') {
        await this.auth.getValidToken();
      }
    } catch (authErr) {
      const friendlyErr = isAuthError(authErr)
        ? FRIENDLY_AUTH_ERROR_MSG
        : `Lỗi xác thực Google Drive: ${authErr?.message || authErr}`;
      this.status = 'error';
      this.lastError = friendlyErr;
      this._syncInProgress = false;
      this.scanPhase = null;
      this.scanInfo = null;
      if (typeof this._stopActiveWorkersAndClaims === 'function') {
        this._stopActiveWorkersAndClaims();
      }
      if (typeof this.onChange === 'function') this.onChange();
      throw new Error(friendlyErr);
    }

    const captured_generation = this._lifecycleGeneration || 0;

    try {
      await this._syncTargetReady;
    } catch {
      // Fallback handled
    }
    if (!this._isLifecycleCurrent(captured_generation)) return;

    try {
      await this._awaitTelegramFloodClear({
        aborted: false,
        addEventListener() {},
        removeEventListener() {},
      });
    } catch {
      return;
    }
    if (!this._isLifecycleCurrent(captured_generation)) return;

    // Stop all active queue workers and downloads immediately so scanning has exclusive access
    if (typeof this._stopActiveWorkersAndClaims === 'function') {
      this._stopActiveWorkersAndClaims();
    }

    const requeued = this._requeueOrphanManifests();
    if (requeued > 0) {
      this.pendingCount = this.db.gdriveSyncQueueCount();
      if (typeof this.onChange === 'function') this.onChange();
    }

    this._activeAbortController = new AbortController();
    this._syncInProgress = true;
    this.status = 'syncing';
    this.lastError = null;
    if (typeof this.onChange === 'function') this.onChange();

    try {
      const subs = this.db.gdriveSubscriptionsAll().filter(s => s.enabled);

      this.scanPhase = 'scanning';
      this.scanInfo = { currentFolder: '/', filesFound: 0 };
      this.totalCount = 0;
      this.syncedCount = 0;
      this.currentSyncFile = null;
      this.currentSyncProgress = 0;
      if (typeof this.onChange === 'function') this.onChange();

      const canUseCache = typeof this.db?.gdriveCacheNodesCount === 'function'
        && typeof this.db?.gdriveCacheNodesQuerySubtree === 'function';

      const shouldFetchIndex = canUseCache && (
        forceIndex ||
        this.db.gdriveCacheNodesCount() === 0 ||
        this.db.gdriveStateGet('cache_status') !== 'ready' ||
        (typeof this.db.gdriveCacheHasCorruptedNodes === 'function' && this.db.gdriveCacheHasCorruptedNodes())
      );

      if (shouldFetchIndex) {
        if (typeof this.api?.listAllFilesFlat === 'function') {
          this.scanPhase = 'indexing';
          this.scanInfo = { currentFolder: '/', filesFound: 0 };
          if (typeof this.onChange === 'function') this.onChange();
          await fetchFullIndex(this.api, this.db, (p) => {
            if (!this._isLifecycleCurrent(captured_generation)) return;
            this.scanPhase = p.phase;
            this.scanInfo = {
              currentFolder: '/',
              filesFound: p.loadedCount,
              totalCount: p.totalCount,
              recentItems: p.recentItems || [],
            };
            if (typeof this.onChange === 'function') this.onChange();
          }, { signal: this._activeAbortController?.signal });
        }
      }

      const vaultLookup = buildVaultLookupIndex(this._vaultEntries());

      for (const sub of subs) {
        if (canUseCache && this.db.gdriveCacheNodesCount() > 0) {
          if (sub.isFolder) {
            const folderNode = this.db.gdriveCacheNodesGet(sub.driveId);
            const subDrivePath = folderNode?.drivePath || (sub.drivePath.endsWith('/') ? sub.drivePath : `${sub.drivePath}/`);
            const cachedFiles = this.db.gdriveCacheNodesQuerySubtree(subDrivePath, {
              filesOnly: true,
              nonTrashedOnly: true,
            });

            let loopIndex = 0;
            for (const f of cachedFiles) {
              if (!this._isLifecycleCurrent(captured_generation)) return;
              loopIndex += 1;
              if (loopIndex % 100 === 0) {
                await new Promise((resolve) => setImmediate(resolve));
              }
              if (f.mimeType && f.mimeType.startsWith('application/vnd.google-apps.')) continue;
              if (!this._shouldSyncFile(f.name)) continue;

              const relativePath = f.drivePath.startsWith(subDrivePath)
                ? f.drivePath.slice(subDrivePath.length)
                : f.name;
              const target_path = `${sub.vaultPath}${relativePath}`.replace(/\/+/g, '/');

              const manifest = this.db.gdriveManifestGet(f.id);
              if (!manifest) {
                const match = vaultLookup.findMatch({
                  targetPath: target_path,
                  drivePath: f.drivePath || relativePath,
                  fileName: f.name,
                  size: f.size,
                });
                if (match) {
                  this.db.gdriveManifestUpsert({
                    driveFileId: f.id,
                    drivePath: relativePath,
                    vaultPath: match.path,
                    md5: f.md5Checksum || null,
                    sha256: match.sha256,
                    size: Number(f.size),
                    driveModifiedTime: f.modifiedTime || new Date().toISOString(),
                  });
                  this.db.gdriveSyncQueueRemove(f.id);
                  this.db.gdriveSyncErrorRemove(f.id);
                  this.syncedCount += 1;
                  continue;
                }
              }

              const normTarget = nfcPath(manifest?.vaultPath || target_path);
              const vault_entries_at_path = vaultLookup.getEntriesAtPath(normTarget);
              if (!shouldEnqueueDriveFile({
                manifest,
                driveModifiedTime: f.modifiedTime,
                driveMd5: f.md5Checksum,
                vaultEntry: vault_entries_at_path[0] || null,
                vaultEntriesAtPath: vault_entries_at_path,
                driveSize: f.size,
              })) continue;

              if (!this._hasEnabledSubscription(f.id, target_path)) continue;
              this.db.gdriveSyncQueueAdd({
                driveFileId: f.id,
                fileName: f.name,
                drivePath: relativePath,
                vaultPath: target_path,
                size: f.size,
                modifiedTime: f.modifiedTime,
                md5Checksum: f.md5Checksum,
              });
              this.totalCount += 1;
              if (loopIndex % 50 === 0) {
                this.pendingCount = this.db.gdriveSyncQueueCount();
                if (typeof this.onChange === 'function') this.onChange();
              }
            }
            this.pendingCount = this.db.gdriveSyncQueueCount();
            if (typeof this.onChange === 'function') this.onChange();
          } else {
            const f = this.db.gdriveCacheNodesGet(sub.driveId);
            if (f && !f.trashed && !f.mimeType?.startsWith('application/vnd.google-apps.') && this._shouldSyncFile(f.name)) {
              const manifest = this.db.gdriveManifestGet(sub.driveId);
              if (!manifest) {
                const match = vaultLookup.findMatch({
                  targetPath: sub.vaultPath,
                  drivePath: sub.drivePath,
                  fileName: f.name,
                  size: f.size,
                });
                if (match) {
                  this.db.gdriveManifestUpsert({
                    driveFileId: f.id,
                    drivePath: sub.drivePath,
                    vaultPath: match.path,
                    md5: f.md5Checksum || null,
                    sha256: match.sha256,
                    size: Number(f.size),
                    driveModifiedTime: f.modifiedTime || new Date().toISOString(),
                  });
                  this.db.gdriveSyncQueueRemove(f.id);
                  this.db.gdriveSyncErrorRemove(f.id);
                  this.syncedCount += 1;
                  continue;
                }
              }

              const vault_entries_at_path = vaultLookup.getEntriesAtPath(manifest?.vaultPath || sub.vaultPath);
              if (shouldEnqueueDriveFile({
                manifest,
                driveModifiedTime: f.modifiedTime,
                vaultEntry: vault_entries_at_path[0] || null,
                vaultEntriesAtPath: vault_entries_at_path,
                driveSize: f.size,
              }) && this._hasEnabledSubscription(f.id, sub.vaultPath)) {
                this.db.gdriveSyncQueueAdd({
                  driveFileId: f.id,
                  fileName: f.name,
                  drivePath: sub.drivePath,
                  vaultPath: sub.vaultPath,
                  size: Number(f.size) || 0,
                  modifiedTime: f.modifiedTime,
                  md5Checksum: f.md5Checksum || null,
                });
                this.totalCount += 1;
                this.pendingCount = this.db.gdriveSyncQueueCount();
                if (typeof this.onChange === 'function') this.onChange();
              }
            }
          }
          continue;
        }

        if (sub.isFolder) {
          const visited_ids = new Set();
          this._folderIdCache.set(sub.driveId, new Set([sub.driveId]));
          await this.api.listFolderRecursive(sub.driveId, '', visited_ids, {
            onProgress: (info) => {
              if (!this._isLifecycleCurrent(captured_generation)) return;
              this.scanInfo = { currentFolder: `${sub.drivePath}/${info.currentFolder}`, filesFound: info.filesFound };
              if (typeof this.onChange === 'function') this.onChange();
            },
            onFile: (f) => {
              if (!this._isLifecycleCurrent(captured_generation)) return;
              if (!this._shouldSyncFile(f.name)) return;
              const manifest = this.db.gdriveManifestGet(f.id);
              const target_path = `${sub.vaultPath}${f.drivePath}`;

              if (!manifest) {
                const match = vaultLookup.findMatch({
                  targetPath: target_path,
                  drivePath: f.drivePath,
                  fileName: f.name,
                  size: f.size,
                });
                if (match) {
                  this.db.gdriveManifestUpsert({
                    driveFileId: f.id,
                    drivePath: f.drivePath,
                    vaultPath: match.path,
                    md5: f.md5Checksum || null,
                    sha256: match.sha256,
                    size: Number(f.size),
                    driveModifiedTime: f.modifiedTime || new Date().toISOString(),
                  });
                  this.db.gdriveSyncQueueRemove(f.id);
                  this.db.gdriveSyncErrorRemove(f.id);
                  this.syncedCount += 1;
                  return;
                }
              }

              const vault_entries_at_path = vaultLookup.getEntriesAtPath(manifest?.vaultPath || target_path);
              if (!shouldEnqueueDriveFile({
                manifest,
                driveModifiedTime: f.modifiedTime,
                vaultEntry: vault_entries_at_path[0] || null,
                vaultEntriesAtPath: vault_entries_at_path,
                driveSize: f.size,
              })) return;
              if (!this._hasEnabledSubscription(f.id, target_path)) return;
              this.db.gdriveSyncQueueAdd({
                driveFileId: f.id,
                fileName: f.name,
                drivePath: f.drivePath,
                vaultPath: target_path,
                size: f.size,
                modifiedTime: f.modifiedTime,
                md5Checksum: f.md5Checksum,
              });
              this.totalCount += 1;
              this.pendingCount = this.db.gdriveSyncQueueCount();
              if (typeof this.onChange === 'function') this.onChange();
            },
          });
          if (!this._isLifecycleCurrent(captured_generation)) return;
          this._folderIdCache.set(sub.driveId, new Set([sub.driveId, ...visited_ids]));
        } else {
          try {
            const file = await this.api.getFile(sub.driveId);
            if (!this._isLifecycleCurrent(captured_generation)) return;
            if (!file || file.trashed || file.mimeType?.startsWith('application/vnd.google-apps.')) continue;
            if (!this._shouldSyncFile(file.name)) continue;
            const manifest = this.db.gdriveManifestGet(sub.driveId);

            if (!manifest) {
              const match = vaultLookup.findMatch({
                targetPath: sub.vaultPath,
                drivePath: sub.drivePath,
                fileName: file.name,
                size: file.size,
              });
              if (match) {
                this.db.gdriveManifestUpsert({
                  driveFileId: file.id,
                  drivePath: sub.drivePath,
                  vaultPath: match.path,
                  md5: file.md5Checksum || null,
                  sha256: match.sha256,
                  size: Number(file.size),
                  driveModifiedTime: file.modifiedTime || new Date().toISOString(),
                });
                this.db.gdriveSyncQueueRemove(file.id);
                this.db.gdriveSyncErrorRemove(file.id);
                this.syncedCount += 1;
                continue;
              }
            }

            const vault_entries_at_path = vaultLookup.getEntriesAtPath(manifest?.vaultPath || sub.vaultPath);
            if (!shouldEnqueueDriveFile({
              manifest,
              driveModifiedTime: file.modifiedTime,
              vaultEntry: vault_entries_at_path[0] || null,
              vaultEntriesAtPath: vault_entries_at_path,
              driveSize: file.size,
            })) continue;
            if (!this._hasEnabledSubscription(file.id, sub.vaultPath)) continue;
            this.db.gdriveSyncQueueAdd({
              driveFileId: file.id,
              fileName: file.name,
              drivePath: sub.drivePath,
              vaultPath: sub.vaultPath,
              size: Number(file.size) || 0,
              modifiedTime: file.modifiedTime,
              md5Checksum: file.md5Checksum || null,
            });
            this.totalCount += 1;
            this.pendingCount = this.db.gdriveSyncQueueCount();
            if (typeof this.onChange === 'function') this.onChange();
          } catch (e) {
            if (!this._isLifecycleCurrent(captured_generation)) return;
            if (isAuthError(e)) throw e;
            console.warn(`[GDriveSyncService] Failed to get file ${sub.driveId}:`, e.message);
          }
        }
      }

      if (typeof this.reconcileExistingVaultFiles === 'function') {
        try {
          this.reconcileExistingVaultFiles();
        } catch (recErr) {
          console.warn('[GDriveSyncService] Auto-reconciliation post-scan error:', recErr);
        }
      }

      if (!this._isLifecycleCurrent(captured_generation)) return;
      this.scanPhase = null;
      this.scanInfo = null;
      if (typeof this.onChange === 'function') this.onChange();

      try {
        const token = typeof this.db?.gdriveStateGet === 'function' ? this.db.gdriveStateGet('changes_page_token') : null;
        if (!token && typeof this.api?.getChanges === 'function') {
          const { newStartPageToken } = await this.api.getChanges(null);
          if (!this._isLifecycleCurrent(captured_generation)) return;
          if (typeof this.db?.gdriveStateSet === 'function') {
            this.db.gdriveStateSet('changes_page_token', newStartPageToken);
          }
        }
      } catch (tokenErr) {
        if (!this._isLifecycleCurrent(captured_generation)) return;
        if (isAuthError(tokenErr)) throw tokenErr;
        console.warn('[GDriveSyncService] Failed to set changes token post-scan:', tokenErr.message);
      }

      if (!this._isLifecycleCurrent(captured_generation)) return;
      this.lastSyncAt = new Date().toISOString();
      const remainingInQueue = typeof this.db?.gdriveSyncQueueCount === 'function'
        ? this.db.gdriveSyncQueueCount()
        : 0;
      this.pendingCount = remainingInQueue;
      const autoSyncAfterScan = typeof this.db?.gdriveStateGet === 'function'
        ? this.db.gdriveStateGet('auto_sync_after_scan', '1') !== '0'
        : true;

      if (remainingInQueue === 0) {
        this.status = 'idle';
      } else if (autoSyncAfterScan && !this.isPaused) {
        this.status = 'syncing';
        this._startQueueWorker();
      } else {
        this.status = 'idle';
      }
    } catch (e) {
      if (!this._isLifecycleCurrent(captured_generation)) return;
      if (e.name === 'AbortError' || e.message?.includes('aborted') || e.message?.includes('Indexing aborted')) {
        this.status = 'idle';
        this.lastError = null;
        this.scanPhase = null;
        this.scanInfo = null;
        this._syncInProgress = false;
        if (typeof this.onChange === 'function') this.onChange();
        return;
      }
      const friendlyErr = isAuthError(e)
        ? FRIENDLY_AUTH_ERROR_MSG
        : String(e?.message || e);
      this.status = 'error';
      this.lastError = friendlyErr;
      this.scanPhase = null;
      this.scanInfo = null;
      this._syncInProgress = false;
      if (typeof this._stopActiveWorkersAndClaims === 'function') {
        this._stopActiveWorkersAndClaims();
      }
      console.error('[GDriveSyncService] scan error:', e);
      if (typeof this.onChange === 'function') this.onChange();
      throw new Error(friendlyErr);
    } finally {
      this._activeAbortController = null;
      if ((this._lifecycleGeneration || 0) === captured_generation) {
        this.currentSyncFile = null;
        this.currentSyncProgress = 0;
        this.scanPhase = null;
        this.scanInfo = null;
        this._syncInProgress = false;
        if (typeof this.onChange === 'function') this.onChange();
      }
    }
  },

  abortScan() {
    if (this._activeAbortController) {
      try {
        this._activeAbortController.abort();
      } catch {
        // ignore
      }
      this._activeAbortController = null;
    }
    this.scanPhase = null;
    this.scanInfo = null;
    this._syncInProgress = false;
    this.status = 'idle';
    if (typeof this.onChange === 'function') this.onChange();
  },

  async _runPollSync() {
    if (this._syncInProgress) return;
    if (!this.auth.isConnected()) return;

    const captured_generation = this._lifecycleGeneration || 0;
    this._syncInProgress = true;
    this.status = 'syncing';
    this.lastError = null;
    if (typeof this.onChange === 'function') this.onChange();

    try {
      let pageToken = this.db.gdriveStateGet('changes_page_token');
      if (!pageToken) {
        const { newStartPageToken } = await this.api.getChanges(null);
        if (!this._isLifecycleCurrent(captured_generation)) return;
        this.db.gdriveStateSet('changes_page_token', newStartPageToken);
        this._syncInProgress = false;
        this.status = 'idle';
        if (typeof this.onChange === 'function') this.onChange();
        return;
      }

      let changes;
      let newStartPageToken;
      try {
        const changesRes = await this.api.getChanges(pageToken);
        changes = changesRes.changes;
        newStartPageToken = changesRes.newStartPageToken;
      } catch (pollErr) {
        if (isTokenExpiredError(pollErr)) {
          console.warn('[GDriveSyncService] Changes token expired (410), resetting token...');
          this.db.gdriveStateSet('changes_page_token', '');
          this.db.gdriveStateSet('cache_status', 'stale');
          if (typeof this.api?.listAllFilesFlat === 'function' && typeof this.db?.gdriveCacheNodesUpsertBatch === 'function') {
            await fetchFullIndex(this.api, this.db, null, { signal: this._activeAbortController?.signal });
          }
          return;
        }
        throw pollErr;
      }
      if (!this._isLifecycleCurrent(captured_generation)) return;

      if (typeof this.db?.gdriveCacheNodesUpsertBatch === 'function') {
        applyChangesToCache(changes, this.db);
      }

      const subs = this.db.gdriveSubscriptionsAll().filter(s => s.enabled);
      const filesToSync = [];
      const vaultLookup = buildVaultLookupIndex(this._vaultEntries());

      for (const change of changes) {
        if (change.removed || change.file?.trashed) {
          for (let pending_index = filesToSync.length - 1; pending_index >= 0; pending_index -= 1) {
            if (filesToSync[pending_index].driveFileId === change.fileId) {
              filesToSync.splice(pending_index, 1);
            }
          }
          if (this.db.gdriveStateGet('propagate_deletes', '0') !== '1') continue;
          const drive_manifest = this.db.gdriveManifestGet(change.fileId);
          if (!drive_manifest) continue;
          const vault_entry = this._vaultEntries().find(
            (entry_item) => entry_item.path === drive_manifest.vaultPath && !isInTrash(entry_item.path),
          );
          if (vault_entry) await this.vault.trashEntries([vault_entry.messageId]);
          if (!this._isLifecycleCurrent(captured_generation)) return;
          this.db.gdriveSyncQueueRemove(change.fileId);
          this.db.gdriveManifestDelete(change.fileId);
          continue;
        }
        if (!change.file) continue;
        if (change.file.mimeType === 'application/vnd.google-apps.folder') continue;
        if (change.file.mimeType?.startsWith('application/vnd.google-apps.')) continue;
        if (!this._shouldSyncFile(change.file.name)) continue;

        for (const sub of subs) {
          const manifest = this.db.gdriveManifestGet(change.fileId);
          const is_manifest_match = Boolean(
            manifest && (
              sub.isFolder
                ? String(manifest.vaultPath).startsWith(sub.vaultPath)
                : sub.driveId === change.fileId
            ),
          );
          let discovery_hit = matchChangeToSubscription(change, sub, {
            manifest,
            folderIds: this._folderIdCache.get(sub.driveId),
          });

          if (sub.isFolder) {
            const parent_ids = change.file.parents || [];
            const is_direct_child = parent_ids.includes(sub.driveId);
            if (!is_manifest_match && !is_direct_child) {
              discovery_hit = await this._resolveUnderSubscription(change.file, sub);
              if (!this._isLifecycleCurrent(captured_generation)) return;
            }
          }

          if (!discovery_hit) continue;

          if (!manifest) {
            const match = vaultLookup.findMatch({
              targetPath: discovery_hit.vaultPath,
              drivePath: discovery_hit.drivePath,
              fileName: change.file.name,
              size: change.file.size,
            });
            if (match) {
              this.db.gdriveManifestUpsert({
                driveFileId: change.fileId,
                drivePath: discovery_hit.drivePath,
                vaultPath: match.path,
                md5: change.file.md5Checksum || null,
                sha256: match.sha256,
                size: Number(change.file.size) || 0,
                driveModifiedTime: change.file.modifiedTime || new Date().toISOString(),
              });
              this.db.gdriveSyncQueueRemove(change.fileId);
              this.db.gdriveSyncErrorRemove(change.fileId);
              break;
            }
          }

          const normTarget = nfcPath(manifest?.vaultPath || discovery_hit.vaultPath);
          const vault_entries_at_path = vaultLookup.getEntriesAtPath(normTarget);
          if (!shouldEnqueueDriveFile({
            manifest,
            driveModifiedTime: change.file.modifiedTime,
            driveMd5: change.file.md5Checksum,
            vaultEntry: vault_entries_at_path[0] || null,
            vaultEntriesAtPath: vault_entries_at_path,
            driveSize: change.file.size,
          })) break;

          filesToSync.push({
            driveFileId: change.fileId,
            fileName: change.file.name,
            drivePath: discovery_hit.drivePath,
            vaultPath: discovery_hit.vaultPath,
            size: Number(change.file.size) || 0,
            modifiedTime: change.file.modifiedTime,
            md5Checksum: change.file.md5Checksum || null,
          });
          break;
        }
      }

      if (!this._isLifecycleCurrent(captured_generation)) return;
      this.pendingCount = this.db.gdriveSyncQueueCount();
      this.totalCount += filesToSync.length;
      if (typeof this.onChange === 'function') this.onChange();

      for (const f of filesToSync) {
        if (!this._hasEnabledSubscription(f.driveFileId, f.vaultPath)) continue;
        this.db.gdriveSyncQueueAdd({
          driveFileId: f.driveFileId,
          fileName: f.fileName,
          drivePath: f.drivePath,
          vaultPath: f.vaultPath,
          size: f.size,
          modifiedTime: f.modifiedTime,
          md5Checksum: f.md5Checksum,
        });
      }
      this.pendingCount = this.db.gdriveSyncQueueCount();
      if (typeof this.onChange === 'function') this.onChange();

      if (!this._isLifecycleCurrent(captured_generation)) return;
      this.db.gdriveStateSet('changes_page_token', newStartPageToken);
      this.lastSyncAt = new Date().toISOString();
      const isAutoSync = typeof this.isAutoSyncEnabled === 'function'
        ? this.isAutoSyncEnabled()
        : (typeof this.db?.gdriveStateGet === 'function' ? this.db.gdriveStateGet('auto_sync_after_scan', '1') !== '0' : true);
      if (this.pendingCount === 0) {
        this.status = 'idle';
      } else if (isAutoSync && !this.isPaused) {
        this.status = 'syncing';
        this._startQueueWorker();
      } else {
        this.status = 'idle';
      }
    } catch (e) {
      if (!this._isLifecycleCurrent(captured_generation)) return;
      this.status = 'error';
      this.lastError = String(e.message || e);
      console.error('[GDriveSyncService] poll error:', e);
    } finally {
      if ((this._lifecycleGeneration || 0) === captured_generation) {
        this._syncInProgress = false;
        if (typeof this.onChange === 'function') this.onChange();
      }
    }
  },

  _isLifecycleCurrent(captured_generation) {
    return (this._lifecycleGeneration || 0) === captured_generation && this.auth.isConnected();
  },

  _hasEnabledSubscription(driveFileId, vaultPath) {
    return this.db.gdriveSubscriptionsAll().some((subscription_item) => (
      subscription_item.enabled && (
        subscription_item.isFolder
          ? String(vaultPath).startsWith(subscription_item.vaultPath)
          : subscription_item.driveId === driveFileId || subscription_item.vaultPath === vaultPath
      )
    ));
  },

  async _resolveUnderSubscription(fileMeta, sub) {
    const cached_ids = this._folderIdCache.get(sub.driveId) || new Set([sub.driveId]);
    this._folderIdCache.set(sub.driveId, cached_ids);
    const initial_parents = fileMeta.parents || [];

    for (const initial_parent of initial_parents) {
      const relative_parts = [fileMeta.name];
      const walked_ids = [];
      let current_parent = initial_parent;

      for (let current_depth = 0; current_depth <= 20; current_depth += 1) {
        if (current_parent === sub.driveId) {
          for (const walked_id of walked_ids) cached_ids.add(walked_id);
          const drive_path = relative_parts.join('/');
          return {
            drivePath: drive_path,
            vaultPath: buildVaultPath(sub.vaultPath, drive_path),
          };
        }
        if (current_depth === 20 || !current_parent) break;

        let parent_meta;
        try {
          parent_meta = await this.api.getFile(current_parent);
        } catch {
          break;
        }
        if (!parent_meta || parent_meta.trashed) break;

        walked_ids.push(current_parent);
        relative_parts.unshift(parent_meta.name);
        current_parent = parent_meta.parents?.[0];
      }
    }

    return null;
  },

  addSubscription({ driveId, drivePath, vaultPath, isFolder }) {
    this.db.gdriveSubscriptionAdd({ driveId, drivePath, vaultPath, isFolder });
    if (isFolder) this._folderIdCache.set(driveId, new Set([driveId]));
    if (typeof this.onChange === 'function') this.onChange();
  },

  removeSubscription(driveId) {
    this._lifecycleGeneration = (this._lifecycleGeneration || 0) + 1;
    this._syncInProgress = false;
    const sub = this.db.gdriveSubscriptionsAll().find(s => s.driveId === driveId);
    this._queueWorkerRunning = false;
    this._activeWorkers = 0;
    for (const active_controller of this._workerControllers.values()) {
      active_controller.abort();
    }
    this._workerControllers.clear();
    this._retryController?.abort();
    if (sub) {
      const is_folder = sub.isFolder || sub.vaultPath.endsWith('/');
      if (is_folder) {
        this.db.gdriveManifestRemoveByVaultPathPrefix(sub.vaultPath);
        this.db.gdriveSyncQueueRemoveByVaultPathPrefix(sub.vaultPath);
        this.db.gdriveSyncErrorsRemoveByVaultPathPrefix(sub.vaultPath);
      } else {
        this.db.gdriveManifestDelete(driveId);
        this.db.gdriveSyncQueueRemove(driveId);
        this.db.gdriveSyncErrorRemove(driveId);
      }
    }
    this.db.gdriveSubscriptionRemove(driveId);
    this._folderIdCache.delete(driveId);
    this.pendingCount = this.db.gdriveSyncQueueCount();
    if (this.auth.isConnected() && !this.isPaused) this._startQueueWorker();
    if (typeof this.onChange === 'function') this.onChange();
  },

  toggleSubscription(driveId, enabled) {
    this.db.gdriveSubscriptionSetEnabled(driveId, enabled);
    if (typeof this.onChange === 'function') this.onChange();
  },

  async listDriveFolder(folderId = 'root') {
    return this.api.listFolder(folderId);
  },
};

module.exports = { scannerMethods };
