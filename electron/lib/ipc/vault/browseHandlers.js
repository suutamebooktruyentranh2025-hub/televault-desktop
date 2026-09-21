const {
  listFolder,
  listAllFolders,
  sortFolderListing,
  buildFolderListingMetadata,
  buildVisibleTreeRows,
  folderMtime,
  folderSize,
  folderCounts,
  K_TRASH_FOLDER,
  buildDashboardStats,
} = require('@televault/core');
const { serializeEntry } = require('./vaultShared');

function registerBrowseHandlers(ipcMain, ctx) {
  ipcMain.handle('vault:getListing', (_evt, { folder, sortField = 'name', sortDirection = 'asc' }) => {
    if (!ctx.isReady()) return { ok: false, error: 'not_ready', folders: [], files: [] };
    const db = ctx.getDb();
    const all = db.getAll();
    const base = folder || '/';
    const listing = listFolder(all, base);
    const { folderMetadataMap, currentCounts } = buildFolderListingMetadata(all, base, listing.folders);
    const sorted = sortFolderListing(listing, all, base, {
      field: sortField,
      direction: sortDirection,
      folderMetadataMap,
    });
    const folderItems = sorted.folders.map((name) => {
      const meta = folderMetadataMap.get(name) || {
        name,
        path: `${base}${name}/`,
        mtime: new Date(0),
        size: 0,
        fileCount: 0,
        folderCount: 0,
        totalFiles: 0,
        totalFolders: 0,
      };
      return {
        name: meta.name,
        path: meta.path,
        mtime: meta.mtime instanceof Date ? meta.mtime.toISOString() : new Date(meta.mtime).toISOString(),
        size: meta.size,
        fileCount: meta.fileCount,
        folderCount: meta.folderCount,
        totalFiles: meta.totalFiles,
        totalFolders: meta.totalFolders,
      };
    });
    const folderTags = db.folderTagsIndex();
    return {
      ok: true,
      folders: folderItems,
      files: sorted.files.map((e) => serializeEntry(db, e, folderTags)),
      counts: currentCounts,
    };
  });

  ipcMain.handle('vault:getTree', (_evt, { expanded = [] }) => {
    if (!ctx.isReady()) return { ok: false, rows: [] };
    const db = ctx.getDb();
    const all = db.getAll();
    const folderTags = db.folderTagsIndex();
    const rows = buildVisibleTreeRows(all, new Set(expanded)).map((row) => {
      if (row.kind === 'folder') {
        return {
          kind: 'folder',
          depth: row.depth,
          path: row.path,
          name: row.name,
          hasChildren: row.hasChildren,
          expanded: row.expanded,
        };
      }
      return {
        kind: 'file',
        depth: row.depth,
        entry: serializeEntry(db, row.entry, folderTags),
      };
    });
    return { ok: true, rows };
  });

  ipcMain.handle('vault:getStats', () => {
    if (!ctx.isReady()) return { ok: false, count: 0 };
    const db = ctx.getDb();
    return {
      ok: true,
      count: db.listVisibleFileCount(),
      trashFolder: K_TRASH_FOLDER,
    };
  });

function getDayBoundsUtc(dateStr, timeZone) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const intlParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(dUtc);
  const pMap = {};
  for (const p of intlParts) pMap[p.type] = p.value;
  const localH = parseInt(pMap.hour, 10) % 24;
  const localM = parseInt(pMap.minute, 10);
  const offsetMinutes = (localH - 12) * 60 + localM;
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMinutes * 60000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
  };
}

  ipcMain.handle('vault:getDashboard', (_evt, { rangeDays = 30 } = {}) => {
    if (!ctx.isReady()) {
      return { ok: false, error: 'not_ready' };
    }
    const entries = ctx.getDb()?.getDashboardEntries?.() || ctx.getDb()?.getAll() || [];
    const stats = buildDashboardStats(entries, {
      rangeDays: Number(rangeDays) || 30,
      includeDayFiles: false,
    });
    return { ok: true, stats };
  });

  ipcMain.handle('vault:getDayFiles', (_evt, { date, limit = 100 } = {}) => {
    if (!ctx.isReady()) {
      return { ok: false, error: 'not_ready' };
    }
    const bounds = getDayBoundsUtc(date);
    if (!bounds) {
      return { ok: false, error: 'invalid_date' };
    }
    const { startUtc, endUtc } = bounds;
    const fetchLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const db = ctx.getDb();
    if (!db || typeof db.getDayFiles !== 'function') {
      return { ok: true, files: [], totalCount: 0, totalBytes: 0, date };
    }
    const res = db.getDayFiles({ startUtc, endUtc, limit: fetchLimit });
    return {
      ok: true,
      files: res.files || [],
      totalCount: res.totalCount || 0,
      totalBytes: res.totalBytes || 0,
      date,
    };
  });

  ipcMain.handle('vault:search', (_evt, { query, tags = [] }) => {
    if (!ctx.isReady()) return { ok: false, files: [] };
    const db = ctx.getDb();
    const folderTags = db.folderTagsIndex();
    const files = db.search({ query, tags }).map((e) => serializeEntry(db, e, folderTags));
    return { ok: true, files };
  });

  ipcMain.handle('vault:getFolderTags', (_evt, { folderPath }) => {
    if (!ctx.isReady()) return { ok: false, tags: [] };
    const db = ctx.getDb();
    const index = db.folderTagsIndex();
    return { ok: true, tags: index[folderPath] || [] };
  });

  ipcMain.handle('vault:allTags', async () => {
    if (!ctx.isReady()) return { ok: false, tags: {}, foldersByTag: {} };
    const db = ctx.getDb();
    db.reconcileFolderTagsFromMarkers();
    let foldersByTag = db.foldersByTag();
    const tagCounts = db.allTags();

    const needsTelegramResync = Object.keys(tagCounts).some((tag) => !(foldersByTag[tag]?.length));
    if (needsTelegramResync) {
      const channel = ctx.getChannel?.();
      const chatId = db.getVaultChatId();
      if (channel && chatId) {
        try {
          await channel.resyncDirMarkers(chatId);
          foldersByTag = db.foldersByTag();
        } catch (e) {
          console.error('[vault:allTags resync]', e);
        }
      }
    }

    return { ok: true, tags: tagCounts, names: db.allTagNames(), foldersByTag };
  });

  ipcMain.handle('vault:allFolders', () => {
    if (!ctx.isReady()) return { ok: false, folders: [] };
    const db = ctx.getDb();
    return { ok: true, folders: listAllFolders(db.getAll()) };
  });

  ipcMain.handle('vault:getFoldersDetails', (_evt, { paths = [] } = {}) => {
    if (!ctx.isReady()) return { ok: false, folders: [] };
    const db = ctx.getDb();
    const all = db.getAll();
    const folders = (paths || []).map((folderPath) => {
      const parts = folderPath.split('/').filter(Boolean);
      const name = parts.at(-1) || folderPath;
      const mtime = folderMtime(all, folderPath);
      const counts = folderCounts(all, folderPath);
      return {
        path: folderPath,
        name,
        mtime: mtime.toISOString(),
        size: folderSize(all, folderPath),
        fileCount: counts.fileCount,
        folderCount: counts.folderCount,
        totalFiles: counts.totalFiles,
        totalFolders: counts.totalFolders,
      };
    });
    return { ok: true, folders };
  });
}

module.exports = { registerBrowseHandlers };
