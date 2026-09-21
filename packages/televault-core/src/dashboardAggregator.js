const { isDir, entryName } = require('./vaultEntry');
const { isInTrash } = require('./trash');

function visibleFiles(all) {
  return all.filter((e) => !isDir(e) && !isInTrash(e.path));
}

function isSubfolderOrFormat(folderName, potentialStoryName = '') {
  if (!folderName) return false;
  const name = folderName.trim();
  // Format extensions in brackets or parentheses: (CBZ), [MOBI], (PDF), etc.
  if (/\((cbz|cbr|mobi|epub|pdf|azw3?|raw|zip|rar|tar|7z)\)$/i.test(name)) return true;
  if (/\[(cbz|cbr|mobi|epub|pdf|azw3?|raw|zip|rar|tar|7z)\]$/i.test(name)) return true;
  if (/^(cbz|cbr|mobi|epub|pdf|azw3?|raw|zip|rar|tar|7z)$/i.test(name)) return true;

  // Chapter / Volume / Part / Subfolder patterns: Sub, Chap 1, Vol 2, Tập 3, Phần 4, Book 1, Extra...
  if (/^(sub|subfolder|part|ch|chap|chapter|vol|volume|tập|tap|hồi|phần|phan|cuốn|cuon|book|extra|bonus|omake|side\s*story)\b/i.test(name)) {
    return true;
  }
  if (/\b(chap|chapter|vol|volume|tập|tap|hồi|phần|phan|part)\s*\d+/i.test(name)) return true;

  // Name starts with potential story name + format/suffix: e.g. "Naruto (CBZ)", "Naruto - CBZ"
  if (potentialStoryName) {
    const sName = potentialStoryName.trim().toLowerCase();
    const lName = name.toLowerCase();
    if (lName !== sName && lName.startsWith(sName)) {
      const rest = lName.slice(sName.length).trim();
      if (/^[(\[-_\s]/.test(rest) || /\((cbz|cbr|mobi|epub|pdf|azw3?|raw|zip|rar|tar|7z)\)/i.test(rest)) {
        return true;
      }
    }
  }

  return false;
}

function extractStoryFolder(filePath) {
  const normPath = typeof filePath === 'string' ? filePath.normalize('NFC') : filePath;
  const parts = normPath.split('/').filter(Boolean);
  if (parts.length <= 1) return null; // file at root

  // Start from parts.length - 2 (direct parent of the file)
  let storyIndex = parts.length - 2;

  // If there are parent and grandparent, check if parent is format/subfolder
  if (storyIndex > 0) {
    const parentName = parts[storyIndex];
    const grandParentName = parts[storyIndex - 1];
    if (isSubfolderOrFormat(parentName, grandParentName)) {
      storyIndex -= 1;
      // Trace further up if previous parent is also a subfolder indicator
      while (storyIndex > 0) {
        const currentName = parts[storyIndex];
        const nextAbove = parts[storyIndex - 1];
        if (isSubfolderOrFormat(currentName, nextAbove)) {
          storyIndex -= 1;
        } else {
          break;
        }
      }
    }
  }

  const storyPathParts = parts.slice(0, storyIndex + 1);
  const path = `/${storyPathParts.join('/')}/`;
  const name = parts[storyIndex];
  const subtextParts = parts.slice(0, storyIndex);
  const subtext = subtextParts.join(' / ');

  return { path, name, subtext };
}

const formatterCache = new Map();
function getLocalDateFormatter(timeZone) {
  const tzKey = timeZone || 'default';
  let fmt = formatterCache.get(tzKey);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(tzKey, fmt);
  }
  return fmt;
}

function formatLocalDate(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  return getLocalDateFormatter(timeZone).format(d);
}

function buildDateRange(endDate, days, timeZone) {
  const fmt = getLocalDateFormatter(timeZone);
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    keys.push(fmt.format(d));
  }
  return keys;
}

/**
 * @param {import('./vaultEntry').VaultEntry[]} all
 * @param {{ rangeDays?: number, today?: Date, timeZone?: string, topN?: number, includeDayFiles?: boolean }} [options]
 */
function buildDashboardStats(all, options = {}) {
  const rangeDays = options.rangeDays ?? 30;
  const today = options.today ?? new Date();
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const topN = options.topN ?? 10;
  const includeDayFiles = options.includeDayFiles ?? false;
  const fmt = getLocalDateFormatter(timeZone);

  const files = visibleFiles(all);
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, e) => sum + e.size, 0);

  /** @type {Map<string, { path: string, name: string, subtext: string, bytes: number, fileCount: number, vaultId?: string }>} */
  const folderMap = new Map();
  for (const file of files) {
    const folder = extractStoryFolder(file.path);
    if (!folder) continue;
    const mapKey = file.vaultId ? `${file.vaultId}:${folder.path}` : folder.path;
    const row = folderMap.get(mapKey) || {
      path: folder.path,
      name: folder.name,
      subtext: folder.subtext,
      bytes: 0,
      fileCount: 0,
      vaultId: file.vaultId || 'personal',
    };
    row.bytes += file.size;
    row.fileCount += 1;
    folderMap.set(mapKey, row);
  }
  const topFolders = [...folderMap.values()]
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, topN);

  const topFiles = [...files]
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, topN)
    .map((e) => ({
      messageId: e.messageId,
      path: e.path,
      name: entryName(e),
      bytes: e.size,
      mtime: e.mtime instanceof Date ? e.mtime.toISOString() : new Date(e.mtime).toISOString(),
      vaultId: e.vaultId || 'personal',
    }));

  const dateKeys = buildDateRange(today, rangeDays, timeZone);
  /** @type {Map<string, { date: string, fileCount: number, bytes: number, files?: any[] }>} */
  const byDay = new Map(
    dateKeys.map((date) => [
      date,
      includeDayFiles
        ? { date, fileCount: 0, bytes: 0, files: [] }
        : { date, fileCount: 0, bytes: 0 },
    ])
  );

  for (const file of files) {
    const mDate = file.mtime instanceof Date ? file.mtime : new Date(file.mtime);
    const key = fmt.format(mDate);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.fileCount += 1;
    bucket.bytes += file.size;
    if (includeDayFiles && bucket.files) {
      bucket.files.push({
        messageId: file.messageId,
        path: file.path,
        name: entryName(file),
        bytes: file.size,
        mtime: mDate.toISOString(),
        vaultId: file.vaultId || 'personal',
      });
    }
  }

  const uploadsPerDay = dateKeys.map((date) => {
    const b = byDay.get(date);
    if (includeDayFiles && b && Array.isArray(b.files) && b.files.length > 1) {
      b.files.sort((a, bFile) => bFile.bytes - a.bytes);
    }
    return b;
  });

  return { totalFiles, totalBytes, topFolders, topFiles, uploadsPerDay };
}

module.exports = { buildDashboardStats, visibleFiles, extractStoryFolder };
