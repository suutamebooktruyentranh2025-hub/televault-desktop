const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createZipFromDirectory, extractZipToDirectory } = require('./zipStore');

const MANIFEST_NAME = 'manifest.json';
const BACKUP_FORMAT = 'televault-backup-v1';

function apiCredentialsFileName(accountId) {
  return `televault-tg-api-${accountId}.json`;
}

/**
 * Clear OAuth tokens from a DB file copy (safe backup).
 * @param {string} dbPath
 */
function sanitizeDbCopyForSafeBackup(dbPath) {
  const db = new Database(dbPath);
  try {
    db.exec('DELETE FROM gdrive_tokens');
  } finally {
    db.close();
  }
}

/**
 * Copy live index.db to dest using SQLite backup API when possible.
 * @param {string} sourceDbPath
 * @param {string} destDbPath
 */
async function copyIndexDb(sourceDbPath, destDbPath) {
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error('index.db_not_found');
  }
  fs.mkdirSync(path.dirname(destDbPath), { recursive: true });
  const source = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destDbPath);
  } finally {
    source.close();
  }
}

function copyDirectoryRecursive(sourceDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true });
}

/**
 * @param {{
 *   accountDir: string,
 *   userDataPath: string,
 *   accountId: string,
 *   zipPath: string,
 *   includeSessions?: boolean,
 *   appVersion?: string,
 * }} opts
 */
async function createAppBackupArchive(opts) {
  const include_sessions = Boolean(opts.includeSessions);
  const staging_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-backup-stage-'));
  try {
    const staged_db = path.join(staging_dir, 'index.db');
    await copyIndexDb(path.join(opts.accountDir, 'index.db'), staged_db);
    if (!include_sessions) {
      sanitizeDbCopyForSafeBackup(staged_db);
    }

    if (include_sessions) {
      const td_source = path.join(opts.accountDir, 'td');
      if (fs.existsSync(td_source)) {
        copyDirectoryRecursive(td_source, path.join(staging_dir, 'td'));
      }
      const api_source = path.join(opts.userDataPath, apiCredentialsFileName(opts.accountId));
      if (fs.existsSync(api_source)) {
        fs.copyFileSync(api_source, path.join(staging_dir, apiCredentialsFileName(opts.accountId)));
      }
    }

    const manifest = {
      format: BACKUP_FORMAT,
      appVersion: opts.appVersion || '0.0.0',
      accountId: opts.accountId,
      createdAt: new Date().toISOString(),
      includesSessions: include_sessions,
    };
    fs.writeFileSync(path.join(staging_dir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');

    createZipFromDirectory(staging_dir, opts.zipPath);
    return { ok: true, includesSessions: include_sessions, zipPath: opts.zipPath };
  } finally {
    fs.rmSync(staging_dir, { recursive: true, force: true });
  }
}

/**
 * @param {{
 *   zipPath: string,
 *   accountDir: string,
 *   userDataPath: string,
 *   accountId: string,
 * }} opts
 */
async function restoreAppBackupArchive(opts) {
  const extract_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-backup-extract-'));
  try {
    extractZipToDirectory(opts.zipPath, extract_dir);
    const manifest_path = path.join(extract_dir, MANIFEST_NAME);
    if (!fs.existsSync(manifest_path)) {
      throw new Error('backup_manifest_missing');
    }
    const manifest = JSON.parse(fs.readFileSync(manifest_path, 'utf8'));
    if (manifest.format !== BACKUP_FORMAT) {
      throw new Error('backup_format_unsupported');
    }
    const staged_db = path.join(extract_dir, 'index.db');
    if (!fs.existsSync(staged_db)) {
      throw new Error('backup_db_missing');
    }

    fs.mkdirSync(opts.accountDir, { recursive: true });
    const dest_db = path.join(opts.accountDir, 'index.db');
    // Remove WAL/SHM leftovers so restored DB opens cleanly.
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const stale_path = `${dest_db}${suffix === '' ? '' : suffix}`;
      if (suffix === '') continue;
      if (fs.existsSync(stale_path)) fs.unlinkSync(stale_path);
    }
    fs.copyFileSync(staged_db, dest_db);

    const includes_sessions = Boolean(manifest.includesSessions);
    if (includes_sessions) {
      const td_source = path.join(extract_dir, 'td');
      const td_dest = path.join(opts.accountDir, 'td');
      if (fs.existsSync(td_dest)) {
        fs.rmSync(td_dest, { recursive: true, force: true });
      }
      if (fs.existsSync(td_source)) {
        copyDirectoryRecursive(td_source, td_dest);
      }
      const api_name = apiCredentialsFileName(opts.accountId);
      const api_source = path.join(extract_dir, api_name);
      if (fs.existsSync(api_source)) {
        fs.copyFileSync(api_source, path.join(opts.userDataPath, api_name));
      }
    }

    return {
      ok: true,
      includesSessions: includes_sessions,
      accountId: manifest.accountId || opts.accountId,
      appVersion: manifest.appVersion,
    };
  } finally {
    fs.rmSync(extract_dir, { recursive: true, force: true });
  }
}

module.exports = {
  BACKUP_FORMAT,
  sanitizeDbCopyForSafeBackup,
  copyIndexDb,
  createAppBackupArchive,
  restoreAppBackupArchive,
  apiCredentialsFileName,
};
