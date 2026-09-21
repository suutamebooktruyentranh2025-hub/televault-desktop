const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const PARALLEL_DOWNLOAD_THRESHOLD = 20 * 1024 * 1024; // 20 MB
const DEFAULT_CONCURRENCY = 4;
const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Pre-allocates an empty destination file of exact size.
 * @param {string} destPath
 * @param {number} totalSize
 */
function allocateFile(destPath, totalSize) {
  const fd = fs.openSync(destPath, 'w');
  try {
    if (totalSize > 0) {
      fs.ftruncateSync(fd, totalSize);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Calculate contiguous byte ranges for parallel download.
 * @param {number} fileSize
 * @param {{ concurrency?: number, minChunkSize?: number, threshold?: number }} [opts]
 * @returns {Array<{ index: number, start: number, end: number, size: number }>}
 */
function calculateDownloadChunks(fileSize, opts = {}) {
  const threshold = opts.threshold ?? PARALLEL_DOWNLOAD_THRESHOLD;
  const maxConcurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const minChunk = Math.max(1024 * 1024, opts.minChunkSize ?? MIN_CHUNK_SIZE);

  if (fileSize <= 0) return [];
  if (fileSize < threshold) {
    return [{ index: 0, start: 0, end: fileSize - 1, size: fileSize }];
  }

  let numChunks = Math.min(maxConcurrency, Math.floor(fileSize / minChunk));
  if (numChunks < 1) numChunks = 1;

  const baseChunkSize = Math.floor(fileSize / numChunks);
  const remainder = fileSize % numChunks;

  const chunks = [];
  let currentStart = 0;

  for (let i = 0; i < numChunks; i++) {
    const chunkSize = baseChunkSize + (i === numChunks - 1 ? remainder : 0);
    const end = currentStart + chunkSize - 1;
    chunks.push({
      index: i,
      start: currentStart,
      end,
      size: chunkSize,
    });
    currentStart = end + 1;
  }

  return chunks;
}

/**
 * Downloads a single chunk range with retry and stream to disk.
 * @param {{
 *   url: string,
 *   token: string,
 *   destPath: string,
 *   start: number,
 *   end: number,
 *   signal?: AbortSignal,
 *   onChunkProgress?: (bytesDelta: number) => void,
 *   agent?: https.Agent,
 *   maxRetries?: number,
 * }} opts
 */
async function downloadChunk(opts) {
  const {
    url,
    token,
    destPath,
    start,
    end,
    signal,
    onChunkProgress,
    agent,
    maxRetries = 3,
  } = opts;

  let currentOffset = start;
  let attempt = 0;

  while (currentOffset <= end) {
    if (signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }

    try {
      await _downloadChunkRange({
        url,
        token,
        destPath,
        start: currentOffset,
        end,
        signal,
        agent,
        onProgressDelta: (bytesDelta) => {
          currentOffset += bytesDelta;
          if (typeof onChunkProgress === 'function') {
            onChunkProgress(bytesDelta);
          }
        },
      });
      break; // Successfully completed chunk
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) throw err;
      if (err.code === 'NOT_PARTIAL') throw err; // Server does not support Range

      attempt++;
      if (attempt > maxRetries) {
        throw new Error(`Chunk ${start}-${end} failed after ${maxRetries} retries: ${err.message}`);
      }
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

/**
 * Internal single attempt for range download.
 */
function _downloadChunkRange({ url, token, destPath, start, end, signal, agent, onProgressDelta }) {
  return new Promise((resolve, reject) => {
    let fileWriter = null;
    let reqStream = null;
    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    const settleReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reqStream?.destroy();
      if (fileWriter && !fileWriter.writableFinished) {
        fileWriter.destroy();
      }
      reject(err);
    };

    const settleResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onAbort = () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      settleReject(abortErr);
    };

    if (signal?.aborted) {
      return onAbort();
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    const parsed = new URL(url);
    const headers = {
      Authorization: `Bearer ${token}`,
      Range: `bytes=${start}-${end}`,
    };

    reqStream = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
      timeout: 45000,
      agent,
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        cleanup();
        _downloadChunkRange({
          url: res.headers.location,
          token,
          destPath,
          start,
          end,
          signal,
          agent,
          onProgressDelta,
        }).then(resolve, reject);
        return;
      }

      if (res.statusCode === 200) {
        res.resume();
        const err = new Error('Server returned 200 OK instead of 206 Partial Content (Range unsupported)');
        err.code = 'NOT_PARTIAL';
        return settleReject(err);
      }

      if (res.statusCode !== 206) {
        const chunks = [];
        res.on('data', (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          settleReject(new Error(`Chunk download failed: HTTP ${res.statusCode} ${body.slice(0, 150)}`));
        });
        return;
      }

      fileWriter = fs.createWriteStream(destPath, {
        flags: 'r+',
        start,
        highWaterMark: 2 * 1024 * 1024,
      });

      res.on('data', (chunk) => {
        if (typeof onProgressDelta === 'function') {
          onProgressDelta(chunk.length);
        }
      });

      res.pipe(fileWriter);

      fileWriter.on('finish', () => {
        settleResolve();
      });

      fileWriter.on('error', (wErr) => {
        settleReject(wErr);
      });

      res.on('error', (rErr) => {
        settleReject(rErr);
      });
    });

    reqStream.on('timeout', () => {
      reqStream.destroy();
      settleReject(new Error(`Range request timeout (${start}-${end})`));
    });

    reqStream.on('error', (netErr) => {
      settleReject(netErr);
    });

    reqStream.end();
  });
}

/**
 * High-level parallel downloader coordinator.
 * @param {{
 *   url: string,
 *   token: string,
 *   destPath: string,
 *   fileSize: number,
 *   signal?: AbortSignal,
 *   onProgress?: (fraction: number) => void,
 *   agent?: https.Agent,
 *   concurrency?: number,
 * }} opts
 * @returns {Promise<{ parallelSuccess: boolean, fallbackReason?: string }>}
 */
async function downloadParallelChunks(opts) {
  const {
    url,
    token,
    destPath,
    fileSize,
    signal,
    onProgress,
    agent,
    concurrency = DEFAULT_CONCURRENCY,
  } = opts;

  if (fileSize <= 0) {
    throw new Error('Invalid file size for parallel download');
  }

  const chunks = calculateDownloadChunks(fileSize, { concurrency });
  if (chunks.length <= 1) {
    return { parallelSuccess: false, fallbackReason: 'File size below parallel threshold' };
  }

  // Pre-allocate the destination file
  allocateFile(destPath, fileSize);

  let totalDownloadedBytes = 0;
  let lastProgressAt = 0;

  const emitProgress = (force = false) => {
    if (typeof onProgress !== 'function') return;
    const now = Date.now();
    if (!force && now - lastProgressAt < 100) return;
    lastProgressAt = now;
    const fraction = Math.min(1, Math.max(0, totalDownloadedBytes / fileSize));
    onProgress(fraction);
  };

  const chunkPromises = chunks.map((chunk) => {
    return downloadChunk({
      url,
      token,
      destPath,
      start: chunk.start,
      end: chunk.end,
      signal,
      agent,
      onChunkProgress: (bytesDelta) => {
        totalDownloadedBytes += bytesDelta;
        emitProgress(false);
      },
    });
  });

  try {
    await Promise.all(chunkPromises);
    emitProgress(true);
    return { parallelSuccess: true };
  } catch (err) {
    if (err.code === 'NOT_PARTIAL') {
      return { parallelSuccess: false, fallbackReason: 'Range requests not supported by server' };
    }
    throw err;
  }
}

module.exports = {
  PARALLEL_DOWNLOAD_THRESHOLD,
  DEFAULT_CONCURRENCY,
  MIN_CHUNK_SIZE,
  allocateFile,
  calculateDownloadChunks,
  downloadChunk,
  downloadParallelChunks,
};
