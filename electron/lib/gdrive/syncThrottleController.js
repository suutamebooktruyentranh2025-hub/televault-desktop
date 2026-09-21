/**
 * Adaptive concurrency controller + retry logic for the GDrive sync queue worker.
 * Starts conservative (1 concurrent), scales up on success, drops back on errors.
 */
class SyncThrottleController {
  /**
   * @param {{
   *   minConcurrency?: number,
   *   maxConcurrency?: number,
   *   scaleUpAfter?: number,
   *   cooldownMs?: number,
   *   maxRetries?: number,
   *   baseRetryDelayMs?: number,
   * }} opts
   */
  constructor({
    minConcurrency = 1,
    maxConcurrency = 3,
    scaleUpAfter = 5,
    cooldownMs = 30000,
    maxRetries = 3,
    baseRetryDelayMs = 2000,
  } = {}) {
    this._min = minConcurrency;
    this._max = maxConcurrency;
    this._scaleUpAfter = scaleUpAfter;
    this._cooldownMs = cooldownMs;
    this._maxRetries = maxRetries;
    this._baseRetryDelayMs = baseRetryDelayMs;

    this._concurrency = minConcurrency;
    this._successStreak = 0;
    this._throttleCount = 0;
    this._lastScaleDownAt = 0;
  }

  /** @returns {number} Current target concurrency */
  getConcurrency() {
    return this._concurrency;
  }

  /** Call after a file syncs successfully. May increase concurrency. */
  reportSuccess() {
    this._successStreak += 1;
    if (
      this._successStreak >= this._scaleUpAfter &&
      this._concurrency < this._max &&
      !this._inCooldown()
    ) {
      this._concurrency += 1;
      this._successStreak = 0;
      console.log(`[SyncThrottleController] Scale up → concurrency=${this._concurrency}`);
    }
  }

  /**
   * Call when a sync error occurs.
   * @param {'throttle'|'timeout'|'network'|'permanent'} type
   */
  reportError(type) {
    this._successStreak = 0;
    if (type === 'throttle' || type === 'timeout' || type === 'auth') {
      this._throttleCount += 1;
      this._concurrency = this._min;
      this._lastScaleDownAt = Date.now();
      console.warn(`[SyncThrottleController] Scale down → concurrency=${this._concurrency} (${type})`);
    }
  }

  /**
   * Determine whether a failed file should be retried.
   * @param {number} attempt - Current attempt number (1-based)
   * @param {'throttle'|'timeout'|'network'|'permanent'|'auth'} errorType
   * @returns {{ retry: boolean, delayMs: number }}
   */
  shouldRetry(attempt, errorType) {
    if (errorType === 'permanent' || errorType === 'auth') {
      return { retry: false, delayMs: 0 };
    }
    if (attempt > this._maxRetries) {
      return { retry: false, delayMs: 0 };
    }
    const delayMs = this._baseRetryDelayMs * Math.pow(2, attempt - 1);
    return { retry: true, delayMs };
  }

  /** @returns {{ concurrency: number, successStreak: number, throttleCount: number }} */
  getStats() {
    return {
      concurrency: this._concurrency,
      successStreak: this._successStreak,
      throttleCount: this._throttleCount,
    };
  }

  /** @private */
  _inCooldown() {
    return Date.now() - this._lastScaleDownAt < this._cooldownMs;
  }
}

module.exports = { SyncThrottleController };
