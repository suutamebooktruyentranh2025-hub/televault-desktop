const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { LocalWatcher } = require('./localWatcher');
const { computeSyncActions } = require('./syncEngine');
const { conflictName } = require('./conflictResolver');

/**
 * @typedef {'idle'|'syncing'|'paused'|'error'|'conflict'} SyncStatus
 */

class SyncService {
  /**
   * @param {{
   *   db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>,
   *   vault: import('../vault/vaultService').VaultService,
   *   onChange?: () => void,
   * }} opts
   */
  constructor({ db, vault, onChange }) {
    this.db = db;
    this.vault = vault;
    this.onChange = onChange || (() => {});
    /** @type {LocalWatcher | null} */
    this._watcher = null;
    /** @type {SyncStatus} */
    this.status = 'idle';
    this.lastSyncAt = null;
    this.pendingCount = 0;
    this.conflictCount = 0;
    this.lastError = null;
    this._syncInProgress = false;
    /** @type {string[]} */
    this.conflicts = [];
  }

  getSnapshot() {
    const config = typeof this.db?.getSyncConfig === 'function' ? this.db.getSyncConfig() : null;
    return {
      enabled: Boolean(config?.syncEnabled && config?.syncFolder),
      syncEnabled: Boolean(config?.syncEnabled),
      syncFolder: config?.syncFolder || null,
      status: this.status,
      lastSyncAt: this.lastSyncAt,
      pendingCount: this.pendingCount,
      conflictCount: this.conflictCount,
      conflicts: [...this.conflicts],
      lastError: this.lastError,
    };
  }

  async start() {
    const config = this.db.getSyncConfig();
    if (!config.syncEnabled || !config.syncFolder) return;
    if (!fs.existsSync(config.syncFolder)) {
      this.status = 'error';
      this.lastError = 'Thư mục sync không tồn tại';
      this.onChange();
      return;
    }

    this._watcher = new LocalWatcher({
      folder: config.syncFolder,
      debounceMs: 30000,
      onBatch: () => void this._runSync(),
    });

    await this._watcher.start();
    this.status = 'idle';
    this.onChange();

    // Run initial sync
    await this._runSync();
  }

  async stop() {
    if (this._watcher) {
      await this._watcher.stop();
      this._watcher = null;
    }
    this.status = 'idle';
    this.onChange();
  }

  async _runSync() {
    if (this._syncInProgress) return;
    this._syncInProgress = true;
    this.status = 'syncing';
    this.lastError = null;
    this.onChange();

    try {
      const config = this.db.getSyncConfig();
      if (!config.syncFolder || !config.syncEnabled) return;

      // 1. Scan local files
      const localFiles = this._scanLocalFiles(config.syncFolder);

      // 2. Get remote files from DB under sync vault folder
      const remoteFiles = this._getRemoteFiles(config.syncVaultFolder);

      // 3. Get manifest
      const manifest = this.db.syncManifestAll();

      // 4. Compute actions
      const actions = computeSyncActions({
        localFiles,
        remoteFiles,
        manifest,
        mode: config.syncMode,
      });

      this.pendingCount = actions.length;
      this.onChange();

      // 5. Execute actions
      const newConflicts = [];
      for (const action of actions) {
        try {
          await this._executeAction(action, config);
          this.pendingCount -= 1;
          this.onChange();
        } catch (e) {
          console.error(`[SyncService] Failed action ${action.action} for ${action.relPath}:`, e);
          if (action.action === 'conflict') newConflicts.push(action.relPath);
        }
      }

      this.conflicts = newConflicts;
      this.conflictCount = newConflicts.length;
      this.lastSyncAt = new Date().toISOString();
      this.status = newConflicts.length > 0 ? 'conflict' : 'idle';
    } catch (e) {
      this.status = 'error';
      this.lastError = String(e.message || e);
      console.error('[SyncService] sync error:', e);
    } finally {
      this._syncInProgress = false;
      this.onChange();
    }
  }

  _scanLocalFiles(folder) {
    /** @type {Array<{ relPath: string, sha256: string, mtime: string }>} */
    const files = [];
    this._walkDir(folder, (relPath, fullPath) => {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return;
      const sha256 = this._sha256Of(fullPath);
      files.push({ relPath, sha256, mtime: stat.mtime.toISOString() });
    });
    return files;
  }

  _walkDir(dir, fn, prefix = '') {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue; // skip hidden files
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) this._walkDir(full, fn, rel);
      else fn(rel, full);
    }
  }

  _getRemoteFiles(syncVaultFolder) {
    const entries = this.db.getAll();
    /** @type {Array<{ relPath: string, sha256: string, messageId: number }>} */
    const files = [];
    for (const entry of entries) {
      if (entry.path.endsWith('/')) continue; // skip folders
      if (!entry.path.startsWith(syncVaultFolder)) continue;
      const relPath = entry.path.slice(syncVaultFolder.length);
      files.push({ relPath, sha256: entry.sha256, messageId: entry.messageId });
    }
    return files;
  }

  async _executeAction(action, config) {
    const { syncFolder, syncVaultFolder } = config;

    switch (action.action) {
      case 'upload': {
        const localPath = path.join(syncFolder, action.relPath);
        const destPath = `${syncVaultFolder}${action.relPath}`;
        if (!fs.existsSync(localPath)) break;

        // Pause watcher to avoid re-triggering
        this._watcher?.pause();
        try {
          const { done } = await this.vault.enqueueUpload(localPath, destPath);
          await done;
        } finally {
          this._watcher?.resume();
        }

        this.db.syncManifestUpsert(action.relPath, {
          sha256: action.sha256,
          mtime: new Date().toISOString(),
          side: 'both',
        });
        break;
      }

      case 'download': {
        const entry = this.db.getAll().find(e => e.messageId === action.messageId);
        if (!entry) break;

        this._watcher?.pause();
        try {
          const { done } = this.vault.enqueueDownload(entry);
          const downloadedPath = await done;
          // Copy from TDLib cache to sync folder
          const destLocalPath = path.join(syncFolder, action.relPath);
          const destDir = path.dirname(destLocalPath);
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(downloadedPath, destLocalPath);
        } finally {
          this._watcher?.resume();
        }

        this.db.syncManifestUpsert(action.relPath, {
          sha256: action.sha256,
          mtime: new Date().toISOString(),
          side: 'both',
        });
        break;
      }

      case 'delete-remote': {
        await this.vault.deleteEntries([action.messageId]);
        this.db.syncManifestDelete(action.relPath);
        break;
      }

      case 'delete-local': {
        const localPath = path.join(syncFolder, action.relPath);
        this._watcher?.pause();
        try {
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        } finally {
          this._watcher?.resume();
        }
        this.db.syncManifestDelete(action.relPath);
        break;
      }

      case 'conflict': {
        // Keep remote version on Telegram as-is
        // Rename local file with conflict suffix
        const localPath = path.join(syncFolder, action.relPath);
        if (!fs.existsSync(localPath)) break;

        const dirOfFile = path.dirname(localPath);
        const existingPaths = fs.existsSync(dirOfFile)
          ? fs.readdirSync(dirOfFile).map(n =>
              path.relative(syncFolder, path.join(dirOfFile, n)).replace(/\\/g, '/')
            )
          : [];
        const conflictRelPath = conflictName(action.relPath, new Date(), existingPaths);
        const conflictFullPath = path.join(syncFolder, conflictRelPath);

        this._watcher?.pause();
        try {
          fs.renameSync(localPath, conflictFullPath);
          // Upload conflict copy to Telegram
          const conflictDest = `${syncVaultFolder}${conflictRelPath}`;
          const { done } = await this.vault.enqueueUpload(conflictFullPath, conflictDest);
          await done;

          // Download remote version to local
          const entry = this.db.getAll().find(e => e.messageId === action.messageId);
          if (entry) {
            const { done: dlDone } = this.vault.enqueueDownload(entry);
            const downloadedPath = await dlDone;
            fs.copyFileSync(downloadedPath, localPath);
          }
        } finally {
          this._watcher?.resume();
        }

        // Update manifest for both files
        this.db.syncManifestUpsert(action.relPath, {
          sha256: action.remoteSha,
          mtime: new Date().toISOString(),
          side: 'both',
        });
        this.db.syncManifestUpsert(conflictRelPath, {
          sha256: action.localSha,
          mtime: new Date().toISOString(),
          side: 'both',
        });
        break;
      }

      default:
        break;
    }
  }

  _sha256Of(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }

  /**
   * Run initial sync with the chosen strategy.
   * @param {'merge'|'local-source'|'remote-source'} strategy
   */
  async runInitialSync(strategy) {
    const config = this.db.getSyncConfig();
    if (!config.syncFolder) throw new Error('No sync folder configured');

    this.status = 'syncing';
    this.onChange();

    try {
      // Clear existing manifest
      this.db.syncManifestClear();

      const localFiles = this._scanLocalFiles(config.syncFolder);
      const remoteFiles = this._getRemoteFiles(config.syncVaultFolder);

      switch (strategy) {
        case 'merge': {
          // Upload all local files, download all remote-only files
          for (const lf of localFiles) {
            const remote = remoteFiles.find(r => r.relPath === lf.relPath);
            if (remote && remote.sha256 === lf.sha256) {
              // Same file, just record in manifest
              this.db.syncManifestUpsert(lf.relPath, {
                sha256: lf.sha256,
                mtime: lf.mtime,
                side: 'both',
              });
            } else if (remote) {
              // Different content — keep both (conflict)
              const conflictRelPath = conflictName(lf.relPath);
              const conflictFullPath = path.join(config.syncFolder, conflictRelPath);
              fs.renameSync(path.join(config.syncFolder, lf.relPath), conflictFullPath);
              const { done } = await this.vault.enqueueUpload(
                conflictFullPath,
                `${config.syncVaultFolder}${conflictRelPath}`,
              );
              await done;
              // Download remote version
              const entry = this.db.getAll().find(e => e.messageId === remote.messageId);
              if (entry) {
                const { done: dl } = this.vault.enqueueDownload(entry);
                const dlPath = await dl;
                fs.copyFileSync(dlPath, path.join(config.syncFolder, lf.relPath));
              }
              this.db.syncManifestUpsert(lf.relPath, { sha256: remote.sha256, mtime: new Date().toISOString(), side: 'both' });
              this.db.syncManifestUpsert(conflictRelPath, { sha256: lf.sha256, mtime: lf.mtime, side: 'both' });
            } else {
              // Local only — upload
              const { done } = await this.vault.enqueueUpload(
                path.join(config.syncFolder, lf.relPath),
                `${config.syncVaultFolder}${lf.relPath}`,
              );
              await done;
              this.db.syncManifestUpsert(lf.relPath, { sha256: lf.sha256, mtime: lf.mtime, side: 'both' });
            }
          }
          // Download remote-only files
          if (config.syncMode === 'two-way') {
            for (const rf of remoteFiles) {
              if (localFiles.some(l => l.relPath === rf.relPath)) continue;
              const entry = this.db.getAll().find(e => e.messageId === rf.messageId);
              if (!entry) continue;
              const { done } = this.vault.enqueueDownload(entry);
              const dlPath = await done;
              const destLocal = path.join(config.syncFolder, rf.relPath);
              const destDir = path.dirname(destLocal);
              if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(dlPath, destLocal);
              this.db.syncManifestUpsert(rf.relPath, { sha256: rf.sha256, mtime: new Date().toISOString(), side: 'both' });
            }
          }
          break;
        }

        case 'local-source': {
          // Upload everything from local, ignore remote
          for (const lf of localFiles) {
            const { done } = await this.vault.enqueueUpload(
              path.join(config.syncFolder, lf.relPath),
              `${config.syncVaultFolder}${lf.relPath}`,
            );
            await done;
            this.db.syncManifestUpsert(lf.relPath, { sha256: lf.sha256, mtime: lf.mtime, side: 'both' });
          }
          break;
        }

        case 'remote-source': {
          // Download everything from remote to local
          for (const rf of remoteFiles) {
            const entry = this.db.getAll().find(e => e.messageId === rf.messageId);
            if (!entry) continue;
            const { done } = this.vault.enqueueDownload(entry);
            const dlPath = await done;
            const destLocal = path.join(config.syncFolder, rf.relPath);
            const destDir = path.dirname(destLocal);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(dlPath, destLocal);
            this.db.syncManifestUpsert(rf.relPath, { sha256: rf.sha256, mtime: new Date().toISOString(), side: 'both' });
          }
          break;
        }
      }

      this.lastSyncAt = new Date().toISOString();
      this.status = 'idle';
    } catch (e) {
      this.status = 'error';
      this.lastError = String(e.message || e);
      throw e;
    } finally {
      this.onChange();
    }
  }
}

module.exports = { SyncService };
