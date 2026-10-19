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
  isTrashFolder,
  isInTrash,
  isDir,
  buildDashboardStats,
  visibleFiles,
  extractStoryFolder,
  entryName,
} = require('@televault/core');
const {
  serializeEntry,
  broadcastVaultChanged,
  broadcastSharedVaultsChanged,
  safeBroadcast,
} = require('./vaultShared');

function registerBrowseHandlers(ipcMain, ctx) {
  ipcMain.handle('vault:getListing', (_evt, { folder, sortField = 'name', sortDirection = 'asc' }) => {
    if (!ctx.isReady()) return { ok: false, error: 'not_ready', folders: [], files: [] };
    const db = ctx.getDb();
    const all = db.getAll();
    const base = folder || '/';
    const isTrash = isTrashFolder(base);
    const listing = isTrash
      ? { folders: [], files: all.filter((e) => isInTrash(e.path) && !isDir(e)) }
      : listFolder(all, base);
    const { folderMetadataMap, currentCounts } = buildFolderListingMetadata(all, base, listing.folders);
    if (isTrash) {
      currentCounts.fileCount = listing.files.length;
      currentCounts.totalFiles = listing.files.length;
      currentCounts.folderCount = 0;
      currentCounts.totalFolders = 0;
    }
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

  function resolveDb(targetChatId) {
    if (targetChatId != null && targetChatId !== '') {
      const sharedMgr = ctx.getSharedVaults?.();
      return sharedMgr?.getInstance?.(Number(targetChatId))?.db || null;
    }
    if (!ctx.isReady()) return null;
    return ctx.getDb?.() || null;
  }

  ipcMain.handle('vault:allTags', (_evt, { chatId } = {}) => {
    const db = resolveDb(chatId);
    if (!db) return { ok: false, tags: {}, foldersByTag: {} };
    db.reconcileFolderTagsFromMarkers();
    const foldersByTag = db.foldersByTag();
    const tagCounts = db.allTags();
    return { ok: true, tags: tagCounts, names: db.allTagNames(), foldersByTag };
  });

  ipcMain.handle('vault:allFolders', () => {
    if (!ctx.isReady()) return { ok: false, folders: [] };
    const db = ctx.getDb();
    return { ok: true, folders: listAllFolders(db.getAll()) };
  });

  ipcMain.handle('vault:getFoldersDetails', (_evt, { paths = [], chatId } = {}) => {
    const db = resolveDb(chatId);
    if (!db) return { ok: false, folders: [] };
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

  ipcMain.handle('vault:getFlatStories', (_evt, { chatId, sortField = 'size', sortDirection = 'desc' } = {}) => {
    const db = resolveDb(chatId);
    if (!db) return { ok: false, folders: [] };
    const all = db.getAll();
    const files = visibleFiles(all);
    const folderMap = new Map();

    for (const file of files) {
      const story = extractStoryFolder(file.path);
      if (!story) continue;
      let row = folderMap.get(story.path);
      if (!row) {
        row = {
          path: story.path,
          name: story.name,
          subtext: story.subtext,
          size: 0,
          fileCount: 0,
          folderCount: 0,
          totalFiles: 0,
          totalFolders: 0,
          mtime: new Date(0),
        };
        folderMap.set(story.path, row);
      }
      row.size += file.size || 0;
      row.fileCount += 1;
      row.totalFiles += 1;
      const fileMtime = file.mtime instanceof Date ? file.mtime : new Date(file.mtime || 0);
      if (fileMtime > row.mtime) {
        row.mtime = fileMtime;
      }
    }

    const folders = [...folderMap.values()];
    folders.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'size') {
        cmp = (a.size || 0) - (b.size || 0);
      } else if (sortField === 'mtime') {
        cmp = a.mtime.getTime() - b.mtime.getTime();
      } else {
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return {
      ok: true,
      folders: folders.map((f) => ({
        ...f,
        mtime: f.mtime.toISOString(),
      })),
    };
  });

  ipcMain.handle('vault:getFlatFiles', (_evt, { chatId, sortField = 'size', sortDirection = 'desc' } = {}) => {
    const db = resolveDb(chatId);
    if (!db) return { ok: false, files: [] };
    const all = db.getAll();
    const files = visibleFiles(all);

    files.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'size') {
        cmp = (a.size || 0) - (b.size || 0);
      } else if (sortField === 'mtime') {
        const at = a.mtime instanceof Date ? a.mtime.getTime() : new Date(a.mtime || 0).getTime();
        const bt = b.mtime instanceof Date ? b.mtime.getTime() : new Date(b.mtime || 0).getTime();
        cmp = at - bt;
      } else {
        const an = entryName(a);
        const bn = entryName(b);
        cmp = an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    const folderTags = db.folderTagsIndex();
    return {
      ok: true,
      files: files.map((e) => serializeEntry(db, e, folderTags)),
    };
  });

  let activeScanAbortController = null;

  ipcMain.handle('vault:rescanHistory', async (_evt, { chatId } = {}) => {
    if (activeScanAbortController) {
      activeScanAbortController.abort();
      activeScanAbortController = null;
    }
    const abortController = new AbortController();
    activeScanAbortController = abortController;
    const signal = abortController.signal;

    // 1. Shared vault rescan if target chatId provided
    if (chatId != null && chatId !== '') {
      const targetChatId = Number(chatId);
      const sharedMgr = ctx.getSharedVaults?.();
      if (!sharedMgr) return { ok: false, error: 'not_ready' };
      try {
        const scanned = await sharedMgr.forceRescanVault(targetChatId, (n) => {
          safeBroadcast('vault:scanProgress', { chatId: targetChatId, scanned: n });
        }, { signal });
        broadcastSharedVaultsChanged();
        const fileCount = sharedMgr.getFiles(targetChatId, '/')?.length || 0;
        return { ok: true, scanned, fileCount, chatId: targetChatId };
      } catch (e) {
        if (e.name === 'AbortError' || signal.aborted) {
          broadcastSharedVaultsChanged();
          return { ok: false, aborted: true };
        }
        console.error('[vault:rescanHistory shared-vault error]', e);
        return { ok: false, error: String(e.message || e) };
      } finally {
        if (activeScanAbortController === abortController) {
          activeScanAbortController = null;
        }
      }
    }

    // 2. Personal vault rescan
    if (!ctx.isReady()) return { ok: false, error: 'not_ready' };
    const channel = ctx.getChannel?.();
    const myChatId = ctx.getChatId?.();
    const db = ctx.getDb?.();
    if (!channel || myChatId == null || !db) {
      return { ok: false, error: 'vault_unavailable' };
    }

    try {
      const scanned = await channel.scanHistory(
        Number(myChatId),
        (n) => {
          safeBroadcast('vault:scanProgress', { chatId: Number(myChatId), scanned: n });
        },
        { forceFull: true, signal }
      );
      broadcastVaultChanged();
      const fileCount = typeof db.countEntries === 'function'
        ? db.countEntries()
        : (typeof db.getAll === 'function'
          ? db.getAll().filter((e) => !e.path.endsWith('/') && !e.path.startsWith('/Rác/')).length
          : 0);
      return { ok: true, scanned, fileCount, chatId: Number(myChatId) };
    } catch (e) {
      if (e.name === 'AbortError' || signal.aborted) {
        broadcastVaultChanged();
        return { ok: false, aborted: true };
      }
      console.error('[vault:rescanHistory personal-vault error]', e);
      return { ok: false, error: String(e.message || e) };
    } finally {
      if (activeScanAbortController === abortController) {
        activeScanAbortController = null;
      }
    }
  });

  ipcMain.handle('vault:cancelRescan', () => {
    if (activeScanAbortController) {
      activeScanAbortController.abort();
      activeScanAbortController = null;
      return { ok: true };
    }
    return { ok: false };
  });
}

module.exports = { registerBrowseHandlers };
