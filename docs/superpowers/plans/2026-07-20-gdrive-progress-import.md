# GDrive Progress Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import GDrive sync progress (manifest, subscriptions, selected state, vault file index) from account A into account B so already-synced Drive→vault files are skipped and only gaps re-enqueue.

**Architecture:** Pure helpers under `electron/lib/gdrive/` extract a progress snapshot from a source `index.db` (+ vault file rows) and apply it into a destination account DB + `shared-vaults/<vaultChatId>/index.db`. Phase 1 reads another local account dir; Phase 2 packages the same snapshot as a ZIP via existing `zipStore.js`. IPC pauses GDrive, applies, sets sync target, clears queue; UI on GDrive settings.

**Tech Stack:** Electron main, `better-sqlite3` via `openIndexDb`, existing `createZipFromDirectory` / `extractZipToDirectory`, React `GDriveSyncScreen`, `node:test`.

## Global Constraints

- Never copy `gdrive_tokens`, Telegram `td/`, or API credential files.
- Replace destination GDrive manifest + subscriptions (not merge two Drive trees); clear dest `gdrive_sync_queue`.
- Copy only selected `gdrive_state` keys (filters/conflict/poll/temp); never copy tokens or Drive `changes_page_token`.
- Set dest `sync_target_chat_id` to source `vault_chat_id` (`kv.vault_chat_id`).
- Merge vault `files` (+ tags via `upsert`) into dest `shared-vaults/<vaultChatId>/index.db`.
- Reuse `openIndexDb`, `zipStore`, `GDriveSyncService.setSyncTargetChatId` / `setPaused`; do not fork upload/dedup logic.
- TDD: failing test before production change for each task below.
- Run electron unit tests with: `node --test electron/lib/gdrive/__tests__/<file>.test.js`. If `better-sqlite3` ABI mismatch, rebuild with `npx electron-rebuild -f -o better-sqlite3` first.

---

## File map

| File | Role |
|------|------|
| `electron/lib/gdrive/gdriveProgressImport.js` | Extract/apply snapshot; local account import; ZIP export/import |
| `electron/lib/gdrive/__tests__/gdriveProgressImport.test.js` | Unit tests for extract/apply/queue clear/vault merge/ZIP |
| `electron/lib/ipc/gdriveHandlers.js` | IPC: list import sources, import from account, export/import ZIP |
| `electron/lib/ipc/sessionHandlers.js` | Pass account-path helpers into gdrive handler registration if needed |
| `electron/preload.js` + `preload.js` | Expose new `gdrive.*` APIs (keep both in sync) |
| `src/screens/GDriveSyncScreen.jsx` | Import/export UI in advanced settings |
| `src/i18n/locales.js` | vi/en strings |

---

### Task 1: Extract + apply progress snapshot (core)

**Files:**
- Create: `electron/lib/gdrive/gdriveProgressImport.js`
- Create: `electron/lib/gdrive/__tests__/gdriveProgressImport.test.js`

**Interfaces:**
- Produces:
  - `IMPORTABLE_STATE_KEYS` — `string[]`
  - `PROGRESS_FORMAT` — `'televault-gdrive-progress-v1'`
  - `extractGdriveProgressSnapshot(sourceDb)` → `{ vaultChatId, subscriptions, manifest, state, vaultFiles }`
  - `applyGdriveProgressSnapshot({ destDb, destAccountDir, snapshot })` → `{ vaultChatId, manifestCount, subscriptionCount, filesMerged }`
  - `importGdriveProgressFromAccountDir({ sourceAccountDir, destAccountDir, destDb })` → apply result
  - `exportGdriveProgressZip` / `importGdriveProgressZip` — stubs throwing until Task 2

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openIndexDb } = require('../../db/indexDb');
const {
  extractGdriveProgressSnapshot,
  applyGdriveProgressSnapshot,
  IMPORTABLE_STATE_KEYS,
} = require('../gdriveProgressImport');

function makeSourceDb(dir) {
  const db = openIndexDb(path.join(dir, 'index.db'));
  db.setVaultChatId(-1004310533766);
  db.gdriveSubscriptionAdd({
    driveId: 'folder1', drivePath: '/Drive', vaultPath: '/GDrive/', isFolder: true,
  });
  db.gdriveManifestUpsert({
    driveFileId: 'd1', drivePath: 'a.jpg', vaultPath: '/GDrive/a.jpg',
    md5: 'm1', sha256: 's1', size: 10, driveModifiedTime: 't1',
  });
  db.gdriveStateSet('conflict_policy', 'keep_both');
  db.gdriveStateSet('poll_interval_ms', '900000');
  db.gdriveStateSet('ignored_extensions', '.tmp');
  db.gdriveTokenSet('refresh_token', 'SECRET');
  db.gdriveStateSet('changes_page_token', 'should-not-copy');
  db.upsert({
    messageId: 42, path: '/GDrive/a.jpg', size: 10, sha256: 's1',
    mtime: new Date('2024-01-01'), localPath: null, tags: ['photo'],
  });
  return db;
}

test('extract snapshot includes gdrive data and vault files, excludes tokens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-src-'));
  const db = makeSourceDb(dir);
  const snap = extractGdriveProgressSnapshot(db);
  db.close();
  assert.equal(snap.vaultChatId, -1004310533766);
  assert.equal(snap.manifest.length, 1);
  assert.equal(snap.subscriptions.length, 1);
  assert.equal(snap.state.conflict_policy, 'keep_both');
  assert.equal(snap.state.changes_page_token, undefined);
  assert.ok(!('refresh_token' in (snap.state || {})));
  assert.equal(snap.vaultFiles.length, 1);
  assert.equal(snap.vaultFiles[0].path, '/GDrive/a.jpg');
  assert.deepEqual(snap.vaultFiles[0].tags, ['photo']);
  for (const key of IMPORTABLE_STATE_KEYS) {
    assert.ok(typeof key === 'string');
  }
});

test('apply replaces dest manifest/subs, clears queue, merges shared vault files, sets sync target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-apply-'));
  const srcDir = path.join(root, 'A');
  fs.mkdirSync(srcDir);
  const srcDb = makeSourceDb(srcDir);
  const snap = extractGdriveProgressSnapshot(srcDb);
  srcDb.close();

  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  destDb.gdriveManifestUpsert({
    driveFileId: 'old', drivePath: 'x', vaultPath: '/GDrive/x',
    md5: null, sha256: 'x', size: 1, driveModifiedTime: 't0',
  });
  destDb.gdriveSubscriptionAdd({
    driveId: 'oldsub', drivePath: '/Old', vaultPath: '/Old/', isFolder: true,
  });
  destDb.gdriveSyncQueueAdd({
    driveFileId: 'q1', fileName: 'q.jpg', drivePath: 'q.jpg',
    vaultPath: '/GDrive/q.jpg', size: 1, modifiedTime: 't',
  });
  destDb.gdriveStateSet('conflict_policy', 'skip');

  const result = applyGdriveProgressSnapshot({
    destDb, destAccountDir: destDir, snapshot: snap,
  });

  assert.equal(result.vaultChatId, -1004310533766);
  assert.equal(result.manifestCount, 1);
  assert.equal(destDb.gdriveManifestAll().length, 1);
  assert.equal(destDb.gdriveManifestGet('d1').sha256, 's1');
  assert.equal(destDb.gdriveManifestGet('old'), null);
  assert.equal(destDb.gdriveSubscriptionsAll().length, 1);
  assert.equal(destDb.gdriveSyncQueueCount(), 0);
  assert.equal(destDb.gdriveStateGet('conflict_policy'), 'keep_both');
  assert.equal(destDb.gdriveStateGet('sync_target_chat_id'), '-1004310533766');
  assert.equal(destDb.gdriveStateGet('changes_page_token', null), null);

  const sharedPath = path.join(destDir, 'shared-vaults', '-1004310533766', 'index.db');
  assert.ok(fs.existsSync(sharedPath));
  const sharedDb = openIndexDb(sharedPath);
  const entry = sharedDb.getAll().find((e) => e.path === '/GDrive/a.jpg');
  assert.ok(entry);
  assert.equal(entry.sha256, 's1');
  assert.deepEqual(entry.tags, ['photo']);
  sharedDb.close();
  destDb.close();
});

test('extract throws when source has no vault_chat_id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-novault-'));
  const db = openIndexDb(path.join(dir, 'index.db'));
  assert.throws(() => extractGdriveProgressSnapshot(db), /vault_chat_id/);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test electron/lib/gdrive/__tests__/gdriveProgressImport.test.js`

Expected: FAIL (module not found or functions undefined)

- [ ] **Step 3: Write minimal implementation**

Create `electron/lib/gdrive/gdriveProgressImport.js`:

```js
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

function extractGdriveProgressSnapshot(sourceDb) {
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
    vaultFiles: sourceDb.getAll().map(serializeVaultFile),
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

  const sharedDb = ensureSharedVaultDb(destAccountDir, vaultChatId);
  let filesMerged = 0;
  try {
    for (const raw of snapshot.vaultFiles || []) {
      sharedDb.upsert({
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
    sharedDb.close();
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
    const snapshot = extractGdriveProgressSnapshot(sourceDb);
    return applyGdriveProgressSnapshot({ destDb, destAccountDir, snapshot });
  } finally {
    sourceDb.close();
  }
}

async function exportGdriveProgressZip() {
  throw new Error('not_implemented');
}
async function importGdriveProgressZip() {
  throw new Error('not_implemented');
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
};
```

Note: leave ZIP stubs throwing until Task 2.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test electron/lib/gdrive/__tests__/gdriveProgressImport.test.js`

Expected: PASS for the three tests above

- [ ] **Step 5: Commit**

```bash
git add electron/lib/gdrive/gdriveProgressImport.js electron/lib/gdrive/__tests__/gdriveProgressImport.test.js
git commit -m "$(cat <<'EOF'
feat: extract and apply GDrive progress snapshots between accounts

EOF
)"
```

---

### Task 2: ZIP export / import (Phase 2)

**Files:**
- Modify: `electron/lib/gdrive/gdriveProgressImport.js`
- Modify: `electron/lib/gdrive/__tests__/gdriveProgressImport.test.js`

**Interfaces:**
- Consumes: `extractGdriveProgressSnapshot`, `applyGdriveProgressSnapshot`, `PROGRESS_FORMAT`, `createZipFromDirectory`, `extractZipToDirectory`
- Produces: working `exportGdriveProgressZip` / `importGdriveProgressZip`

ZIP layout:

```
manifest.json   — { format, appVersion, accountId, vaultChatId, createdAt, counts }
gdrive.json     — { subscriptions, manifest, state }
vault-files.json — vaultFiles array
```

- [ ] **Step 1: Write the failing ZIP round-trip test** (append to test file)

```js
const {
  exportGdriveProgressZip,
  importGdriveProgressZip,
  PROGRESS_FORMAT,
} = require('../gdriveProgressImport');

test('ZIP export/import round-trips progress without tokens', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-zip-'));
  const srcDir = path.join(root, 'A');
  fs.mkdirSync(srcDir);
  const srcDb = makeSourceDb(srcDir);
  srcDb.close();

  const zipPath = path.join(root, 'progress.televault-gdrive-progress.zip');
  const exported = await exportGdriveProgressZip({
    sourceAccountDir: srcDir,
    zipPath,
    accountId: 'acc-a',
    appVersion: '0.1.0',
  });
  assert.equal(exported.ok, true);
  assert.ok(fs.existsSync(zipPath));

  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  const imported = await importGdriveProgressZip({
    zipPath, destAccountDir: destDir, destDb,
  });
  assert.equal(imported.vaultChatId, -1004310533766);
  assert.equal(destDb.gdriveManifestGet('d1').sha256, 's1');
  assert.equal(destDb.gdriveStateGet('sync_target_chat_id'), '-1004310533766');
  const sharedDb = openIndexDb(path.join(destDir, 'shared-vaults', '-1004310533766', 'index.db'));
  assert.ok(sharedDb.getAll().some((e) => e.path === '/GDrive/a.jpg'));
  sharedDb.close();
  destDb.close();
});

test('ZIP import rejects wrong format', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-badzip-'));
  const stage = path.join(root, 'stage');
  fs.mkdirSync(stage);
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({
    format: 'not-this', vaultChatId: 1,
  }));
  const zipPath = path.join(root, 'bad.zip');
  const { createZipFromDirectory } = require('../../backup/zipStore');
  createZipFromDirectory(stage, zipPath);
  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  await assert.rejects(
    () => importGdriveProgressZip({ zipPath, destAccountDir: destDir, destDb }),
    /format/,
  );
  destDb.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test electron/lib/gdrive/__tests__/gdriveProgressImport.test.js`

Expected: FAIL on ZIP tests (`not_implemented`)

- [ ] **Step 3: Implement ZIP helpers** (replace stubs)

```js
async function exportGdriveProgressZip({ sourceAccountDir, zipPath, accountId, appVersion }) {
  const sourcePath = path.join(sourceAccountDir, 'index.db');
  if (!fs.existsSync(sourcePath)) throw new Error('source_index_db_missing');
  const sourceDb = openIndexDb(sourcePath);
  let snapshot;
  try {
    snapshot = extractGdriveProgressSnapshot(sourceDb);
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
```

- [ ] **Step 4: Run tests — PASS**

Run: `node --test electron/lib/gdrive/__tests__/gdriveProgressImport.test.js`

- [ ] **Step 5: Commit**

```bash
git add electron/lib/gdrive/gdriveProgressImport.js electron/lib/gdrive/__tests__/gdriveProgressImport.test.js
git commit -m "$(cat <<'EOF'
feat: ZIP export/import for GDrive progress packages

EOF
)"
```

---

### Task 3: Dedup integration check after apply

**Files:**
- Modify: `electron/lib/gdrive/__tests__/gdriveProgressImport.test.js`

**Interfaces:**
- Consumes: `applyGdriveProgressSnapshot`, `shouldEnqueueDriveFile` from `gdriveDiscovery.js`

- [ ] **Step 1: Write test**

```js
const { shouldEnqueueDriveFile } = require('../gdriveDiscovery');

test('after import, unchanged Drive file with vault entry should not enqueue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-dedup-'));
  const srcDir = path.join(root, 'A');
  fs.mkdirSync(srcDir);
  const srcDb = makeSourceDb(srcDir);
  const snap = extractGdriveProgressSnapshot(srcDb);
  srcDb.close();

  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  applyGdriveProgressSnapshot({ destDb, destAccountDir: destDir, snapshot: snap });

  const manifest = destDb.gdriveManifestGet('d1');
  const sharedDb = openIndexDb(path.join(destDir, 'shared-vaults', '-1004310533766', 'index.db'));
  const vaultEntry = sharedDb.getAll().find((e) => e.path === '/GDrive/a.jpg');
  assert.equal(
    shouldEnqueueDriveFile({
      manifest,
      driveModifiedTime: 't1',
      vaultEntry,
    }),
    false,
  );
  sharedDb.close();
  destDb.close();
});
```

- [ ] **Step 2: Run — should PASS** (documents success criterion; if fail, fix apply path/mtime serialization)

- [ ] **Step 3: Commit**

```bash
git add electron/lib/gdrive/__tests__/gdriveProgressImport.test.js
git commit -m "$(cat <<'EOF'
test: assert imported progress skips re-enqueue for unchanged files

EOF
)"
```

---

### Task 4: IPC + preload

**Files:**
- Modify: `electron/lib/ipc/gdriveHandlers.js`
- Modify: `electron/lib/ipc/sessionHandlers.js` (pass account helpers if missing)
- Modify: `electron/preload.js`
- Modify: `preload.js`

**Interfaces:**
- Consumes: `importGdriveProgressFromAccountDir`, `exportGdriveProgressZip`, `importGdriveProgressZip`, account path helpers, `GDriveSyncService.setPaused`, `setSyncTargetChatId`
- Produces IPC:
  - `gdrive:listProgressImportSources` → `{ ok, sources: [{ id, name }] }`
  - `gdrive:importProgressFromAccount` `{ sourceAccountId }` → `{ ok, vaultChatId, manifestCount, ... }`
  - `gdrive:exportProgress` → save dialog + export ZIP
  - `gdrive:importProgress` → open dialog + import ZIP

Pause GDrive before mutate; after apply call `await svc.setSyncTargetChatId(String(result.vaultChatId))` so live `this.vault` rebinds.

Example local-import handler (adapt to existing `registerGdriveHandlers` deps — pass `getActiveAccountId`, `listAccounts`, `getAccountDir`, `getAppVersion` from session registration):

```js
const {
  importGdriveProgressFromAccountDir,
  exportGdriveProgressZip,
  importGdriveProgressZip,
} = require('../gdrive/gdriveProgressImport');

ipcMain.handle('gdrive:listProgressImportSources', () => {
  const activeId = ctx.getActiveAccountId();
  const sources = ctx.listAccounts()
    .filter((a) => a.id !== activeId)
    .map((a) => ({ id: a.id, name: a.name || a.id }));
  return { ok: true, sources };
});

ipcMain.handle('gdrive:importProgressFromAccount', async (_evt, { sourceAccountId }) => {
  const svc = ctx.getGdriveService();
  if (!svc) return { ok: false, error: 'gdrive_unavailable' };
  const activeId = ctx.getActiveAccountId();
  if (!sourceAccountId || sourceAccountId === activeId) {
    return { ok: false, error: 'invalid_source' };
  }
  const sourceDir = ctx.getAccountDir(sourceAccountId);
  const destDir = ctx.getAccountDir(activeId);
  if (!fs.existsSync(path.join(sourceDir, 'index.db'))) {
    return { ok: false, error: 'source_index_db_missing' };
  }
  const wasPaused = svc.isPaused;
  svc.setPaused(true);
  try {
    const result = importGdriveProgressFromAccountDir({
      sourceAccountDir: sourceDir,
      destAccountDir: destDir,
      destDb: svc.db,
    });
    await svc.setSyncTargetChatId(String(result.vaultChatId));
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally {
    if (!wasPaused) svc.setPaused(false);
  }
});
```

ZIP export/import: use `dialog.showSaveDialog` / `showOpenDialog` like `backup:export` / `backup:import` (default name `televault-gdrive-progress-YYYYMMDD-HHmm.televault-gdrive-progress.zip`).

Preload (both files):

```js
listProgressImportSources: () => ipcRenderer.invoke('gdrive:listProgressImportSources'),
importProgressFromAccount: (sourceAccountId) =>
  ipcRenderer.invoke('gdrive:importProgressFromAccount', { sourceAccountId }),
exportProgress: () => ipcRenderer.invoke('gdrive:exportProgress'),
importProgress: () => ipcRenderer.invoke('gdrive:importProgress'),
```

- [ ] **Step 1: Implement IPC + preload wiring**

- [ ] **Step 2: Commit**

```bash
git add electron/lib/ipc/gdriveHandlers.js electron/lib/ipc/sessionHandlers.js electron/preload.js preload.js
git commit -m "$(cat <<'EOF'
feat: IPC for GDrive progress import from account or ZIP

EOF
)"
```

---

### Task 5: UI + i18n

**Files:**
- Modify: `src/screens/GDriveSyncScreen.jsx`
- Modify: `src/i18n/locales.js`

- [ ] **Step 1: Add locale keys** (vi + en)

```js
// vi
gdriveProgressImportTitle: 'Import tiến trình GDrive',
gdriveProgressImportHint: 'Sao chép manifest/subscriptions và chỉ mục vault từ account khác trên máy này, hoặc từ file ZIP. Xóa hàng đợi sync hiện tại. Không sao chép token Drive hay phiên Telegram.',
gdriveProgressImportFromAccount: 'Import từ account trên máy',
gdriveProgressImportConfirm: 'Ghi đè tiến trình GDrive của account hiện tại, xóa hàng đợi sync, và đặt vault đích theo account nguồn. Tiếp tục?',
gdriveProgressImportSuccess: 'Đã import {manifest} file manifest, {files} mục vault. Chạy Scan Now để tiếp tục phần còn thiếu.',
gdriveProgressImportError: 'Import tiến trình thất bại.',
gdriveProgressExport: 'Xuất tiến trình ra ZIP',
gdriveProgressImportZip: 'Import từ ZIP',
gdriveProgressNoSources: 'Không có account nguồn khác trên máy này.',

// en
gdriveProgressImportTitle: 'Import GDrive progress',
gdriveProgressImportHint: 'Copy manifest/subscriptions and vault index from another account on this device, or from a ZIP. Clears the current sync queue. Does not copy Drive tokens or Telegram sessions.',
gdriveProgressImportFromAccount: 'Import from account on this device',
gdriveProgressImportConfirm: 'Overwrite this account’s GDrive progress, clear the sync queue, and set the sync target vault from the source. Continue?',
gdriveProgressImportSuccess: 'Imported {manifest} manifest rows and {files} vault entries. Run Scan Now for remaining gaps.',
gdriveProgressImportError: 'Failed to import GDrive progress.',
gdriveProgressExport: 'Export progress ZIP',
gdriveProgressImportZip: 'Import from ZIP',
gdriveProgressNoSources: 'No other accounts on this device.',
```

- [ ] **Step 2: UI**

In the advanced settings panel (near sync target):

1. On expand/mount: `listProgressImportSources()` → `progressSources` state.
2. Source select + Import button → confirm → `importProgressFromAccount(id)` → toast with counts; refresh status/targets.
3. Buttons for `exportProgress` / `importProgress` (ZIP).
4. One section only — title, hint, controls; no new dashboard cards.

- [ ] **Step 3: Commit**

```bash
git add src/screens/GDriveSyncScreen.jsx src/i18n/locales.js
git commit -m "$(cat <<'EOF'
feat: GDrive settings UI for progress import/export

EOF
)"
```

---

### Task 6: Verify

- [ ] **Step 1: Run unit tests**

```bash
node --test electron/lib/gdrive/__tests__/gdriveProgressImport.test.js
node --test electron/lib/backup/__tests__/zipStore.test.js
```

Expected: all PASS

- [ ] **Step 2: Manual checklist**

1. Account A has GDrive manifest + personal vault chat `-1004310533766`.
2. Switch to B → GDrive → Import from A → confirm.
3. Sync target shows vault A; shared vault index has `/GDrive/...` paths.
4. Queue empty; Scan Now only enqueues Drive files missing from manifest+vault entry.
5. Export ZIP from A; Import ZIP on B → same outcome.
6. Confirm B’s Drive OAuth tokens and Telegram session unchanged.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Copy manifest + subscriptions | 1 |
| Selected state, no tokens | 1 (`IMPORTABLE_STATE_KEYS`) |
| Clear dest queue | 1 |
| Merge files into shared-vaults DB | 1 |
| Set sync_target_chat_id | 1 + 4 (live rebind) |
| Same-machine A→B UI | 4 + 5 |
| Pause during import | 4 |
| Abort if no vault_chat_id | 1 |
| Phase 2 ZIP export/import | 2 + 4 + 5 |
| shouldEnqueueDriveFile skip after import | 3 |
| No td/ / tokens in package | 2 |

## Placeholder scan

No TBD left; ZIP format, state keys, IPC names, and test code are concrete.

## Type consistency

- Snapshot fields: `vaultChatId`, `subscriptions`, `manifest`, `state`, `vaultFiles` — same across extract/apply/ZIP.
- `PROGRESS_FORMAT = 'televault-gdrive-progress-v1'` used in export and import reject path.
- IPC `sourceAccountId` → `getAccountDir(sourceAccountId)`.
