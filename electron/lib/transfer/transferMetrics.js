/**
 * EMA speed tracker (ported from TeleVault-elpideus uploadStore).
 * @param {{ now?: () => number }} [opts]
 */
function createSpeedTracker(opts = {}) {
  let lastProgress = 0;
  let lastUpdateAt = 0;
  let speedBps = 0;
  let totalBytes = 0;
  let progressFraction = 0;
  const nowFn = opts.now || Date.now;

  return {
    /**
     * @param {number} nextProgressFraction 0..1
     * @param {number} nextTotalBytes
     */
    update(nextProgressFraction, nextTotalBytes) {
      totalBytes = nextTotalBytes || 0;
      progressFraction = nextProgressFraction;
      const now = nowFn();
      if (lastUpdateAt === 0) {
        lastProgress = nextProgressFraction;
        lastUpdateAt = now;
        return;
      }
      const deltaTime = (now - lastUpdateAt) / 1000;
      if (deltaTime < 0.5) return;

      const deltaProgress = nextProgressFraction - lastProgress;
      if (deltaProgress > 0 && totalBytes > 0) {
        const deltaBytes = deltaProgress * totalBytes;
        const currentSpeed = deltaBytes / deltaTime;
        speedBps = speedBps === 0 ? currentSpeed : speedBps * 0.7 + currentSpeed * 0.3;
      } else if (deltaProgress < 0) {
        speedBps = 0;
      } else if (deltaTime > 10) {
        speedBps = 0;
      }
      lastProgress = nextProgressFraction;
      lastUpdateAt = now;
    },

    getSnapshot() {
      const bytesDone = progressFraction * totalBytes;
      const remainingBytes = Math.max(0, totalBytes - bytesDone);
      const etaSeconds = speedBps > 0 ? remainingBytes / speedBps : null;
      return {
        speedBps,
        etaSeconds,
        bytesDone,
        totalBytes,
      };
    },

    reset() {
      lastProgress = 0;
      lastUpdateAt = 0;
      speedBps = 0;
      totalBytes = 0;
      progressFraction = 0;
    },
  };
}

module.exports = { createSpeedTracker };
