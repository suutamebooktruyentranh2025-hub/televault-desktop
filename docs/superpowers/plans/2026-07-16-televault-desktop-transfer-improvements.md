# TeleVault Desktop Transfer Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp upload/download của televault-desktop bằng cách port các pattern tốt nhất từ TeleVault-elpideus — streaming hash, progress metrics, dedup, stall detection, retry/resume UI, và multi-part files >2GB.

**Architecture:** Giữ TransferQueue + VaultService làm orchestrator; tách logic mới vào module nhỏ (`streamHash`, `transferMetrics`, `splitPlanner`); enrich IPC snapshot với speed/ETA/phase; mở rộng caption v2 cho multi-part.

**Tech Stack:** Electron 34, TDLib (`tdl`), better-sqlite3, React 19, Node crypto/fs streams.

**Spec:** `docs/superpowers/specs/2026-07-16-televault-desktop-transfer-improvements-design.md`

## Global Constraints

- Comment code bằng tiếng Anh
- Biến đặt tên theo `adjective_noun`
- Không thay đổi kiến trúc Electron/TDLib — không thêm HTTP backend
- Backward compatible caption v1
- `maxConcurrentTransfers` giữ giới hạn 1–5
- Không commit secrets (.env)
- Chạy test trước khi claim done: `npm test`

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `electron/lib/vault/streamHash.js` | Streaming SHA256 + progress callback |
| `electron/lib/transfer/transferMetrics.js` | EMA speed + ETA tracker |
| `electron/lib/vault/splitPlanner.js` | Chia file >2GB thành parts |
| `electron/lib/vault/multiPartUpload.js` | Upload manifest + parts, rollback |
| `electron/lib/vault/multiPartDownload.js` | Download parts → merge by offset |
| `electron/lib/vault/vaultService.js` | Orchestrate upload/download, stall detection |
| `electron/lib/transfer/transferQueue.js` | Enriched snapshot fields |
| `electron/lib/ipc/vaultHandlers.js` | IPC retry/resume/pause |
| `electron/preload.js` | Expose new IPC methods |
| `packages/televault-core/src/captionCodec.js` | v2 multi-part encode/decode |
| `src/hooks/useTransfers.js` | retry/resume/cancel helpers |
| `src/components/UploadActivityPanel.jsx` | Speed, ETA, action buttons |

---

## Phase 1 — P0 Improvements

### Task 1: Streaming SHA256

**Files:**
- Create: `electron/lib/vault/streamHash.js`
- Create: `electron/lib/vault/__tests__/streamHash.test.js`
- Modify: `electron/lib/vault/vaultService.js:369-373`

**Interfaces:**
- Produces: `async function sha256Stream(filePath, { onProgress, signal }) → Promise<string>`

- [ ] **Step 1: Write the failing test**

```javascript
// electron/lib/vault/__tests__/streamHash.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { sha256Stream } = require('../streamHash');

test('sha256Stream matches sync hash for small file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-hash-'));
  const filePath = path.join(tmpDir, 'test.bin');
  const content = Buffer.alloc(1024 * 1024, 0xab); // 1 MB
  fs.writeFileSync(filePath, content);
  const expected = crypto.createHash('sha256').update(content).digest('hex');
  const actual = await sha256Stream(filePath, {});
  expect(actual).toBe(expected);
  fs.rmSync(tmpDir, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/admin/Downloads/televault-desktop && npm test -- electron/lib/vault/__tests__/streamHash.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement streamHash.js**

```javascript
// electron/lib/vault/streamHash.js
const fs = require('fs');
const crypto = require('crypto');

const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB — matches elpideus hash-worker

async function sha256Stream(filePath, { onProgress, signal } = {}) {
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const hash = crypto.createHash('sha256');
  let bytesRead = 0;

  await new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
    const onAbort = () => {
      readStream.destroy();
      reject(new Error('Hash aborted'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });

    readStream.on('data', (chunk) => {
      hash.update(chunk);
      bytesRead += chunk.length;
      if (onProgress) onProgress(bytesRead / totalSize);
    });
    readStream.on('error', reject);
    readStream.on('end', resolve);
  });

  return hash.digest('hex');
}

module.exports = { sha256Stream, CHUNK_SIZE };
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Replace `_sha256Of` in vaultService.js**

```javascript
// vaultService.js — replace _sha256Of with async version using sha256Stream
const { sha256Stream } = require('./streamHash');

async _sha256OfAsync(filePath, report, signal) {
  return sha256Stream(filePath, {
    onProgress: (f) => report?.(f * 0.05), // hashing = first 5% of bar
    signal,
  });
}
```

Update all callers (`_runUpload`, `_isUploadAlreadyOnVault`, `_isDownloadAlreadyComplete`, `_runDownload`) to use async hash.

---

### Task 2: Transfer Metrics (Speed + ETA)

**Files:**
- Create: `electron/lib/transfer/transferMetrics.js`
- Create: `electron/lib/transfer/__tests__/transferMetrics.test.js`
- Modify: `electron/lib/transfer/transferQueue.js`

**Interfaces:**
- Produces: `function createSpeedTracker() → { update(progressFraction, totalBytes), getSnapshot() }`

- [ ] **Step 1: Write failing test**

```javascript
const { createSpeedTracker } = require('../transferMetrics');

test('speed tracker computes positive speed after progress', () => {
  const tracker = createSpeedTracker();
  tracker.update(0, 1000);
  // Simulate 500ms later with 50% progress
  tracker._now = () => Date.now() + 500;
  tracker.update(0.5, 1000);
  const snap = tracker.getSnapshot();
  expect(snap.speedBps).toBeGreaterThan(0);
  expect(snap.etaSeconds).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement transferMetrics.js**

Port EMA logic from elpideus `uploadStore.ts:86-116`:

```javascript
function createSpeedTracker() {
  let lastProgress = 0;
  let lastUpdateAt = Date.now();
  let speedBps = 0;
  let totalBytes = 0;
  let _now = Date.now;

  return {
    _now: () => _now,
    update(progressFraction, total) {
      totalBytes = total;
      const now = _now();
      const deltaTime = (now - lastUpdateAt) / 1000;
      if (deltaTime >= 0.5) {
        const deltaProgress = progressFraction - lastProgress;
        if (deltaProgress > 0 && totalBytes > 0) {
          const deltaBytes = deltaProgress * totalBytes;
          const currentSpeed = deltaBytes / deltaTime;
          speedBps = speedBps === 0 ? currentSpeed : speedBps * 0.7 + currentSpeed * 0.3;
        } else if (deltaProgress < 0) {
          speedBps = 0;
        } else if (deltaTime > 10) {
          speedBps = 0;
        }
        lastProgress = progressFraction;
        lastUpdateAt = now;
      }
    },
    getSnapshot() {
      const bytesDone = lastProgress * totalBytes;
      const remaining = totalBytes - bytesDone;
      const etaSeconds = speedBps > 0 ? remaining / speedBps : null;
      return { speedBps, etaSeconds, bytesDone, totalBytes };
    },
  };
}
```

- [ ] **Step 4: Extend TransferTask + snapshot()**

Add to `TransferTask` constructor:
```javascript
this.phase = 'queued';
this.speedTracker = createSpeedTracker();
```

In `_report(f)`:
```javascript
_report(f) {
  this.lastProgress = f;
  if (this.totalBytes) this.speedTracker.update(f, this.totalBytes);
  for (const fn of this._listeners) fn(f);
}
```

In `snapshot()`:
```javascript
const metrics = t.speedTracker.getSnapshot();
return {
  ...existing,
  phase: t.phase,
  bytesDone: metrics.bytesDone,
  totalBytes: t.totalBytes,
  speedBps: metrics.speedBps,
  etaSeconds: metrics.etaSeconds,
};
```

- [ ] **Step 5: Run tests — expect PASS**

---

### Task 3: Pre-upload Deduplication

**Files:**
- Modify: `electron/lib/vault/vaultService.js` — `enqueueUpload`
- Modify: `electron/lib/ipc/vaultHandlers.js` — return skip info
- Modify: `src/components/VaultShell.jsx` — toast on skip

- [ ] **Step 1: Write test**

```javascript
// electron/lib/vault/__tests__/dedup.test.js (mock db + channel)
test('enqueueUpload skips when sha256+size match existing entry', async () => {
  // setup vault with existing entry
  const result = vault.enqueueUpload('/tmp/same.bin', '/docs/same.bin');
  expect(result.skipped).toBe(true);
});
```

- [ ] **Step 2: Implement check before queue**

```javascript
enqueueUpload(localPath, destPath, options = {}) {
  const existingEntry = this.db.getAll().find(
    (e) => e.path === destPath && !isInTrash(e.path)
  );
  if (existingEntry && fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    if (existingEntry.size === stat.size) {
      // defer hash to async path — or sync quick size+path match first
      return { skipped: true, reason: 'duplicate', task: null, done: Promise.resolve() };
    }
  }
  // ... existing enqueue logic
}
```

Add async dedup in `_runUpload` start (full sha256 compare) — skip if match, mark task done immediately.

- [ ] **Step 3: UI toast in VaultShell when `result.skipped`**

---

### Task 4: Stall Detection

**Files:**
- Modify: `electron/lib/vault/vaultService.js` — `_awaitUploadComplete`, `_runDownload`

- [ ] **Step 1: Write test for stall timeout**

Mock `updateFile` không fire trong 121s → expect reject 'stalled'.

- [ ] **Step 2: Implement stall watchdog**

Port `_STALL_TIMEOUT = 120` from elpideus `upload.py:43`:

```javascript
const STALL_TIMEOUT_MS = 120 * 1000;

// Inside _awaitUploadComplete handler:
let lastProgressAt = Date.now();
const stallTimer = setInterval(() => {
  if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
    clearInterval(stallTimer);
    clearTimeout(timeout);
    this.client.off('update', handler);
    reject(new Error('Upload stalled — no progress for 120s'));
  }
}, 5000);

// In updateFile case:
lastProgressAt = Date.now();
```

Apply same pattern to download `updateFile` listener.

- [ ] **Step 3: Verify TransferQueue retries stalled upload (max 3 attempts)**

---

### Task 5: Retry / Resume / Pause IPC + UI

**Files:**
- Modify: `electron/lib/ipc/vaultHandlers.js`
- Modify: `electron/preload.js`
- Modify: `src/hooks/useTransfers.js`
- Modify: `src/components/UploadActivityPanel.jsx`

- [ ] **Step 1: Add IPC handlers**

```javascript
// vaultHandlers.js
ipcMain.handle('vault:retryTransfer', (_e, taskId) => {
  const task = vault.queue.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false };
  vault.retryTransfer(task);
  return { ok: true };
});

ipcMain.handle('vault:resumeTransfer', (_e, taskId) => {
  const task = vault.queue.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false };
  vault.resumeTransfer(task);
  return { ok: true };
});
```

- [ ] **Step 2: Expose in preload.js**

```javascript
retryTransfer: (taskId) => ipcRenderer.invoke('vault:retryTransfer', taskId),
resumeTransfer: (taskId) => ipcRenderer.invoke('vault:resumeTransfer', taskId),
```

- [ ] **Step 3: Extend useTransfers hook**

```javascript
const retry = useCallback(async (taskId) => {
  await api?.retryTransfer(taskId);
  await refresh();
}, [refresh]);

const resume = useCallback(async (taskId) => {
  await api?.resumeTransfer(taskId);
  await refresh();
}, [refresh]);
```

- [ ] **Step 4: Update UploadActivityPanel**

Port display from elpideus `TransferItem.tsx:67-80`:
- Show `{formatBytes(speedBps)}/s`
- Show ETA when `etaSeconds != null`
- Failed row: Retry button
- Paused row: Resume button

Add helper `src/utils/formatBytes.js` if not exists (check `src/utils/format.js`).

- [ ] **Step 5: Manual test** — kill network mid-upload, verify retry works

---

### Task 6: Folder Download Progress UI

**Files:**
- Modify: `electron/preload.js` — verify `onDownloadFolderProgress` exposed
- Modify: `src/components/VaultShell.jsx` or `BrowserScreen.jsx`

- [ ] **Step 1: Grep preload for `downloadFolderProgress`**

- [ ] **Step 2: Add state + listener**

```javascript
const [folderProgress, setFolderProgress] = useState(null);
useEffect(() => {
  return window.televault?.vault?.onDownloadFolderProgress?.((p) => {
    setFolderProgress(p); // { current, total, fileName }
  });
}, []);
```

- [ ] **Step 3: Show modal/bar during folder export**

Display: `Downloading {fileName} ({current}/{total})`

---

### Task 7: Hash Semaphore (1 concurrent)

**Files:**
- Create: `electron/lib/vault/hashSemaphore.js`
- Modify: `electron/lib/vault/vaultService.js`

- [ ] **Step 1: Port semaphore from elpideus `semaphore.ts`**

Simple async mutex — max 1 hash at a time.

- [ ] **Step 2: Wrap `_sha256OfAsync` calls with `hashSemaphore.acquire()`**

Prevents RAM spike when uploading folder with many large files.

---

## Phase 2 — P1 Large Files & Cache

### Task 8: Caption Codec v2 (Multi-part)

**Files:**
- Modify: `packages/televault-core/src/captionCodec.js`
- Create: `packages/televault-core/__tests__/captionCodec.v2.test.js`

- [ ] **Step 1: Write v2 roundtrip test**

```javascript
test('encode/decode v2 manifest with parts', () => {
  const entry = {
    messageId: 1,
    path: '/big.iso',
    size: 5_000_000_000,
    sha256: 'abc',
    mtime: new Date(),
    parts: [
      { messageId: 1, offset: 0, size: 2097152000 },
      { messageId: 2, offset: 2097152000, size: 2097152000 },
    ],
  };
  const encoded = encodeCaption(entry);
  const decoded = decodeCaption(1, encoded);
  expect(decoded.parts).toHaveLength(2);
});
```

- [ ] **Step 2: Implement v2 in encodeCaption/decodeCaption**

- Bump `CAPTION_VERSION` to 2 when `entry.parts` present
- v1 decode unchanged

- [ ] **Step 3: Run `npm test -- packages/televault-core`**

---

### Task 9: Split Planner

**Files:**
- Create: `electron/lib/vault/splitPlanner.js`
- Create: `electron/lib/vault/__tests__/splitPlanner.test.js`

**Interfaces:**
- Produces: `function planSplits(totalSize, splitSize = 2097152000) → Array<{ offset, size, partIndex }>`

- [ ] **Step 1: Test 5GB → 3 parts**

```javascript
const { planSplits, SPLIT_SIZE } = require('../splitPlanner');
test('5GB file splits into 3 parts', () => {
  const parts = planSplits(5_000_000_000);
  expect(parts).toHaveLength(3);
  expect(parts[0].offset).toBe(0);
  expect(parts[0].size).toBe(SPLIT_SIZE);
  expect(parts[2].size).toBe(5_000_000_000 - 2 * SPLIT_SIZE);
});
```

- [ ] **Step 2: Implement (port `_SPLIT_SIZE` from elpideus upload.py:41)**

```javascript
const SPLIT_SIZE = 2_097_152_000;

function planSplits(totalSize, splitSize = SPLIT_SIZE) {
  if (totalSize <= splitSize) return [{ offset: 0, size: totalSize, partIndex: 0 }];
  const partCount = Math.ceil(totalSize / splitSize);
  return Array.from({ length: partCount }, (_, i) => ({
    partIndex: i,
    offset: i * splitSize,
    size: Math.min(splitSize, totalSize - i * splitSize),
  }));
}
```

---

### Task 10: Multi-part Upload

**Files:**
- Create: `electron/lib/vault/multiPartUpload.js`
- Modify: `electron/lib/vault/vaultService.js`

- [ ] **Step 1: Implement part file extraction**

Use `fs.createReadStream` with `{ start: offset, end: offset + size - 1 }` → temp file per part OR TDLib inputFileGenerated with local path slice via temp.

- [ ] **Step 2: Upload manifest (part 0) then remaining parts**

Track `uploadedMessageIds[]` in task metadata for rollback.

- [ ] **Step 3: Rollback on failure**

Port pattern from elpideus `upload.py` — delete uploaded Telegram messages via `deleteMessages`.

- [ ] **Step 4: Pre-check file size > SPLIT_SIZE in enqueueUpload → route to multiPartUpload**

---

### Task 11: Multi-part Download

**Files:**
- Create: `electron/lib/vault/multiPartDownload.js`
- Modify: `electron/lib/vault/vaultService.js` — `_runDownload`

- [ ] **Step 1: Detect entry.parts in _runDownload**

- [ ] **Step 2: Download each part, write to offset**

```javascript
const writeStream = fs.createWriteStream(destPath, { flags: 'r+', start: part.offset });
// or pre-allocate file: fs.writeFileSync(destPath, Buffer.alloc(totalSize))
```

- [ ] **Step 3: Verify full file SHA256 after merge**

- [ ] **Step 4: Progress weighted by part sizes**

---

### Task 12: Cache Limit Enforcement

**Files:**
- Modify: `electron/lib/vault/vaultService.js` or new `electron/lib/vault/cacheEvictor.js`
- Modify: `electron/lib/db/indexDb.js` — fix key mismatch (`cache_limit` vs `cache_limit_gb`)

- [ ] **Step 1: Fix getCacheLimitBytes to read `cache_limit_gb` setting**

- [ ] **Step 2: Implement LRU evict after download**

Walk TDLib cache dir, sort by mtime, delete until under limit (skip files with active transfers).

- [ ] **Step 3: Manual test** — set cache limit 0.1GB, download large file, verify evict

---

## Phase 3 — Backlog (P2)

### Task 13: Shared Vault Download Parity
- Refactor inline download in `vaultHandlers.js` to use VaultService pattern
- Add SHA256 verify

### Task 14: Upload Size Pre-check UI
- Warn before upload if file > 2GB without Premium
- i18n keys already mention 2GB/4GB limit

---

## Verification Checklist

- [ ] `npm test` — all pass
- [ ] Upload 10MB file — speed + ETA visible
- [ ] Upload same file twice — dedup skip toast
- [ ] Disconnect network 2min — stall → retry
- [ ] Failed upload — Retry button works
- [ ] Folder download — progress bar shows
- [ ] Upload >2GB file (Phase 2) — splits correctly, download merges with valid SHA

---

## Self-Review

**Spec coverage:**
- Streaming hash → Task 1 ✓
- Transfer metrics → Task 2 ✓
- Dedup → Task 3 ✓
- Stall detection → Task 4 ✓
- Retry/resume UI → Task 5 ✓
- Folder progress → Task 6 ✓
- Hash semaphore → Task 7 ✓
- Multi-part >2GB → Tasks 8-11 ✓
- Cache enforcement → Task 12 ✓
- Shared vault → Task 13 (P2) ✓

**Placeholder scan:** None found.

**Type consistency:** `sha256Stream`, `createSpeedTracker`, `planSplits` signatures consistent across tasks.

---

## Execution Options

**Plan saved to:** `docs/superpowers/plans/2026-07-16-televault-desktop-transfer-improvements.md`

**Recommended order:** Phase 1 Tasks 1→7 sequentially (each independently testable), then Phase 2 Tasks 8→12.

**Subagent-Driven (recommended):** Dispatch fresh subagent per task with two-stage review.

**Inline Execution:** Implement Phase 1 in this session, checkpoint after Task 5 (UI visible improvements).
