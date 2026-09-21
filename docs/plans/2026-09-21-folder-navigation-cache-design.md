# Fast Folder Navigation with SWR In-Memory Cache & Breadcrumb Optimization

## Problem Statement
When navigating folders in the "My Drive" vault:
1. **Perceived Delay & Loading Flash**: Even though all vault file/folder metadata is stored offline in SQLite (`index.db`), navigating into any folder triggers 4 parallel IPC calls (`vault:getListing`, `vault:getTree`, `vault:getStats`, `vault:allFolders`). Each handler performs an unbounded scan of the SQLite database. Furthermore, frontend state immediately wiped folders/files and showed a centered "Đang tải...", producing a jarring flash.
2. **Aggressive Breadcrumb Collapsing**: Folders were collapsed into `…` ellipsis menu at $\ge 4$ crumbs, even on wide desktop screens.
3. **Redundant Reload on Active Crumb**: The current folder crumb was rendered as a clickable button that triggered an unnecessary full reload.

## Technical Architecture

### 1. In-Memory SWR Cache (`useVault.js` & `useSharedVaults.js`)
- An in-memory Map `folderListingCache` stores `{ folders, files, counts, timestamp }` keyed by `${folder}:${sortField}:${sortDirection}`.
- When `goTo(targetFolder)` is called:
  - If `targetFolder === currentFolder`, early-return (no-op).
  - If `cacheKey` exists in `folderListingCache`:
    - Synchronously set `folders`, `files`, `counts` into React state.
    - Set `loading = false`. Result: **0ms instant transition**.
  - If not in cache: set `loading = true` and fetch from IPC.
- SWR Revalidation: In background, fetch fresh listing from backend.
- Cache Invalidation: When `vaultApi.onChanged` fires (file added, moved, deleted, renamed, tags changed), `folderListingCache.clear()` ensures cache consistency.

### 2. IPC Decoupling in `useVault.js`
- Separate `getListing` from `getTree`, `getStats`, and `allFolders`.
- Changing folders ONLY queries `vaultApi.getListing(currentFolder, sortField, sortDirection)`.
- `getTree` only runs when `expandedFolders` changes or on vault change.
- `getStats` and `allFolders` only run on mount or on `vaultApi.onChanged`.
- Reduces SQLite database scans and IPC overhead by ~75%.

### 3. DriveBreadcrumb UX Overhaul (`DriveBreadcrumb.jsx`)
- Collapse threshold relaxed from $\ge 4$ to $\ge 6$.
- The active/current folder crumb is rendered as a non-clickable `<span>` title with `font-semibold text-[var(--gd-text)]`.
- Intermediate crumbs have expanded `max-w-[200px]` with subtle hover styles.
- Ellipsis menu neatly presents collapsed intermediate folders.

### 4. Non-Destructive Loading State (`BrowserScreen.jsx`)
- Do not unmount content if cached items are present during background revalidation.
- Subtle top loading indicator bar shown only when background sync is active.
