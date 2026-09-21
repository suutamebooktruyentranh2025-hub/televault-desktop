const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { URL } = require('url');
const { verifyDownloadedFile } = require('./downloadIntegrity');
const { downloadParallelChunks, PARALLEL_DOWNLOAD_THRESHOLD } = require('./gdriveParallelDownloader');

const sharedHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 16,
  maxFreeSockets: 8,
  timeout: 60000,
});

const BASE = 'https://www.googleapis.com/drive/v3';
const FIELDS_FILE = 'id,name,mimeType,size,modifiedTime,md5Checksum,parents,trashed';
const FIELDS_LIST = `files(${FIELDS_FILE}),nextPageToken`;

function getResumeOffset(tempPath, expectedSize) {
  if (expectedSize <= 0 || !fs.existsSync(tempPath)) return 0;
  return fs.statSync(tempPath).size;
}

function createAbortError() {
  const abort_error = new Error('The operation was aborted');
  abort_error.name = 'AbortError';
  return abort_error;
}

class GDriveApi {
  /**
   * @param {{ auth: import('./gdriveAuth').GDriveAuth }} opts
   */
  constructor({ auth, rateLimiter = null }) {
    this.auth = auth;
    this.rateLimiter = rateLimiter;
  }

  /**
   * List children of a folder.
   * @param {string} folderId - Drive folder ID ('root' for My Drive root)
   * @returns {Promise<Array<{ id: string, name: string, mimeType: string, size: number, modifiedTime: string, isFolder: boolean }>>}
   */
  async listFolder(folderId = 'root') {
    const files = [];
    let pageToken = null;
    do {
      const q = folderId === 'sharedWithMe'
        ? `sharedWithMe = true and trashed = false`
        : `'${folderId}' in parents and trashed = false`;
      let url = `${BASE}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(FIELDS_LIST)}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const data = await this._get(url);
      for (const f of data.files || []) {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: Number(f.size) || 0,
          modifiedTime: f.modifiedTime,
          md5Checksum: f.md5Checksum || null,
          isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
  }

  /**
   * Flatly list all files and folders across Drive with pagination.
   * @param {{ onPage?: (files: Array<any>) => void, signal?: AbortSignal }} opts
   */
  async listAllFilesFlat(opts = {}) {
    const allFiles = [];
    let pageToken = null;
    do {
      if (opts.signal?.aborted) throw createAbortError();
      const fields = 'nextPageToken,files(id,name,mimeType,parents,size,modifiedTime,md5Checksum,shortcutDetails,trashed)';
      let url = `${BASE}/files?q=${encodeURIComponent('trashed = false')}&fields=${encodeURIComponent(fields)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const data = await this._get(url);
      const pageFiles = data.files || [];
      if (typeof opts.onPage === 'function') {
        opts.onPage(pageFiles);
      }
      for (const f of pageFiles) {
        allFiles.push(f);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return allFiles;
  }

  /**
   * Recursively list all files in a folder (non-folder items only).
   * Skips Google Docs/Sheets/Slides (not downloadable as binary).
   * @param {string} folderId
   * @param {string} pathPrefix - e.g. "MyFolder/"
   * @param {Set} visited - cycle detection
   * @param {{ onProgress?: (info: { currentFolder: string, filesFound: number }) => void, onFile?: (file: object) => void, _counter?: { count: number } }} opts
   * @returns {Promise<Array<{ id: string, name: string, drivePath: string, size: number, modifiedTime: string, md5Checksum: string|null }>>}
   */
  async listFolderRecursive(folderId, pathPrefix = '', visited = new Set(), opts = {}) {
    if (visited.has(folderId)) return [];
    visited.add(folderId);

    // Initialize shared counter on first call
    if (!opts._counter) opts._counter = { count: 0 };

    if (opts.onProgress) {
      opts.onProgress({ currentFolder: pathPrefix || '/', filesFound: opts._counter.count });
    }

    const items = await this.listFolder(folderId);
    /** @type {Array<{ id: string, name: string, drivePath: string, size: number, modifiedTime: string, md5Checksum: string|null }>} */
    const result = [];
    for (const item of items) {
      if (item.isFolder) {
        const sub = await this.listFolderRecursive(item.id, `${pathPrefix}${item.name}/`, visited, opts);
        result.push(...sub);
      } else if (!item.mimeType.startsWith('application/vnd.google-apps.')) {
        opts._counter.count += 1;
        const fileInfo = {
          id: item.id,
          name: item.name,
          drivePath: `${pathPrefix}${item.name}`,
          size: item.size,
          modifiedTime: item.modifiedTime,
          md5Checksum: item.md5Checksum,
        };
        result.push(fileInfo);
        if (opts.onFile) opts.onFile(fileInfo);
      }
    }
    return result;
  }

  /**
   * Get changes since last page token.
   * @param {string|null} pageToken
   * @returns {Promise<{ changes: Array<{ fileId: string, removed: boolean, file: any }>, newStartPageToken: string }>}
   */
  async getChanges(pageToken) {
    if (!pageToken) {
      // Get initial page token
      const data = await this._get(`${BASE}/changes/startPageToken?supportsAllDrives=true&includeItemsFromAllDrives=true`);
      return { changes: [], newStartPageToken: data.startPageToken };
    }

    const allChanges = [];
    let nextPageToken = pageToken;
    let newStartPageToken = null;
    do {
      const changesFields = `changes(fileId,removed,file(${FIELDS_FILE})),nextPageToken,newStartPageToken`;
      let url = `${BASE}/changes?pageToken=${encodeURIComponent(nextPageToken)}`
        + `&fields=${encodeURIComponent(changesFields)}`
        + `&pageSize=1000&includeRemoved=true&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const data = await this._get(url);
      for (const c of data.changes || []) {
        allChanges.push({
          fileId: c.fileId,
          removed: c.removed || false,
          file: c.file || null,
        });
      }
      nextPageToken = data.nextPageToken;
      if (data.newStartPageToken) newStartPageToken = data.newStartPageToken;
    } while (nextPageToken);

    return { changes: allChanges, newStartPageToken: newStartPageToken || pageToken };
  }

  /**
   * Download a file to a local temp path. Streams to disk to handle large files.
   * @param {string} fileId
   * @param {string} fileName
   * @param {string} [customTempDir] optional custom temp directory
   * @param {function(number): void} [onProgress] callback with progress fraction
   * @param {{ signal?: AbortSignal, expectedSize?: number, expectedMd5?: string|null }} [opts]
   * @returns {Promise<string>} path to downloaded temp file
   */
  async downloadFile(fileId, fileName, customTempDir, onProgress, opts = {}) {
    let tempDir = customTempDir;
    if (tempDir) {
      try {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      } catch (err) {
        console.warn(`[GDriveApi] Custom temp dir "${customTempDir}" inaccessible (${err.code || err.message}), falling back to OS temp dir`);
        tempDir = null;
      }
    }
    if (!tempDir) {
      const defaultTempRoot = app?.getPath ? app.getPath('temp') : (require('os').tmpdir?.() || '/tmp');
      tempDir = path.join(defaultTempRoot, 'gdrive-sync');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    }
    // Sanitize filename for filesystem
    const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const tempPath = path.join(tempDir, `${fileId}_${safeName}`);
    const expected_size = Number(opts.expectedSize) || 0;
    const expected_md5 = opts.expectedMd5 || null;
    const resume_offset = getResumeOffset(tempPath, expected_size);

    if (opts.signal?.aborted) throw createAbortError();
    if (expected_size > 0 && resume_offset >= expected_size) {
      await verifyDownloadedFile({
        filePath: tempPath,
        expectedSize: expected_size,
        expectedMd5: expected_md5,
      });
      return tempPath;
    }

    const token = await this.auth.getValidToken();
    const url = `${BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

    // Try parallel multi-part download for large files when starting fresh
    if (expected_size >= PARALLEL_DOWNLOAD_THRESHOLD && resume_offset === 0) {
      try {
        const parallelResult = await downloadParallelChunks({
          url,
          token,
          destPath: tempPath,
          fileSize: expected_size,
          signal: opts.signal,
          onProgress,
          agent: sharedHttpsAgent,
        });

        if (parallelResult.parallelSuccess) {
          await verifyDownloadedFile({
            filePath: tempPath,
            expectedSize: expected_size,
            expectedMd5: expected_md5,
          });

          if (opts.resultHolder && typeof opts.resultHolder === 'object') {
            opts.resultHolder.md5 = null;
            opts.resultHolder.sha256 = null;
          }

          return tempPath;
        }
        console.warn(`[GDriveApi] Parallel download skipped (${parallelResult.fallbackReason}), using single-stream`);
      } catch (err) {
        if (opts.signal?.aborted || err.name === 'AbortError') throw err;
        console.warn(`[GDriveApi] Parallel download failed, falling back to single-stream: ${err.message}`);
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* ignore cleanup error */ }
      }
    }

    const request_headers = { Authorization: `Bearer ${token}` };
    if (resume_offset > 0) request_headers.Range = `bytes=${resume_offset}-`;

    const download_result = await this._downloadStream(url, token, tempPath, 0, onProgress, {
      headers: request_headers,
      append: resume_offset > 0,
      signal: opts.signal,
      existingBytes: resume_offset,
      expectedSize: expected_size,
    });
    const inFlightMd5 = download_result?.inFlightMd5 || null;
    const inFlightSha256 = download_result?.inFlightSha256 || null;

    await verifyDownloadedFile({
      filePath: tempPath,
      expectedSize: expected_size,
      expectedMd5: expected_md5,
      inFlightMd5,
    });

    if (opts.resultHolder && typeof opts.resultHolder === 'object') {
      opts.resultHolder.md5 = inFlightMd5;
      opts.resultHolder.sha256 = inFlightSha256;
    }

    return tempPath;
  }

  /**
   * Get file metadata by ID.
   * @param {string} fileId
   */
  async getFile(fileId) {
    return this._get(`${BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FIELDS_FILE)}&supportsAllDrives=true`);
  }

  /**
   * Get information about the user and Drive storage quota.
   */
  async getAbout() {
    return this._get(`${BASE}/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)`);
  }

  /**
   * Stream download a file, following redirects.
   */
  _downloadStream(url, token, destPath, redirectCount = 0, onProgress = null, opts = {}) {
    if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

    return new Promise((resolve, reject) => {
      let response_stream = null;
      let file_writer = null;
      let retry_timer = null;
      let request_settled = false;
      let abort_pending = false;

      const cleanup_request = () => {
        if (retry_timer) clearTimeout(retry_timer);
        opts.signal?.removeEventListener('abort', abort_request);
      };
      const resolve_request = (result_path) => {
        if (request_settled) return;
        request_settled = true;
        cleanup_request();
        resolve(result_path);
      };
      const reject_request = (request_error) => {
        if (request_settled) return;
        request_settled = true;
        cleanup_request();
        reject(request_error);
      };
      const delegate_request = (next_url, next_count) => {
        if (request_settled) return;
        request_settled = true;
        cleanup_request();
        this._downloadStream(next_url, token, destPath, next_count, onProgress, opts)
          .then(resolve, reject);
      };
      const abort_request = () => {
        abort_pending = true;
        const abort_error = createAbortError();
        response_stream?.unpipe(file_writer);
        response_stream?.destroy();
        request_stream?.destroy();
        if (file_writer && !file_writer.writableFinished) {
          file_writer.end(() => {
            file_writer.destroy();
            reject_request(abort_error);
          });
          return;
        }
        reject_request(abort_error);
      };

      if (opts.signal?.aborted) {
        reject_request(createAbortError());
        return;
      }
      opts.signal?.addEventListener('abort', abort_request, { once: true });

      const parsed = new URL(url);
      const request_headers = opts.headers || { Authorization: `Bearer ${token}` };
      const request_stream = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: request_headers,
        timeout: 60000,
        agent: sharedHttpsAgent,
      }, (res) => {
        response_stream = res;
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // drain response
          delegate_request(res.headers.location, redirectCount + 1);
          return;
        }

        // Handle 429 for downloads
        if (res.statusCode === 429) {
          res.resume();
          const retryAfterSec = parseInt(res.headers['retry-after'] || '0', 10);
          const retryAfterMs = retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;
          if (this.rateLimiter) this.rateLimiter.reportThrottle(retryAfterMs);
          if (redirectCount < 5) {
            const delay = retryAfterMs || 2000 * Math.pow(2, redirectCount);
            retry_timer = setTimeout(() => {
              delegate_request(url, redirectCount + 1);
            }, delay);
            return;
          }
          reject_request(new Error(`Download rate limited after ${redirectCount} retries`));
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          const chunks = [];
          res.on('data', (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            reject_request(new Error(`Download failed: ${res.statusCode} ${body.slice(0, 200)}`));
          });
          return;
        }

        const should_append = opts.append === true && res.statusCode === 206;
        const existing_bytes = should_append ? (Number(opts.existingBytes) || 0) : 0;
        file_writer = fs.createWriteStream(destPath, {
          flags: should_append ? 'a' : 'w',
          highWaterMark: 4 * 1024 * 1024,
        });

        const md5Hash = crypto.createHash('md5');
        const sha256Hash = crypto.createHash('sha256');

        const response_size = parseInt(res.headers['content-length'] || '0', 10);
        const expected_size = Number(opts.expectedSize) || existing_bytes + response_size;
        let downloaded_bytes = 0;
        let last_progress_at = 0;
        const now_fn = () => (typeof this._now === 'function' ? this._now() : Date.now());
        const emit_progress = (force = false) => {
          if (!onProgress || expected_size <= 0) return;
          const now = now_fn();
          if (!force && last_progress_at > 0 && now - last_progress_at < 100) return;
          last_progress_at = now;
          onProgress(Math.min(1, (existing_bytes + downloaded_bytes) / expected_size));
        };

        res.on('data', (chunk) => {
          if (!should_append) {
            md5Hash.update(chunk);
            sha256Hash.update(chunk);
          }
          if (onProgress && expected_size > 0) {
            downloaded_bytes += chunk.length;
            emit_progress(false);
          }
        });

        res.pipe(file_writer);
        file_writer.on('finish', () => {
          emit_progress(true);
          if (!abort_pending) {
            const inFlightMd5 = !should_append ? md5Hash.digest('hex').toLowerCase() : null;
            const inFlightSha256 = !should_append ? sha256Hash.digest('hex') : null;
            resolve_request({ destPath, inFlightMd5, inFlightSha256 });
          }
        });
        file_writer.on('error', (write_error) => {
          reject_request(abort_pending ? createAbortError() : write_error);
        });
        res.on('error', reject_request);
      });
      request_stream.on('timeout', () => {
        request_stream.destroy();
        reject_request(new Error('Google Drive Download Timeout'));
      });
      request_stream.on('error', (request_error) => {
        if (abort_pending) return;
        reject_request(request_error);
      });
      request_stream.end();
    });
  }

  /**
   * Authenticated GET request, returns parsed JSON.
   */
  async _get(url, _retryCount = 0) {
    if (this.rateLimiter) await this.rateLimiter.acquire();

    const token = await this.auth.getValidToken();
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
        agent: sharedHttpsAgent,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
        res.on('end', () => {
          // Handle 429 Too Many Requests
          if (res.statusCode === 429) {
            const retryAfterSec = parseInt(res.headers['retry-after'] || '0', 10);
            const retryAfterMs = retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;
            if (this.rateLimiter) this.rateLimiter.reportThrottle(retryAfterMs);
            if (_retryCount < 5) {
              const delay = retryAfterMs || 2000 * Math.pow(2, _retryCount);
              setTimeout(() => {
                this._get(url, _retryCount + 1).then(resolve, reject);
              }, delay);
              return;
            }
            reject(new Error(`Rate limited after ${_retryCount} retries`));
            return;
          }

          if (this.rateLimiter) this.rateLimiter.reportSuccess();

          const data = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(data);
            if (json.error) {
              // Check for rate limit errors in response body
              const code = json.error.code || res.statusCode;
              const reason = json.error.errors?.[0]?.reason || '';
              if (code === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')) {
                if (this.rateLimiter) this.rateLimiter.reportThrottle();
                if (_retryCount < 5) {
                  setTimeout(() => {
                    this._get(url, _retryCount + 1).then(resolve, reject);
                  }, 2000 * Math.pow(2, _retryCount));
                  return;
                }
              }
              reject(new Error(json.error.message || JSON.stringify(json.error)));
            } else {
              resolve(json);
            }
          } catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Google Drive API Request Timeout'));
      });
      req.on('error', reject);
      req.end();
    });
  }
}

module.exports = { GDriveApi, getResumeOffset };
