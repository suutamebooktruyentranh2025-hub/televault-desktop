# Google Drive Multi-Part Parallel Download Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Accelerate Google Drive file downloads by implementing multi-part concurrent chunk downloading with HTTP Range requests for large files (>= 20 MB).

**Architecture:** Split files into parallel byte chunks (`Range: bytes=start-end`), preallocate the local file using `fs.ftruncateSync`, stream chunks directly to disk at designated byte offsets using random-access write streams, aggregate real-time progress across workers, and verify file integrity upon completion.

**Tech Stack:** Node.js `https`, `crypto`, `fs`, `node:test`.

---

### Task 1: Chunk Planner & Range Calculation

**Files:**
- Create: `electron/lib/gdrive/gdriveParallelDownloader.js`
- Test: `electron/lib/gdrive/__tests__/parallelDownloader.test.js`

**Step 1: Write the failing test**
Create test cases in `parallelDownloader.test.js` verifying:
- File size < 20MB returns null or single chunk (no parallelization needed).
- File size 100MB splits into 4 chunks with correct start/end offsets (contiguous byte ranges covering 0 to size - 1).
- Small chunks (< minChunkSize 5MB) do not exceed concurrency limits.

**Step 2: Run test to verify it fails**
Run: `node --test electron/lib/gdrive/__tests__/parallelDownloader.test.js`

**Step 3: Write minimal implementation**
Implement `calculateDownloadChunks(fileSize, opts)` in `electron/lib/gdrive/gdriveParallelDownloader.js`.

**Step 4: Run test to verify it passes**
Run: `node --test electron/lib/gdrive/__tests__/parallelDownloader.test.js`

---

### Task 2: Single Chunk Range Downloader with Write Stream

**Files:**
- Modify: `electron/lib/gdrive/gdriveParallelDownloader.js`
- Test: `electron/lib/gdrive/__tests__/parallelDownloader.test.js`

**Step 1: Write the failing test**
Add tests for `downloadChunk`:
- Downloads a byte range (e.g., 0-49, 50-99) into preallocated file at offset using `flags: 'r+'`.
- Reports chunk-level progress.
- Respects `AbortSignal`.

**Step 2: Run test to verify it fails**
Run: `node --test electron/lib/gdrive/__tests__/parallelDownloader.test.js`

**Step 3: Implement `downloadChunk`**
Write `downloadChunk({ url, token, destPath, start, end, signal, onProgress, agent })` with retry logic for network blips.

**Step 4: Run test to verify it passes**
Run: `node --test electron/lib/gdrive/__tests__/parallelDownloader.test.js`

---

### Task 3: Multi-Part Coordinator & Fallback

**Files:**
- Modify: `electron/lib/gdrive/gdriveParallelDownloader.js`
- Test: `electron/lib/gdrive/__tests__/parallelDownloader.test.js`

**Step 1: Write the failing test**
Add tests for `downloadParallel`:
- Preallocates destination file using `allocateFile`.
- Concurrently downloads all chunks and computes aggregated progress.
- Detects non-206 response on first chunk and signals single-stream fallback.

**Step 2: Run test to verify it fails**
Run: `node --test electron/lib/gdrive/__tests__/parallelDownloader.test.js`

**Step 3: Implement `downloadParallel`**
Orchestrate concurrent worker promises via `Promise.all` with aggregate progress tracking and cleanup.

**Step 4: Run test to verify it passes**
Run: `node --test electron/lib/gdrive/__tests__/parallelDownloader.test.js`

---

### Task 4: Integrate with `GDriveApi.downloadFile`

**Files:**
- Modify: `electron/lib/gdrive/gdriveApi.js`
- Test: `electron/lib/gdrive/__tests__/downloadResume.test.js`

**Step 1: Update `downloadFile` logic**
In `gdriveApi.js`:
- If `expected_size >= PARALLEL_DOWNLOAD_THRESHOLD` (20 MB) and not resuming a partial download:
  - Delegate to `downloadParallel`.
  - Fallback to `_downloadStream` if range request fails or is unsupported.
- Maintain existing verification via `verifyDownloadedFile`.

**Step 2: Run download test suite**
Run: `node --test electron/lib/gdrive/__tests__/downloadResume.test.js`
Run: `node --test electron/lib/gdrive/__tests__/parallelDownloader.test.js`

---

### Task 5: Full Regression & Build Verification

**Files:**
- Verify: Entire codebase tests & Vite build

**Step 1: Run all backend tests**
Run: `npm run test:all`
Run: `node --test electron/lib/gdrive/__tests__/*.test.js`

**Step 2: Run frontend build**
Run: `npm run build`
