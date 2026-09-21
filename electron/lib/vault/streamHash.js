const fs = require('fs');
const crypto = require('crypto');

/** Chunk size matches TeleVault-elpideus hash-worker (64 MB). */
const CHUNK_SIZE = 64 * 1024 * 1024;

/**
 * Stream SHA-256 of a file without loading it fully into RAM.
 * @param {string} filePath
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<string>} hex digest
 */
async function sha256Stream(filePath, { onProgress, signal } = {}) {
  const totalSize = fs.statSync(filePath).size;
  const hash = crypto.createHash('sha256');
  let bytesRead = 0;

  await new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });

    const onAbort = () => {
      readStream.destroy();
      reject(new Error('Hash aborted'));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    readStream.on('data', (chunk) => {
      hash.update(chunk);
      bytesRead += chunk.length;
      if (totalSize > 0 && onProgress) {
        onProgress(bytesRead / totalSize);
      }
    });
    readStream.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    readStream.on('end', () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    });
  });

  return hash.digest('hex');
}

module.exports = { sha256Stream, CHUNK_SIZE };
