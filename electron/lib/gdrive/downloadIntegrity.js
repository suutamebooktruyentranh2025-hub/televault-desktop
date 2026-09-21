const crypto = require('crypto');
const fs = require('fs');

/**
 * Stream MD5 of a file without loading it fully into RAM.
 * @param {string} filePath
 * @returns {Promise<string>} lowercase hex digest
 */
function md5FileStream(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const read_stream = fs.createReadStream(filePath);
    read_stream.on('data', (chunk) => hash.update(chunk));
    read_stream.on('error', reject);
    read_stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
  });
}

/**
 * Verify a Drive download before it is uploaded to Telegram.
 * Incomplete downloads are kept for Range resume; corrupt full-size files are deleted.
 * @param {{ filePath: string, expectedSize?: number, expectedMd5?: string|null, inFlightMd5?: string|null }} opts
 * @returns {Promise<number>} actual local file size
 */
async function verifyDownloadedFile({ filePath, expectedSize = 0, expectedMd5 = null, inFlightMd5 = null }) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Download integrity check failed: temp file missing');
  }

  const actual_size = fs.statSync(filePath).size;
  const expected_size = Number(expectedSize) || 0;

  if (expected_size > 0 && actual_size !== expected_size) {
    if (actual_size > expected_size) {
      try { fs.unlinkSync(filePath); } catch { /* ignore cleanup errors */ }
    }
    throw new Error(
      `Download size mismatch: expected ${expected_size} bytes, got ${actual_size}`,
    );
  }

  if (expectedMd5) {
    const actual_md5 = inFlightMd5 || (await md5FileStream(filePath));
    const expected_md5 = String(expectedMd5).toLowerCase();
    if (actual_md5 !== expected_md5) {
      try { fs.unlinkSync(filePath); } catch { /* ignore cleanup errors */ }
      throw new Error(
        `Download md5 mismatch: expected ${expected_md5}, got ${actual_md5}`,
      );
    }
  }

  return actual_size;
}

module.exports = { verifyDownloadedFile, md5FileStream };
