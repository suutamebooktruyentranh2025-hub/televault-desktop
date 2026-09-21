/**
 * Disambiguates duplicate sibling names within the same parent folder.
 * Appends (1), (2) while keeping extension intact.
 * @param {Array<{ id: string, name: string, isFolder: boolean|number }>} siblings
 * @returns {Map<string, string>} Map of id -> uniqueName
 */
function disambiguateSiblingNames(siblings) {
  const nameCounts = new Map();
  const result = new Map();

  for (const item of siblings) {
    const rawName = (item.name || 'unnamed').normalize('NFC').replace(/[\/\\]/g, '_');
    const isFolder = Boolean(item.isFolder);

    const occurrences = (nameCounts.get(rawName) || 0) + 1;
    nameCounts.set(rawName, occurrences);

    if (occurrences === 1) {
      result.set(item.id, rawName);
    } else {
      const disambiguated = isFolder
        ? `${rawName} (${occurrences - 1})`
        : (() => {
            const dotIdx = rawName.lastIndexOf('.');
            if (dotIdx > 0) {
              const stem = rawName.slice(0, dotIdx);
              const ext = rawName.slice(dotIdx);
              return `${stem} (${occurrences - 1})${ext}`;
            }
            return `${rawName} (${occurrences - 1})`;
          })();
      result.set(item.id, disambiguated);
    }
  }
  return result;
}

/**
 * Builds normalized hierarchical paths for all nodes.
 * @param {Array<object>} nodes
 * @returns {Map<string, object>} Map of id -> node with drivePath
 */
function materializePaths(nodes) {
  const nodeMap = new Map();
  const childrenByParent = new Map();

  for (const node of nodes) {
    const normalized = { ...node, name: (node.name || '').normalize('NFC').replace(/[\/\\]/g, '_') };
    nodeMap.set(node.id, normalized);
    const pId = node.parentId || 'root';
    if (!childrenByParent.has(pId)) {
      childrenByParent.set(pId, []);
    }
    childrenByParent.get(pId).push(normalized);
  }

  const result = new Map();
  const visited = new Set();

  function walk(parentId, currentPath) {
    if (visited.has(parentId)) return;
    visited.add(parentId);

    const children = childrenByParent.get(parentId) || [];
    if (children.length === 0) return;

    const disambiguatedNames = disambiguateSiblingNames(children);

    for (const child of children) {
      const uniqueName = disambiguatedNames.get(child.id);
      const isFolder = Boolean(child.isFolder);
      const childPath = isFolder ? `${currentPath}${uniqueName}/` : `${currentPath}${uniqueName}`;

      const materialized = {
        ...nodeMap.get(child.id),
        name: uniqueName,
        drivePath: childPath,
      };
      result.set(child.id, materialized);

      if (isFolder) {
        walk(child.id, childPath);
      }
    }
  }

  // Traverse from root
  walk('root', '/');

  // Handle any disconnected or orphaned nodes (whose parent is not 'root' and not found)
  for (const [id, node] of nodeMap) {
    if (!result.has(id)) {
      const isFolder = Boolean(node.isFolder);
      const fallbackPath = isFolder ? `/${node.name}/` : `/${node.name}`;
      result.set(id, { ...node, drivePath: fallbackPath });
    }
  }

  return result;
}

/**
 * Fetches all Drive nodes, materializes paths, persists to SQLite, and initializes changes token.
 * @param {object} api GDriveApi instance
 * @param {object} db indexDb instance
 * @param {(progress: { phase: string, loadedCount: number, totalCount?: number }) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [opts]
 */
async function fetchFullIndex(api, db, onProgress, opts = {}) {
  db.gdriveStateSet('cache_status', 'indexing');
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'fetching', loadedCount: 0 });
  }

  let rawNodes = [];
  let loadedCount = 0;
  try {
    if (typeof api.listAllFilesFlat === 'function') {
      rawNodes = await api.listAllFilesFlat({
        signal: opts.signal,
        onPage: (pageItems) => {
          loadedCount += pageItems.length;
          if (typeof onProgress === 'function') {
            const sampleItems = pageItems.slice(-50).map((f) => ({
              id: f.id,
              name: (f.name || '').normalize('NFC'),
              mimeType: f.mimeType || '',
              isFolder: f.mimeType === 'application/vnd.google-apps.folder',
              size: Number(f.size) || 0,
              modifiedTime: f.modifiedTime || null,
            }));
            onProgress({ phase: 'fetching', loadedCount, recentItems: sampleItems });
          }
        },
      });
    } else {
      rawNodes = await api.listFolder('root');
      loadedCount = rawNodes.length;
      if (typeof onProgress === 'function') {
        const sampleItems = rawNodes.slice(-50).map((f) => ({
          id: f.id,
          name: (f.name || '').normalize('NFC'),
          mimeType: f.mimeType || '',
          isFolder: f.mimeType === 'application/vnd.google-apps.folder',
          size: Number(f.size) || 0,
          modifiedTime: f.modifiedTime || null,
        }));
        onProgress({ phase: 'fetching', loadedCount, recentItems: sampleItems });
      }
    }
  } catch (err) {
    db.gdriveStateSet('cache_status', 'error');
    throw err;
  }

  if (opts.signal?.aborted) {
    db.gdriveStateSet('cache_status', 'idle');
    const abortErr = new Error('Indexing aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (typeof onProgress === 'function') {
    onProgress({ phase: 'materializing', loadedCount: rawNodes.length, totalCount: rawNodes.length });
  }

  // Convert raw Google Drive API files to internal cache nodes
  const formattedNodes = rawNodes.map((f) => ({
    id: f.id,
    parentId: f.parents && f.parents.length > 0 ? f.parents[0] : 'root',
    name: (f.name || '').normalize('NFC'),
    mimeType: f.mimeType || '',
    isFolder: f.mimeType === 'application/vnd.google-apps.folder' ? 1 : 0,
    size: Number(f.size) || 0,
    modifiedTime: f.modifiedTime || null,
    md5Checksum: f.md5Checksum || null,
    trashed: f.trashed ? 1 : 0,
    shortcutTargetId: f.shortcutDetails?.targetId || null,
  }));

  await new Promise((resolve) => setImmediate(resolve));
  const materializedMap = materializePaths(formattedNodes);
  await new Promise((resolve) => setImmediate(resolve));
  const nodesToSave = Array.from(materializedMap.values());

  if (typeof onProgress === 'function') {
    onProgress({ phase: 'saving', loadedCount: nodesToSave.length, totalCount: nodesToSave.length });
  }

  db.gdriveCacheNodesClear();

  // Insert in chunks of 2,000 nodes yielding to the event loop so the app never freezes
  const CHUNK_SIZE = 2000;
  for (let i = 0; i < nodesToSave.length; i += CHUNK_SIZE) {
    if (opts.signal?.aborted) {
      const abortErr = new Error('Indexing aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const chunk = nodesToSave.slice(i, i + CHUNK_SIZE);
    db.gdriveCacheNodesUpsertBatch(chunk);
    await new Promise((resolve) => setImmediate(resolve));
  }

  // Initialize Changes Token
  try {
    const { newStartPageToken } = await api.getChanges(null);
    if (newStartPageToken) {
      db.gdriveStateSet('changes_page_token', newStartPageToken);
    }
  } catch (tokenErr) {
    console.warn('[GDriveCacheIndexer] Failed to obtain initial changes token:', tokenErr?.message || tokenErr);
  }

  db.gdriveStateSet('cache_status', 'ready');
  db.gdriveStateSet('cache_total_nodes', String(nodesToSave.length));
  db.gdriveStateSet('cache_last_full_scan', new Date().toISOString());

  if (typeof onProgress === 'function') {
    onProgress({ phase: 'ready', loadedCount: nodesToSave.length, totalCount: nodesToSave.length });
  }

  return nodesToSave;
}

module.exports = {
  disambiguateSiblingNames,
  materializePaths,
  fetchFullIndex,
};
