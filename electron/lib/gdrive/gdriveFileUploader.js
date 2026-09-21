const fs = require('fs');
const { isInTrash } = require('@televault/core');
const { shouldSkipDownload, resolveConflictVaultPath } = require('./gdriveDiscovery');
const { createSpeedTracker } = require('../transfer/transferMetrics');
const { createAbortError } = require('./gdriveFloodController');

const uploaderMethods = {
  _assertSubscriptionExists(driveFileId, vaultPath) {
    if (typeof this.db?.gdriveSubscriptionsAll !== 'function') return;
    if (String(vaultPath).startsWith('/GoogleDrive/')) return;
    const current_subscriptions = this.db.gdriveSubscriptionsAll();
    const matching_subscription = current_subscriptions.some((subscription_item) => (
      subscription_item.isFolder
        ? String(vaultPath).startsWith(subscription_item.vaultPath)
        : subscription_item.driveId === driveFileId || subscription_item.vaultPath === vaultPath
    ));
    if (!matching_subscription) throw createAbortError();
  },

  _getVaultEntriesAtPath(vaultPath) {
    const vault_db = this.vault?.db;
    if (vault_db && typeof vault_db.getEntriesByPath === 'function') {
      return vault_db.getEntriesByPath(vaultPath).filter((e) => !isInTrash(e.path));
    }
    if (typeof this.db?.getEntriesByPath === 'function') {
      return this.db.getEntriesByPath(vaultPath).filter((e) => !isInTrash(e.path));
    }
    return this._vaultEntries().filter((e) => e.path === vaultPath && !isInTrash(e.path));
  },

  async _syncFile({
    driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, md5Checksum = null,
  }, signal, workerId) {
    if (typeof this._shouldSyncFile === 'function' && !this._shouldSyncFile(fileName || drivePath)) {
      console.log(`[GDriveSyncService] _syncFile skipping ignored file: ${fileName}`);
      this.db.gdriveSyncQueueRemove(driveFileId);
      return;
    }
    try {
      if (!workerId || !this._activeWorkersMap || this._activeWorkersMap.size <= 1) {
        this.currentSyncProgress = 0;
        this._currentSpeedBps = 0;
        this._syncPhase = 'download';
        this._downloadFraction = 0;
        this._uploadFraction = 0;
        this._downloadSpeedTracker = createSpeedTracker({ now: this._now });
      }
      if (typeof this.onChange === 'function') this.onChange();

      // Do not download more Drive bytes while Telegram is flood-waiting.
      await this._awaitTelegramFloodClear(signal);

      const existing_manifest = this.db.gdriveManifestGet(driveFileId);
      const matching_entries = this._getVaultEntriesAtPath(vaultPath);
      const matching_entry = matching_entries.find(
        (vault_entry) => Number(vault_entry.size) === Number(size),
      ) || matching_entries[0] || null;
      if (shouldSkipDownload({
        manifest: existing_manifest,
        driveMd5: md5Checksum,
        vaultEntry: matching_entry,
        driveSize: size,
      })) {
        this._assertSubscriptionExists(driveFileId, vaultPath);
        this.db.gdriveManifestUpsert({
          driveFileId,
          drivePath,
          vaultPath,
          md5: md5Checksum,
          sha256: existing_manifest?.sha256 ?? matching_entry.sha256,
          size: existing_manifest?.size ?? matching_entry.size,
          driveModifiedTime: modifiedTime,
        });
        this.db.gdriveSyncErrorRemove(driveFileId);
        return;
      }

      // Download to temp
      const customTempDir = this.db.gdriveStateGet('temp_download_dir', '');
      const download_started_at = Date.now();
      const resultHolder = {};
      const tempPath = await this.api.downloadFile(driveFileId, fileName, customTempDir, (progress) => {
        this._noteDownloadProgress(progress, size, workerId);
      }, {
        signal,
        expectedSize: size,
        expectedMd5: md5Checksum,
        resultHolder,
      });
      {
        const elapsed_sec = Math.max(0.001, (Date.now() - download_started_at) / 1000);
        const mbps = (Number(size) || 0) / elapsed_sec / (1024 * 1024);
        console.log(`[GDrive] download done ${fileName}: ${mbps.toFixed(2)} MB/s (${size || 0} bytes in ${elapsed_sec.toFixed(1)}s)`);
      }

      // Keep temp on upload/retryable failure so the next attempt can reuse the local file
      let cleanupTemp = true;
      try {
        const verified_size = fs.statSync(tempPath).size;
        let sha256 = resultHolder.sha256;
        if (!sha256) {
          this._noteHashProgress(workerId);
          sha256 = await this._sha256OfAsync(tempPath, signal);
        }
        this._assertSubscriptionExists(driveFileId, vaultPath);

        // Dedup check: if same SHA256 + size already on vault at same path, skip
        const original_vault_path = vaultPath;
        const existingEntries = this._getVaultEntriesAtPath(original_vault_path);
        let overwrite_message_ids = [];
        if (existingEntries.length > 0) {
          const existing = existingEntries.find(
            (vault_entry) => vault_entry.sha256 === sha256 && vault_entry.size === verified_size,
          ) || null;
          if (existing) {
            this._assertSubscriptionExists(driveFileId, vaultPath);
            this.db.gdriveManifestUpsert({
              driveFileId, drivePath, vaultPath, md5: md5Checksum, sha256, size: verified_size,
              driveModifiedTime: modifiedTime,
            });
            this.db.gdriveSyncErrorRemove(driveFileId);
            return;
          }

          const conflict_policy = this.db.gdriveStateGet('conflict_policy', 'skip');
          const existing_paths = this._vaultEntries().map((vault_entry) => vault_entry.path);
          const conflict_decision = resolveConflictVaultPath({
            policy: conflict_policy,
            vaultPath,
            existingPaths: existing_paths,
            now: new Date(),
          });
          if (conflict_decision.action === 'skip') {
            this._assertSubscriptionExists(driveFileId, vaultPath);
            this.db.gdriveSyncErrorAdd({
              driveFileId,
              fileName,
              drivePath,
              vaultPath,
              size,
              modifiedTime,
              errorMessage: 'conflict: vault has different content',
            });
            return;
          }
          if (conflict_policy === 'overwrite' && conflict_decision.vaultPath === original_vault_path) {
            overwrite_message_ids = existingEntries
              .map((vault_entry) => vault_entry.messageId)
              .filter((message_id) => Number.isInteger(message_id));
          }
          vaultPath = conflict_decision.vaultPath;
        }

        // Upload to Telegram vault
        if (signal?.aborted) throw createAbortError();
        const pending_upload = await this.vault.enqueueUpload(tempPath, vaultPath, {
          metadata: { source: 'gdrive', sha256 },
          sha256,
        });
        let active_cancellation = null;
        let active_unsubscribe = null;
        try {
          if (!pending_upload.skipped && pending_upload.task) {
            active_cancellation = () => this.vault.queue.cancel(pending_upload.task.id);
            signal?.addEventListener('abort', active_cancellation, { once: true });
            if (signal?.aborted) active_cancellation();

            active_unsubscribe = pending_upload.task.onProgress((progress) => {
              this._noteUploadProgress(progress, pending_upload.task.speedBps, workerId);
            });
            await pending_upload.done;
            if (!pending_upload.skipped && pending_upload.task?.status === 'failed') {
              const upload_error = pending_upload.task.error || new Error('Upload failed');
              throw upload_error instanceof Error
                ? upload_error
                : new Error(String(upload_error.message || upload_error));
            }
            if (!pending_upload.skipped && pending_upload.task?.status === 'cancelled') {
              throw createAbortError();
            }
          } else {
            this.currentSyncProgress = 1;
            this._downloadFraction = 1;
            this._uploadFraction = 1;
            this._currentSpeedBps = 0;
            this._notifyProgress();
          }
          if (signal?.aborted) throw createAbortError();
        } finally {
          if (active_cancellation) {
            signal?.removeEventListener('abort', active_cancellation);
          }
          active_unsubscribe?.();
        }

        if (!pending_upload.skipped && overwrite_message_ids.length > 0) {
          const current_entries = this._getVaultEntriesAtPath(original_vault_path);
          const trashable_ids = overwrite_message_ids.filter((message_id) => current_entries.some(
            (vault_entry) => vault_entry.messageId === message_id
              && vault_entry.path === original_vault_path
              && !isInTrash(vault_entry.path),
          ));
          await this.vault.trashEntries(trashable_ids);
        }

        this._assertSubscriptionExists(driveFileId, original_vault_path);
        this.db.gdriveManifestUpsert({
          driveFileId, drivePath, vaultPath, md5: md5Checksum, sha256, size: verified_size,
          driveModifiedTime: modifiedTime,
        });
        this.db.gdriveSyncErrorRemove(driveFileId);
      } catch (upload_or_hash_error) {
        cleanupTemp = false;
        throw upload_or_hash_error;
      } finally {
        if (cleanupTemp) {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); }
          catch (e) { console.warn('[GDriveSyncService] temp cleanup failed:', e); }
        }
      }
    } catch (e) {
      if (signal?.aborted) {
        if (e.name === 'AbortError') throw e;
        throw createAbortError();
      }
      if (e.name === 'AbortError') throw e;
      this._assertSubscriptionExists(driveFileId, vaultPath);
      this.db.gdriveSyncErrorAdd({
        driveFileId, fileName, drivePath, vaultPath, size,
        modifiedTime, errorMessage: String(e.message || e),
      });
      throw e;
    }
  },
};

module.exports = { uploaderMethods };
