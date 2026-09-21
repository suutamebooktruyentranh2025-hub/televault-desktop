# Google Drive Cache Explorer Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build a paginated Explorer view in the Google Drive tab displaying all scanned files and folders from the local SQLite cache, complete with real-time sync lifecycle status badges (Synced, Queued, Error, Skipped, Pending), search, filters, summary metrics, and manual re-queue actions.

**Architecture:** A SQLite DAO query performs indexed `LEFT JOIN` operations across `gdrive_cache_nodes`, `gdrive_manifest`, `gdrive_sync_queue`, and `gdrive_sync_errors` to compute status dynamically. IPC handlers expose paginated queries, summary aggregates, and requeue actions. The frontend renders a dedicated "Tệp đã quét" tab with a mini KPI summary bar, filter toolbar, and responsive paginated table.

**Tech Stack:** Node.js, Electron IPC, SQLite (`better-sqlite3`), React 18, Tailwind CSS, Lucide icons.

---

### Task 1: SQLite DAO Methods for Cache Query & Summary

**Files:**
- Modify: `electron/lib/db/indexDb.js`
- Test: `electron/lib/gdrive/__tests__/gdriveCacheQuery.test.js`

**Step 1: Write the failing test**
Create `electron/lib/gdrive/__tests__/gdriveCacheQuery.test.js` testing `gdriveCacheQueryFiles` and `gdriveCacheSummaryStats`.

**Step 2: Run test to verify it fails**
Run: `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/lib/gdrive/__tests__/gdriveCacheQuery.test.js`
Expected: FAIL with functions not defined on db.

**Step 3: Implement DAO functions in indexDb.js**
Add `gdriveCacheQueryFiles({ search, status, isFolder, limit, offset, sortBy, sortOrder })` and `gdriveCacheSummaryStats()` in `electron/lib/db/indexDb.js`.

**Step 4: Run test to verify it passes**
Run: `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/lib/gdrive/__tests__/gdriveCacheQuery.test.js`
Expected: PASS.

**Step 5: Commit**
`git add electron/lib/db/indexDb.js electron/lib/gdrive/__tests__/gdriveCacheQuery.test.js`
`git commit -m "feat(db): add gdriveCacheQueryFiles and gdriveCacheSummaryStats DAO methods"`

---

### Task 2: IPC Handlers & Preload Bridge

**Files:**
- Modify: `electron/lib/ipc/gdriveHandlers.js`
- Modify: `electron/preload.js`
- Test: `electron/lib/gdrive/__tests__/gdriveCacheIpc.test.js`

**Step 1: Write the failing test**
Create `electron/lib/gdrive/__tests__/gdriveCacheIpc.test.js` testing requeue logic and cache query through IPC handlers.

**Step 2: Run test to verify it fails**
Run: `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/lib/gdrive/__tests__/gdriveCacheIpc.test.js`
Expected: FAIL.

**Step 3: Implement IPC handlers and Preload methods**
Register `gdrive:queryCacheFiles`, `gdrive:getCacheSummary`, `gdrive:requeueCacheFile`, `gdrive:requeueAllPending` in `gdriveHandlers.js` and expose in `preload.js`.

**Step 4: Run test to verify it passes**
Run: `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/lib/gdrive/__tests__/gdriveCacheIpc.test.js`
Expected: PASS.

**Step 5: Commit**
`git add electron/lib/ipc/gdriveHandlers.js electron/preload.js electron/lib/gdrive/__tests__/gdriveCacheIpc.test.js`
`git commit -m "feat(gdrive): add cache query and requeue IPC handlers"`

---

### Task 3: Frontend State Hook & Localization

**Files:**
- Create: `src/screens/gdrive/useGDriveCacheExplorer.js`
- Modify: `src/screens/gdrive/useGDriveSyncState.js`
- Modify: `src/i18n/locales.js`

**Step 1: Add i18n keys for Cache Explorer**
Add localized labels (Vi & En) for tab name, search placeholder, status badges, column headers, and action buttons in `src/i18n/locales.js`.

**Step 2: Implement useGDriveCacheExplorer hook**
Handles query parameters (`page`, `limit`, `search`, `status`, `isFolder`), debounced search, loading states, cache summary fetching, and re-enqueue calls.

**Step 3: Integrate into useGDriveSyncState**
Expose cache explorer state and wire `gdrive:changed` listener to trigger debounced re-fetch when sync state changes.

**Step 4: Commit**
`git add src/screens/gdrive/useGDriveCacheExplorer.js src/screens/gdrive/useGDriveSyncState.js src/i18n/locales.js`
`git commit -m "feat(ui): add useGDriveCacheExplorer hook and i18n keys"`

---

### Task 4: Frontend UI Components & Tab Integration

**Files:**
- Create: `src/screens/gdrive/components/GDriveCacheSummaryBar.jsx`
- Create: `src/screens/gdrive/components/GDriveCacheTable.jsx`
- Create: `src/screens/gdrive/tabs/GDriveCacheExplorerTab.jsx`
- Modify: `src/screens/gdrive/index.jsx`

**Step 1: Create GDriveCacheSummaryBar**
Render 4 KPI metric cards (Total scanned, Synced to Telegram %, Pending count, Error count).

**Step 2: Create GDriveCacheTable**
Render toolbar (search, status filter, type filter, sync all pending button), responsive table rows with status badges, and pagination controls.

**Step 3: Create GDriveCacheExplorerTab & Mount in GDriveSyncScreen**
Integrate components into `GDriveCacheExplorerTab.jsx`, add tab button `Tệp đã quét` in `src/screens/gdrive/index.jsx`.

**Step 4: Commit**
`git add src/screens/gdrive/components/GDriveCacheSummaryBar.jsx src/screens/gdrive/components/GDriveCacheTable.jsx src/screens/gdrive/tabs/GDriveCacheExplorerTab.jsx src/screens/gdrive/index.jsx`
`git commit -m "feat(ui): implement GDriveCacheExplorerTab with summary bar and table"`

---

### Task 5: System Verification & Production Build

**Files:**
- None (verification phase)

**Step 1: Run all unit tests**
Run: `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/lib/gdrive/__tests__/*.test.js`
Expected: ALL PASS.

**Step 2: Run core test suite**
Run: `npm test`
Expected: ALL PASS.

**Step 3: Run production Vite build**
Run: `npm run build`
Expected: Build succeeds with 0 errors.

**Step 4: Update task tracker**
Update `docs/plans/task.md`.

**Step 5: Commit**
`git add docs/plans/task.md`
`git commit -m "chore: complete gdrive cache explorer implementation"`
