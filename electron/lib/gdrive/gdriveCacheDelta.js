/**
 * Detects whether an API error is HTTP 410 Gone (expired Changes Page Token).
 * @param {any} error
 * @returns {boolean}
 */
function isTokenExpiredError(error) {
  if (!error) return false;
  if (error.status === 410 || error.code === 410 || error.statusCode === 410) return true;
  const msg = String(error.message || error);
  return msg.includes('410') || msg.includes('Page token is no longer valid') || msg.includes('startPageToken');
}

/**
 * Resolves full path for a file or folder given its parent.
 * @param {string} parentId
 * @param {string} name
 * @param {boolean|number} isFolder
 * @param {object} db
 * @param {Map<string, object>} [pendingNodes]
 * @returns {string}
 */
function resolvePathForNode(parentId, name, isFolder, db, pendingNodes = null) {
  const cleanName = (name || '').normalize('NFC').replace(/[\/\\]/g, '_');
  const isDir = Boolean(isFolder);
  if (!parentId || parentId === 'root') {
    return isDir ? `/${cleanName}/` : `/${cleanName}`;
  }
  const parentNode = (pendingNodes && pendingNodes.get(parentId)) ||
    (typeof db.gdriveCacheNodesGet === 'function' ? db.gdriveCacheNodesGet(parentId) : null);
  if (parentNode && parentNode.drivePath) {
    const parentPath = parentNode.drivePath.endsWith('/') ? parentNode.drivePath : `${parentNode.drivePath}/`;
    return isDir ? `${parentPath}${cleanName}/` : `${parentPath}${cleanName}`;
  }
  return isDir ? `/${cleanName}/` : `/${cleanName}`;
}

/**
 * Applies incremental changes from Google Drive Changes API to local cache DB.
 * @param {Array<{ fileId: string, removed?: boolean, file?: any }>} changes
 * @param {object} db indexDb instance
 * @returns {{ removedCount: number, trashedCount: number, updatedCount: number }}
 */
function applyChangesToCache(changes, db) {
  let removedCount = 0;
  let trashedCount = 0;
  let updatedCount = 0;

  if (!Array.isArray(changes) || changes.length === 0) {
    return { removedCount, trashedCount, updatedCount };
  }

  const nodesToUpsert = [];
  const pendingNodes = new Map();

  for (const change of changes) {
    const fileId = change.fileId || change.file?.id;
    if (!fileId) continue;

    // 1. Permanent removal
    if (change.removed) {
      if (typeof db.gdriveCacheNodesDelete === 'function') {
        db.gdriveCacheNodesDelete(fileId);
      }
      pendingNodes.delete(fileId);
      removedCount += 1;
      continue;
    }

    // 2. Trashed in Drive
    if (change.file?.trashed) {
      if (typeof db.gdriveCacheNodesSetTrashed === 'function') {
        db.gdriveCacheNodesSetTrashed(fileId, 1);
      }
      pendingNodes.delete(fileId);
      trashedCount += 1;
      continue;
    }

    // 3. New or updated file/folder
    if (change.file) {
      const f = change.file;
      const isFolder = f.mimeType === 'application/vnd.google-apps.folder' ? 1 : 0;
      const parentId = f.parents && f.parents.length > 0 ? f.parents[0] : 'root';
      const cleanName = (f.name || '').normalize('NFC').replace(/[\/\\]/g, '_');
      const drivePath = resolvePathForNode(parentId, cleanName, isFolder, db, pendingNodes);

      if (isFolder && typeof db.gdriveCacheNodesGet === 'function' && typeof db.gdriveCacheNodesUpdatePrefix === 'function') {
        const oldNode = pendingNodes.get(fileId) || db.gdriveCacheNodesGet(fileId);
        if (oldNode && oldNode.drivePath && oldNode.drivePath !== drivePath) {
          db.gdriveCacheNodesUpdatePrefix(oldNode.drivePath, drivePath);
          const oldPrefix = oldNode.drivePath.endsWith('/') ? oldNode.drivePath : `${oldNode.drivePath}/`;
          const newPrefix = drivePath.endsWith('/') ? drivePath : `${drivePath}/`;
          for (const pending of pendingNodes.values()) {
            if (pending.drivePath && pending.drivePath.startsWith(oldPrefix)) {
              pending.drivePath = `${newPrefix}${pending.drivePath.slice(oldPrefix.length)}`;
            }
          }
        }
      }

      const nodeRecord = {
        id: fileId,
        parentId,
        name: cleanName,
        mimeType: f.mimeType || '',
        isFolder,
        size: Number(f.size) || 0,
        modifiedTime: f.modifiedTime || null,
        md5Checksum: f.md5Checksum || null,
        trashed: 0,
        shortcutTargetId: f.shortcutDetails?.targetId || null,
        drivePath,
        cachedAt: new Date().toISOString(),
      };
      pendingNodes.set(fileId, nodeRecord);
      nodesToUpsert.push(nodeRecord);
      updatedCount += 1;
    }
  }

  if (nodesToUpsert.length > 0 && typeof db.gdriveCacheNodesUpsertBatch === 'function') {
    db.gdriveCacheNodesUpsertBatch(nodesToUpsert);
  }

  return { removedCount, trashedCount, updatedCount };
}

module.exports = {
  isTokenExpiredError,
  resolvePathForNode,
  applyChangesToCache,
};
