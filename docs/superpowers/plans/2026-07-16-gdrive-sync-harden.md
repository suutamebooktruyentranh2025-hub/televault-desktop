# GDrive Drive→Vault Sync Harden — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden one-way Google Drive → TeleVault sync so poll discovers new files, workers claim queue rows atomically, large downloads resume, md5 skips waste, conflicts/deletes are explicit policies, and lifecycle/UI match reality.

**Architecture:** Patch in place on `GDriveSyncService` + small helpers. Atomic queue claim in SQLite; poll discovery via parent/subscription matching; Range resume in `gdriveApi`; reuse `streamHash.js`; settings for `conflict_policy` and `propagate_deletes`.

**Tech Stack:** Electron main process, better-sqlite3, Node `https` Range downloads, existing `ApiRateLimiter` / `SyncThrottleController`, React GDrive UI.

**Spec:** `docs/superpowers/specs/2026-07-16-gdrive-sync-harden-design.md`

## Global Constraints

- Drive → Vault only — never request write OAuth scopes
- Variable names: `adjective_noun`
- Code comments in English
- Default `propagate_deletes = false`, `conflict_policy = skip`
- Soft-trash vault on delete prop — never hard-delete Telegram messages from GDrive path
- Run `node --test` on touched test files before claiming done
- Reuse `electron/lib/vault/streamHash.js` — do not reimplement full-file hash

---

## File Structure

| File | Responsibility |
|---|---|
| `electron/lib/db/indexDb.js` | Queue claim columns + `gdriveSyncQueueClaimNext`, manifest md5, cleanup helpers |
| `electron/lib/gdrive/gdriveDiscovery.js` | Pure helpers: match change to subscription, resolve vault path, conflict dest path |
| `electron/lib/gdrive/gdriveApi.js` | Resume download with Range + AbortSignal |
| `electron/lib/gdrive/gdriveAuth.js` | Verify OAuth `state` |
| `electron/lib/gdrive/gdriveSyncService.js` | Wire discovery, claim, md5 skip, conflict, deletes, abort, lifecycle |
| `electron/lib/ipc/gdriveHandlers.js` | Expose new settings in snapshot / setters |
| `src/screens/GDriveSyncScreen.jsx` | Toggles + throttle UI |
| `src/i18n/locales.js` | New strings |
| `README.md` | One-way wording |
| `electron/lib/gdrive/__tests__/*.test.js` | Unit tests per task |
| `electron/lib/db/__tests__/gdriveQueueClaim.test.js` | Claim concurrency test |

---

## Phase 0 — P0 Reliability

### Task 1: Atomic queue claim

**Files:**
- Modify: `electron/lib/db/indexDb.js` (schema + queue helpers)
- Create: `electron/lib/db/__tests__/gdriveQueueClaim.test.js`

**Interfaces:**
- Produces: `gdriveSyncQueueClaimNext(workerId: string) → queueItem | null`
- Produces: `gdriveSyncQueueReleaseToQueued(driveFileId)`, `gdriveSyncQueueResetStale(maxAgeMs)`
- Consumes: existing `gdriveSyncQueueAdd` / `Remove` / `Count`

- [ ] **Step 1: Write failing test**

```javascript
// electron/lib/db/__tests__/gdriveQueueClaim.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openIndexDb } = require('../indexDb');

function openTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-q-'));
  return { db: openIndexDb(path.join(dir, 'index.db')), dir };
}

test('two claims return different rows', () => {
  const { db, dir } = openTempDb();
  db.gdriveSyncQueueAdd({
    driveFileId: 'a', fileName: 'a.bin', drivePath: 'a.bin', vaultPath: '/GDrive/a.bin',
    size: 1, modifiedTime: '2026-01-01T00:00:00.000Z',
  });
  db.gdriveSyncQueueAdd({
    driveFileId: 'b', fileName: 'b.bin', drivePath: 'b.bin', vaultPath: '/GDrive/b.bin',
    size: 1, modifiedTime: '2026-01-01T00:00:00.000Z',
  });
  const first = db.gdriveSyncQueueClaimNext('w1');
  const second = db.gdriveSyncQueueClaimNext('w2');
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.driveFileId, second.driveFileId);
  assert.equal(db.gdriveSyncQueueClaimNext('w3'), null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test — expect FAIL** (claim API missing or better-sqlite3 env issue — if sqlite native fails in Node, run under electron or document; prefer implementing claim and running when native works)

Run: `node --test electron/lib/db/__tests__/gdriveQueueClaim.test.js`

- [ ] **Step 3: Migrate schema + implement claim**

In `createSchema` / migrations after `gdrive_sync_queue` create:

```javascript
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
```

Implement claim inside a transaction (portable, no RETURNING required):

```javascript
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
}

gdriveSyncQueueReleaseToQueued(driveFileId) {
  db.prepare(
    `UPDATE gdrive_sync_queue SET status = 'queued', claimed_at = NULL, claimed_by = NULL
     WHERE drive_file_id = ?`,
  ).run(driveFileId);
}

gdriveSyncQueueResetStale(maxAgeMs = 30 * 60 * 1000) {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  db.prepare(
    `UPDATE gdrive_sync_queue SET status = 'queued', claimed_at = NULL, claimed_by = NULL
     WHERE status = 'running' AND claimed_at IS NOT NULL AND claimed_at < ?`,
  ).run(cutoff);
}
```

Also update `gdriveSyncQueueAdd` to set `status = 'queued'` and clear claim fields. Optionally store `md5_checksum` column on queue (migration) if enqueue already has md5.

- [ ] **Step 4: Wire workers in `gdriveSyncService.js`**

Replace `gdriveSyncQueueGetNext()` with `gdriveSyncQueueClaimNext(workerId)`. On pause/abort: `gdriveSyncQueueReleaseToQueued`. On `_startQueueWorker`: call `gdriveSyncQueueResetStale()`.

- [ ] **Step 5: Run test — expect PASS; commit**

```bash
git add electron/lib/db/indexDb.js electron/lib/db/__tests__/gdriveQueueClaim.test.js electron/lib/gdrive/gdriveSyncService.js
git commit -m "fix(gdrive): atomic queue claim for concurrent workers"
```

---

### Task 2: Poll discovery for new files

**Files:**
- Create: `electron/lib/gdrive/gdriveDiscovery.js`
- Create: `electron/lib/gdrive/__tests__/gdriveDiscovery.test.js`
- Modify: `electron/lib/gdrive/gdriveSyncService.js` `_runPollSync`

**Interfaces:**
- Produces: `matchChangeToSubscription(change, sub, { manifest, isUnderFolder }) → null | { drivePath, vaultPath }`
- Produces: `buildVaultPath(subVaultPath, relativeDrivePath) → string`
- Consumes: `api.getFile`, subscription list, optional folder-id cache on service

- [ ] **Step 1: Write failing discovery tests**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchChangeToSubscription, buildVaultPath } = require('../gdriveDiscovery');

test('folder sub matches new file when parent is subscription root', () => {
  const sub = { driveId: 'folder1', vaultPath: '/GDrive/Docs/', isFolder: true, enabled: true };
  const change = {
    fileId: 'file9',
    removed: false,
    file: { id: 'file9', name: 'new.pdf', parents: ['folder1'], modifiedTime: 't', size: '10', md5Checksum: 'm' },
  };
  const hit = matchChangeToSubscription(change, sub, { manifest: null, folderIds: new Set(['folder1']) });
  assert.ok(hit);
  assert.equal(hit.vaultPath, '/GDrive/Docs/new.pdf');
});

test('folder sub ignores file outside folder tree', () => {
  const sub = { driveId: 'folder1', vaultPath: '/GDrive/Docs/', isFolder: true };
  const change = {
    fileId: 'x',
    file: { name: 'x.bin', parents: ['other'], modifiedTime: 't', size: '1' },
  };
  assert.equal(
    matchChangeToSubscription(change, sub, { manifest: null, folderIds: new Set(['folder1']) }),
    null,
  );
});
```

- [ ] **Step 2: Implement `gdriveDiscovery.js`**

```javascript
function buildVaultPath(subVaultPath, relativeDrivePath) {
  const base = subVaultPath.endsWith('/') ? subVaultPath : `${subVaultPath}/`;
  const rel = String(relativeDrivePath || '').replace(/^\/+/, '');
  return `${base}${rel}`.replace(/\/+/g, '/');
}

function matchChangeToSubscription(change, sub, { manifest, folderIds }) {
  if (!change?.file || change.removed) return null;
  const file = change.file;
  if (sub.isFolder) {
    if (manifest && String(manifest.vaultPath).startsWith(sub.vaultPath)) {
      return { drivePath: manifest.drivePath, vaultPath: manifest.vaultPath };
    }
    const parents = file.parents || [];
    const under = parents.some((p) => folderIds?.has(p) || p === sub.driveId);
    if (!under) return null;
    // relative path: for root-of-sub parent === sub.driveId → just file.name
    // deeper paths require resolveRelativePath (service supplies drivePath if known)
    const drivePath = file.drivePath || file.name;
    return { drivePath, vaultPath: buildVaultPath(sub.vaultPath, drivePath) };
  }
  if (sub.driveId === (change.fileId || file.id)) {
    return { drivePath: sub.drivePath || file.name, vaultPath: sub.vaultPath };
  }
  return null;
}

module.exports = { matchChangeToSubscription, buildVaultPath };
```

- [ ] **Step 3: Maintain folder id cache on service**

On `addSubscription` for folders and after `scanNow`, store `Set` of folder ids under that subscription in memory (`this._folderIdCache: Map<subDriveId, Set<string>>`). Seed with `sub.driveId`. During recursive scan, add each visited folder id. On poll, if parent not in cache, optionally `getFile` + walk parents until hit sub root or escape (max depth 20); if under sub, add intermediate folder ids to cache and build relative path from names.

Helper on service:

```javascript
async _resolveUnderSubscription(fileMeta, sub) {
  // walk parents via api.getFile until sub.driveId or root; return { drivePath, vaultPath } or null
}
```

- [ ] **Step 4: Rewrite `_runPollSync` loop** to use discovery + enqueue new files; keep skip Google Docs / filter extensions.

- [ ] **Step 5: Tests pass; commit**

```bash
git commit -m "fix(gdrive): discover new files under subscribed folders on poll"
```

---

### Task 3: README one-way wording

**Files:**
- Modify: `README.md` (VI + EN feature bullets)

- [ ] **Step 1: Replace two-way claims**

VI: `Đồng bộ Google Drive một chiều (Drive → TeleVault, chỉ đọc).`  
EN: `One-way Google Drive sync (Drive → TeleVault, read-only).`

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: correct GDrive sync to one-way Drive→Vault"
```

---

## Phase 1 — P1 Performance & Conflict

### Task 4: Manifest md5 + skip before download

**Files:**
- Modify: `electron/lib/db/indexDb.js` — `md5` column on `gdrive_manifest`
- Modify: `electron/lib/gdrive/gdriveSyncService.js` `_syncFile`
- Create: `electron/lib/gdrive/__tests__/md5Skip.test.js` (pure helper if extracted)

**Interfaces:**
- Produces: `shouldSkipDownload({ manifest, driveMd5, vaultEntry }) → boolean`

- [ ] **Step 1: Test**

```javascript
const { shouldSkipDownload } = require('../gdriveDiscovery'); // or gdriveSyncPolicy.js
test('skip when md5 and vault sha match', () => {
  assert.equal(
    shouldSkipDownload({
      manifest: { md5: 'abc', sha256: 's1', size: 10 },
      driveMd5: 'abc',
      vaultEntry: { sha256: 's1', size: 10 },
    }),
    true,
  );
});
```

- [ ] **Step 2: Migrate `gdrive_manifest.md5`, update upsert/get**

- [ ] **Step 3: In `_syncFile`, before `downloadFile`:** if skip → update manifest modifiedTime/md5 and return

- [ ] **Step 4: Commit** `feat(gdrive): skip download when Drive md5 matches vault`

---

### Task 5: Resume download + AbortSignal + stream hash

**Files:**
- Modify: `electron/lib/gdrive/gdriveApi.js` `downloadFile` / `_downloadStream`
- Modify: `electron/lib/gdrive/gdriveSyncService.js` — pass signal, use `sha256Stream`
- Create: `electron/lib/gdrive/__tests__/downloadResume.test.js` (unit-test Range header selection helper)

**Interfaces:**
- Produces: `downloadFile(fileId, fileName, customTempDir, onProgress, { signal, expectedSize })`
- Produces: `getResumeOffset(tempPath, expectedSize) → number`

- [ ] **Step 1: Test resume offset helper**

```javascript
test('resume offset uses existing partial size', () => {
  // write partial file size 50, expected 100 → offset 50
});
```

- [ ] **Step 2: Implement Range download**

```javascript
async downloadFile(fileId, fileName, customTempDir, onProgress, opts = {}) {
  // ...
  const expectedSize = opts.expectedSize || 0;
  let offset = 0;
  if (fs.existsSync(tempPath) && expectedSize > 0) {
    offset = fs.statSync(tempPath).size;
    if (offset >= expectedSize) return tempPath;
  }
  const headers = { Authorization: `Bearer ${token}` };
  if (offset > 0) headers.Range = `bytes=${offset}-`;
  await this._downloadStream(url, token, tempPath, 0, onProgress, { headers, append: offset > 0, signal: opts.signal, existingBytes: offset, expectedSize });
  return tempPath;
}
```

Handle 206 append (`flags: 'a'`), 200 truncate rewrite. On abort → destroy streams, reject `AbortError`. Keep partial on 429 retry.

- [ ] **Step 3: Replace `_sha256Of` with**

```javascript
const { sha256Stream } = require('../vault/streamHash');
async _sha256OfAsync(filePath) {
  return sha256Stream(filePath);
}
```

- [ ] **Step 4: Per-worker AbortController** — map `workerId → controller`; `setPaused(true)` aborts all; on abort release queue to queued

- [ ] **Step 5: Commit** `feat(gdrive): resume downloads and stream hash temp files`

---

### Task 6: Conflict policy

**Files:**
- Create/extend: `electron/lib/gdrive/gdriveDiscovery.js` or `gdriveSyncPolicy.js` — `resolveConflictVaultPath`
- Modify: `gdriveSyncService.js` `_syncFile`
- Modify: IPC + UI for setting
- Modify: `src/i18n/locales.js`

**Interfaces:**
- Produces: `resolveConflictVaultPath({ policy, vaultPath, existingPaths, now }) → { action: 'skip'|'upload', vaultPath }`

- [ ] **Step 1: Tests for keep_both naming**

```javascript
test('keep_both adds conflict date suffix', () => {
  const r = resolveConflictVaultPath({
    policy: 'keep_both',
    vaultPath: '/GDrive/a.pdf',
    existingPaths: ['/GDrive/a.pdf'],
    now: new Date('2026-07-16T00:00:00Z'),
  });
  assert.equal(r.action, 'upload');
  assert.match(r.vaultPath, /conflict 2026-07-16/);
});
```

Use `@televault/core` `uniqueVaultPath` if needed after building desired conflict name.

- [ ] **Step 2: After hashing, if vault exists with different sha:**

```javascript
const policy = this.db.gdriveStateGet('conflict_policy', 'skip');
const decision = resolveConflictVaultPath({ policy, vaultPath, existingPaths: this.db.getAll().map(e => e.path), now: new Date() });
if (decision.action === 'skip') {
  this.db.gdriveSyncErrorAdd({ ..., errorMessage: 'conflict: vault has different content' });
  return;
}
vaultPath = decision.vaultPath; // may change for keep_both
```

- [ ] **Step 3: UI select + IPC get/set state**

- [ ] **Step 4: Commit** `feat(gdrive): conflict policy skip/overwrite/keep_both`

---

## Phase 2 — P2 Lifecycle & UI

### Task 7: Propagate deletes (opt-in)

**Files:**
- Modify: `gdriveSyncService.js` `_runPollSync`
- Modify: UI toggle
- Needs: `vault.trashEntries([messageId])` when entry found by path

- [ ] **Step 1: When `change.removed || change.file?.trashed`:**

```javascript
if (this.db.gdriveStateGet('propagate_deletes', '0') !== '1') continue;
const manifest = this.db.gdriveManifestGet(change.fileId);
if (!manifest) continue;
const entry = this.db.getAll().find(e => e.path === manifest.vaultPath && !isInTrash(e.path));
if (entry) await this.vault.trashEntries([entry.messageId]);
this.db.gdriveManifestDelete(change.fileId);
this.db.gdriveSyncQueueRemove(change.fileId);
```

- [ ] **Step 2: Default off; i18n warning label**

- [ ] **Step 3: Commit** `feat(gdrive): optional trash vault when Drive deletes file`

---

### Task 8: Lifecycle cleanup + sequential retryAll

**Files:**
- Modify: `gdriveSyncService.js` `disconnect`, `removeSubscription`, `retryFile` / retry-all path
- Modify: `indexDb.js` helpers to clear queue/errors by vaultPath prefix

- [ ] **Step 1: `disconnect` clears queue + errors**

- [ ] **Step 2: `removeSubscription` clears related queue/errors/manifest**

- [ ] **Step 3: Retry All awaits each retry sequentially**

- [ ] **Step 4: Commit** `fix(gdrive): clean queue on disconnect and sequential retryAll`

---

### Task 9: Throttle UI + OAuth state verify

**Files:**
- Modify: `gdriveSyncService.js` `getSnapshot` include `throttleInfo`
- Modify: `GDriveSyncScreen.jsx` display concurrency / throttled
- Modify: `gdriveAuth.js` verify `state` query param equals generated state

- [ ] **Step 1: Auth — store pending state; reject callback mismatch**

- [ ] **Step 2: Snapshot:**

```javascript
throttleInfo: {
  concurrency: this.throttleController.getConcurrency(),
  throttled: this.rateLimiter.isThrottled?.() || false,
  stats: this.rateLimiter.getStats?.() || null,
}
```

- [ ] **Step 3: UI show small status line when throttled**

- [ ] **Step 4: Commit** `feat(gdrive): show throttle status and verify OAuth state`

---

## Verification Checklist

- [ ] New file in subscribed folder enqueued after poll without Scan Now
- [ ] Concurrency 3 never double-processes same `drive_file_id`
- [ ] Kill mid-download → resume continues (partial temp grows)
- [ ] Same md5 + vault present → no download
- [ ] Conflict skip records error; keep_both creates new path
- [ ] propagate_deletes off ignores Drive trash
- [ ] Disconnect empties queue
- [ ] README says one-way

---

## Self-Review

**Spec coverage:** Tasks 1–9 map to spec §5.1–5.9 and phases §9.  
**Placeholders:** None.  
**Type consistency:** `gdriveSyncQueueClaimNext`, `matchChangeToSubscription`, `shouldSkipDownload`, `resolveConflictVaultPath` used consistently.

---

## Execution Handoff

**Plan saved to:** `docs/superpowers/plans/2026-07-16-gdrive-sync-harden.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task + review between tasks  
2. **Inline Execution** — execute in this session with checkpoints (start Phase 0 Tasks 1–3)

Which approach?
