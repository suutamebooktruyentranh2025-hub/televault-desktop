const RECENT_KEY = 'televault:recentMoveFolders';
const RECENT_LIMIT = 12;

export function isInvalidMoveDestination(destination, currentFolder, sourceFolders = []) {
  if (!destination || !destination.endsWith('/')) return true;
  if (destination === currentFolder) return true;
  return sourceFolders.some((folderPath) => destination === folderPath || destination.startsWith(folderPath));
}

export function isExcludedMoveFolder(path, sourceFolders = []) {
  return sourceFolders.some((folderPath) => path === folderPath || path.startsWith(folderPath));
}

export function joinFolderPath(parent, nameOrItem) {
  const name = typeof nameOrItem === 'string' ? nameOrItem : nameOrItem?.name;
  if (!name) return parent;
  const base = parent.endsWith('/') ? parent : `${parent}/`;
  return `${base}${name}/`.replace(/\/+/g, '/');
}

export function folderDisplayName(path, myDriveLabel) {
  if (!path || path === '/') return myDriveLabel;
  return path.split('/').filter(Boolean).at(-1) || myDriveLabel;
}

export function getRecentMoveFolders() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string' && p.endsWith('/')) : [];
  } catch {
    return [];
  }
}

export function recordRecentMoveFolder(path) {
  if (!path || !path.endsWith('/')) return;
  const next = [path, ...getRecentMoveFolders().filter((item) => item !== path)].slice(0, RECENT_LIMIT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function buildSuggestedFolders(allFolders, sourceFolders, currentFolder, limit = 10) {
  const seen = new Set();
  const items = [];

  for (const path of getRecentMoveFolders()) {
    if (seen.has(path)) continue;
    if (isExcludedMoveFolder(path, sourceFolders)) continue;
    if (isInvalidMoveDestination(path, currentFolder, sourceFolders)) continue;
    if (allFolders.length > 0 && !allFolders.includes(path) && path !== '/') continue;
    seen.add(path);
    items.push(path);
    if (items.length >= limit) return items;
  }

  for (const path of allFolders) {
    if (seen.has(path)) continue;
    if (path === currentFolder) continue;
    if (isExcludedMoveFolder(path, sourceFolders)) continue;
    if (isInvalidMoveDestination(path, currentFolder, sourceFolders)) continue;
    seen.add(path);
    items.push(path);
    if (items.length >= limit) return items;
  }

  if (!seen.has('/') && !isInvalidMoveDestination('/', currentFolder, sourceFolders)) {
    items.unshift('/');
  }

  return items.slice(0, limit);
}
