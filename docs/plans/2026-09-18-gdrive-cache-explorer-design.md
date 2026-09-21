# Google Drive Cache Explorer & Status Engine Design

**Date:** 2026-09-18  
**Topic:** Scanned Files & Folders Explorer with Real-Time Sync Statuses

---

## 1. Problem Statement & Motivation
Currently, TeleVault scans Google Drive folders and files into a local SQLite cache table (`gdrive_cache_nodes`) for instant diffing and incremental syncing. However, users can only see items actively in the queue, recently synced history items, or failed files in the error tab. There is no unified view to inspect:
- All folders and files discovered on Google Drive.
- The lifecycle sync status of each file (whether it has already been synced to Telegram, is currently in queue, pending sync, skipped due to filters, or encountered an error).
- Selective actions to re-enqueue pending or error files directly from this view.
- Comprehensive search, filter, and export capabilities.

---

## 2. Architecture & Status Engine

### 2.1 Status Lifecycle Matrix
Every file/folder in `gdrive_cache_nodes` is evaluated against operational tables (`gdrive_manifest`, `gdrive_sync_queue`, `gdrive_sync_errors`) via SQLite queries:

| Status Code | Label | Evaluation Rules | UI Badge |
| :--- | :--- | :--- | :--- |
| `synced` | Đã đồng bộ | Present in `gdrive_manifest` (uploaded to Telegram Vault) | 🟢 Green (`bg-emerald-500/10 text-emerald-500`) |
| `queued` | Đang chờ / Đang tải | Present in `gdrive_sync_queue` (waiting in queue or in-flight transfer) | 🟡 Amber (`bg-amber-500/10 text-amber-500`) |
| `error` | Lỗi đồng bộ | Present in `gdrive_sync_errors` (failed upload, retry limit, >2GB, etc.) | 🔴 Red (`bg-red-500/10 text-red-500`) |
| `skipped` | Bỏ qua | Non-folder Google Workspace doc (`application/vnd.google-apps.*`) or matches `ignored_extensions` | ⚪ Gray (`bg-zinc-500/10 text-zinc-400`) |
| `trashed` | Thùng rác | `trashed = 1` in Drive cache | 🗑️ Rose (`bg-rose-500/10 text-rose-400`) |
| `pending` | Chưa đồng bộ | Normal file/folder not yet queued or synced | 🔵 Sky (`bg-sky-500/10 text-sky-500 border border-dashed`) |

### 2.2 Database Query Optimization
In `electron/lib/db/indexDb.js`:
- `gdriveCacheQueryFiles({ search, status, isFolder, limit, offset, sortBy, sortOrder })`:
  Uses a `LEFT JOIN` between `gdrive_cache_nodes` and `gdrive_manifest`, `gdrive_sync_queue`, `gdrive_sync_errors`.
  Filters on `search` (matching `c.name LIKE ? OR c.drive_path LIKE ?`), `status`, and `isFolder`.
  Supports indexed pagination (`LIMIT ? OFFSET ?`).
- `gdriveCacheSummaryStats()`:
  Calculates aggregate counts and sizes (`totalFiles`, `totalFolders`, `syncedCount`, `pendingCount`, `queuedCount`, `errorCount`, `skippedCount`, `totalSizeBytes`, `syncedSizeBytes`).

---

## 3. User Interface Design

### 3.1 Tab Integration
In `src/screens/gdrive/index.jsx`:
- Add a 4th tab header button: `Tệp đã quét ({cacheSummary.totalFiles})`.
- Keyboard and tab switching state managed cleanly in `useGDriveSyncState.js`.

### 3.2 Mini Dashboard (Summary Bar)
Displays 4 compact stat cards at the top of the tab:
1. **Tổng số tệp / thư mục**: Total count + formatted total bytes.
2. **Đã đồng bộ lên Telegram**: Count + percentage badge (e.g., `85%`) + progress bar.
3. **Chưa đồng bộ**: Count of pending files.
4. **Lỗi / Bỏ qua**: Count of error items (red indicator) and skipped files.

### 3.3 Toolbar & Filter Controls
- **Instant Search Input**: Debounced search by file name or path segment.
- **Status Filter Dropdown**: `Tất cả` | `Chưa đồng bộ` | `Đã đồng bộ` | `Trong hàng đợi` | `Lỗi` | `Bỏ qua`.
- **Type Filter Dropdown**: `Tất cả` | `Chỉ tệp` | `Chỉ thư mục`.
- **Action Buttons**:
  - `Đồng bộ tất cả file chưa tải`: Queues all `pending` files matching active subscriptions.
  - `Xuất CSV`: Exports filtered or complete cache list to a CSV file.

### 3.4 Paginated Table View
- **Columns**:
  1. **Tên & Biểu tượng**: File/folder icon based on extension/folder flag, filename, parent folder context.
  2. **Đường dẫn Drive**: Full canonical path (e.g., `/Truyện/Manga/Chap01.cbz`).
  3. **Kích thước**: Human-readable size (KB, MB, GB; `-` for folders).
  4. **Ngày sửa đổi**: ISO date formatted locally.
  5. **Trạng thái**: Visual badge with tooltip (shows specific error message if status is `error`).
  6. **Thao tác**:
     - *Đồng bộ*: Enqueues individual file if pending or error.
     - *Mở Drive*: Opens the file directly in Google Drive web via default browser.
- **Pagination Bar**: Page navigation (Previous, Next, Page X of Y, Page size selector 50 / 100 / 200).

---

## 4. IPC Communication Layer
- `gdrive:queryCacheFiles`: Calls `db.gdriveCacheQueryFiles(params)` and returns `{ items, total }`.
- `gdrive:getCacheSummary`: Calls `db.gdriveCacheSummaryStats()` and returns summary counts and sizes.
- `gdrive:requeueCacheFile`: Takes `{ driveFileId }`, resolves metadata from cache, and inserts into `gdrive_sync_queue`.
- `gdrive:requeueAllPending`: Finds all pending files under active subscriptions and adds them to `gdrive_sync_queue`.
- `gdrive:exportCacheCsv`: Formats cache records as CSV string and saves via system save dialog.

---

## 5. Verification & Testing Strategy
1. **Unit Tests (Backend & DB)**:
   - Verify `gdriveCacheQueryFiles` with various filter combinations (`status`, `search`, `isFolder`).
   - Verify `gdriveCacheSummaryStats` accuracy with mock nodes across all statuses.
   - Verify `requeueCacheFile` correctly populates `gdrive_sync_queue`.
2. **IPC Integration Tests**:
   - Verify IPC handlers return expected data formats without hanging.
3. **Frontend Compilation & Build Verification**:
   - Ensure Vite builds cleanly without linter or typing errors.
