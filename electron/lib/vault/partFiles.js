const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Extract a byte range from source into a temp part file.
 * @param {string} sourcePath
 * @param {number} offset
 * @param {number} size
 * @param {string} destPath
 */
function extractPartFile(sourcePath, offset, size, destPath) {
  return new Promise((resolve, reject) => {
    if (size === 0) {
      fs.writeFileSync(destPath, Buffer.alloc(0));
      resolve();
      return;
    }
    const readStream = fs.createReadStream(sourcePath, {
      start: offset,
      end: offset + size - 1,
    });
    const writeStream = fs.createWriteStream(destPath);
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);
    readStream.pipe(writeStream);
  });
}

/**
 * Write bytes from sourcePath into destPath at a given offset.
 * @param {string} sourcePath
 * @param {string} destPath
 * @param {number} offset
 */
function writeAtOffset(sourcePath, destPath, offset) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(sourcePath);
    const writeStream = fs.createWriteStream(destPath, { flags: 'r+', start: offset });
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);
    readStream.pipe(writeStream);
  });
}

/**
 * Create a sparse/preallocated output file of exact size.
 * @param {string} destPath
 * @param {number} totalSize
 */
function allocateFile(destPath, totalSize) {
  const fd = fs.openSync(destPath, 'w');
  try {
    if (totalSize > 0) fs.ftruncateSync(fd, totalSize);
  } finally {
    fs.closeSync(fd);
  }
}

function createPartsTempDir(label = 'parts') {
  const dirPath = path.join(os.tmpdir(), 'televault', `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function removeTempDir(dirPath) {
  if (!dirPath) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

module.exports = {
  extractPartFile,
  writeAtOffset,
  allocateFile,
  createPartsTempDir,
  removeTempDir,
};
