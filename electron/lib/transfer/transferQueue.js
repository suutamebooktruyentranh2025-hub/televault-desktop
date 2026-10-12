const { createSpeedTracker } = require('./transferMetrics');
const { parseFloodWaitSeconds } = require('../telegram/floodRetry');

class TransferTask {
  /**
   * @param {{ id: string, kind: string, label: string, run: (report: (f: number) => void, signal?: AbortSignal) => Promise<void> }} opts
   */
  constructor({ id, kind, label, run, localPath, destPath, messageId, totalBytes, persistId, metadata }) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this.run = run;
    this.localPath = localPath ?? null;
    this.destPath = destPath ?? null;
    this.messageId = messageId ?? null;
    this.totalBytes = totalBytes ?? null;
    this.persistId = persistId ?? null;
    this.metadata = metadata ?? null;
    this.status = 'queued';
    this.phase = 'queued';
    this.error = null;
    this.lastProgress = 0;
    this.abortController = new AbortController();
    this.speedTracker = createSpeedTracker();
    /** @type {Set<(f: number) => void>} */
    this._listeners = new Set();
  }

  /** @param {(f: number) => void} fn */
  onProgress(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** @param {number} f */
  _report(f) {
    this.lastProgress = f;
    if (this.totalBytes != null) {
      this.speedTracker.update(f, this.totalBytes);
    }
    for (const fn of this._listeners) fn(f);
  }
}

class TransferQueue {
  /**
   * @param {{
   *   maxConcurrent?: number,
   *   baseBackoffMs?: number,
   *   maxAttempts?: number,
   *   onChange?: () => void,
   *   sleep?: (ms: number) => Promise<void>,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.maxConcurrent = opts.maxConcurrent ?? 2;
    this.baseBackoffMs = opts.baseBackoffMs ?? 2000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.onChange = opts.onChange || (() => {});
    this.onStatusChange = opts.onStatusChange || null;
    this.isPaused = false;
    this.pacingMs = opts.pacingMs ?? 1500;
    this._sleep = opts.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    /** @type {TransferTask[]} */
    this.tasks = [];
    /** @type {Array<[TransferTask, (value?: void) => void, (reason?: unknown) => void]>} */
    this._waiting = [];
    this._running = 0;
    this._lastProgressNotifyAt = 0;
  }

  _touchProgressNotify() {
    const now = Date.now();
    if (now - this._lastProgressNotifyAt >= 200) {
      this._lastProgressNotifyAt = now;
      this.onChange();
    }
  }

  setMaxConcurrent(n) {
    this.maxConcurrent = Math.max(1, Math.min(5, n));
    this._pump();
  }

  pause() {
    if (this.isPaused) return;
    this.isPaused = true;
    this.onChange();
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.onChange();
    this._pump();
  }

  /** @param {TransferTask} task */
  add(task) {
    return new Promise((resolve, reject) => {
      this.tasks.push(task);
      this._waiting.push([task, resolve, reject]);
      this.onChange();
      this._pump();
    });
  }

  restorePaused(task) {
    if (task.status === 'queued') task.status = 'paused';
    this.tasks.push(task);
    this.onChange();
  }

  removeTask(taskId) {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.onChange();
  }

  startTask(task) {
    if (task.status === 'paused' || task.status === 'failed') {
      task.error = null;
      task.lastProgress = 0;
      task.phase = 'queued';
      task.speedTracker.reset();
      task.abortController = new AbortController();
      task.status = 'queued';
    }
    if (task.status !== 'queued') return Promise.resolve();
    const done = new Promise((resolve, reject) => {
      this._waiting.push([task, resolve, reject]);
      this._notify(task);
      this._pump();
    });
    done.catch(() => {});
    task._donePromise = done;
    return done;
  }

  /** @param {TransferTask} task @param {(value?: void) => void} resolve @param {(reason?: unknown) => void} reject */
  _settle(task, resolve, reject) {
    if (task.status === 'failed') {
      reject(task.error || new Error('Transfer failed'));
      return;
    }
    if (task.status === 'cancelled') {
      const cancelled = new Error('Transfer cancelled');
      cancelled.name = 'AbortError';
      reject(cancelled);
      return;
    }
    resolve();
  }

  _notify(task) {
    this.onChange();
    if (this.onStatusChange) this.onStatusChange(task);
  }

  cancel(taskId) {
    let canceled = false;
    for (const [task] of this._waiting) {
      if (task.id === taskId && task.status === 'queued') {
        task.status = 'cancelled';
        this._notify(task);
        canceled = true;
      }
    }
    if (!canceled) {
      const runningTask = this.tasks.find((t) => t.id === taskId && t.status === 'running');
      if (runningTask) {
        runningTask.status = 'cancelled';
        runningTask.abortController.abort();
        this._notify(runningTask);
      }
    }
  }

  clearFinished() {
    this.tasks = this.tasks.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'failed',
    );
    this.onChange();
  }

  snapshot() {
    return this.tasks.map((t) => {
      const metrics = t.speedTracker.getSnapshot();
      return {
        id: t.id,
        kind: t.kind,
        label: t.label,
        status: t.status,
        phase: t.phase,
        progress: t.lastProgress,
        error: t.error ? String(t.error.message || t.error) : null,
        metadata: t.metadata,
        bytesDone: metrics.bytesDone,
        totalBytes: t.totalBytes,
        speedBps: metrics.speedBps,
        etaSeconds: metrics.etaSeconds,
      };
    });
  }

  _pump() {
    if (this.isPaused) return;
    while (this._running < this.maxConcurrent && this._waiting.length > 0) {
      if (this.isPaused) return;
      const [task, resolve, reject] = this._waiting.shift();
      if (task.status === 'cancelled') {
        this._settle(task, resolve, reject);
        continue;
      }
      this._running += 1;
      this._execute(task).finally(() => {
        this._running -= 1;
        this._settle(task, resolve, reject);
        this._notify(task);
        this._pump();
      });
    }
  }

  /** @param {TransferTask} task */
  async _execute(task) {
    task.status = 'running';
    this._notify(task);
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (task.status === 'cancelled') return;
      try {
        if (attempt > 1) {
          task.lastProgress = 0;
          task.speedTracker.reset();
          task.abortController = new AbortController();
        }
        await task.run((f) => {
          task._report(f);
          this._touchProgressNotify();
        }, task.abortController.signal);

        if (task.status === 'cancelled') return;
        task.status = 'done';
        task.phase = 'done';
        if (this.pacingMs > 0 && task.kind === 'upload') {
          await this._sleep(this.pacingMs);
        }
        return;
      } catch (e) {
        if (task.status === 'cancelled') return;
        task.error = e;
        const floodWaitSec = parseFloodWaitSeconds(e);
        if (attempt === this.maxAttempts) {
          task.status = 'failed';
          if (floodWaitSec != null || e?.code === 429 || (typeof e?.message === 'string' && e.message.includes('Too Many Requests'))) {
            this.pause();
          }
          return;
        }
        const delayMs = floodWaitSec != null
          ? floodWaitSec * 1000
          : this.baseBackoffMs * attempt;
        await this._sleep(delayMs);
      }
    }
  }
}

module.exports = { TransferQueue, TransferTask };
