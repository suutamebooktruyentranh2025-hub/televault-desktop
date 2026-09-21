const fs = require('fs');
const path = require('path');

/**
 * Evict least-recently-used local vault cache files until under the limit.
 * Skips paths that are currently involved in active transfers.
 *
 * @param {{
 *   db: { getAll: () => any[], getCacheLimitBytes: () => number, setLocalPath: (id: number, p: string|null) => void },
 *   activeLocalPaths?: Set<string>,
 * }} opts
 * @returns {{ freedBytes: number, removed: number }}
 */
function evictCacheIfNeeded({ db, activeLocalPaths = new Set() }) {
  const limitBytes = db.getCacheLimitBytes();
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
    return { freedBytes: 0, removed: 0 };
  }

  const candidates = [];
  let totalBytes = 0;
  for (const entry of db.getAll()) {
    if (!entry.localPath || !fs.existsSync(entry.localPath)) continue;
    if (activeLocalPaths.has(entry.localPath)) continue;
    let size = 0;
    try {
      size = fs.statSync(entry.localPath).size;
    } catch {
      continue;
    }
    totalBytes += size;
    candidates.push({
      messageId: entry.messageId,
      localPath: entry.localPath,
      size,
      lastUsed: entry.lastUsed || entry.mtime?.toISOString?.() || '1970-01-01T00:00:00.000Z',
    });
  }

  if (totalBytes <= limitBytes) {
    return { freedBytes: 0, removed: 0 };
  }

  candidates.sort((a, b) => String(a.lastUsed).localeCompare(String(b.lastUsed)));

  let freedBytes = 0;
  let removed = 0;
  for (const item of candidates) {
    if (totalBytes - freedBytes <= limitBytes) break;
    try {
      fs.unlinkSync(item.localPath);
      db.setLocalPath(item.messageId, null);
      freedBytes += item.size;
      removed += 1;
    } catch {
      // skip files that cannot be deleted
    }
  }

  return { freedBytes, removed };
}

/**
 * Sum size of files under a directory (best-effort).
 * @param {string} dirPath
 */
function directorySizeBytes(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return 0;
  let total = 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // ignore
        }
      }
    }
  }
  return total;
}

module.exports = { evictCacheIfNeeded, directorySizeBytes };
