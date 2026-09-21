# Google Drive Local Metadata Cache & Delta Sync Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a SQLite-backed local metadata cache (`gdrive_cache_nodes`) for Google Drive with flat batch ingestion, path materialization, incremental delta sync via Changes API, and offline subscription matching.

**Architecture:** Drive metadata is ingested in bulk (1000 items/request), stored in SQLite with normalized NFC paths, kept updated with delta tokens, and queried locally to eliminate redundant network roundtrips during scans.

**Tech Stack:** Node.js, Electron, SQLite (better-sqlite3 via indexDb), Google Drive REST API v3.

---

### Task 1: Schema & SQLite DAO for `gdrive_cache_nodes`

**Files:**
- Modify: `electron/lib/db/indexDb.js:70-130, 715-770`
- Test: `electron/lib/gdrive/__tests__/gdriveCacheDb.test.js`

**Step 1: Write the failing test**
Create `electron/lib/gdrive/__tests__/gdriveCacheDb.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');

test('gdrive_cache_nodes schema and DAO operations', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-cache-db-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);
    assert.equal(typeof db.gdriveCacheNodesUpsertBatch, 'function');
    assert.equal(typeof db.gdriveCacheNodesGet, 'function');
    assert.equal(typeof db.gdriveCacheNodesQuerySubtree, 'function');

    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'f1',
        parentId: 'root',
        name: 'Report.pdf',
        mimeType: 'application/pdf',
        isFolder: 0,
        size: 1024,
        modifiedTime: '2026-09-18T10:00:00Z',
        md5Checksum: 'abc123md5',
        trashed: 0,
        shortcutTargetId: null,
        drivePath: '/Report.pdf',
      },
    ]);

    const node = db.gdriveCacheNodesGet('f1');
    assert.equal(node.name, 'Report.pdf');
    assert.equal(node.drivePath, '/Report.pdf');
    assert.equal(node.size, 1024);

    const subtree = db.gdriveCacheNodesQuerySubtree('/');
    assert.equal(subtree.length, 1);
    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

**Step 2: Run test to verify it fails**
Run: `node --test electron/lib/gdrive/__tests__/gdriveCacheDb.test.js`
Expected: FAIL with `db.gdriveCacheNodesUpsertBatch is not a function`.

**Step 3: Implement minimal schema and methods in `indexDb.js`**
Add table creation `gdrive_cache_nodes` and DAO methods:
- `gdriveCacheNodesUpsertBatch(nodes)`
- `gdriveCacheNodesGet(id)`
- `gdriveCacheNodesDelete(id)`
- `gdriveCacheNodesSetTrashed(id, trashed)`
- `gdriveCacheNodesQuerySubtree(pathPrefix)`
- `gdriveCacheNodesCount()`
- `gdriveCacheNodesClear()`

**Step 4: Run test to verify it passes**
Run: `node --test electron/lib/gdrive/__tests__/gdriveCacheDb.test.js`
Expected: PASS.

**Step 5: Commit**
```bash
git add electron/lib/db/indexDb.js electron/lib/gdrive/__tests__/gdriveCacheDb.test.js
git commit -m "feat(db): add gdrive_cache_nodes table and DAO methods"
```

---

### Task 2: Path Materialization & Flat Batch Ingestor

**Files:**
- Create: `electron/lib/gdrive/gdriveCacheIndexer.js`
- Test: `electron/lib/gdrive/__tests__/gdriveCacheIndexer.test.js`

**Step 1: Write the failing test**
Create `electron/lib/gdrive/__tests__/gdriveCacheIndexer.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { materializePaths } = require('../gdriveCacheIndexer');

test('materializePaths builds clean NFC paths and resolves duplicate names', () => {
  const nodes = [
    { id: 'dir1', parentId: 'root', name: 'Truyện', isFolder: 1 },
    { id: 'dir2', parentId: 'dir1', name: 'Manga', isFolder: 1 },
    { id: 'f1', parentId: 'dir2', name: 'Chapter 1.cbz', isFolder: 0 },
    { id: 'f2', parentId: 'dir2', name: 'Chapter 1.cbz', isFolder: 0 }, // duplicate name
  ];

  const materialized = materializePaths(nodes);
  assert.equal(materialized.get('dir1').drivePath, '/Truyện/');
  assert.equal(materialized.get('dir2').drivePath, '/Truyện/Manga/');
  assert.equal(materialized.get('f1').drivePath, '/Truyện/Manga/Chapter 1.cbz');
  assert.equal(materialized.get('f2').drivePath, '/Truyện/Manga/Chapter 1 (1).cbz');
});
```

**Step 2: Run test to verify it fails**
Run: `node --test electron/lib/gdrive/__tests__/gdriveCacheIndexer.test.js`
Expected: FAIL with "Cannot find module '../gdriveCacheIndexer'".

**Step 3: Implement `materializePaths` and `fetchFullIndex` in `gdriveCacheIndexer.js`**
- Normalize string with `normalize('NFC')`.
- Build parent-to-children index.
- Compute paths with disambiguation suffixes `(1)`, `(2)`.
- Export `materializePaths` and `fetchFullIndex(api, db, onProgress)`.

**Step 4: Run test to verify it passes**
Run: `node --test electron/lib/gdrive/__tests__/gdriveCacheIndexer.test.js`
Expected: PASS.

**Step 5: Commit**
```bash
git add electron/lib/gdrive/gdriveCacheIndexer.js electron/lib/gdrive/__tests__/gdriveCacheIndexer.test.js
git commit -m "feat(gdrive): implement path materialization and flat batch indexing"
```

---

### Task 3: Incremental Delta Processor via Changes API

**Files:**
- Create: `electron/lib/gdrive/gdriveCacheDelta.js`
- Test: `electron/lib/gdrive/__tests__/gdriveCacheDelta.test.js`

**Step 1: Write the failing test**
Create `electron/lib/gdrive/__tests__/gdriveCacheDelta.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyChangesToCache } = require('../gdriveCacheDelta');

test('applyChangesToCache updates, deletes and trashes nodes', () => {
  const cacheMap = new Map([
    ['f1', { id: 'f1', parentId: 'root', name: 'file1.txt', drivePath: '/file1.txt', trashed: 0 }],
  ]);
  const mockDb = {
    gdriveCacheNodesGet: (id) => cacheMap.get(id),
    gdriveCacheNodesUpsertBatch: (nodes) => nodes.forEach((n) => cacheMap.set(n.id, n)),
    gdriveCacheNodesSetTrashed: (id, t) => {
      const node = cacheMap.get(id);
      if (node) node.trashed = t;
    },
    gdriveCacheNodesDelete: (id) => cacheMap.delete(id),
  };

  const changes = [
    { fileId: 'f1', removed: true },
    { fileId: 'f2', removed: false, file: { id: 'f2', name: 'file2.txt', parents: ['root'], size: 500, mimeType: 'text/plain' } },
  ];

  applyChangesToCache(changes, mockDb);
  assert.equal(cacheMap.has('f1'), false);
  assert.equal(cacheMap.has('f2'), true);
});
```

**Step 2: Run test to verify it fails**
Run: `node --test electron/lib/gdrive/__tests__/gdriveCacheDelta.test.js`
Expected: FAIL with "Cannot find module '../gdriveCacheDelta'".

**Step 3: Implement `applyChangesToCache` in `gdriveCacheDelta.js`**
- Process `removed: true` and `trashed: true`.
- Insert/update new items and calculate their paths.
- Handle 410 Gone recovery helper.

**Step 4: Run test to verify it passes**
Run: `node --test electron/lib/gdrive/__tests__/gdriveCacheDelta.test.js`
Expected: PASS.

**Step 5: Commit**
```bash
git add electron/lib/gdrive/gdriveCacheDelta.js electron/lib/gdrive/__tests__/gdriveCacheDelta.test.js
git commit -m "feat(gdrive): implement incremental changes delta processor"
```

---

### Task 4: Integrate Cache Engine into Scanner & Discovery

**Files:**
- Modify: `electron/lib/gdrive/gdriveScanner.js`
- Modify: `electron/lib/gdrive/gdriveDiscovery.js`
- Test: `electron/lib/gdrive/__tests__/gdriveDiscovery.test.js`

**Step 1: Write tests for local cache query matching**
Add tests verifying that querying active subscriptions against `gdrive_cache_nodes` matches files and enqueues only unsynced or modified files.

**Step 2: Run test to verify behavior**
Run: `node --test electron/lib/gdrive/__tests__/gdriveDiscovery.test.js`

**Step 3: Update `gdriveScanner.js`**
- When `scanNow()` runs:
  - If `cache_status !== 'ready'`: run `fetchFullIndex(api, db, onProgress)`.
  - Then match local subscription paths directly in SQLite:
    `const files = db.gdriveCacheNodesQuerySubtree(sub.drivePath);`
  - Push matching items into `gdrive_sync_queue`.
- When `_runPollSync()` runs:
  - Fetch `api.getChanges(pageToken)`.
  - Apply changes via `applyChangesToCache`.
  - Re-evaluate active subscriptions in SQLite and enqueue diffs.
  - If 410 is encountered, reset `changes_page_token` and re-index smoothly.

**Step 4: Run test suite to verify no regressions**
Run:
```bash
node --test electron/lib/gdrive/__tests__/apiRateLimiter.test.js electron/lib/gdrive/__tests__/conflictPolicy.test.js electron/lib/gdrive/__tests__/downloadIntegrity.test.js electron/lib/gdrive/__tests__/downloadResume.test.js electron/lib/gdrive/__tests__/gdriveAuthState.test.js electron/lib/gdrive/__tests__/gdriveDiscovery.test.js electron/lib/gdrive/__tests__/lifecycleCleanup.test.js
```
Expected: All tests PASS.

**Step 5: Commit**
```bash
git add electron/lib/gdrive/gdriveScanner.js electron/lib/gdrive/gdriveDiscovery.js
git commit -m "feat(gdrive): integrate local cache indexing into scanner and polling loop"
```

---

### Task 5: System Verification & Frontend Compilation

**Files:**
- Verify: `npm run build`
- Verify: `npm test`
- Update: `docs/plans/task.md`

**Step 1: Run frontend build**
Run: `npm run build`
Expected: 0 errors, Vite bundle completes cleanly.

**Step 2: Run all core and unit tests**
Run: `npm test`
Expected: 44 tests PASS.

**Step 3: Commit tracker and final documentation**
```bash
git add docs/plans/task.md
git commit -m "chore: complete Google Drive local metadata cache implementation"
```
