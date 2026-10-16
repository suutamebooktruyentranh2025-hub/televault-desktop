const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { app, shell } = require('electron');

/**
 * Chuẩn hóa phiên bản (loại bỏ 'v', khoảng trắng).
 * @param {string} version 
 * @returns {string}
 */
function cleanVersion(version) {
  if (!version || typeof version !== 'string') return '0.0.0';
  return version.trim().replace(/^[vV]/, '') || '0.0.0';
}

/**
 * So sánh semver.
 * @param {string} remote 
 * @param {string} current 
 * @returns {boolean}
 */
function isNewerVersion(remote, current) {
  if (!remote) return false;
  if (!current) return true;
  const parse = (v) => {
    const [core, ...pre] = cleanVersion(v).split('-');
    const parts = core.split('.').map((p) => parseInt(p, 10) || 0);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0, pre: pre.join('-') };
  };
  const r = parse(remote);
  const c = parse(current);
  if (r.major !== c.major) return r.major > c.major;
  if (r.minor !== c.minor) return r.minor > c.minor;
  if (r.patch !== c.patch) return r.patch > c.patch;
  if (r.pre && !c.pre) return false;
  if (!r.pre && c.pre) return true;
  return false;
}

/**
 * Bóc tách nội dung Markdown release notes thành danh sách mục phân loại.
 * @param {string} markdown
 * @returns {Array<{ type: 'new' | 'fix' | 'improve' | 'other', text: string }>}
 */
function parseChangelog(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const lines = markdown.split(/\r?\n/);
  const results = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    let cleanLine = line.replace(/^[-*•]\s+/, '').trim();
    if (!cleanLine) continue;

    let type = 'other';
    if (
      /^\[?(?:Mới|New|Feature)\]?[:\s]*/i.test(cleanLine) ||
      /^feat(?:\(.*?\))?:\s*/i.test(cleanLine)
    ) {
      type = 'new';
      cleanLine = cleanLine.replace(/^\[?(?:Mới|New|Feature)\]?[:\s]*/i, '').replace(/^feat(?:\(.*?\))?:\s*/i, '');
    } else if (
      /^\[?(?:Sửa|Fix|Bugfix)\]?[:\s]*/i.test(cleanLine) ||
      /^fix(?:\(.*?\))?:\s*/i.test(cleanLine)
    ) {
      type = 'fix';
      cleanLine = cleanLine.replace(/^\[?(?:Sửa|Fix|Bugfix)\]?[:\s]*/i, '').replace(/^fix(?:\(.*?\))?:\s*/i, '');
    } else if (
      /^\[?(?:Cải tiến|Improve|Enhancement|Tối ưu)\]?[:\s]*/i.test(cleanLine) ||
      /^(?:perf|refactor)(?:\(.*?\))?:\s*/i.test(cleanLine)
    ) {
      type = 'improve';
      cleanLine = cleanLine
        .replace(/^\[?(?:Cải tiến|Improve|Enhancement|Tối ưu)\]?[:\s]*/i, '')
        .replace(/^(?:perf|refactor)(?:\(.*?\))?:\s*/i, '');
    }
    results.push({ type, text: cleanLine.trim() });
  }
  return results;
}

/**
 * Lựa chọn tệp cài đặt phù hợp với hệ điều hành và kiến trúc CPU.
 * @param {object} releaseData
 * @param {string} [platform=process.platform]
 * @param {string} [arch=process.arch]
 * @returns {{ name: string, url: string, size: number } | null}
 */
function resolveDownloadAsset(releaseData, platform = process.platform, arch = process.arch) {
  const assets = releaseData?.assets || [];
  if (!assets.length) return null;

  if (platform === 'win32') {
    // Windows: ưu tiên file exe cài đặt
    const exeAssets = assets.filter((a) => a.name?.toLowerCase().endsWith('.exe'));
    if (!exeAssets.length) return null;

    // Nếu có file ghi rõ arch
    const archMatch = exeAssets.find((a) => a.name.toLowerCase().includes(arch));
    const chosen = archMatch || exeAssets[0];
    return { name: chosen.name, url: chosen.browser_download_url, size: chosen.size || 0 };
  }

  if (platform === 'darwin') {
    // macOS: ưu tiên file .dmg
    const dmgAssets = assets.filter((a) => a.name?.toLowerCase().endsWith('.dmg'));
    if (!dmgAssets.length) return null;

    if (arch === 'arm64') {
      const armAsset = dmgAssets.find((a) => /arm64|aarch64/i.test(a.name));
      const chosen = armAsset || dmgAssets[0];
      return { name: chosen.name, url: chosen.browser_download_url, size: chosen.size || 0 };
    } else {
      const intelAsset = dmgAssets.find((a) => /x64|intel/i.test(a.name) || !/arm64/i.test(a.name));
      const chosen = intelAsset || dmgAssets[0];
      return { name: chosen.name, url: chosen.browser_download_url, size: chosen.size || 0 };
    }
  }

  return null;
}

/**
 * Thực hiện HTTP/HTTPS GET hỗ trợ chuyển hướng (redirect).
 * @param {string} targetUrl 
 * @param {object} options 
 * @param {number} [redirectCount=0]
 * @returns {Promise<http.IncomingMessage>}
 */
function followRedirectGet(targetUrl, options = {}, redirectCount = 0) {
  if (redirectCount > 10) {
    return Promise.reject(new Error('Too many redirects'));
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'TeleVault-Desktop',
          ...(options.headers || {}),
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          resolve(followRedirectGet(nextUrl, options, redirectCount + 1));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`Request failed with status code ${res.statusCode}`));
          return;
        }
        resolve(res);
      }
    );

    req.on('error', reject);
    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    }
  });
}

/**
 * Kiểm tra phiên bản mới từ GitHub Releases.
 * @param {object} [opts]
 * @param {string} [opts.repo='suutamebooktruyentranh2025-hub/televault']
 * @param {string} [opts.currentVersion]
 * @returns {Promise<object>}
 */
async function checkForUpdate(opts = {}) {
  const repo = opts.repo || 'suutamebooktruyentranh2025-hub/televault';
  const currentVersion = opts.currentVersion || (app?.getVersion ? app.getVersion() : '0.3.1');
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

  const res = await followRedirectGet(apiUrl, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
    timeout: 15000,
  });

  let rawData = '';
  for await (const chunk of res) {
    rawData += chunk;
  }

  const release = JSON.parse(rawData);
  const latestTag = release.tag_name || '';
  const latestVersion = cleanVersion(latestTag);
  const hasUpdate = isNewerVersion(latestVersion, currentVersion);
  const asset = resolveDownloadAsset(release);
  const changelog = parseChangelog(release.body || '');

  return {
    hasUpdate,
    latestVersion,
    currentVersion,
    releaseDate: release.published_at || '',
    releaseNotes: release.body || '',
    changelog,
    downloadUrl: asset?.url || null,
    assetName: asset?.name || null,
    assetSize: asset?.size || 0,
  };
}

/**
 * Tải file cập nhật về máy với theo dõi tiến độ.
 * @param {object} params
 * @param {string} params.url
 * @param {string} params.filename
 * @param {string} [params.destDir]
 * @param {(progress: { percent: number, downloadedBytes: number, totalBytes: number }) => void} [params.onProgress]
 * @returns {Promise<{ filePath: string }>}
 */
async function downloadUpdate({ url, filename, destDir, onProgress }) {
  if (!url) throw new Error('Missing download URL');

  const baseDir = destDir || (app?.getPath ? path.join(app.getPath('temp'), 'televault-update') : path.join(os.tmpdir(), 'televault-update'));
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const targetFile = path.join(baseDir, filename || 'televault-installer');
  const fileStream = fs.createWriteStream(targetFile);

  const res = await followRedirectGet(url, { timeout: 30000 });
  const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
  let downloadedBytes = 0;

  onProgress?.({ percent: 0, downloadedBytes: 0, totalBytes });

  return new Promise((resolve, reject) => {
    res.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      onProgress?.({ percent, downloadedBytes, totalBytes });
    });

    res.pipe(fileStream);

    fileStream.on('finish', () => {
      fileStream.close(() => {
        onProgress?.({ percent: 100, downloadedBytes, totalBytes });
        resolve({ filePath: targetFile });
      });
    });

    res.on('error', (err) => {
      fileStream.destroy();
      try { fs.unlinkSync(targetFile); } catch {}
      reject(err);
    });

    fileStream.on('error', (err) => {
      fileStream.destroy();
      try { fs.unlinkSync(targetFile); } catch {}
      reject(err);
    });
  });
}

/**
 * Thực hiện cài đặt bản cập nhật đã tải về.
 * @param {string} filePath 
 * @param {object} [injected] 
 */
async function installUpdate(filePath, injected = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Installer file not found at: ${filePath}`);
  }

  const platform = injected.platform || process.platform;
  const doSpawn = injected.spawnFn || spawn;
  const doQuit = injected.quitFn || (() => app?.quit && app.quit());
  const doOpenPath = injected.openPathFn || (shell?.openPath ? (p) => shell.openPath(p) : null);

  if (platform === 'win32') {
    // Chạy NSIS silent installer tự động và khởi động lại ứng dụng
    const child = doSpawn(filePath, ['/S', '--updated'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    setTimeout(() => {
      doQuit();
    }, 500);
    return { ok: true, platform: 'win32' };
  }

  if (platform === 'darwin') {
    // Mở file DMG để người dùng kéo thả hoặc mount
    if (doOpenPath) {
      await doOpenPath(filePath);
    }
    return { ok: true, platform: 'darwin' };
  }

  throw new Error(`Unsupported platform for auto-install: ${platform}`);
}

module.exports = {
  cleanVersion,
  isNewerVersion,
  parseChangelog,
  resolveDownloadAsset,
  checkForUpdate,
  downloadUpdate,
  installUpdate,
};
