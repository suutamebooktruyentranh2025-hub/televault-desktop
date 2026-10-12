const { isDir } = require('./vaultEntry');
const { K_TRASH_FOLDER_NAME } = require('./trash');

/** @typedef {'name'|'mtime'|'size'} VaultSortField */
/** @typedef {'asc'|'desc'} SortDirection */

function toNfc(str) {
  return typeof str === 'string' ? str.normalize('NFC') : str;
}

/**
 * Retains the latest entry per unique normalized path.
 * @param {import('./vaultEntry').VaultEntry[]} entries
 * @returns {import('./vaultEntry').VaultEntry[]}
 */
function dedupeEntriesByPath(entries) {
  if (!Array.isArray(entries) || entries.length <= 1) return entries;
  /** @type {Map<string, import('./vaultEntry').VaultEntry>} */
  const map = new Map();
  for (const e of entries) {
    const key = toNfc(e.path);
    const existing = map.get(key);
    if (!existing || (e.messageId > existing.messageId)) {
      map.set(key, e);
    }
  }
  return [...map.values()];
}

/**
 * @param {import('./vaultEntry').VaultEntry[]} all
 * @param {string} folder
 */
function listFolder(all, folder) {
  if (!folder.endsWith('/')) {
    throw new Error('folder must end with /');
  }

  all = dedupeEntriesByPath(all);
  const normFolder = toNfc(folder);
  const folders = new Set();
  /** @type {import('./vaultEntry').VaultEntry[]} */
  const files = [];

  for (const e of all) {
    const ePath = toNfc(e.path);
    if (!ePath.startsWith(normFolder) || ePath === normFolder) continue;
    const rest = ePath.slice(normFolder.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      files.push(e);
    } else {
      const name = rest.slice(0, slash);
      if (normFolder === '/' && name === K_TRASH_FOLDER_NAME) continue;
      folders.add(name);
    }
  }

  return {
    folders: [...folders].sort(),
    files: files.sort((a, b) => {
      const pathA = toNfc(a.path);
      const pathB = toNfc(b.path);
      return pathA.slice(pathA.lastIndexOf('/') + 1).localeCompare(
        pathB.slice(pathB.lastIndexOf('/') + 1),
      );
    }),
  };
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {string} folderPath */
function folderMtime(all, folderPath) {
  all = dedupeEntriesByPath(all);
  const normFolder = toNfc(folderPath);
  let latest = null;
  /** @type {import('./vaultEntry').VaultEntry|null} */
  let marker = null;
  for (const e of all) {
    const ePath = toNfc(e.path);
    if (ePath === normFolder && isDir(e)) marker = e;
    if (ePath.startsWith(normFolder) && ePath !== normFolder && !isDir(e)) {
      if (!latest || e.mtime > latest) latest = e.mtime;
    }
  }
  return latest ?? marker?.mtime ?? new Date(0);
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {string} folderPath */
function folderSize(all, folderPath) {
  all = dedupeEntriesByPath(all);
  const normFolder = toNfc(folderPath);
  let total = 0;
  for (const e of all) {
    const ePath = toNfc(e.path);
    if (ePath.startsWith(normFolder) && ePath !== normFolder && !isDir(e)) {
      total += e.size;
    }
  }
  return total;
}

function compareByDirection(a, b, direction) {
  const c = a < b ? -1 : a > b ? 1 : 0;
  return direction === 'asc' ? c : -c;
}

function sortFolderListing(listing, all, currentFolder, { field, direction, folderMetadataMap }) {
  const folders = [...listing.folders];
  const files = [...listing.files];

  if (field === 'name') {
    folders.sort((a, b) => compareByDirection(a, b, direction));
    files.sort((a, b) => compareByDirection(
      a.path.slice(a.path.lastIndexOf('/') + 1),
      b.path.slice(b.path.lastIndexOf('/') + 1),
      direction,
    ));
  } else if (field === 'mtime') {
    const mtimes = new Map(
      folders.map((name) => [
        name,
        folderMetadataMap?.has(name)
          ? new Date(folderMetadataMap.get(name).mtime).getTime()
          : folderMtime(all, `${currentFolder}${name}/`).getTime(),
      ])
    );
    folders.sort((a, b) => compareByDirection(mtimes.get(a), mtimes.get(b), direction));
    files.sort((a, b) => compareByDirection(a.mtime.getTime(), b.mtime.getTime(), direction));
  } else if (field === 'size') {
    const sizes = new Map(
      folders.map((name) => [
        name,
        folderMetadataMap?.has(name)
          ? (folderMetadataMap.get(name)?.size ?? 0)
          : folderSize(all, `${currentFolder}${name}/`),
      ])
    );
    folders.sort((a, b) => compareByDirection(sizes.get(a), sizes.get(b), direction));
    files.sort((a, b) => compareByDirection(a.size, b.size, direction));
  }

  return { folders, files };
}

/**
 * Single-pass calculation of folder metadata (mtime, size, file/folder counts)
 * for all direct subfolders as well as the current folder itself.
 * Replaces N*3 passes over `all` with a single O(N) pass.
 *
 * @param {import('./vaultEntry').VaultEntry[]} all
 * @param {string} currentFolder
 * @param {string[]} subfolderNames
 */
function buildFolderListingMetadata(all, currentFolder, subfolderNames = []) {
  all = dedupeEntriesByPath(all);
  const baseFolder = currentFolder.endsWith('/') ? currentFolder : `${currentFolder}/`;
  const normFolder = toNfc(baseFolder);

  const currentDirectSubfolders = new Set();
  const currentAllSubfolders = new Set();
  let currentDirectFiles = 0;
  let currentTotalFiles = 0;

  /** @type {Map<string, { name: string, path: string, latestMtime: Date|null, markerMtime: Date|null, size: number, directFiles: number, directSubfolders: Set<string>, totalFiles: number, allSubfolders: Set<string> }>} */
  const subfolderMap = new Map();
  for (const name of subfolderNames) {
    const normName = toNfc(name);
    subfolderMap.set(normName, {
      name,
      path: `${baseFolder}${name}/`,
      latestMtime: null,
      markerMtime: null,
      size: 0,
      directFiles: 0,
      directSubfolders: new Set(),
      totalFiles: 0,
      allSubfolders: new Set(),
    });
  }

  for (const e of all) {
    const ePath = toNfc(e.path);
    if (!ePath.startsWith(normFolder) || ePath === normFolder) continue;

    const rest = ePath.slice(normFolder.length);

    if (normFolder === '/' && (rest === K_TRASH_FOLDER_NAME || rest.startsWith(`${K_TRASH_FOLDER_NAME}/`))) {
      continue;
    }

    const firstSlash = rest.indexOf('/');

    if (firstSlash === -1) {
      if (!isDir(e)) {
        currentDirectFiles += 1;
      }
    } else {
      const dirName = rest.slice(0, firstSlash);
      currentDirectSubfolders.add(dirName);
    }

    if (!isDir(e)) {
      currentTotalFiles += 1;
    }

    let pos = 0;
    while ((pos = rest.indexOf('/', pos)) !== -1) {
      const sub = rest.slice(0, pos);
      if (sub) {
        currentAllSubfolders.add(sub);
      }
      pos += 1;
    }

    if (firstSlash !== -1) {
      const subName = rest.slice(0, firstSlash);
      const sub = subfolderMap.get(subName);
      if (sub) {
        const subRest = rest.slice(firstSlash + 1);
        if (subRest === '') {
          if (isDir(e)) {
            sub.markerMtime = e.mtime;
          }
        } else {
          if (!isDir(e)) {
            sub.size += e.size;
            if (!sub.latestMtime || e.mtime > sub.latestMtime) {
              sub.latestMtime = e.mtime;
            }
            sub.totalFiles += 1;
          }

          const secondSlash = subRest.indexOf('/');
          if (secondSlash === -1) {
            if (!isDir(e)) {
              sub.directFiles += 1;
            }
          } else {
            const nestedName = subRest.slice(0, secondSlash);
            sub.directSubfolders.add(nestedName);
          }

          let subPos = 0;
          while ((subPos = subRest.indexOf('/', subPos)) !== -1) {
            const nestedSub = subRest.slice(0, subPos);
            if (nestedSub) {
              sub.allSubfolders.add(nestedSub);
            }
            subPos += 1;
          }
        }
      }
    }
  }

  const folderMetadataMap = new Map();
  for (const [, sub] of subfolderMap.entries()) {
    const finalMtime = sub.latestMtime ?? sub.markerMtime ?? new Date(0);
    const item = {
      name: sub.name,
      path: sub.path,
      mtime: finalMtime,
      size: sub.size,
      fileCount: sub.directFiles,
      folderCount: sub.directSubfolders.size,
      totalFiles: sub.totalFiles,
      totalFolders: sub.allSubfolders.size,
    };
    folderMetadataMap.set(sub.name, item);
    folderMetadataMap.set(toNfc(sub.name), item);
  }

  const currentCounts = {
    fileCount: currentDirectFiles,
    folderCount: currentDirectSubfolders.size,
    totalFiles: currentTotalFiles,
    totalFolders: currentAllSubfolders.size,
  };

  return {
    folderMetadataMap,
    currentCounts,
  };
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {string} folderPath */
function folderHasContents(all, folderPath) {
  const listing = listFolder(all, folderPath);
  return listing.folders.length > 0 || listing.files.some((e) => !isDir(e));
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {Set<string>} expanded */
function buildVisibleTreeRows(all, expanded) {
  /** @type {Array<{ kind: 'folder', depth: number, path: string, name: string, hasChildren: boolean, expanded: boolean } | { kind: 'file', depth: number, entry: import('./vaultEntry').VaultEntry }>} */
  const rows = [];

  /** @param {string} folderPath @param {number} depth */
  function walk(folderPath, depth) {
    const listing = listFolder(all, folderPath);
    for (const name of listing.folders) {
      const path = `${folderPath}${name}/`;
      const hasChildren = folderHasContents(all, path);
      const isExpanded = expanded.has(path);
      rows.push({ kind: 'folder', depth, path, name, hasChildren, expanded: isExpanded });
      if (isExpanded) walk(path, depth + 1);
    }
    for (const file of listing.files) {
      if (!isDir(file)) rows.push({ kind: 'file', depth, entry: file });
    }
  }

  walk('/', 0);
  return rows;
}

/**
 * Counts direct and recursive files and subfolders under a given folder path.
 * @param {import('./vaultEntry').VaultEntry[]} all
 * @param {string} folderPath
 */
function folderCounts(all, folderPath) {
  all = dedupeEntriesByPath(all);
  const normPath = toNfc(folderPath.endsWith('/') ? folderPath : `${folderPath}/`);
  const directSubfolders = new Set();
  const allSubfolders = new Set();
  let directFiles = 0;
  let totalFiles = 0;

  for (const e of all) {
    const ePath = toNfc(e.path);
    if (!ePath.startsWith(normPath) || ePath === normPath) continue;
    const rest = ePath.slice(normPath.length);
    if (normPath === '/' && (rest === K_TRASH_FOLDER_NAME || rest.startsWith(`${K_TRASH_FOLDER_NAME}/`))) {
      continue;
    }
    const slash = rest.indexOf('/');

    if (slash === -1) {
      if (!isDir(e)) {
        directFiles += 1;
      }
    } else {
      const name = rest.slice(0, slash);
      directSubfolders.add(name);
    }

    if (!isDir(e)) {
      totalFiles += 1;
    }

    let pos = 0;
    while ((pos = rest.indexOf('/', pos)) !== -1) {
      const sub = rest.slice(0, pos);
      if (sub) {
        allSubfolders.add(sub);
      }
      pos += 1;
    }
  }

  return {
    fileCount: directFiles,
    folderCount: directSubfolders.size,
    totalFiles,
    totalFolders: allSubfolders.size,
  };
}

module.exports = {
  listFolder,
  folderMtime,
  folderSize,
  folderCounts,
  sortFolderListing,
  buildFolderListingMetadata,
  folderHasContents,
  buildVisibleTreeRows,
};
