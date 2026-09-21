const { uniqueVaultPath, isInTrash } = require('@televault/core');

function buildVaultPath(subVaultPath, relativeDrivePath) {
  const normalized_base = subVaultPath.endsWith('/') ? subVaultPath : `${subVaultPath}/`;
  const normalized_relative = String(relativeDrivePath || '').replace(/^\/+/, '');
  return `${normalized_base}${normalized_relative}`.replace(/\/+/g, '/');
}

function shouldSkipDownload({ manifest, driveMd5, vaultEntry, driveSize }) {
  if (!driveMd5 || !vaultEntry) return false;
  if (manifest) {
    return manifest.md5 === driveMd5
      && manifest.sha256 === vaultEntry.sha256
      && manifest.size === vaultEntry.size;
  }
  // No manifest yet: vault already has this path at the Drive-listed size → skip re-download.
  const listed_size = driveSize != null ? Number(driveSize) : NaN;
  if (!Number.isFinite(listed_size)) return false;
  return Number(vaultEntry.size) === listed_size;
}

function nfcPath(str) {
  return typeof str === 'string' ? str.normalize('NFC') : str;
}

/**
 * Whether a Drive file should be (re)enqueued for sync.
 * Orphans (manifest without vault entry) must re-enqueue even when Drive mtime is unchanged.
 * Without a manifest, skip enqueue when the target vault already has the path at matching size
 * (avoids re-downloading files present on vault but never recorded in gdrive_manifest).
 * When multiple vault rows share the same path (legacy duplicates), ANY size match skips.
 *
 * @param {{
 *   manifest?: { driveModifiedTime?: string, md5?: string } | null,
 *   driveModifiedTime?: string,
 *   driveMd5?: string,
 *   vaultEntry?: { size?: number } | null,
 *   vaultEntriesAtPath?: Array<{ size?: number }> | null,
 *   driveSize?: number | null,
 * }} args
 */
function shouldEnqueueDriveFile({
  manifest,
  driveModifiedTime,
  driveMd5,
  vaultEntry,
  vaultEntriesAtPath,
  driveSize,
}) {
  const entries = Array.isArray(vaultEntriesAtPath) && vaultEntriesAtPath.length > 0
    ? vaultEntriesAtPath
    : (vaultEntry ? [vaultEntry] : []);

  if (manifest) {
    if (entries.length === 0) return true;
    if (manifest.driveModifiedTime !== driveModifiedTime) {
      if (driveMd5 && manifest.md5 && driveMd5 === manifest.md5) {
        return false;
      }
      return true;
    }
    return false;
  }
  if (driveSize != null && entries.some((entry) => Number(entry.size) === Number(driveSize))) {
    return false;
  }
  return true;
}

function resolveConflictVaultPath({
  policy,
  vaultPath,
  existingPaths,
  now,
}) {
  if (policy === 'skip') {
    return { action: 'skip', vaultPath };
  }
  if (policy === 'overwrite') {
    return { action: 'upload', vaultPath };
  }
  const dateStr = (now || new Date()).toISOString().slice(0, 10);
  const extMatch = vaultPath.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? `.${extMatch[1]}` : '';
  const base = extMatch ? vaultPath.slice(0, -ext.length) : vaultPath;

  const candidate = `${base} (conflict ${dateStr})${ext}`;
  const finalPath = uniqueVaultPath(candidate, existingPaths || []);
  return { action: 'upload', vaultPath: finalPath };
}

function matchChangeToSubscription(change, sub, { manifest, folderIds }) {
  if (!change?.file || change.removed) return null;
  const changed_file = change.file;
  if (sub.isFolder) {
    if (manifest && String(manifest.vaultPath).startsWith(sub.vaultPath)) {
      return { drivePath: manifest.drivePath, vaultPath: manifest.vaultPath };
    }
    const parent_ids = changed_file.parents || [];
    const is_under = parent_ids.some((parent_id) => folderIds?.has(parent_id) || parent_id === sub.driveId);
    if (!is_under) return null;
    // Deeper paths are supplied by the service after resolving parent metadata.
    const drive_path = changed_file.drivePath || changed_file.name;
    return { drivePath: drive_path, vaultPath: buildVaultPath(sub.vaultPath, drive_path) };
  }
  if (sub.driveId === (change.fileId || changed_file.id)) {
    return { drivePath: sub.drivePath || changed_file.name, vaultPath: sub.vaultPath };
  }
  return null;
}

/**
 * Builds an in-memory lookup index from existing vault entries to reconcile
 * incoming Drive files against what already exists in the Telegram channel/vault.
 * Normalizes all paths and filenames to Unicode NFC to handle macOS NFD paths.
 *
 * @param {Array<{ path: string, size: number, sha256?: string, messageId?: number }>} vaultEntries
 * @param {(path: string) => boolean} [isTrashFn]
 */
function buildVaultLookupIndex(vaultEntries, isTrashFn = isInTrash) {
  const byExactPath = new Map();
  const byExactPathList = new Map();
  const byNameAndSize = new Map();

  for (const entry of vaultEntries || []) {
    if (!entry?.path) continue;
    if (typeof isTrashFn === 'function' && isTrashFn(entry.path)) continue;

    const normPath = nfcPath(entry.path);
    byExactPath.set(normPath, entry);
    let pathList = byExactPathList.get(normPath);
    if (!pathList) {
      pathList = [];
      byExactPathList.set(normPath, pathList);
    }
    pathList.push(entry);

    const parts = normPath.split('/');
    const fileName = parts[parts.length - 1];
    const numSize = Number(entry.size);
    if (fileName && Number.isFinite(numSize) && numSize > 0) {
      const key = `${fileName}::${numSize}`;
      let list = byNameAndSize.get(key);
      if (!list) {
        list = [];
        byNameAndSize.set(key, list);
      }
      list.push(entry);
    }
  }

  return {
    byExactPath,
    byExactPathList,
    byNameAndSize,
    getEntriesAtPath(targetPath) {
      if (!targetPath) return [];
      return byExactPathList.get(nfcPath(targetPath)) || [];
    },
    findMatch({ targetPath, drivePath, fileName, size }) {
      const numSize = Number(size);
      if (!Number.isFinite(numSize) || numSize <= 0) return null;

      const normTarget = nfcPath(targetPath);
      const normDrive = nfcPath(drivePath);
      const normFile = nfcPath(fileName);

      // 1. Exact target path & size match (100% confidence)
      if (normTarget) {
        const exact = byExactPath.get(normTarget);
        if (exact && Number(exact.size) === numSize) {
          return exact;
        }
      }

      // 2. Candidates matching exact fileName & exact byte size
      const effectiveName = normFile || (normDrive ? normDrive.split('/').pop() : null);
      if (!effectiveName) return null;

      const candidates = byNameAndSize.get(`${effectiveName}::${numSize}`);
      if (!candidates || candidates.length === 0) return null;

      // If only 1 candidate in the entire vault with this exact name and size:
      if (candidates.length === 1) {
        return candidates[0];
      }

      // 3. If multiple candidates, try path suffix matching
      if (normDrive) {
        const cleanDrive = normDrive.replace(/^\/+/, '');
        for (const c of candidates) {
          const cleanVault = nfcPath(c.path).replace(/^\/+/, '');
          if (cleanVault.endsWith(cleanDrive)) {
            return c;
          }
        }

        // 4. Try parent folder matching
        const segments = cleanDrive.split('/').filter(Boolean);
        if (segments.length > 1) {
          const parent = segments[segments.length - 2];
          for (const c of candidates) {
            if (nfcPath(c.path).includes(`/${parent}/`)) {
              return c;
            }
          }
        }
      }

      // Default to first candidate
      return candidates[0];
    },
  };
}

module.exports = {
  nfcPath,
  matchChangeToSubscription,
  buildVaultPath,
  shouldSkipDownload,
  shouldEnqueueDriveFile,
  resolveConflictVaultPath,
  buildVaultLookupIndex,
};
