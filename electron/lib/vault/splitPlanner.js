/** Telegram document limit (non-premium). Ported from TeleVault-elpideus. */
const SPLIT_SIZE = 2_097_152_000;

/**
 * @param {number} totalSize
 * @param {number} [splitSize]
 * @returns {Array<{ partIndex: number, offset: number, size: number }>}
 */
function planSplits(totalSize, splitSize = SPLIT_SIZE) {
  if (!Number.isFinite(totalSize) || totalSize < 0) {
    throw new Error('totalSize must be a non-negative number');
  }
  if (totalSize === 0) {
    return [{ partIndex: 0, offset: 0, size: 0 }];
  }
  if (totalSize <= splitSize) {
    return [{ partIndex: 0, offset: 0, size: totalSize }];
  }
  const partCount = Math.ceil(totalSize / splitSize);
  return Array.from({ length: partCount }, (_, partIndex) => ({
    partIndex,
    offset: partIndex * splitSize,
    size: Math.min(splitSize, totalSize - partIndex * splitSize),
  }));
}

function needsSplit(totalSize, splitSize = SPLIT_SIZE) {
  return totalSize > splitSize;
}

module.exports = { SPLIT_SIZE, planSplits, needsSplit };
