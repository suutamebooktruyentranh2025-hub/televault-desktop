const path = require('path');
const Database = require('better-sqlite3');
const {
  isInTrash,
  effectiveTagsForPath,
  entryMatchesSearch,
} = require('@televault/core');

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files(
      message_id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      mtime TEXT NOT NULL,
      local_path TEXT,
      last_used TEXT,
      td_file_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha256);
    CREATE TABLE IF NOT EXISTS file_tags(
      message_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY(message_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag);
    CREATE TABLE IF NOT EXISTS folder_tags(
      folder_path TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY(folder_path, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_folder_tags_tag ON folder_tags(tag);
    CREATE TABLE IF NOT EXISTS journal(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op TEXT NOT NULL,
      args TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transfers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      local_path TEXT,
      dest_path TEXT,
      message_id INTEGER,
      size INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_config(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_manifest(
      rel_path TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      mtime TEXT NOT NULL,
      side TEXT NOT NULL DEFAULT 'both'
    );
    CREATE TABLE IF NOT EXISTS gdrive_tokens(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gdrive_subscriptions(
      drive_id TEXT PRIMARY KEY,
      drive_path TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      is_folder INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS gdrive_manifest(
      drive_file_id TEXT PRIMARY KEY,
      drive_path TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      md5 TEXT,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      drive_modified_time TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gdrive_manifest_vault_path ON gdrive_manifest(vault_path);
    CREATE TABLE IF NOT EXISTS gdrive_state(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gdrive_sync_errors(
      drive_file_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      drive_path TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      size INTEGER,
      modified_time TEXT,
      error_message TEXT,
      failed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS gdrive_sync_queue(
      drive_file_id TEXT PRIMARY KEY,
      file_name TEXT,
      drive_path TEXT,
      vault_path TEXT,
      size INTEGER,
      modified_time TEXT,
      md5_checksum TEXT,
      added_at TEXT,
      retry_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS gdrive_cache_nodes(
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      is_folder INTEGER NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      modified_time TEXT,
      md5_checksum TEXT,
      trashed INTEGER NOT NULL DEFAULT 0,
      shortcut_target_id TEXT,
      drive_path TEXT,
      cached_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_parent ON gdrive_cache_nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_path ON gdrive_cache_nodes(drive_path);
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_sync ON gdrive_cache_nodes(trashed, is_folder);
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_parent_folder ON gdrive_cache_nodes(parent_id, is_folder, trashed);
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_name ON gdrive_cache_nodes(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_size ON gdrive_cache_nodes(size);
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_modified ON gdrive_cache_nodes(modified_time);
    CREATE INDEX IF NOT EXISTS idx_gdrive_cache_files_group ON gdrive_cache_nodes(trashed, is_folder, parent_id);
  `);

  // Migration: add retry_count if missing (for existing databases)
  try {
    db.prepare('SELECT retry_count FROM gdrive_sync_queue LIMIT 0').get();
  } catch {
    db.exec('ALTER TABLE gdrive_sync_queue ADD COLUMN retry_count INTEGER DEFAULT 0');
  }

  for (const col of [
    ['status', "TEXT DEFAULT 'queued'"],
    ['claimed_at', 'TEXT'],
    ['claimed_by', 'TEXT'],
  ]) {
    try {
      db.prepare(`SELECT ${col[0]} FROM gdrive_sync_queue LIMIT 0`).get();
    } catch {
      db.exec(`ALTER TABLE gdrive_sync_queue ADD COLUMN ${col[0]} ${col[1]}`);
    }
  }
  db.exec(`UPDATE gdrive_sync_queue SET status = 'queued' WHERE status IS NULL OR status = ''`);

  for (const [table_name, column_name, column_type] of [
    ['gdrive_manifest', 'md5', 'TEXT'],
    ['gdrive_sync_queue', 'md5_checksum', 'TEXT'],
  ]) {
    try {
      db.prepare(`SELECT ${column_name} FROM ${table_name} LIMIT 0`).get();
    } catch {
      db.exec(`ALTER TABLE ${table_name} ADD COLUMN ${column_name} ${column_type}`);
    }
  }

  // Migration: multi-part file metadata (caption v2)
  try {
    db.prepare('SELECT parts FROM files LIMIT 0').get();
  } catch {
    db.exec('ALTER TABLE files ADD COLUMN parts TEXT');
  }
}

function rowToEntry(db, r) {
  const tagRows = db.prepare('SELECT tag FROM file_tags WHERE message_id = ?').all(r.message_id);
  let parts = null;
  if (r.parts) {
    try {
      const parsed = JSON.parse(r.parts);
      if (Array.isArray(parsed) && parsed.length > 0) parts = parsed;
    } catch {
      parts = null;
    }
  }
  return {
    messageId: r.message_id,
    path: r.path,
    size: r.size,
    sha256: r.sha256,
    mtime: new Date(r.mtime),
    tags: tagRows.map((t) => t.tag),
    localPath: r.local_path,
    lastUsed: r.last_used || null,
    parts,
  };
}

function buildSkippedFilterSql(db, tableAlias = 'c') {
  let ignoredStr = '';
  let allowedStr = '';
  try {
    const ignoredRow = db.prepare("SELECT value FROM gdrive_state WHERE key = 'ignored_extensions'").get();
    const allowedRow = db.prepare("SELECT value FROM gdrive_state WHERE key = 'allowed_extensions'").get();
    ignoredStr = ignoredRow?.value || '';
    allowedStr = allowedRow?.value || '';
  } catch {
    // In case gdrive_state table is missing in older schema migrations
  }

  const ignoredList = String(ignoredStr)
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);

  const allowedList = String(allowedStr)
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);

  const clauses = [
    `${tableAlias}.mime_type LIKE 'application/vnd.google-apps.%'`,
  ];

  if (ignoredList.length > 0) {
    const orLikes = ignoredList
      .map((ext) => `${tableAlias}.name LIKE '%.${ext.replace(/'/g, "''")}'`)
      .join(' OR ');
    clauses.push(`(${orLikes})`);
  }

  if (allowedList.length > 0) {
    const orLikes = allowedList
      .map((ext) => `${tableAlias}.name LIKE '%.${ext.replace(/'/g, "''")}'`)
      .join(' OR ');
    clauses.push(`(${tableAlias}.name LIKE '%.%' AND NOT (${orLikes}))`);
  }

  return `(${clauses.join(' OR ')})`;
}

/**
 * @param {string} dbPath
 */
function openIndexDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  createSchema(db);

  function folderTagsIndex() {
    const rows = db.prepare('SELECT folder_path, tag FROM folder_tags ORDER BY folder_path, tag').all();
    /** @type {Record<string, string[]>} */
    const index = {};
    for (const r of rows) {
      if (!index[r.folder_path]) index[r.folder_path] = [];
      index[r.folder_path].push(r.tag);
    }
    return index;
  }

  let folderRollupCache = null;

  function invalidateFolderRollupCache() {
    folderRollupCache = null;
  }

  function getFolderStatsRollup(hideIgnored = false) {
    const cacheKey = hideIgnored ? 'hide' : 'all';
    const now = Date.now();
    if (folderRollupCache && folderRollupCache[cacheKey] && (now - folderRollupCache[cacheKey].timestamp < 8000)) {
      return folderRollupCache[cacheKey];
    }

    const skippedFilterSql = buildSkippedFilterSql(db, 'd');
    const hideFilter = hideIgnored ? `AND NOT (${skippedFilterSql})` : '';

    const folders = db.prepare('SELECT id, parent_id FROM gdrive_cache_nodes WHERE is_folder = 1 AND trashed = 0').all();

    const directCounts = db.prepare(`
      SELECT
        d.parent_id,
        COUNT(*) as total,
        COUNT(CASE WHEN m.drive_file_id IS NOT NULL THEN 1 END) as synced,
        COUNT(CASE WHEN m.drive_file_id IS NULL AND q.drive_file_id IS NOT NULL THEN 1 END) as queued,
        COUNT(CASE WHEN m.drive_file_id IS NULL AND q.drive_file_id IS NULL AND e.drive_file_id IS NOT NULL THEN 1 END) as error
      FROM gdrive_cache_nodes d
      LEFT JOIN gdrive_manifest m ON d.id = m.drive_file_id
      LEFT JOIN gdrive_sync_queue q ON d.id = q.drive_file_id
      LEFT JOIN gdrive_sync_errors e ON d.id = e.drive_file_id
      WHERE d.trashed = 0 AND d.is_folder = 0 ${hideFilter}
      GROUP BY d.parent_id
    `).all();

    const countsMap = new Map();
    for (const c of directCounts) {
      countsMap.set(c.parent_id, {
        total: c.total,
        synced: c.synced,
        queued: c.queued,
        error: c.error,
      });
    }

    const childrenMap = new Map();
    for (const f of folders) {
      if (!childrenMap.has(f.parent_id)) childrenMap.set(f.parent_id, []);
      childrenMap.get(f.parent_id).push(f.id);
    }

    const statsMap = new Map();
    const visiting = new Set();

    function getStats(folderId) {
      if (statsMap.has(folderId)) return statsMap.get(folderId);
      if (visiting.has(folderId)) {
        return { total: 0, synced: 0, queued: 0, error: 0 };
      }
      visiting.add(folderId);

      const direct = countsMap.get(folderId) || { total: 0, synced: 0, queued: 0, error: 0 };
      const res = {
        total: direct.total,
        synced: direct.synced,
        queued: direct.queued,
        error: direct.error,
      };

      const subIds = childrenMap.get(folderId) || [];
      for (const sid of subIds) {
        const sub = getStats(sid);
        res.total += sub.total;
        res.synced += sub.synced;
        res.queued += sub.queued;
        res.error += sub.error;
      }

      visiting.delete(folderId);
      statsMap.set(folderId, res);
      return res;
    }

    for (const f of folders) {
      getStats(f.id);
    }

    const parentWithFoldersSet = new Set();
    for (const f of folders) {
      if (hideIgnored) {
        const st = statsMap.get(f.id);
        if (st && st.total > 0) {
          parentWithFoldersSet.add(f.parent_id);
        }
      } else {
        parentWithFoldersSet.add(f.parent_id);
      }
    }

    const data = { timestamp: now, statsMap, parentWithFoldersSet };
    if (!folderRollupCache) folderRollupCache = {};
    folderRollupCache[cacheKey] = data;
    return data;
  }

  return {
    close() {
      db.close();
    },

    upsert(entry) {
      const tx = db.transaction(() => {
        const existing = db.prepare('SELECT message_id FROM files WHERE path = ?').all(entry.path);
        for (const row of existing) {
          if (row.message_id !== entry.messageId) {
            if (row.message_id > entry.messageId) {
              return;
            }
            db.prepare('DELETE FROM files WHERE message_id = ?').run(row.message_id);
            db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(row.message_id);
          }
        }

        const partsJson =
          Array.isArray(entry.parts) && entry.parts.length > 0 ? JSON.stringify(entry.parts) : null;
        db.prepare(
          `INSERT INTO files(message_id, path, size, sha256, mtime, local_path, parts)
           VALUES (@messageId, @path, @size, @sha256, @mtime, @localPath, @parts)
           ON CONFLICT(message_id) DO UPDATE SET
             path=excluded.path, size=excluded.size, sha256=excluded.sha256,
             mtime=excluded.mtime, local_path=excluded.local_path, parts=excluded.parts`,
        ).run({
          messageId: entry.messageId,
          path: entry.path,
          size: entry.size,
          sha256: entry.sha256,
          mtime: entry.mtime.toISOString(),
          localPath: entry.localPath ?? null,
          parts: partsJson,
        });

        db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(entry.messageId);
        if (entry.path.endsWith('/')) {
          db.prepare('DELETE FROM folder_tags WHERE folder_path = ?').run(entry.path);
          for (const tag of entry.tags || []) {
            db.prepare('INSERT OR REPLACE INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(
              entry.path,
              tag,
            );
            db.prepare('INSERT INTO file_tags(message_id, tag) VALUES (?, ?)').run(
              entry.messageId,
              tag,
            );
          }
        } else {
          for (const tag of entry.tags || []) {
            db.prepare('INSERT INTO file_tags(message_id, tag) VALUES (?, ?)').run(
              entry.messageId,
              tag,
            );
          }
        }
      });
      tx();
    },

    delete(messageId) {
      db.transaction(() => {
        db.prepare('DELETE FROM files WHERE message_id = ?').run(messageId);
        db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(messageId);
      })();
    },

    getDashboardEntries() {
      const rows = db.prepare(`
        SELECT message_id AS messageId, path, size, mtime 
        FROM files 
        WHERE message_id > 0 AND path NOT LIKE '/Rác/%' AND path NOT LIKE '%/'
      `).all();
      return rows.map((r) => ({
        messageId: r.messageId,
        path: r.path,
        size: r.size,
        mtime: new Date(r.mtime),
      }));
    },

    getDayFiles({ startUtc, endUtc, limit = 100 }) {
      const rows = db.prepare(`
        SELECT message_id AS messageId, path, size, mtime 
        FROM files 
        WHERE message_id > 0 AND path NOT LIKE '/Rác/%' AND path NOT LIKE '%/'
          AND mtime >= ? AND mtime <= ? 
        ORDER BY size DESC 
        LIMIT ?
      `).all(startUtc, endUtc, limit);
      const countRow = db.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS totalBytes 
        FROM files 
        WHERE message_id > 0 AND path NOT LIKE '/Rác/%' AND path NOT LIKE '%/'
          AND mtime >= ? AND mtime <= ?
      `).get(startUtc, endUtc);
      return {
        files: rows.map((r) => ({
          messageId: r.messageId,
          path: r.path,
          name: path.posix.basename(r.path),
          bytes: r.size,
          mtime: r.mtime,
        })),
        totalCount: countRow?.count ?? 0,
        totalBytes: countRow?.totalBytes ?? 0,
      };
    },

    getAll() {
      const rows = db.prepare(`
        SELECT f.* FROM files f
        INNER JOIN (
          SELECT path, MAX(message_id) AS max_id
          FROM files
          WHERE message_id > 0
          GROUP BY path
        ) latest ON f.path = latest.path AND f.message_id = latest.max_id
      `).all();
      const allTagRows = db.prepare('SELECT message_id, tag FROM file_tags').all();
      /** @type {Map<number, string[]>} */
      const tagsByMessageId = new Map();
      for (const t of allTagRows) {
        let list = tagsByMessageId.get(t.message_id);
        if (!list) {
          list = [];
          tagsByMessageId.set(t.message_id, list);
        }
        list.push(t.tag);
      }

      return rows.map((r) => {
        let parts = null;
        if (r.parts) {
          try {
            const parsed = JSON.parse(r.parts);
            if (Array.isArray(parsed) && parsed.length > 0) parts = parsed;
          } catch {
            parts = null;
          }
        }
        return {
          messageId: r.message_id,
          path: r.path,
          size: r.size,
          sha256: r.sha256,
          mtime: new Date(r.mtime),
          tags: tagsByMessageId.get(r.message_id) || [],
          localPath: r.local_path,
          lastUsed: r.last_used || null,
          parts,
        };
      });
    },

    getByMessageId(messageId) {
      const r = db.prepare('SELECT * FROM files WHERE message_id = ?').get(messageId);
      return r ? rowToEntry(db, r) : null;
    },

    getEntriesByPath(filePath) {
      if (!filePath) return [];
      const rows = db.prepare('SELECT * FROM files WHERE path = ? AND message_id > 0').all(filePath);
      return rows.map((r) => rowToEntry(db, r));
    },

    countEntries() {
      return db.prepare('SELECT COUNT(DISTINCT path) AS c FROM files WHERE message_id > 0').get().c;
    },

    reconcileToMessageIds(validIds) {
      const rows = db.prepare('SELECT message_id FROM files').all();
      db.transaction(() => {
        for (const r of rows) {
          if (!validIds.has(r.message_id)) {
            db.prepare('DELETE FROM files WHERE message_id = ?').run(r.message_id);
            db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(r.message_id);
          }
        }
      })();
    },

    getVaultChatId() {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('vault_chat_id');
      return row ? Number.parseInt(row.value, 10) : null;
    },

    setVaultChatId(chatId) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(
        'vault_chat_id',
        String(chatId),
      );
    },

    getLastMessageId() {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('last_message_id');
      return row ? Number.parseInt(row.value, 10) : 0;
    },

    setLastMessageId(id) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(
        'last_message_id',
        String(id),
      );
    },

    deleteTemporaryMessageIds() {
      db.transaction(() => {
        db.prepare('DELETE FROM file_tags WHERE message_id < 0').run();
        db.prepare('DELETE FROM files WHERE message_id < 0').run();
      })();
      this.purgeStaleJournal();
    },

    listVisibleFileCount() {
      return db
        .prepare(
          `SELECT COUNT(DISTINCT path) AS c FROM files
           WHERE path NOT LIKE '/Rác/%' AND path NOT LIKE '%/'`,
        )
        .get().c;
    },

    setFolderTags(folderPath, tags) {
      db.transaction(() => {
        db.prepare('DELETE FROM folder_tags WHERE folder_path = ?').run(folderPath);
        for (const t of tags) {
          db.prepare('INSERT INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(folderPath, t);
        }
        const marker = db.prepare('SELECT message_id FROM files WHERE path = ? LIMIT 1').get(folderPath);
        if (marker) {
          db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(marker.message_id);
          for (const t of tags) {
            db.prepare('INSERT INTO file_tags(message_id, tag) VALUES (?, ?)').run(
              marker.message_id,
              t,
            );
          }
        }
      })();
    },

    folderTagsIndex,

    allTagNames() {
      return Object.keys(this.foldersByTag()).sort((a, b) => a.localeCompare(b));
    },

    /** Folders that directly carry each tag (excludes trash). */
    foldersByTag() {
      /** @type {Record<string, string[]>} */
      const byTag = {};
      const add = (folderPath, tag) => {
        if (!tag || isInTrash(folderPath)) return;
        if (!byTag[tag]) byTag[tag] = [];
        if (!byTag[tag].includes(folderPath)) byTag[tag].push(folderPath);
      };

      for (const [folderPath, tags] of Object.entries(folderTagsIndex())) {
        for (const tag of tags) add(folderPath, tag);
      }

      for (const entry of this.getAll()) {
        if (!entry.path.endsWith('/')) continue;
        for (const tag of entry.tags || []) add(entry.path, tag);
      }

      for (const tag of Object.keys(byTag)) {
        byTag[tag].sort((a, b) => a.localeCompare(b));
      }
      return byTag;
    },

    /** Backfill folder_tags rows from dir marker entries (file_tags on folder paths). */
    reconcileFolderTagsFromMarkers() {
      for (const entry of this.getAll()) {
        if (!entry.path.endsWith('/') || isInTrash(entry.path)) continue;
        const markerTags = [...(entry.tags || [])].sort();
        const existing = [...(folderTagsIndex()[entry.path] || [])].sort();
        if (markerTags.join('\0') === existing.join('\0')) continue;
        this.setFolderTags(entry.path, entry.tags || []);
      }
    },

    renameFolderTagsPath(from, to) {
      const rows = db.prepare('SELECT folder_path, tag FROM folder_tags WHERE folder_path LIKE ?').all(`${from}%`);
      db.transaction(() => {
        for (const r of rows) {
          const newPath = to + r.folder_path.slice(from.length);
          db.prepare('DELETE FROM folder_tags WHERE folder_path = ? AND tag = ?').run(
            r.folder_path,
            r.tag,
          );
          db.prepare('INSERT OR IGNORE INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(
            newPath,
            r.tag,
          );
        }
      })();
    },

    renameTagName(from, to) {
      db.transaction(() => {
        const folderRows = db.prepare('SELECT folder_path FROM folder_tags WHERE tag = ?').all(from);
        for (const r of folderRows) {
          db.prepare('DELETE FROM folder_tags WHERE folder_path = ? AND tag = ?').run(r.folder_path, from);
          db.prepare('INSERT OR IGNORE INTO folder_tags(folder_path, tag) VALUES (?, ?)').run(
            r.folder_path,
            to,
          );
        }
        const fileRows = db.prepare('SELECT message_id FROM file_tags WHERE tag = ?').all(from);
        for (const r of fileRows) {
          db.prepare('DELETE FROM file_tags WHERE message_id = ? AND tag = ?').run(r.message_id, from);
          db.prepare('INSERT OR IGNORE INTO file_tags(message_id, tag) VALUES (?, ?)').run(
            r.message_id,
            to,
          );
        }
      })();
    },

    deleteTagName(tag) {
      db.transaction(() => {
        db.prepare('DELETE FROM folder_tags WHERE tag = ?').run(tag);
        db.prepare('DELETE FROM file_tags WHERE tag = ?').run(tag);
      })();
    },

    rekeyMessageId(oldId, newId) {
      if (oldId === newId) return;
      db.transaction(() => {
        const row = db.prepare('SELECT * FROM files WHERE message_id = ?').get(oldId);
        if (!row) return;
        db.prepare('DELETE FROM files WHERE message_id = ?').run(oldId);
        db.prepare(
          `INSERT OR REPLACE INTO files(message_id, path, size, sha256, mtime, local_path, last_used, td_file_id, parts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newId,
          row.path,
          row.size,
          row.sha256,
          row.mtime,
          row.local_path,
          row.last_used,
          row.td_file_id,
          row.parts ?? null,
        );
        const tagRows = db.prepare('SELECT tag FROM file_tags WHERE message_id = ?').all(oldId);
        db.prepare('DELETE FROM file_tags WHERE message_id = ?').run(oldId);
        for (const t of tagRows) {
          db.prepare('INSERT INTO file_tags(message_id, tag) VALUES (?, ?)').run(newId, t.tag);
        }
      })();
    },

    search({ query, tags = [] } = {}) {
      const trimmedQuery = query?.trim();
      const hasQuery = Boolean(trimmedQuery);
      const folderTags = folderTagsIndex();
      let results = this.getAll().filter((e) => !e.path.endsWith('/') && !isInTrash(e.path));

      if (tags.length > 0) {
        results = results.filter((e) => {
          const eff = effectiveTagsForPath(e.path, folderTags);
          return tags.every((t) => eff.includes(t));
        });
      }

      if (hasQuery) {
        results = results.filter((e) =>
          entryMatchesSearch(e.path, effectiveTagsForPath(e.path, folderTags), trimmedQuery),
        );
      } else if (tags.length === 0) {
        return [];
      }

      results.sort((a, b) => a.path.localeCompare(b.path));
      return results;
    },

    allTags() {
      const folderTags = folderTagsIndex();
      /** @type {Record<string, number>} */
      const counts = {};
      for (const e of this.getAll()) {
        if (e.path.endsWith('/') || isInTrash(e.path)) continue;
        for (const t of effectiveTagsForPath(e.path, folderTags)) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
      return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    },

    folderCountForTag(tag) {
      const folderTags = folderTagsIndex();
      return Object.values(folderTags).filter((tags) => tags.includes(tag)).length;
    },

    findBySha(sha256) {
      const r = db.prepare('SELECT * FROM files WHERE sha256 = ? LIMIT 1').get(sha256);
      return r ? rowToEntry(db, r) : null;
    },

    setLocalPath(messageId, localPath) {
      db.prepare('UPDATE files SET local_path = ? WHERE message_id = ?').run(localPath, messageId);
    },

    touchLastUsed(messageId) {
      db.prepare('UPDATE files SET last_used = ? WHERE message_id = ?').run(
        new Date().toISOString(),
        messageId,
      );
    },

    setTdFileId(messageId, tdFileId) {
      db.prepare('UPDATE files SET td_file_id = ? WHERE message_id = ?').run(tdFileId, messageId);
    },

    getCacheLimitBytes() {
      const gbRow = db.prepare('SELECT value FROM kv WHERE key = ?').get('cache_limit_gb');
      if (gbRow != null) {
        const gb = Number.parseFloat(gbRow.value);
        if (Number.isFinite(gb) && gb > 0) return Math.floor(gb * 1024 * 1024 * 1024);
      }
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('cache_limit');
      return row ? Number.parseInt(row.value, 10) : 2 * 1024 * 1024 * 1024;
    },

    setCacheLimitBytes(bytes) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(
        'cache_limit',
        String(bytes),
      );
      const gb = bytes / (1024 * 1024 * 1024);
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(
        'cache_limit_gb',
        String(gb),
      );
    },

    getSaveAsDirectory() {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('save_as_dir');
      return row?.value || null;
    },

    setSaveAsDirectory(dir) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run('save_as_dir', dir);
    },

    clearSaveAsDirectory() {
      db.prepare('DELETE FROM kv WHERE key = ?').run('save_as_dir');
    },

    getSetting(key, defaultValue = null) {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
      return row ? row.value : defaultValue;
    },

    setSetting(key, value) {
      db.prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(key, value);
    },

    journalAdd(op, args) {
      const r = db.prepare('INSERT INTO journal(op, args) VALUES (?, ?)').run(op, JSON.stringify(args));
      return Number(r.lastInsertRowid);
    },

    journalPending() {
      return db
        .prepare('SELECT id, op, args FROM journal ORDER BY id')
        .all()
        .map((r) => ({ id: r.id, op: r.op, args: JSON.parse(r.args) }));
    },

    journalRemove(id) {
      db.prepare('DELETE FROM journal WHERE id = ?').run(id);
    },

    purgeStaleJournal() {
      for (const item of this.journalPending()) {
        const mid = item.args.messageId;
        if (typeof mid === 'number' && mid < 0) this.journalRemove(item.id);
      }
    },

    getAutoResumeTransfers() {
      return this.getSetting('auto_resume_transfers', '1') === '1';
    },

    setAutoResumeTransfers(enabled) {
      this.setSetting('auto_resume_transfers', enabled ? '1' : '0');
    },

    transferAdd({ kind, label, localPath, destPath, messageId, size = 0 }) {
      const r = db
        .prepare(
          `INSERT INTO transfers(kind, label, status, local_path, dest_path, message_id, size, created_at)
           VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)`,
        )
        .run(kind, label, localPath ?? null, destPath ?? null, messageId ?? null, size, new Date().toISOString());
      return Number(r.lastInsertRowid);
    },

    transferUpdate(id, { status, error } = {}) {
      const patch = [];
      const args = [];
      if (status != null) {
        patch.push('status = ?');
        args.push(status);
      }
      if (error != null) {
        patch.push('error = ?');
        args.push(error);
      }
      if (patch.length === 0) return;
      args.push(id);
      db.prepare(`UPDATE transfers SET ${patch.join(', ')} WHERE id = ?`).run(...args);
    },

    transferRemove(id) {
      db.prepare('DELETE FROM transfers WHERE id = ?').run(id);
    },

    transfersPending() {
      return db.prepare('SELECT * FROM transfers ORDER BY id').all().map((r) => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        status: r.status,
        localPath: r.local_path,
        destPath: r.dest_path,
        messageId: r.message_id,
        size: r.size,
        error: r.error,
        createdAt: r.created_at,
      }));
    },

    getSyncConfig() {
      const get = (key, defaultValue) => {
        const row = db.prepare('SELECT value FROM sync_config WHERE key = ?').get(key);
        return row ? row.value : defaultValue;
      };
      return {
        syncFolder: get('sync_folder', null),
        syncMode: get('sync_mode', 'upload-only'),
        syncEnabled: get('sync_enabled', 'false') === 'true',
        syncVaultFolder: get('sync_vault_folder', '/Sync/'),
      };
    },

    setSyncConfig({ syncFolder, syncMode, syncEnabled, syncVaultFolder }) {
      const set = (key, value) => {
        if (value != null) {
          db.prepare('INSERT OR REPLACE INTO sync_config(key, value) VALUES (?, ?)').run(key, String(value));
        }
      };
      db.transaction(() => {
        if (syncFolder !== undefined) set('sync_folder', syncFolder);
        if (syncMode !== undefined) set('sync_mode', syncMode);
        if (syncEnabled !== undefined) set('sync_enabled', syncEnabled ? 'true' : 'false');
        if (syncVaultFolder !== undefined) set('sync_vault_folder', syncVaultFolder);
      })();
    },

    syncManifestUpsert(relPath, { sha256, mtime, side }) {
      db.prepare(
        'INSERT OR REPLACE INTO sync_manifest(rel_path, sha256, mtime, side) VALUES (?, ?, ?, ?)'
      ).run(relPath, sha256, mtime, side);
    },

    syncManifestGet(relPath) {
      const r = db.prepare('SELECT * FROM sync_manifest WHERE rel_path = ?').get(relPath);
      return r ? { relPath: r.rel_path, sha256: r.sha256, mtime: r.mtime, side: r.side } : null;
    },

    syncManifestDelete(relPath) {
      db.prepare('DELETE FROM sync_manifest WHERE rel_path = ?').run(relPath);
    },

    syncManifestAll() {
      return db.prepare('SELECT * FROM sync_manifest ORDER BY rel_path').all().map(r => ({
        relPath: r.rel_path, sha256: r.sha256, mtime: r.mtime, side: r.side,
      }));
    },

    syncManifestClear() {
      db.prepare('DELETE FROM sync_manifest').run();
    },

    // --- Google Drive ---
    gdriveTokenGet(key) {
      const row = db.prepare('SELECT value FROM gdrive_tokens WHERE key = ?').get(key);
      return row?.value ?? null;
    },
    gdriveTokenSet(key, value) {
      db.prepare('INSERT OR REPLACE INTO gdrive_tokens(key, value) VALUES (?, ?)').run(key, value);
    },
    gdriveTokenDelete(key) {
      db.prepare('DELETE FROM gdrive_tokens WHERE key = ?').run(key);
    },
    gdriveTokensClear() {
      db.prepare('DELETE FROM gdrive_tokens').run();
    },

    gdriveSubscriptionAdd({ driveId, drivePath, vaultPath, isFolder }) {
      db.prepare(
        'INSERT OR REPLACE INTO gdrive_subscriptions(drive_id, drive_path, vault_path, is_folder, enabled) VALUES (?, ?, ?, ?, 1)'
      ).run(driveId, drivePath, vaultPath, isFolder ? 1 : 0);
    },
    gdriveSubscriptionRemove(driveId) {
      db.prepare('DELETE FROM gdrive_subscriptions WHERE drive_id = ?').run(driveId);
    },
    gdriveSubscriptionSetEnabled(driveId, enabled) {
      db.prepare('UPDATE gdrive_subscriptions SET enabled = ? WHERE drive_id = ?').run(enabled ? 1 : 0, driveId);
    },
    gdriveSubscriptionsAll() {
      return db.prepare('SELECT * FROM gdrive_subscriptions ORDER BY drive_path').all().map(r => ({
        driveId: r.drive_id,
        drivePath: r.drive_path,
        vaultPath: r.vault_path,
        isFolder: r.is_folder === 1,
        enabled: r.enabled === 1,
      }));
    },

    gdriveManifestUpsert({ driveFileId, drivePath, vaultPath, md5 = null, sha256, size, driveModifiedTime }) {
      invalidateFolderRollupCache();
      db.prepare(
        `INSERT OR REPLACE INTO gdrive_manifest(
          drive_file_id, drive_path, vault_path, md5, sha256, size, drive_modified_time, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(driveFileId, drivePath, vaultPath, md5, sha256, size, driveModifiedTime, new Date().toISOString());
    },
    gdriveManifestGet(driveFileId) {
      const r = db.prepare('SELECT * FROM gdrive_manifest WHERE drive_file_id = ?').get(driveFileId);
      if (!r) return null;
      return {
        driveFileId: r.drive_file_id, drivePath: r.drive_path, vaultPath: r.vault_path,
        md5: r.md5, sha256: r.sha256, size: r.size,
        driveModifiedTime: r.drive_modified_time, syncedAt: r.synced_at,
      };
    },
    gdriveManifestAll() {
      return db.prepare('SELECT * FROM gdrive_manifest ORDER BY drive_path').all().map(r => ({
        driveFileId: r.drive_file_id, drivePath: r.drive_path, vaultPath: r.vault_path,
        md5: r.md5, sha256: r.sha256, size: r.size,
        driveModifiedTime: r.drive_modified_time, syncedAt: r.synced_at,
      }));
    },
    gdriveManifestRecent() {
      return db.prepare('SELECT * FROM gdrive_manifest ORDER BY synced_at DESC').all().map(r => ({
        driveFileId: r.drive_file_id, drivePath: r.drive_path, vaultPath: r.vault_path,
        md5: r.md5, sha256: r.sha256, size: r.size,
        driveModifiedTime: r.drive_modified_time, syncedAt: r.synced_at,
      }));
    },
    gdriveManifestDelete(driveFileId) {
      invalidateFolderRollupCache();
      db.prepare('DELETE FROM gdrive_manifest WHERE drive_file_id = ?').run(driveFileId);
    },
    gdriveManifestRemoveByVaultPathPrefix(vaultPathPrefix) {
      invalidateFolderRollupCache();
      db.prepare(
        'DELETE FROM gdrive_manifest WHERE substr(vault_path, 1, length(?)) = ?',
      ).run(vaultPathPrefix, vaultPathPrefix);
    },
    gdriveManifestClear() {
      invalidateFolderRollupCache();
      db.prepare('DELETE FROM gdrive_manifest').run();
    },

    gdriveSyncErrorAdd({ driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, errorMessage }) {
      db.prepare(
        `INSERT OR REPLACE INTO gdrive_sync_errors(drive_file_id, file_name, drive_path, vault_path, size, modified_time, error_message, failed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, errorMessage, new Date().toISOString());
    },
    gdriveSyncErrorRemove(driveFileId) {
      db.prepare('DELETE FROM gdrive_sync_errors WHERE drive_file_id = ?').run(driveFileId);
    },
    gdriveSyncErrorsAll() {
      return db.prepare('SELECT * FROM gdrive_sync_errors ORDER BY failed_at DESC').all().map(r => ({
        driveFileId: r.drive_file_id, fileName: r.file_name, drivePath: r.drive_path, vaultPath: r.vault_path,
        size: r.size, modifiedTime: r.modified_time, errorMessage: r.error_message, failedAt: r.failed_at,
      }));
    },
    gdriveSyncErrorsClear() {
      db.prepare('DELETE FROM gdrive_sync_errors').run();
    },
    gdriveSyncErrorsRemoveByVaultPathPrefix(vaultPathPrefix) {
      db.prepare(
        'DELETE FROM gdrive_sync_errors WHERE substr(vault_path, 1, length(?)) = ?',
      ).run(vaultPathPrefix, vaultPathPrefix);
    },

    gdriveStateGet(key, defaultValue = null) {
      const row = db.prepare('SELECT value FROM gdrive_state WHERE key = ?').get(key);
      return row?.value ?? defaultValue;
    },
    gdriveStateSet(key, value) {
      if (key === 'ignored_extensions' || key === 'allowed_extensions') {
        invalidateFolderRollupCache();
      }
      db.prepare('INSERT OR REPLACE INTO gdrive_state(key, value) VALUES (?, ?)').run(key, value);
    },

    gdriveSyncQueueAdd({
      driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, md5Checksum = null, retryCount = 0,
    }) {
      db.prepare(`
        INSERT OR REPLACE INTO gdrive_sync_queue(
          drive_file_id, file_name, drive_path, vault_path, size, modified_time, md5_checksum, added_at, retry_count,
          status, claimed_at, claimed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'queued', NULL, NULL)
      `).run(driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, md5Checksum, retryCount);
    },
    gdriveSyncQueueAddBatch(items) {
      if (!Array.isArray(items) || items.length === 0) return 0;
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO gdrive_sync_queue(
          drive_file_id, file_name, drive_path, vault_path, size, modified_time, md5_checksum, added_at, retry_count,
          status, claimed_at, claimed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'queued', NULL, NULL)
      `);
      const errStmt = db.prepare('DELETE FROM gdrive_sync_errors WHERE drive_file_id = ?');
      const batchTx = db.transaction((rows) => {
        let count = 0;
        for (const item of rows) {
          errStmt.run(item.driveFileId);
          stmt.run(
            item.driveFileId,
            item.fileName,
            item.drivePath,
            item.vaultPath,
            item.size,
            item.modifiedTime,
            item.md5Checksum || null,
            item.retryCount || 0
          );
          count += 1;
        }
        return count;
      });
      return batchTx(items);
    },
    gdriveSyncQueueClaimNext(workerId) {
      const claimTx = db.transaction(() => {
        const r = db.prepare(
          `SELECT * FROM gdrive_sync_queue
           WHERE status = 'queued' OR status IS NULL OR status = ''
           ORDER BY added_at ASC LIMIT 1`,
        ).get();
        if (!r) return null;
        const now = new Date().toISOString();
        const updated = db.prepare(
          `UPDATE gdrive_sync_queue
           SET status = 'running', claimed_at = ?, claimed_by = ?
           WHERE drive_file_id = ? AND (status = 'queued' OR status IS NULL OR status = '')`,
        ).run(now, workerId, r.drive_file_id);
        if (updated.changes !== 1) return null;
        return {
          driveFileId: r.drive_file_id,
          fileName: r.file_name,
          drivePath: r.drive_path,
          vaultPath: r.vault_path,
          size: r.size,
          modifiedTime: r.modified_time,
          retryCount: r.retry_count || 0,
          md5Checksum: r.md5_checksum || null,
        };
      });
      return claimTx();
    },
    gdriveSyncQueueReleaseToQueued(driveFileId) {
      db.prepare(
        `UPDATE gdrive_sync_queue SET status = 'queued', claimed_at = NULL, claimed_by = NULL
         WHERE drive_file_id = ?`,
      ).run(driveFileId);
    },
    gdriveSyncQueueReleaseToQueuedIfOwner(driveFileId, workerId) {
      db.prepare(
        `UPDATE gdrive_sync_queue SET status = 'queued', claimed_at = NULL, claimed_by = NULL
         WHERE drive_file_id = ? AND status = 'running' AND claimed_by = ?`,
      ).run(driveFileId, workerId);
    },
    gdriveSyncQueueReleaseAllRunning() {
      db.prepare(
        `UPDATE gdrive_sync_queue SET status = 'queued', claimed_at = NULL, claimed_by = NULL
         WHERE status = 'running'`,
      ).run();
    },
    gdriveSyncQueueResetStale(maxAgeMs = 30 * 60 * 1000) {
      const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
      db.prepare(
        `UPDATE gdrive_sync_queue SET status = 'queued', claimed_at = NULL, claimed_by = NULL
         WHERE status = 'running' AND claimed_at IS NOT NULL AND claimed_at < ?`,
      ).run(cutoff);
    },
    gdriveSyncQueueGetNext() {
      const r = db.prepare('SELECT * FROM gdrive_sync_queue ORDER BY added_at ASC LIMIT 1').get();
      if (!r) return null;
      return {
        driveFileId: r.drive_file_id,
        fileName: r.file_name,
        drivePath: r.drive_path,
        vaultPath: r.vault_path,
        size: r.size,
        modifiedTime: r.modified_time,
        md5Checksum: r.md5_checksum || null,
        retryCount: r.retry_count || 0,
      };
    },

    gdriveSyncQueueGetAll() {
      return db.prepare('SELECT * FROM gdrive_sync_queue ORDER BY added_at ASC').all().map(r => ({
        driveFileId: r.drive_file_id,
        fileName: r.file_name,
        drivePath: r.drive_path,
        vaultPath: r.vault_path,
        size: r.size,
        modifiedTime: r.modified_time,
        md5Checksum: r.md5_checksum || null,
        status: r.status || 'queued',
        claimedBy: r.claimed_by || null,
      }));
    },

    gdriveSyncQueueRemove(driveFileId) {
      db.prepare('DELETE FROM gdrive_sync_queue WHERE drive_file_id = ?').run(driveFileId);
    },
    gdriveSyncQueueRemoveBatch(driveFileIds) {
      if (!Array.isArray(driveFileIds) || driveFileIds.length === 0) return;
      const placeholders = driveFileIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM gdrive_sync_queue WHERE drive_file_id IN (${placeholders})`).run(...driveFileIds);
    },
    gdriveSyncQueueRemoveByVaultPathPrefix(vaultPathPrefix) {
      db.prepare(
        'DELETE FROM gdrive_sync_queue WHERE substr(vault_path, 1, length(?)) = ?',
      ).run(vaultPathPrefix, vaultPathPrefix);
    },
    gdriveSyncQueueCount() {
      const row = db.prepare('SELECT count(*) as count FROM gdrive_sync_queue').get();
      return row ? row.count : 0;
    },
    gdriveSyncQueueClear() {
      db.prepare('DELETE FROM gdrive_sync_queue').run();
    },
    gdriveSyncQueueIncrementRetry(driveFileId) {
      db.prepare('UPDATE gdrive_sync_queue SET retry_count = retry_count + 1 WHERE drive_file_id = ?').run(driveFileId);
    },

    gdriveCacheNodesUpsertBatch(nodes) {
      if (!Array.isArray(nodes) || nodes.length === 0) return;
      invalidateFolderRollupCache();
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO gdrive_cache_nodes(
          id, parent_id, name, mime_type, is_folder, size,
          modified_time, md5_checksum, trashed, shortcut_target_id,
          drive_path, cached_at
        ) VALUES (
          @id, @parentId, @name, @mimeType, @isFolder, @size,
          @modifiedTime, @md5Checksum, @trashed, @shortcutTargetId,
          @drivePath, @cachedAt
        )
      `);
      const insertMany = db.transaction((items) => {
        const now = new Date().toISOString();
        for (const item of items) {
          stmt.run({
            id: item.id,
            parentId: item.parentId || 'root',
            name: item.name || '',
            mimeType: item.mimeType || '',
            isFolder: item.isFolder ? 1 : 0,
            size: Number(item.size) || 0,
            modifiedTime: item.modifiedTime || null,
            md5Checksum: item.md5Checksum || null,
            trashed: item.trashed ? 1 : 0,
            shortcutTargetId: item.shortcutTargetId || null,
            drivePath: item.drivePath || null,
            cachedAt: item.cachedAt || now,
          });
        }
      });
      insertMany(nodes);
    },

    gdriveCacheNodesGet(id) {
      const r = db.prepare('SELECT * FROM gdrive_cache_nodes WHERE id = ?').get(id);
      if (!r) return null;
      return {
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        mimeType: r.mime_type,
        isFolder: r.is_folder === 1,
        size: r.size,
        modifiedTime: r.modified_time,
        md5Checksum: r.md5_checksum,
        trashed: r.trashed === 1,
        shortcutTargetId: r.shortcut_target_id,
        drivePath: r.drive_path,
        cachedAt: r.cached_at,
      };
    },

    gdriveCacheNodesDelete(id) {
      invalidateFolderRollupCache();
      db.prepare('DELETE FROM gdrive_cache_nodes WHERE id = ?').run(id);
    },

    gdriveCacheNodesSetTrashed(id, trashed) {
      invalidateFolderRollupCache();
      db.prepare('UPDATE gdrive_cache_nodes SET trashed = ? WHERE id = ?').run(trashed ? 1 : 0, id);
    },

    gdriveCacheNodesQuerySubtree(pathPrefix, opts = {}) {
      const prefix = pathPrefix.endsWith('/') ? pathPrefix : `${pathPrefix}/`;
      let sql = 'SELECT * FROM gdrive_cache_nodes WHERE ';
      const params = [];

      if (prefix === '/') {
        sql += 'drive_path IS NOT NULL ';
      } else {
        sql += '(drive_path = ? OR substr(drive_path, 1, length(?)) = ?) ';
        params.push(prefix.slice(0, -1), prefix, prefix);
      }

      if (opts.filesOnly) {
        sql += 'AND is_folder = 0 ';
      }
      if (opts.nonTrashedOnly) {
        sql += 'AND trashed = 0 ';
      }
      sql += 'ORDER BY drive_path ASC';

      return db.prepare(sql).all(...params).map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        mimeType: r.mime_type,
        isFolder: r.is_folder === 1,
        size: r.size,
        modifiedTime: r.modified_time,
        md5Checksum: r.md5_checksum,
        trashed: r.trashed === 1,
        shortcutTargetId: r.shortcut_target_id,
        drivePath: r.drive_path,
        cachedAt: r.cached_at,
      }));
    },

    gdriveCacheNodesCount() {
      const row = db.prepare('SELECT COUNT(*) as count FROM gdrive_cache_nodes').get();
      return row ? row.count : 0;
    },

    gdriveCacheNodesClear() {
      invalidateFolderRollupCache();
      db.prepare('DELETE FROM gdrive_cache_nodes').run();
    },

    gdriveCacheHasCorruptedNodes() {
      const row = db.prepare("SELECT 1 FROM gdrive_cache_nodes WHERE instr(name, char(0xFFFD)) > 0 LIMIT 1").get();
      return Boolean(row);
    },

    gdriveCacheNodesUpdatePrefix(oldPrefix, newPrefix) {
      if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) return;
      const normalizedOld = oldPrefix.endsWith('/') ? oldPrefix : `${oldPrefix}/`;
      const normalizedNew = newPrefix.endsWith('/') ? newPrefix : `${newPrefix}/`;

      db.prepare(`
        UPDATE gdrive_cache_nodes
        SET drive_path = ? || substr(drive_path, length(?) + 1)
        WHERE substr(drive_path, 1, length(?)) = ?
      `).run(normalizedNew, normalizedOld, normalizedOld, normalizedOld);
    },

    gdriveCacheQueryFiles(opts = {}) {
      const skippedFilterSql = buildSkippedFilterSql(db);
      const {
        search = '',
        status = 'all',
        isFolder = null,
        limit = 50,
        offset = 0,
        sortBy = 'drive_path',
        sortOrder = 'asc',
      } = opts;

      const whereClauses = [];
      const params = [];

      if (isFolder !== null && isFolder !== undefined) {
        whereClauses.push('c.is_folder = ?');
        params.push(Number(isFolder));
      }

      if (search && String(search).trim().length > 0) {
        whereClauses.push('(c.name LIKE ? OR c.drive_path LIKE ?)');
        const term = `%${String(search).trim()}%`;
        params.push(term, term);
      }

      const statusExpr = `
        CASE
          WHEN c.trashed = 1 THEN 'trashed'
          WHEN c.is_folder = 1 THEN 'folder'
          WHEN m.drive_file_id IS NOT NULL THEN 'synced'
          WHEN ${skippedFilterSql} THEN 'skipped'
          WHEN q.drive_file_id IS NOT NULL THEN 'queued'
          WHEN e.drive_file_id IS NOT NULL THEN 'error'
          ELSE 'pending'
        END
      `;

      if (status && status !== 'all') {
        whereClauses.push(`(${statusExpr}) = ?`);
        params.push(status);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countRow = db.prepare(`
        SELECT COUNT(*) AS count
        FROM gdrive_cache_nodes c
        LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
        LEFT JOIN gdrive_sync_queue q ON c.id = q.drive_file_id
        LEFT JOIN gdrive_sync_errors e ON c.id = e.drive_file_id
        ${whereSql}
      `).get(...params);

      const total = countRow ? countRow.count : 0;

      const validSortCols = {
        name: 'c.name',
        size: 'c.size',
        modified_time: 'c.modified_time',
        status: statusExpr,
        drive_path: 'c.drive_path',
      };
      const orderCol = validSortCols[sortBy] || 'c.drive_path';
      const orderDir = String(sortOrder).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      const rows = db.prepare(`
        SELECT
          c.id,
          c.parent_id,
          c.name,
          c.mime_type,
          c.is_folder,
          c.size,
          c.modified_time,
          c.md5_checksum,
          c.trashed,
          c.shortcut_target_id,
          c.drive_path,
          c.cached_at,
          ${statusExpr} AS status,
          m.vault_path,
          m.synced_at,
          e.error_message
        FROM gdrive_cache_nodes c
        LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
        LEFT JOIN gdrive_sync_queue q ON c.id = q.drive_file_id
        LEFT JOIN gdrive_sync_errors e ON c.id = e.drive_file_id
        ${whereSql}
        ORDER BY ${orderCol} ${orderDir}
        LIMIT ? OFFSET ?
      `).all(...params, Math.max(1, limit), Math.max(0, offset));

      let subs = null;
      let manifestCheckStmt = null;
      let manifestSampleStmt = null;

      function resolveFolderVault(node) {
        if (!subs) {
          subs = db.prepare(
            'SELECT drive_id, drive_path, vault_path, is_folder FROM gdrive_subscriptions WHERE enabled = 1'
          ).all();
          manifestCheckStmt = db.prepare(
            'SELECT 1 FROM gdrive_manifest WHERE vault_path LIKE ? LIMIT 1'
          );
          manifestSampleStmt = db.prepare(
            'SELECT vault_path, drive_path FROM gdrive_manifest WHERE drive_path LIKE ? LIMIT 1'
          );
        }

        let candidateVault = null;
        for (const s of subs) {
          if (s.drive_id === node.id) {
            candidateVault = s.vault_path;
            break;
          }
          if (s.is_folder) {
            const sPath = String(s.drive_path || '');
            const rPath = String(node.drive_path || '');
            if (!sPath) {
              candidateVault = `${s.vault_path}/${rPath}/`.replace(/\/+/g, '/');
              break;
            } else if (rPath === sPath || rPath.startsWith(`${sPath}/`)) {
              const rel = rPath.slice(sPath.length).replace(/^\/+/, '');
              candidateVault = `${s.vault_path}/${rel}/`.replace(/\/+/g, '/');
              break;
            }
          }
        }

        if (candidateVault) {
          const norm = candidateVault.endsWith('/') ? candidateVault : `${candidateVault}/`;
          const hasSynced = manifestCheckStmt.get(`${norm}%`);
          if (hasSynced) return norm;
        }

        if (node.drive_path) {
          const sample = manifestSampleStmt.get(`${node.drive_path}/%`);
          if (sample?.vault_path) {
            const idx = sample.vault_path.lastIndexOf('/');
            if (idx >= 0) {
              return sample.vault_path.slice(0, idx + 1);
            }
          }
        }

        return null;
      }

      const items = rows.map((r) => {
        let vaultPath = r.vault_path || null;
        let isSynced = false;

        if (r.is_folder === 1) {
          vaultPath = resolveFolderVault(r);
          isSynced = Boolean(vaultPath);
        } else {
          isSynced = r.status === 'synced' || Boolean(vaultPath);
        }

        return {
          id: r.id,
          parentId: r.parent_id,
          name: r.name,
          mimeType: r.mime_type,
          isFolder: r.is_folder,
          size: r.size,
          modifiedTime: r.modified_time,
          md5Checksum: r.md5_checksum,
          trashed: r.trashed,
          shortcutTargetId: r.shortcut_target_id,
          drivePath: r.drive_path,
          cachedAt: r.cached_at,
          status: r.status,
          vaultPath,
          isSynced,
          syncedAt: r.synced_at || null,
          errorMessage: r.error_message || null,
        };
      });

      return { items, total };
    },

    gdriveCacheNodesUnlinkedFiles(limit = 50000) {
      return db.prepare(`
        SELECT c.id, c.parent_id, c.name, c.mime_type, c.size, c.modified_time, c.md5_checksum, c.drive_path
        FROM gdrive_cache_nodes c
        LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
        WHERE c.is_folder = 0 AND c.trashed = 0 AND m.drive_file_id IS NULL
        LIMIT ?
      `).all(limit).map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        mimeType: r.mime_type,
        size: r.size,
        modifiedTime: r.modified_time,
        md5Checksum: r.md5_checksum,
        drivePath: r.drive_path,
      }));
    },

    gdriveCacheSummaryStats() {
      const skippedFilterSql = buildSkippedFilterSql(db);
      const row = db.prepare(`
        SELECT 
          COUNT(CASE WHEN c.is_folder = 0 THEN 1 END) AS total_files,
          COUNT(CASE WHEN c.is_folder = 1 THEN 1 END) AS total_folders,
          COUNT(CASE WHEN c.trashed = 1 THEN 1 END) AS trashed_count,
          COUNT(CASE WHEN c.trashed = 0 AND c.is_folder = 0 AND m.drive_file_id IS NOT NULL THEN 1 END) AS synced_count,
          COUNT(CASE WHEN c.trashed = 0 AND c.is_folder = 0 AND m.drive_file_id IS NULL AND NOT (${skippedFilterSql}) AND q.drive_file_id IS NOT NULL THEN 1 END) AS queued_count,
          COUNT(CASE WHEN c.trashed = 0 AND c.is_folder = 0 AND m.drive_file_id IS NULL AND NOT (${skippedFilterSql}) AND q.drive_file_id IS NULL AND e.drive_file_id IS NOT NULL THEN 1 END) AS error_count,
          COUNT(CASE WHEN c.trashed = 0 AND c.is_folder = 0 AND m.drive_file_id IS NULL AND (${skippedFilterSql}) THEN 1 END) AS skipped_count,
          COUNT(CASE WHEN c.trashed = 0 AND c.is_folder = 0 AND m.drive_file_id IS NULL AND q.drive_file_id IS NULL AND e.drive_file_id IS NULL AND NOT (${skippedFilterSql}) THEN 1 END) AS pending_count,
          COALESCE(SUM(CASE WHEN c.is_folder = 0 THEN c.size ELSE 0 END), 0) AS total_size_bytes,
          COALESCE(SUM(CASE WHEN c.trashed = 0 AND c.is_folder = 0 AND m.drive_file_id IS NOT NULL THEN c.size ELSE 0 END), 0) AS synced_size_bytes
        FROM gdrive_cache_nodes c
        LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
        LEFT JOIN gdrive_sync_queue q ON c.id = q.drive_file_id
        LEFT JOIN gdrive_sync_errors e ON c.id = e.drive_file_id
      `).get();

      return {
        totalFiles: row ? row.total_files : 0,
        totalFolders: row ? row.total_folders : 0,
        syncedCount: row ? row.synced_count : 0,
        pendingCount: row ? row.pending_count : 0,
        queuedCount: row ? row.queued_count : 0,
        errorCount: row ? row.error_count : 0,
        skippedCount: row ? row.skipped_count : 0,
        trashedCount: row ? row.trashed_count : 0,
        totalSizeBytes: row ? row.total_size_bytes : 0,
        syncedSizeBytes: row ? row.synced_size_bytes : 0,
        lastFullScanAt: (() => {
          try {
            const scanRow = db.prepare("SELECT value FROM gdrive_state WHERE key = 'cache_last_full_scan'").get();
            return scanRow?.value || null;
          } catch { return null; }
        })(),
      };
    },

    /**
     * Returns immediate child folders of `parentId` with aggregated sync stats.
     * @param {string|null} parentId  null or 'root' for top-level
     */
    gdriveCacheFolderTree(parentId, opts = {}) {
      const pid = parentId || 'root';
      const hideIgnored = opts.hideIgnored === true;
      const { statsMap, parentWithFoldersSet } = getFolderStatsRollup(hideIgnored);

      const rows = db.prepare(`
        SELECT f.id, f.name, f.drive_path, f.trashed
        FROM gdrive_cache_nodes f
        WHERE f.parent_id = ? AND f.is_folder = 1 AND f.trashed = 0
        ORDER BY f.name COLLATE NOCASE ASC
      `).all(pid);

      const results = [];
      for (const r of rows) {
        const stats = statsMap.get(r.id) || { total: 0, synced: 0, queued: 0, error: 0 };
        const totalFiles = stats.total || 0;
        if (hideIgnored && totalFiles === 0) {
          continue;
        }
        results.push({
          id: r.id,
          name: r.name,
          drivePath: r.drive_path,
          trashed: r.trashed === 1,
          totalFiles,
          syncedCount: stats.synced || 0,
          queuedCount: stats.queued || 0,
          errorCount: stats.error || 0,
          pendingCount: Math.max(0, totalFiles - (stats.synced || 0) - (stats.queued || 0) - (stats.error || 0)),
          hasChildren: parentWithFoldersSet.has(r.id),
        });
      }
      return results;
    },

    /**
     * Search folders across the entire cache with sync stats.
     * @param {string} search
     * @param {number} [limit=100]
     */
    gdriveCacheSearchFolders(search, limit = 100, opts = {}) {
      if (!search || !String(search).trim()) return [];
      const hideIgnored = opts.hideIgnored === true;
      const term = `%${String(search).trim()}%`;
      const hasSlash = String(search).includes('/');
      const pathCondition = hasSlash
        ? '(f.name LIKE ? OR f.drive_path LIKE ?)'
        : 'f.name LIKE ?';
      const sqlParams = hasSlash
        ? [term, term, limit || 100]
        : [term, limit || 100];

      const { statsMap } = getFolderStatsRollup(hideIgnored);

      const rows = db.prepare(`
        SELECT f.id, f.parent_id, f.name, f.drive_path, f.trashed
        FROM gdrive_cache_nodes f
        WHERE f.is_folder = 1 AND f.trashed = 0 AND ${pathCondition}
        ORDER BY f.name COLLATE NOCASE ASC
        LIMIT ?
      `).all(...sqlParams);

      const results = [];
      for (const r of rows) {
        const stats = statsMap.get(r.id) || { total: 0, synced: 0, queued: 0, error: 0 };
        const totalFiles = stats.total || 0;
        if (hideIgnored && totalFiles === 0) {
          continue;
        }
        results.push({
          id: r.id,
          parentId: r.parent_id,
          name: r.name,
          drivePath: r.drive_path,
          trashed: r.trashed === 1,
          totalFiles,
          syncedCount: stats.synced || 0,
          queuedCount: stats.queued || 0,
          errorCount: stats.error || 0,
          pendingCount: Math.max(0, totalFiles - (stats.synced || 0) - (stats.queued || 0) - (stats.error || 0)),
        });
      }
      return results;
    },

    /**
     * Returns the ancestors chain of a folder starting from highest level parent down to folderId.
     * @param {string} folderId
     * @returns {Array<{ id: string, name: string, drivePath: string }>}
     */
    gdriveCacheFolderAncestors(folderId) {
      if (!folderId || folderId === 'root') return [];
      const rows = db.prepare(`
        WITH RECURSIVE ancestors(id, parent_id, name, drive_path, level) AS (
          SELECT id, parent_id, name, drive_path, 0 FROM gdrive_cache_nodes WHERE id = ?
          UNION ALL
          SELECT p.id, p.parent_id, p.name, p.drive_path, a.level + 1
          FROM gdrive_cache_nodes p
          JOIN ancestors a ON p.id = a.parent_id
        )
        SELECT id, parent_id, name, drive_path FROM ancestors ORDER BY level DESC
      `).all(folderId);

      return rows.map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        drivePath: r.drive_path,
      }));
    },

    /**
     * Returns files + subfolders of a specific parent with pagination, search, status filter, sorting.
     */
    gdriveCacheFolderChildren(opts = {}) {
      const skippedFilterSql = buildSkippedFilterSql(db, 'c');
      const skippedFilterSqlForD = buildSkippedFilterSql(db, 'd');
      const {
        parentId = 'root',
        search = '',
        status = 'all',
        limit = 50,
        offset = 0,
        sortBy = 'name',
        sortOrder = 'asc',
        hideIgnored = false,
        includeSubfolders = false,
      } = opts;

      const whereClauses = [];
      const params = [];

      if (includeSubfolders) {
        // Recursive mode: return all files within the current folder subtree
        whereClauses.push('c.is_folder = 0');
        whereClauses.push('c.trashed = 0');
        if (parentId && parentId !== 'root') {
          const folderNode = db.prepare('SELECT drive_path FROM gdrive_cache_nodes WHERE id = ?').get(parentId);
          const folderPath = folderNode?.drive_path;
          if (folderPath) {
            whereClauses.push(`(
              c.drive_path LIKE (CASE WHEN ? LIKE '%/' THEN ? ELSE ? || '/' END || '%')
              OR c.parent_id = ?
            )`);
            params.push(folderPath, folderPath, folderPath, parentId);
          } else {
            whereClauses.push('c.parent_id = ?');
            params.push(parentId);
          }
        }
      } else {
        // Hierarchical mode: direct children of parentId
        whereClauses.push('c.parent_id = ?');
        params.push(parentId || 'root');
      }

      const { statsMap } = getFolderStatsRollup(hideIgnored);

      // When hideIgnored is active, hide files that match the ignored/skipped extension rules
      // and hide child folders that have 0 valid files (totalFiles === 0).
      if (hideIgnored) {
        if (!includeSubfolders) {
          const childFolders = db.prepare('SELECT id FROM gdrive_cache_nodes WHERE parent_id = ? AND is_folder = 1 AND trashed = 0').all(parentId || 'root');
          const nonZeroFolderIds = childFolders.filter((f) => {
            const stats = statsMap.get(f.id);
            return stats && stats.total > 0;
          }).map((f) => f.id);

          if (nonZeroFolderIds.length > 0) {
            const placeholders = nonZeroFolderIds.map(() => '?').join(',');
            whereClauses.push(`((c.is_folder = 1 AND c.id IN (${placeholders})) OR (c.is_folder = 0 AND NOT (${skippedFilterSql})))`);
            params.push(...nonZeroFolderIds);
          } else {
            whereClauses.push(`(c.is_folder = 0 AND NOT (${skippedFilterSql}))`);
          }
        } else {
          whereClauses.push(`(c.is_folder = 1 OR NOT (${skippedFilterSql}))`);
        }
      }

      if (search && String(search).trim().length > 0) {
        whereClauses.push('(c.name LIKE ?)');
        params.push(`%${String(search).trim()}%`);
      }

      const statusExpr = `
        CASE
          WHEN c.trashed = 1 THEN 'trashed'
          WHEN c.is_folder = 1 THEN 'folder'
          WHEN m.drive_file_id IS NOT NULL THEN 'synced'
          WHEN ${skippedFilterSql} THEN 'skipped'
          WHEN q.drive_file_id IS NOT NULL THEN 'queued'
          WHEN e.drive_file_id IS NOT NULL THEN 'error'
          ELSE 'pending'
        END
      `;

      if (status && status !== 'all') {
        if (status === 'synced') {
          if (!includeSubfolders) {
            const childFolders = db.prepare('SELECT id FROM gdrive_cache_nodes WHERE parent_id = ? AND is_folder = 1 AND trashed = 0').all(parentId || 'root');
            const matchingFolderIds = childFolders.filter((f) => {
              const stats = statsMap.get(f.id);
              return stats && stats.total > 0 && stats.synced >= stats.total;
            }).map((f) => f.id);

            if (matchingFolderIds.length > 0) {
              const placeholders = matchingFolderIds.map(() => '?').join(',');
              whereClauses.push(`(
                (c.is_folder = 0 AND m.drive_file_id IS NOT NULL)
                OR c.id IN (${placeholders})
              )`);
              params.push(...matchingFolderIds);
            } else {
              whereClauses.push('(c.is_folder = 0 AND m.drive_file_id IS NOT NULL)');
            }
          } else {
            whereClauses.push('(c.is_folder = 0 AND m.drive_file_id IS NOT NULL)');
          }
        } else if (status === 'pending') {
          if (!includeSubfolders) {
            const childFolders = db.prepare('SELECT id FROM gdrive_cache_nodes WHERE parent_id = ? AND is_folder = 1 AND trashed = 0').all(parentId || 'root');
            const matchingFolderIds = childFolders.filter((f) => {
              const stats = statsMap.get(f.id);
              return stats && stats.total > 0 && stats.synced < stats.total;
            }).map((f) => f.id);

            if (matchingFolderIds.length > 0) {
              const placeholders = matchingFolderIds.map(() => '?').join(',');
              whereClauses.push(`(
                (c.is_folder = 0 AND m.drive_file_id IS NULL AND c.trashed = 0)
                OR c.id IN (${placeholders})
              )`);
              params.push(...matchingFolderIds);
            } else {
              whereClauses.push('(c.is_folder = 0 AND m.drive_file_id IS NULL AND c.trashed = 0)');
            }
          } else {
            whereClauses.push('(c.is_folder = 0 AND m.drive_file_id IS NULL AND c.trashed = 0)');
          }
        } else {
          whereClauses.push(`(${statusExpr}) = ?`);
          params.push(status);
        }
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

      const countRow = db.prepare(`
        SELECT COUNT(*) AS count
        FROM gdrive_cache_nodes c
        LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
        LEFT JOIN gdrive_sync_queue q ON c.id = q.drive_file_id
        LEFT JOIN gdrive_sync_errors e ON c.id = e.drive_file_id
        ${whereSql}
      `).get(...params);

      const total = countRow ? countRow.count : 0;

      const validSortCols = {
        name: 'c.name',
        size: 'c.size',
        modified_time: 'c.modified_time',
        status: statusExpr,
        drive_path: 'c.drive_path',
      };
      const orderCol = validSortCols[sortBy] || 'c.name';
      const orderDir = String(sortOrder).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

      // Folders first, then files, then sort within each group
      const rows = db.prepare(`
        SELECT
          c.id,
          c.parent_id,
          c.name,
          c.mime_type,
          c.is_folder,
          c.size,
          c.modified_time,
          c.md5_checksum,
          c.trashed,
          c.shortcut_target_id,
          c.drive_path,
          c.cached_at,
          ${statusExpr} AS status,
          m.vault_path,
          m.synced_at,
          e.error_message
        FROM gdrive_cache_nodes c
        LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
        LEFT JOIN gdrive_sync_queue q ON c.id = q.drive_file_id
        LEFT JOIN gdrive_sync_errors e ON c.id = e.drive_file_id
        ${whereSql}
        ORDER BY c.is_folder DESC, ${orderCol} ${orderDir}
        LIMIT ? OFFSET ?
      `).all(...params, Math.max(1, limit), Math.max(0, offset));

      const items = rows.map((r) => {
        const item = {
          id: r.id,
          parentId: r.parent_id,
          name: r.name,
          mimeType: r.mime_type,
          isFolder: r.is_folder,
          size: r.size,
          modifiedTime: r.modified_time,
          md5Checksum: r.md5_checksum,
          trashed: r.trashed,
          shortcutTargetId: r.shortcut_target_id,
          drivePath: r.drive_path,
          cachedAt: r.cached_at,
          status: r.status,
          vaultPath: r.vault_path || null,
          isSynced: r.status === 'synced' || Boolean(r.vault_path),
          syncedAt: r.synced_at || null,
          errorMessage: r.error_message || null,
        };
        // For subfolder rows, assign quick stats from rollup map
        if (r.is_folder === 1) {
          const stats = statsMap.get(r.id);
          item.folderTotalFiles = stats?.total || 0;
          item.folderSyncedCount = stats?.synced || 0;
          if (item.folderTotalFiles > 0 && item.folderSyncedCount >= item.folderTotalFiles) {
            item.isSynced = true;
            item.status = 'synced';
          } else if (item.folderTotalFiles > 0) {
            item.status = 'pending';
          }
        }
        return item;
      });

      return { items, total };
    },

    /**
     * Collects files in a folder (optionally recursive) that are pending or errored,
     * suitable for batch requeue into sync queue.
     * @param {string} folderId
     * @param {boolean} recursive
     * @returns {{ files: Array<{ id, name, size, modifiedTime, md5Checksum, drivePath, parentId }> }}
     */
    gdriveCacheSyncFolderFiles(folderId, recursive = false) {
      const skippedFilterSql = buildSkippedFilterSql(db);

      let sql;
      const params = [];

      if (recursive) {
        // Get the folder's drive_path first, then LIKE match
        const folder = db.prepare('SELECT drive_path FROM gdrive_cache_nodes WHERE id = ? AND is_folder = 1').get(folderId);
        if (!folder || !folder.drive_path) return { files: [] };
        const prefix = folder.drive_path;
        sql = `
          SELECT c.id, c.name, c.size, c.modified_time, c.md5_checksum, c.drive_path, c.parent_id
          FROM gdrive_cache_nodes c
          LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
          LEFT JOIN gdrive_sync_queue q ON c.id = q.drive_file_id
          LEFT JOIN gdrive_sync_errors e ON c.id = e.drive_file_id
          WHERE c.is_folder = 0
            AND c.trashed = 0
            AND c.drive_path LIKE (? || '%')
            AND m.drive_file_id IS NULL
            AND q.drive_file_id IS NULL
            AND NOT (${skippedFilterSql})
          ORDER BY c.drive_path ASC
        `;
        params.push(prefix);
      } else {
        sql = `
          SELECT c.id, c.name, c.size, c.modified_time, c.md5_checksum, c.drive_path, c.parent_id
          FROM gdrive_cache_nodes c
          LEFT JOIN gdrive_manifest m ON c.id = m.drive_file_id
          LEFT JOIN gdrive_sync_queue q ON c.id = q.drive_file_id
          LEFT JOIN gdrive_sync_errors e ON c.id = e.drive_file_id
          WHERE c.parent_id = ?
            AND c.is_folder = 0
            AND c.trashed = 0
            AND m.drive_file_id IS NULL
            AND q.drive_file_id IS NULL
            AND NOT (${skippedFilterSql})
          ORDER BY c.name ASC
        `;
        params.push(folderId);
      }

      const rows = db.prepare(sql).all(...params);
      return {
        files: rows.map((r) => ({
          id: r.id,
          name: r.name,
          size: r.size,
          modifiedTime: r.modified_time,
          md5Checksum: r.md5_checksum,
          drivePath: r.drive_path,
          parentId: r.parent_id,
        })),
      };
    },

    invalidateFolderRollupCache,
  };
}

module.exports = { openIndexDb, isInTrash };
