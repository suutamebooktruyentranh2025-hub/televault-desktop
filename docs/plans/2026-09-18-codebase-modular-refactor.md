# Codebase Modular Refactoring Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Tách nhỏ các file monolithic (>900 đến 1.650 dòng) gồm `GDriveSyncScreen.jsx`, `gdriveSyncService.js`, `vaultHandlers.js`, và `VaultShell.jsx` thành các module, sub-component và custom hooks chuyên biệt (<300 dòng/file), bảo đảm 100% tương thích ngược và giữ nguyên toàn bộ IPC contract.

**Architecture:** Áp dụng Facade Pattern cho Backend (mỗi domain service có entrypoint Facade mỏng duy trì IPC interface, ủy thác logic cho các sub-services chuyên biệt) và Container/Presenter + Custom Hooks Pattern cho Frontend (màn hình tách thành hook quản lý state, các tab và sub-components hiển thị).

**Tech Stack:** Electron 34, React 19, Vite, better-sqlite3, Tailwind CSS v4, Node.js Test Runner.

---

### Task 1: Decompose `gdriveSyncService.js` into Modular Backend Sub-services

**Files:**
- Create: `electron/lib/gdrive/gdriveFileDownloader.js`
- Create: `electron/lib/gdrive/gdriveFileUploader.js`
- Create: `electron/lib/gdrive/gdriveQueueWorker.js`
- Create: `electron/lib/gdrive/gdriveScanner.js`
- Modify: `electron/lib/gdrive/gdriveSyncService.js`

**Step 1: Trích xuất `gdriveFileDownloader.js`**
Tạo module chịu trách nhiệm tải stream file từ Drive, tích hợp `SyncThrottleController`, tính toán tốc độ `createSpeedTracker`, và hash `sha256Stream`.

**Step 2: Trích xuất `gdriveFileUploader.js`**
Tạo module chịu trách nhiệm đẩy file đã tải lên Vault channel tương ứng (`resolveVault` cho shared target hoặc `vault` cho personal), quản lý tiến trình upload và xóa file tạm.

**Step 3: Trích xuất `gdriveQueueWorker.js`**
Tạo module quản lý concurrency, vòng lặp xử lý items từ `gdrive_sync_queue`, xử lý `_telegramFloodUntil` (sleep khi gặp Telegram flood), và quản lý map `_workerControllers`.

**Step 4: Trích xuất `gdriveScanner.js`**
Tạo module quản lý timer polling (`_pollTimer`), quét Changes API và subscriptions, khớp quy tắc lọc file và nạp vào hàng đợi.

**Step 5: Refactor `gdriveSyncService.js` thành Facade mỏng**
Kết nối các sub-modules trên, giữ nguyên toàn bộ public interface (`startPolling`, `stopPolling`, `scanNow`, `getStatus`, `pause`, `resume`, `requeueErrors`, v.v.).

**Step 6: Xác minh Backend GDrive**
Run: `npm run test:all && node --test electron/lib/vault/__tests__/*.test.js`
Expected: Tất cả 59 tests đều PASS.

**Step 7: Commit**
Run: `git add electron/lib/gdrive/ && git commit -m "refactor(gdrive): decompose gdriveSyncService into modular sub-services"`

---

### Task 2: Decompose `GDriveSyncScreen.jsx` into Modular Frontend Components & Hooks

**Files:**
- Create: `src/screens/gdrive/useGDriveSyncState.js`
- Create: `src/screens/gdrive/components/GDriveQueueRow.jsx`
- Create: `src/screens/gdrive/components/GDriveStatsBar.jsx`
- Create: `src/screens/gdrive/components/GDriveSharedSettings.jsx`
- Create: `src/screens/gdrive/tabs/GDriveQueueTab.jsx`
- Create: `src/screens/gdrive/tabs/GDriveSubscriptionsTab.jsx`
- Create: `src/screens/gdrive/tabs/GDriveErrorsTab.jsx`
- Create: `src/screens/gdrive/tabs/GDriveHistoryTab.jsx`
- Create: `src/screens/gdrive/tabs/GDriveSettingsTab.jsx`
- Create: `src/screens/gdrive/index.jsx`
- Modify: `src/screens/GDriveSyncScreen.jsx` (trở thành re-export shim)

**Step 1: Tạo `useGDriveSyncState.js`**
Tách toàn bộ logic quản lý state, listener IPC (`gdrive:syncProgress`, `gdrive:syncStatusChanged`), các hàm gọi API sang custom hook.

**Step 2: Tạo các UI components dùng chung**
Trích xuất `GDriveQueueRow` (memoized), `GDriveStatsBar`, `GDriveSharedSettings` (SettingsToggle, SettingsField).

**Step 3: Tạo các Tab độc lập**
Tách từng phần giao diện vào các tab tương ứng: `GDriveQueueTab`, `GDriveSubscriptionsTab`, `GDriveErrorsTab`, `GDriveHistoryTab`, `GDriveSettingsTab`.

**Step 4: Hoàn thiện `src/screens/gdrive/index.jsx` & re-export shim**
Ghép các tab vào container chính và cập nhật `src/screens/GDriveSyncScreen.jsx` để export component từ `src/screens/gdrive/index.jsx`.

**Step 5: Xác minh Renderer build**
Run: `npm run build`
Expected: Build thành công không có lỗi syntax hay import.

**Step 6: Commit**
Run: `git add src/screens/gdrive/ src/screens/GDriveSyncScreen.jsx && git commit -m "refactor(ui): decompose GDriveSyncScreen into modular tabs and hooks"`

---

### Task 3: Decompose `vaultHandlers.js` into Modular IPC Handlers

**Files:**
- Create: `electron/lib/ipc/vault/browseHandlers.js`
- Create: `electron/lib/ipc/vault/fileOpHandlers.js`
- Create: `electron/lib/ipc/vault/transferHandlers.js`
- Create: `electron/lib/ipc/vault/duplicateHandlers.js`
- Create: `electron/lib/ipc/vault/dashboardHandlers.js`
- Create: `electron/lib/ipc/vault/index.js`
- Modify: `electron/lib/ipc/vaultHandlers.js`

**Step 1: Tạo `browseHandlers.js`**
Chuyển các handler liên quan đến duyệt thư mục và cây thư mục (`vault:getListing`, `vault:getTree`, `vault:listAllFolders`).

**Step 2: Tạo `fileOpHandlers.js`**
Chuyển các handler thao tác file và thư mục (`vault:createFolder`, `vault:rename`, `vault:delete`, `vault:restore`, `vault:move`, `vault:setTags`).

**Step 3: Tạo `transferHandlers.js`**
Chuyển các handler tải về, upload và xuất dữ liệu (`vault:download`, `vault:uploadFiles`, `vault:exportZip`, `vault:exportFolder`, `vault:reveal`).

**Step 4: Tạo `duplicateHandlers.js` & `dashboardHandlers.js`**
Chuyển các handler quét trùng lặp (`vault:scanDuplicates`, `vault:resolveDuplicates`) và dashboard/cache (`vault:getDashboardStats`, `vault:getCacheStatus`, `vault:clearCache`).

**Step 5: Đăng ký tập trung tại `electron/lib/ipc/vault/index.js`**
Kết nối tất cả handlers vào hàm `registerVaultHandlers` và ủy thác từ `electron/lib/ipc/vaultHandlers.js`.

**Step 6: Xác minh Backend Vault**
Run: `npm run test:all && node --test electron/lib/vault/__tests__/*.test.js`
Expected: Tất cả 59 tests đều PASS.

**Step 7: Commit**
Run: `git add electron/lib/ipc/vault/ electron/lib/ipc/vaultHandlers.js && git commit -m "refactor(ipc): split vaultHandlers into dedicated domain handler modules"`

---

### Task 4: Decompose `VaultShell.jsx` into Specialized Hooks & Sub-components

**Files:**
- Create: `src/hooks/vault/useVaultSelection.js`
- Create: `src/hooks/vault/useVaultNavigation.js`
- Create: `src/hooks/vault/useVaultActions.js`
- Modify: `src/components/VaultShell.jsx`

**Step 1: Tạo `useVaultSelection.js`**
Đóng gói state `selectedIds`, `selectedFolders`, `lastSelectedKey`, cùng các hàm chọn đơn, chọn dải (Shift), chọn kèm (Ctrl/Cmd) và Select All.

**Step 2: Tạo `useVaultNavigation.js`**
Đóng gói state điều hướng (section, current folder path, history, search query, search mode).

**Step 3: Tạo `useVaultActions.js`**
Đóng gói các handlers tương tác (xóa vào thùng rác, khôi phục, xóa vĩnh viễn, mở dialog đổi tên, gắn tag, move dialog).

**Step 4: Tinh gọn `VaultShell.jsx`**
Sử dụng các hook trên, giữ cho file `VaultShell.jsx` chỉ còn là layout container mỏng (<350 dòng) điều phối Sidebar, TopBar, Breadcrumb, Screen và Dialogs.

**Step 5: Xác minh toàn diện**
Run: `npm run build && npm run test:all && node --test electron/lib/vault/__tests__/*.test.js`
Expected: Build thành công và 100% tests PASS.

**Step 6: Commit**
Run: `git add src/hooks/vault/ src/components/VaultShell.jsx && git commit -m "refactor(ui): streamline VaultShell with custom hooks"`
