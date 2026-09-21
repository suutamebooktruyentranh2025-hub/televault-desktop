const path = require('path');
const { sha256Stream } = require('../vault/streamHash');
const { createSpeedTracker } = require('../transfer/transferMetrics');
const { sleepWithAbort, classifyError, parseFloodWaitSeconds } = require('./gdriveFloodController');

const downloaderMethods = {
  _sleep(delay_ms, abort_signal) {
    return sleepWithAbort(delay_ms, abort_signal);
  },

  _now() {
    return Date.now();
  },

  _telegramFloodWaitSecRemaining() {
    const remaining_ms = (this._telegramFloodUntil || 0) - this._now();
    if (remaining_ms <= 0) return 0;
    return Math.ceil(remaining_ms / 1000);
  },

  _noteTelegramFlood(error) {
    const wait_sec = parseFloodWaitSeconds(error);
    if (wait_sec == null) return null;
    const until = this._now() + wait_sec * 1000;
    if (until > (this._telegramFloodUntil || 0)) {
      this._telegramFloodUntil = until;
      if (typeof this.onChange === 'function') this.onChange();
    }
    return wait_sec;
  },

  async _awaitTelegramFloodClear(abort_signal) {
    while (this._now() < (this._telegramFloodUntil || 0)) {
      if (typeof this.onChange === 'function') this.onChange();
      const remaining_ms = this._telegramFloodUntil - this._now();
      await this._sleep(Math.min(Math.max(remaining_ms, 1), 1000), abort_signal);
    }
    if (this._telegramFloodUntil) {
      this._telegramFloodUntil = 0;
      if (typeof this.onChange === 'function') this.onChange();
    }
  },

  getProgressSnapshot() {
    return {
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
    };
  },

  _notifyProgress() {
    const now = typeof this._now === 'function' ? this._now() : Date.now();
    if (now - this._lastProgressNotifyAt < 200) return;
    this._lastProgressNotifyAt = now;
    if (typeof this.onProgress === 'function') {
      this.onProgress(this.getProgressSnapshot());
    }
  },

  _noteDownloadProgress(downloadFraction, totalBytes, workerId) {
    const fraction = Math.min(1, Math.max(0, Number(downloadFraction) || 0));
    this._syncPhase = 'download';
    this._downloadFraction = fraction;
    this._uploadFraction = 0;
    this.currentSyncProgress = fraction * 0.5;

    if (workerId && this._activeWorkersMap?.has(workerId)) {
      const task = this._activeWorkersMap.get(workerId);
      task.phase = 'download';
      task.progress = fraction;
      task.downloadProgress = fraction;
      task.uploadProgress = 0;
      if (!task.speedTracker) {
        task.speedTracker = createSpeedTracker({ now: this._now });
      }
      task.speedTracker.update(fraction, totalBytes || task.size || 0);
      task.speedBps = task.speedTracker.getSnapshot().speedBps;
    } else {
      if (!this._downloadSpeedTracker) {
        this._downloadSpeedTracker = createSpeedTracker({ now: this._now });
      }
      this._downloadSpeedTracker.update(fraction, totalBytes || 0);
      this._currentSpeedBps = this._downloadSpeedTracker.getSnapshot().speedBps;
    }

    if (this._activeWorkersMap && this._activeWorkersMap.size > 0) {
      let totalSpeed = 0;
      for (const t of this._activeWorkersMap.values()) {
        totalSpeed += (t.speedBps || 0);
      }
      this._currentSpeedBps = totalSpeed;
    }

    this._notifyProgress();
  },

  _noteHashProgress(workerId) {
    this._syncPhase = 'hash';
    this._downloadFraction = 1;
    this._uploadFraction = 0;
    this._currentSpeedBps = 0;
    this.currentSyncProgress = 0.5;

    if (workerId && this._activeWorkersMap?.has(workerId)) {
      const task = this._activeWorkersMap.get(workerId);
      task.phase = 'hash';
      task.progress = 0.5;
      task.downloadProgress = 1;
      task.uploadProgress = 0;
      task.speedBps = 0;
    }
    this._notifyProgress();
  },

  _noteUploadProgress(uploadFraction, speedBps, workerId) {
    const fraction = Math.min(1, Math.max(0, Number(uploadFraction) || 0));
    const spd = Number(speedBps) > 0 ? Number(speedBps) : 0;
    this._syncPhase = 'upload';
    this._downloadFraction = 1;
    this._uploadFraction = fraction;
    this.currentSyncProgress = 0.5 + fraction * 0.5;

    if (workerId && this._activeWorkersMap?.has(workerId)) {
      const task = this._activeWorkersMap.get(workerId);
      task.phase = 'upload';
      task.progress = fraction;
      task.downloadProgress = 1;
      task.uploadProgress = fraction;
      task.speedBps = spd;
    }

    if (this._activeWorkersMap && this._activeWorkersMap.size > 0) {
      let totalSpeed = 0;
      for (const t of this._activeWorkersMap.values()) {
        totalSpeed += (t.speedBps || 0);
      }
      this._currentSpeedBps = totalSpeed;
    } else {
      this._currentSpeedBps = spd;
    }

    this._notifyProgress();
  },

  async _sha256OfAsync(filePath, signal) {
    return sha256Stream(filePath, { signal });
  },

  _shouldSyncFile(fileName) {
    const ignored = this.db?.gdriveStateGet?.('ignored_extensions', '') || '';
    const allowed = this.db?.gdriveStateGet?.('allowed_extensions', '') || '';
    return shouldSyncFileName(fileName, { ignored, allowed });
  },

  _classifyError(err) {
    return classifyError(err);
  },
};

function shouldSyncFileName(fileName, { ignored = '', allowed = '' } = {}) {
  const ext = path.extname(fileName || '').toLowerCase().slice(1);
  if (!ext) return true;

  if (ignored) {
    const ignoredList = String(ignored)
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);
    if (ignoredList.includes(ext)) return false;
  }

  if (allowed) {
    const allowedList = String(allowed)
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);
    if (allowedList.length > 0 && !allowedList.includes(ext)) return false;
  }

  return true;
}

module.exports = { downloaderMethods, shouldSyncFileName };

