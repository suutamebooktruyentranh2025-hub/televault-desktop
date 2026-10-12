const fs = require('fs');
const os = require('os');
const path = require('path');
const { openIndexDb } = require('../db/indexDb');
const { createZipFromDirectory, extractZipToDirectory } = require('../backup/zipStore');

const PROGRESS_FORMAT = 'televault-gdrive-progress-v1';
const IMPORTABLE_STATE_KEYS = [
  'ignored_extensions',
  'allowed_extensions',
  'temp_download_dir',
  'conflict_policy',
  'propagate_deletes',
  'poll_interval_ms',
];

function serializeVaultFile(entry) {
  return {
    messageId: entry.messageId,
    path: entry.path,
    size: entry.size,
    sha256: entry.sha256,
    mtime: entry.mtime instanceof Date ? entry.mtime.toISOString() : String(entry.mtime),
    localPath: entry.localPath ?? null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    parts: entry.parts || null,
  };
}

/**
 * Collect vault file rows for progress export/import.
 * Personal index.db is the account vault; Telegram history scan often lands in
 * shared-vaults/<vaultChatId>/index.db for the same chat — merge both by messageId.
 * @param {ReturnType<typeof openIndexDb>} sourceDb
 * @param {string | null} [sourceAccountDir]
 */
function collectVaultFilesForProgress(sourceDb, sourceAccountDir = null) {
  /** @type {Map<number, ReturnType<typeof serializeVaultFile>>} */
  const by_message_id = new Map();
  for (const entry of sourceDb.getAll()) {
    by_message_id.set(entry.messageId, serializeVaultFile(entry));
  }

  const vault_chat_id = sourceDb.getVaultChatId();
  if (!sourceAccountDir || !vault_chat_id) {
    return [...by_message_id.values()];
  }

  const shared_path = path.join(
    sourceAccountDir,
    'shared-vaults',
    String(vault_chat_id),
    'index.db',
  );
  if (!fs.existsSync(shared_path)) {
    return [...by_message_id.values()];
  }

  const shared_db = openIndexDb(shared_path);
  try {
    for (const entry of shared_db.getAll()) {
      by_message_id.set(entry.messageId, serializeVaultFile(entry));
    }
  } finally {
    shared_db.close();
  }
  return [...by_message_id.values()];
}

/**
 * @param {ReturnType<typeof openIndexDb>} sourceDb
 * @param {string | null} [sourceAccountDir] account dir — used to merge shared-vaults index
 */
function extractGdriveProgressSnapshot(sourceDb, sourceAccountDir = null) {
  const vaultChatId = sourceDb.getVaultChatId();
  if (!vaultChatId) throw new Error('vault_chat_id_missing');
  /** @type {Record<string, string>} */
  const state = {};
  for (const key of IMPORTABLE_STATE_KEYS) {
    const value = sourceDb.gdriveStateGet(key, null);
    if (value != null && value !== '') state[key] = String(value);
  }
  return {
    vaultChatId,
    subscriptions: sourceDb.gdriveSubscriptionsAll(),
    manifest: sourceDb.gdriveManifestAll(),
    state,
    vaultFiles: collectVaultFilesForProgress(sourceDb, sourceAccountDir),
  };
}

function ensureSharedVaultDb(destAccountDir, vaultChatId) {
  const dir = path.join(destAccountDir, 'shared-vaults', String(vaultChatId));
  fs.mkdirSync(dir, { recursive: true });
  return openIndexDb(path.join(dir, 'index.db'));
}

function applyGdriveProgressSnapshot({ destDb, destAccountDir, snapshot }) {
  if (!snapshot?.vaultChatId) throw new Error('vault_chat_id_missing');
  const vaultChatId = Number(snapshot.vaultChatId);
  if (!Number.isFinite(vaultChatId)) throw new Error('vault_chat_id_invalid');

  destDb.gdriveManifestClear();
  for (const sub of destDb.gdriveSubscriptionsAll()) {
    destDb.gdriveSubscriptionRemove(sub.driveId);
  }
  destDb.gdriveSyncQueueClear();

  for (const sub of snapshot.subscriptions || []) {
    destDb.gdriveSubscriptionAdd({
      driveId: sub.driveId,
      drivePath: sub.drivePath,
      vaultPath: sub.vaultPath,
      isFolder: Boolean(sub.isFolder),
    });
    if (sub.enabled === false) {
      destDb.gdriveSubscriptionSetEnabled(sub.driveId, false);
    }
  }
  for (const row of snapshot.manifest || []) {
    destDb.gdriveManifestUpsert({
      driveFileId: row.driveFileId,
      drivePath: row.drivePath,
      vaultPath: row.vaultPath,
      md5: row.md5 ?? null,
      sha256: row.sha256,
      size: row.size,
      driveModifiedTime: row.driveModifiedTime,
    });
  }
  for (const key of IMPORTABLE_STATE_KEYS) {
    if (snapshot.state?.[key] != null) {
      destDb.gdriveStateSet(key, String(snapshot.state[key]));
    }
  }
  destDb.gdriveStateSet('sync_target_chat_id', String(vaultChatId));

  const ownVaultChatId = destDb.getVaultChatId();
  const isPersonalVault = ownVaultChatId != null && Number(ownVaultChatId) === vaultChatId;
  const targetDb = isPersonalVault ? destDb : ensureSharedVaultDb(destAccountDir, vaultChatId);
  let filesMerged = 0;
  try {
    for (const raw of snapshot.vaultFiles || []) {
      targetDb.upsert({
        messageId: raw.messageId,
        path: raw.path,
        size: raw.size,
        sha256: raw.sha256,
        mtime: new Date(raw.mtime),
        localPath: raw.localPath ?? null,
        tags: raw.tags || [],
        parts: raw.parts || null,
      });
      filesMerged += 1;
    }
  } finally {
    if (!isPersonalVault) {
      targetDb.close();
    }
  }

  return {
    vaultChatId,
    manifestCount: (snapshot.manifest || []).length,
    subscriptionCount: (snapshot.subscriptions || []).length,
    filesMerged,
  };
}

function importGdriveProgressFromAccountDir({ sourceAccountDir, destAccountDir, destDb }) {
  const sourcePath = path.join(sourceAccountDir, 'index.db');
  if (!fs.existsSync(sourcePath)) throw new Error('source_index_db_missing');
  const sourceDb = openIndexDb(sourcePath);
  try {
    const snapshot = extractGdriveProgressSnapshot(sourceDb, sourceAccountDir);
    return applyGdriveProgressSnapshot({ destDb, destAccountDir, snapshot });
  } finally {
    sourceDb.close();
  }
}

async function exportGdriveProgressZip({ sourceAccountDir, zipPath, accountId, appVersion }) {
  const sourcePath = path.join(sourceAccountDir, 'index.db');
  if (!fs.existsSync(sourcePath)) throw new Error('source_index_db_missing');
  const sourceDb = openIndexDb(sourcePath);
  let snapshot;
  try {
    snapshot = extractGdriveProgressSnapshot(sourceDb, sourceAccountDir);
  } finally {
    sourceDb.close();
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-prog-exp-'));
  try {
    const counts = {
      manifest: snapshot.manifest.length,
      subscriptions: snapshot.subscriptions.length,
      vaultFiles: snapshot.vaultFiles.length,
    };
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({
      format: PROGRESS_FORMAT,
      appVersion: appVersion || '0.0.0',
      accountId: accountId || null,
      vaultChatId: snapshot.vaultChatId,
      createdAt: new Date().toISOString(),
      counts,
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(staging, 'gdrive.json'), JSON.stringify({
      subscriptions: snapshot.subscriptions,
      manifest: snapshot.manifest,
      state: snapshot.state,
    }, null, 2), 'utf8');
    fs.writeFileSync(
      path.join(staging, 'vault-files.json'),
      JSON.stringify(snapshot.vaultFiles),
      'utf8',
    );
    createZipFromDirectory(staging, zipPath);
    return { ok: true, zipPath, vaultChatId: snapshot.vaultChatId, ...counts };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

async function importGdriveProgressZip({ zipPath, destAccountDir, destDb }) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-prog-imp-'));
  try {
    extractZipToDirectory(zipPath, extractDir);
    const manifestPath = path.join(extractDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('progress_manifest_missing');
    const packageManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (packageManifest.format !== PROGRESS_FORMAT) {
      throw new Error('progress_format_unsupported');
    }
    const gdrivePath = path.join(extractDir, 'gdrive.json');
    const filesPath = path.join(extractDir, 'vault-files.json');
    if (!fs.existsSync(gdrivePath) || !fs.existsSync(filesPath)) {
      throw new Error('progress_payload_missing');
    }
    const gdrive = JSON.parse(fs.readFileSync(gdrivePath, 'utf8'));
    const vaultFiles = JSON.parse(fs.readFileSync(filesPath, 'utf8'));
    const snapshot = {
      vaultChatId: packageManifest.vaultChatId,
      subscriptions: gdrive.subscriptions || [],
      manifest: gdrive.manifest || [],
      state: gdrive.state || {},
      vaultFiles: Array.isArray(vaultFiles) ? vaultFiles : [],
    };
    return applyGdriveProgressSnapshot({ destDb, destAccountDir, snapshot });
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

module.exports = {
  PROGRESS_FORMAT,
  IMPORTABLE_STATE_KEYS,
  extractGdriveProgressSnapshot,
  applyGdriveProgressSnapshot,
  importGdriveProgressFromAccountDir,
  exportGdriveProgressZip,
  importGdriveProgressZip,
  ensureSharedVaultDb,
  collectVaultFilesForProgress,
};
