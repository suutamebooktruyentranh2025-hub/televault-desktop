const { createAbortError, FRIENDLY_AUTH_ERROR_MSG } = require('./gdriveFloodController');

const queueWorkerMethods = {
  _stopActiveWorkersAndClaims() {
    this._queueWorkerRunning = false;
    this._activeWorkers = 0;
    this._activeWorkersMap?.clear();
    if (this._workerControllers) {
      for (const active_controller of this._workerControllers.values()) {
        active_controller.abort();
      }
      this._workerControllers.clear();
    }
    if (typeof this.db?.gdriveSyncQueueReleaseAllRunning === 'function') {
      this.db.gdriveSyncQueueReleaseAllRunning();
    }
  },

  _startQueueWorker() {
    if (this._queueWorkerRunning) return;
    this.db.gdriveSyncQueueResetStale();
    this._queueWorkerRunning = true;
    this._activeWorkers = 0;
    this._adjustWorkers();
  },

  _adjustWorkers() {
    const target = this.throttleController.getConcurrency();
    while (this._activeWorkers < target) {
      this._activeWorkers += 1;
      this._runWorkerLoop();
    }
  },

  async _runWorkerLoop() {
    const workerId = `gdrive-worker-${++this._workerIdSeq}`;
    const abort_controller = new AbortController();
    this._workerControllers.set(workerId, abort_controller);
    let claimedItem = null;

    const finishWorker = () => {
      this._activeWorkersMap?.delete(workerId);
      this._workerControllers.delete(workerId);
      if (this._activeWorkersMap && this._activeWorkersMap.size > 0) {
        const remainingTasks = Array.from(this._activeWorkersMap.values());
        this.currentSyncFile = remainingTasks[0].fileName;
      } else {
        this.currentSyncFile = null;
        this._currentSpeedBps = 0;
        this._syncPhase = null;
        this._downloadFraction = 0;
        this._uploadFraction = 0;
        this.currentSyncProgress = 0;
      }
      if (typeof this._notifyProgress === 'function') this._notifyProgress();
    };
    const releaseClaimedItem = () => {
      this._activeWorkersMap?.delete(workerId);
      if (this._activeWorkersMap && this._activeWorkersMap.size > 0) {
        const remainingTasks = Array.from(this._activeWorkersMap.values());
        this.currentSyncFile = remainingTasks[0].fileName;
      } else {
        this.currentSyncFile = null;
        this._currentSpeedBps = 0;
        this._syncPhase = null;
        this._downloadFraction = 0;
        this._uploadFraction = 0;
        this.currentSyncProgress = 0;
      }
      if (typeof this._notifyProgress === 'function') this._notifyProgress();
      if (!claimedItem) return;
      this.db.gdriveSyncQueueReleaseToQueuedIfOwner(claimedItem.driveFileId, workerId);
      claimedItem = null;
    };

    while (this._queueWorkerRunning && !abort_controller.signal.aborted) {
      // Check if this worker should exit (concurrency reduced)
      if (this._activeWorkers > this.throttleController.getConcurrency()) {
        releaseClaimedItem();
        this._activeWorkers -= 1;
        finishWorker();
        return;
      }

      if (!this.auth.isConnected()) {
        try {
          await this._sleep(2000, abort_controller.signal);
        } catch {
          finishWorker();
          return;
        }
        continue;
      }

      // While scanning/indexing is in progress, do not claim or sync any files!
      if (this.scanPhase) {
        try {
          await this._sleep(500, abort_controller.signal);
        } catch {
          finishWorker();
          return;
        }
        continue;
      }

      // Telegram flood: pause claiming more Drive work until the wait clears.
      try {
        await this._awaitTelegramFloodClear(abort_controller.signal);
      } catch (flood_wait_error) {
        if (flood_wait_error.name === 'AbortError') {
          releaseClaimedItem();
          finishWorker();
          return;
        }
        throw flood_wait_error;
      }

      const next = this.db.gdriveSyncQueueClaimNext(workerId);
      if (!next) {
        if (this.status === 'syncing' && !this._syncInProgress) {
          this.status = 'idle';
          this.currentSyncFile = null;
          this.currentSyncProgress = 0;
          this._currentSpeedBps = 0;
          this._syncPhase = null;
          this._downloadFraction = 0;
          this._uploadFraction = 0;
          this.pendingCount = 0;
          if (typeof this.onChange === 'function') this.onChange();
        }
        try {
          await this._sleep(1000, abort_controller.signal);
        } catch {
          finishWorker();
          return;
        }
        continue;
      }

      if (typeof this._shouldSyncFile === 'function' && !this._shouldSyncFile(next.fileName || next.drivePath)) {
        console.log(`[GDriveSyncService] Worker dropping ignored file from queue: ${next.fileName}`);
        this.db.gdriveSyncQueueRemove(next.driveFileId);
        this.pendingCount = this.db.gdriveSyncQueueCount();
        if (typeof this.onChange === 'function') this.onChange();
        continue;
      }

      claimedItem = next;
      if (!this._activeWorkersMap) this._activeWorkersMap = new Map();
      this._activeWorkersMap.set(workerId, {
        workerId,
        driveFileId: next.driveFileId,
        fileName: next.fileName,
        size: next.size,
        drivePath: next.drivePath,
        vaultPath: next.vaultPath,
        phase: 'download',
        progress: 0,
        downloadProgress: 0,
        uploadProgress: 0,
        speedBps: 0,
        startedAt: Date.now(),
      });
      this.status = 'syncing';
      if (!this.currentSyncFile || this._activeWorkersMap.size === 1) {
        this.currentSyncFile = next.fileName;
        this.currentSyncProgress = 0;
        this._currentSpeedBps = 0;
        this._syncPhase = null;
        this._downloadFraction = 0;
        this._uploadFraction = 0;
      }
      this.pendingCount = this.db.gdriveSyncQueueCount();
      if (typeof this.onChange === 'function') this.onChange();
      if (typeof this._notifyProgress === 'function') this._notifyProgress();

      let synced = false;
      let lastErrorType = null;
      let lastError = null;
      const startAttempt = (next.retryCount || 0) + 1;

      for (let attempt = startAttempt; attempt <= startAttempt + 2; attempt++) {
        if (!this._queueWorkerRunning) {
          releaseClaimedItem();
          finishWorker();
          return;
        }

        try {
          await this._syncFile(next, abort_controller.signal, workerId);
          if (abort_controller.signal.aborted) throw createAbortError();
          synced = true;
          break;
        } catch (e) {
          if (abort_controller.signal.aborted || e.name === 'AbortError') {
            releaseClaimedItem();
            finishWorker();
            return;
          }
          const errorType = this._classifyError(e);
          lastErrorType = errorType;
          lastError = e;
          if (errorType === 'throttle') {
            this._noteTelegramFlood(e);
          }
          this.throttleController.reportError(errorType);

          const { retry, delayMs } = this.throttleController.shouldRetry(attempt, errorType);
          if (!retry) {
            console.error(`[GDriveSyncService] Permanent fail ${next.drivePath} (${errorType}):`, e.message);
            break;
          }

          console.warn(`[GDriveSyncService] Retry ${attempt} for ${next.drivePath} in ${delayMs}ms (${errorType})`);
          this.db.gdriveSyncQueueIncrementRetry(next.driveFileId);
          try {
            await this._sleep(delayMs, abort_controller.signal);
          } catch (sleep_error) {
            if (sleep_error.name !== 'AbortError') throw sleep_error;
            releaseClaimedItem();
            finishWorker();
            return;
          }

          if (!this._queueWorkerRunning) {
            releaseClaimedItem();
            finishWorker();
            return;
          }

          // Adjust workers after error (concurrency may have dropped)
          if (this._activeWorkers > this.throttleController.getConcurrency()) {
            releaseClaimedItem();
            this._activeWorkers -= 1;
            finishWorker();
            return;
          }
        }
      }

      this._activeWorkersMap?.delete(workerId);
      if (this._activeWorkersMap && this._activeWorkersMap.size > 0) {
        const remainingTasks = Array.from(this._activeWorkersMap.values());
        this.currentSyncFile = remainingTasks[0].fileName;
        let totalSpeed = 0;
        for (const t of remainingTasks) {
          totalSpeed += (t.speedBps || 0);
        }
        this._currentSpeedBps = totalSpeed;
      } else {
        this.currentSyncFile = null;
        this._currentSpeedBps = 0;
        this._syncPhase = null;
        this._downloadFraction = 0;
        this._uploadFraction = 0;
        this.currentSyncProgress = 0;
      }
      if (typeof this._notifyProgress === 'function') this._notifyProgress();

      if (synced) {
        this.db.gdriveSyncQueueRemove(next.driveFileId);
        this.syncedCount += 1;
        this.throttleController.reportSuccess();
        this._adjustWorkers();

        // Pacing delay: 1.5s interval between consecutive file syncs to prevent Telegram flood bursts
        try {
          await this._sleep(1500, abort_controller.signal);
        } catch (sleep_error) {
          if (sleep_error.name === 'AbortError') {
            claimedItem = null;
            finishWorker();
            return;
          }
        }
      } else if (lastErrorType === 'auth') {
        console.error(`[GDriveSyncService] Fatal auth error on ${next.drivePath}:`, lastError?.message);
        this.status = 'error';
        this.lastError = FRIENDLY_AUTH_ERROR_MSG;
        this.db.gdriveSyncQueueReleaseToQueued(next.driveFileId);
        if (typeof this._stopActiveWorkersAndClaims === 'function') {
          this._stopActiveWorkersAndClaims();
        }
        if (typeof this.onChange === 'function') this.onChange();
        finishWorker();
        return;
      } else if (lastErrorType === 'throttle') {
        this.db.gdriveSyncQueueReleaseToQueued(next.driveFileId);
        const floodWaitSec = this._noteTelegramFlood(lastError);

        // Circuit Breaker: If retried >= 3 times or severe flood wait (>60s), auto-pause the sync queue
        // to protect the Telegram account/channel from escalated punishment or temporary bans.
        if ((next.retryCount || 0) >= 3 || (floodWaitSec && floodWaitSec > 60)) {
          console.warn(`[GDriveSyncService] Telegram flood threshold exceeded (${floodWaitSec || 16}s, retry ${next.retryCount || 0}). Auto-pausing sync to protect account.`);
          if (typeof this.setPaused === 'function') {
            this.setPaused(true);
          } else {
            this.isPaused = true;
            this.status = 'paused';
            this.db?.gdriveStateSet?.('is_paused', '1');
          }
          this.status = 'paused';
          this.lastError = `Telegram giới hạn tần suất (FLOOD_WAIT ${floodWaitSec || 16}s). Đã tự động tạm dừng đồng bộ để bảo vệ tài khoản.`;
          if (typeof this.onChange === 'function') this.onChange();
          claimedItem = null;
          finishWorker();
          return;
        }

        const backoffMs = floodWaitSec != null ? floodWaitSec * 1000 : 30_000;
        try {
          await this._sleep(backoffMs, abort_controller.signal);
        } catch (sleep_error) {
          if (sleep_error.name !== 'AbortError') throw sleep_error;
          claimedItem = null;
          finishWorker();
          return;
        }
      } else if (lastErrorType === 'timeout' || lastErrorType === 'network') {
        this.db.gdriveSyncQueueReleaseToQueued(next.driveFileId);
        try {
          await this._sleep(5_000, abort_controller.signal);
        } catch (sleep_error) {
          if (sleep_error.name !== 'AbortError') throw sleep_error;
          claimedItem = null;
          finishWorker();
          return;
        }
      } else {
        this.db.gdriveSyncQueueRemove(next.driveFileId);
      }

      claimedItem = null;
      this.pendingCount = this.db.gdriveSyncQueueCount();
      if (typeof this.onChange === 'function') this.onChange();
    }

    releaseClaimedItem();
    finishWorker();
  },

  removeQueueItem(driveFileId) {
    this.db.gdriveSyncQueueRemove(driveFileId);
    this.pendingCount = this.db.gdriveSyncQueueCount();
    if (typeof this.onChange === 'function') this.onChange();
  },

  removeQueueBatch(driveFileIds) {
    if (!Array.isArray(driveFileIds) || driveFileIds.length === 0) return;
    if (typeof this.db.gdriveSyncQueueRemoveBatch === 'function') {
      this.db.gdriveSyncQueueRemoveBatch(driveFileIds);
    } else {
      for (const id of driveFileIds) {
        this.db.gdriveSyncQueueRemove(id);
      }
    }
    this.pendingCount = this.db.gdriveSyncQueueCount();
    if (typeof this.onChange === 'function') this.onChange();
  },

  clearQueue() {
    this.db.gdriveSyncQueueClear();
    this.pendingCount = 0;
    if (typeof this.onChange === 'function') this.onChange();
  },

  async retryFile(driveFileId) {
    const captured_generation = this._lifecycleGeneration || 0;
    const errors = this.db.gdriveSyncErrorsAll();
    const target = errors.find(err => err.driveFileId === driveFileId);
    if (!target) return { ok: false, error: 'File not found in sync errors' };
    const retry_controller = new AbortController();
    this._retryController = retry_controller;

    this._syncInProgress = true;
    this.status = 'syncing';
    this.lastError = null;
    if (typeof this.onChange === 'function') this.onChange();

    try {
      const drive_file = await this.api.getFile(driveFileId);
      if (!this._isLifecycleCurrent(captured_generation)) {
        return { ok: false, error: 'cancelled' };
      }
      if (!drive_file || drive_file.trashed) {
        throw new Error('Drive file is unavailable or trashed');
      }
      await this._syncFile({
        driveFileId: target.driveFileId,
        fileName: drive_file.name || target.fileName,
        drivePath: target.drivePath,
        vaultPath: target.vaultPath,
        size: Number(drive_file.size) || 0,
        modifiedTime: drive_file.modifiedTime || target.modifiedTime,
        md5Checksum: drive_file.md5Checksum || null,
      }, retry_controller.signal);
      if (!this._isLifecycleCurrent(captured_generation)) {
        return { ok: false, error: 'cancelled' };
      }
      this.status = 'idle';
      if (typeof this.onChange === 'function') this.onChange();
      return { ok: true };
    } catch (e) {
      if (!this._isLifecycleCurrent(captured_generation)) {
        return { ok: false, error: 'cancelled' };
      }
      this.status = 'error';
      this.lastError = String(e.message || e);
      if (typeof this.onChange === 'function') this.onChange();
      return { ok: false, error: String(e.message || e) };
    } finally {
      if (this._retryController === retry_controller) {
        this._retryController = null;
      }
      if (this._isLifecycleCurrent(captured_generation)) {
        this._syncInProgress = false;
        if (typeof this.onChange === 'function') this.onChange();
      }
    }
  },

  retryErrors(driveFileIds = []) {
    if (!this.db) return { ok: false, error: 'Database not available' };
    const idsToRetry = Array.isArray(driveFileIds) ? driveFileIds : [driveFileIds].filter(Boolean);
    if (idsToRetry.length === 0) return { ok: true, enqueuedCount: 0 };

    const errors = this.db.gdriveSyncErrorsAll() || [];
    const targetSet = new Set(idsToRetry);
    const targets = errors.filter(err => targetSet.has(err.driveFileId));
    if (targets.length === 0) return { ok: true, enqueuedCount: 0 };

    const queueBatch = targets.map(err => {
      let md5Checksum = null;
      if (typeof this.db.gdriveCacheNodesGet === 'function') {
        const node = this.db.gdriveCacheNodesGet(err.driveFileId);
        if (node?.md5Checksum) md5Checksum = node.md5Checksum;
      }
      return {
        driveFileId: err.driveFileId,
        fileName: err.fileName,
        drivePath: err.drivePath,
        vaultPath: err.vaultPath,
        size: Number(err.size) || 0,
        modifiedTime: err.modifiedTime || null,
        md5Checksum,
        retryCount: 0,
      };
    });

    let enqueuedCount = 0;
    if (typeof this.db.gdriveSyncQueueAddBatch === 'function') {
      enqueuedCount = this.db.gdriveSyncQueueAddBatch(queueBatch);
    } else {
      for (const item of queueBatch) {
        if (typeof this.db.gdriveSyncErrorRemove === 'function') {
          this.db.gdriveSyncErrorRemove(item.driveFileId);
        }
        if (typeof this.db.gdriveSyncQueueAdd === 'function') {
          this.db.gdriveSyncQueueAdd(item);
        }
        enqueuedCount++;
      }
    }

    if (typeof this.db.gdriveSyncQueueCount === 'function') {
      this.pendingCount = this.db.gdriveSyncQueueCount();
    }

    if (!this.isPaused && !this.scanPhase && this.auth?.isConnected?.()) {
      this.status = 'syncing';
      this._startQueueWorker();
    }
    if (typeof this.onChange === 'function') this.onChange();

    return { ok: true, enqueuedCount };
  },

  retryAllErrors() {
    if (!this.db) return { ok: false, error: 'Database not available' };
    const errors = this.db.gdriveSyncErrorsAll() || [];
    const ids = errors.map(err => err.driveFileId);
    return this.retryErrors(ids);
  },

  startSync() {
    if (!this.auth?.isConnected?.()) {
      return { ok: false, error: 'Not connected to Google Drive' };
    }
    if (this.isPaused) {
      return { ok: false, error: 'Service is paused' };
    }
    if (this.scanPhase) {
      return { ok: false, error: 'Cannot start sync while scanning' };
    }
    this.status = 'syncing';
    this._startQueueWorker();
    if (typeof this.onChange === 'function') this.onChange();
    return { ok: true };
  },

  setAutoSyncAfterScan(enabled) {
    this.db.gdriveStateSet('auto_sync_after_scan', enabled ? '1' : '0');
    if (!enabled) {
      if (typeof this._stopActiveWorkersAndClaims === 'function') {
        this._stopActiveWorkersAndClaims();
      }
      this.status = 'idle';
    } else if (!this.isPaused && this.auth?.isConnected?.() && (this.db?.gdriveSyncQueueCount?.() || 0) > 0) {
      this.status = 'syncing';
      this._startQueueWorker();
    }
    if (typeof this.onChange === 'function') this.onChange();
    return { ok: true };
  },
};

module.exports = { queueWorkerMethods };
