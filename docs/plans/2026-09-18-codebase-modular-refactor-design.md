# TeleVault Desktop — Thiết kế Tái Cấu Trúc Mã Nguồn Theo Domain (Modular Refactoring Design)

## 1. Mục tiêu và Phạm vi (Goals & Scope)

TeleVault Desktop đang đối mặt với một số file monolithic (có kích thước từ 900 đến hơn 1.600 dòng mã nguồn):
- `GDriveSyncScreen.jsx` (~83KB, 1.650 dòng)
- `gdriveSyncService.js` (~55KB, 1.512 dòng)
- `VaultShell.jsx` (~36KB, 981 dòng)
- `vaultHandlers.js` (~34KB, 926 dòng)
- `vaultService.js` (~33KB, 890 dòng)

Mục tiêu của kế hoạch refactor này là:
1. **Chia tách triệt để các file lớn** thành các sub-module, sub-component và custom hook nhỏ gọn (mỗi file duy trì dưới 300 dòng, tuân thủ Single Responsibility Principle).
2. **Tiến hành theo Domain/Tính năng (Feature-based Phases)**:
   - **Phase 1**: Domain Google Drive Sync (Backend Service & Frontend UI Screen).
   - **Phase 2**: Domain Vault Core (Backend IPC Handlers & Frontend Shell UI).
3. **Zero Breaking Changes**:
   - Giữ nguyên 100% IPC API signature trong `preload.js` và các kênh IPC `ipcMain`/`ipcRenderer`.
   - Giữ nguyên cấu trúc database SQLite `better-sqlite3`.
   - Giữ nguyên toàn bộ behavior, styling Tailwind và trải nghiệm người dùng.
   - Toàn bộ suite test hiện tại (`npm run test:all`, `node --test electron/lib/vault/__tests__/*.test.js`) phải luôn pass ở mỗi bước.

---

## 2. Kiến trúc chi tiết — Phase 1: Google Drive Sync Domain

### 2.1. Backend (`electron/lib/gdrive/`)
Áp dụng **Facade Pattern** để `gdriveSyncService.js` đóng vai trò là entrypoint ổn định cho IPC handlers:

```
electron/lib/gdrive/
├── gdriveSyncService.js          # Facade (~150 dòng), duy trì interface cho IPC
├── gdriveQueueWorker.js          # Quản lý hàng đợi sync, worker concurrency, pause/resume, flood wait
├── gdriveFileDownloader.js       # Streaming download từ Drive API, throttle & stream SHA256 integrity
├── gdriveFileUploader.js         # Upload file đã tải lên Vault (personal hoặc shared target)
├── gdriveScanner.js              # Polling định kỳ, quét thay đổi (Changes API), subscription matching
├── gdriveAuth.js                 # (Đã có) Quản lý OAuth2 credentials & tokens
├── gdriveApi.js                  # (Đã có) Wrapper Google Drive REST API
├── gdriveDiscovery.js            # (Đã có) Quy tắc matching, phân loại path, skip rules
├── gdriveProgressImport.js       # (Đã có) Import/export tiến trình manifest
└── syncThrottleController.js     # (Đã có) Điều phối tốc độ tải
```

#### Trách nhiệm từng module con:
- **`GDriveQueueWorker`**:
  - Sở hữu vòng lặp xử lý items từ bảng `gdrive_sync_queue`.
  - Quản lý `_activeWorkers`, `_workerControllers` (Map các `AbortController` theo item id để hủy khi cần).
  - Tự động ngưng worker khi gặp `_telegramFloodUntil` (Telegram flood wait).
- **`GDriveFileDownloader`**:
  - Nhận task từ QueueWorker, gọi `GDriveApi.downloadFileStream()`.
  - Kết nối với `SyncThrottleController` và `createSpeedTracker` để theo dõi tốc độ truyền (`speedBps`).
  - Ghi file tạm vào cache thư mục và tính toán mã băm `sha256Stream` song song.
- **`GDriveFileUploader`**:
  - Đẩy file tạm đã hash lên Telegram Vault (`vaultService.uploadFile`).
  - Hỗ trợ đổi kênh đích nếu người dùng cấu hình `sync_target_chat_id`.
  - Cập nhật trạng thái item trong database sang `synced` và xóa file tạm.
- **`GDriveScanner`**:
  - Quản lý `_pollTimer` theo `_pollIntervalMs`.
  - Gọi Google Drive Changes API hoặc Scan Subscription thư mục.
  - Sử dụng `gdriveDiscovery` để lọc file rác/file đã tồn tại và ghi vào `gdrive_sync_queue`.
- **`GDriveSyncService` (Facade)**:
  - Khởi tạo và liên kết các sub-module trên.
  - Cung cấp các methods: `startPolling()`, `stopPolling()`, `scanNow()`, `getStatus()`, `pause()`, `resume()`, `requeueErrors()`, `setSyncTargetChatId()`, v.v.

---

### 2.2. Frontend (`src/screens/gdrive/`)
Chia tách `GDriveSyncScreen.jsx` thành module có cấu trúc:

```
src/screens/gdrive/
├── index.jsx                     # Entrypoint điều phối layout, header & tab switching
├── useGDriveSyncState.js         # Custom hook gom toàn bộ state, IPC events, subscriptions
├── components/
│   ├── GDriveStatsBar.jsx        # Thẻ thông số: Pending, Synced, Speed, Trạng thái kết nối
│   ├── GDriveQueueRow.jsx        # Row hiển thị trong hàng đợi (memoized tối ưu render)
│   └── GDriveSharedSettings.jsx  # Toggle & field helper components
└── tabs/
    ├── GDriveQueueTab.jsx        # Bảng hàng đợi, thanh tiến trình file đang tải, thao tác hàng loạt
    ├── GDriveSubscriptionsTab.jsx# Danh sách thư mục Drive đang theo dõi + mở picker
    ├── GDriveErrorsTab.jsx       # Bảng file bị lỗi và nút Thử lại (retry sequentially)
    ├── GDriveHistoryTab.jsx      # Bảng file đã đồng bộ thành công
    └── GDriveSettingsTab.jsx     # Form Client ID/Secret, Sync Target Vault, Poll interval, Import/Export
```

Giữ file shim `src/screens/GDriveSyncScreen.jsx` trỏ sang `src/screens/gdrive/index.jsx` để không làm thay đổi bất kỳ import nào trong [VaultShell.jsx](file:///Users/admin/Documents/Projects/televault-desktop/src/components/VaultShell.jsx).

---

## 3. Kiến trúc chi tiết — Phase 2: Core Vault Domain

### 3.1. Backend (`electron/lib/ipc/vault/`)
Tách `vaultHandlers.js` (926 dòng) thành các module IPC chuyên biệt:

```
electron/lib/ipc/vault/
├── index.js                      # Đăng ký tập trung tất cả vault handlers vào ipcMain
├── browseHandlers.js             # vault:getListing, vault:getTree, vault:listAllFolders, vault:search
├── fileOpHandlers.js             # vault:createFolder, vault:rename, vault:delete, vault:restore, vault:move, vault:setTags
├── transferHandlers.js           # vault:download, vault:uploadFiles, vault:exportZip, vault:exportFolder, vault:reveal
├── duplicateHandlers.js          # vault:scanDuplicates, vault:resolveDuplicates
└── dashboardHandlers.js          # vault:getDashboardStats, vault:getCacheStatus, vault:clearCache
```

`electron/lib/ipc/vaultHandlers.js` đóng vai trò re-export `registerVaultHandlers` trỏ vào `electron/lib/ipc/vault/index.js`.

---

### 3.2. Frontend (`src/components/VaultShell.jsx`)
Trích xuất state và handlers phân tán ra các custom hooks:

```
src/hooks/vault/
├── useVaultSelection.js          # Quản lý selectedIds, selectedFolders, range selection (Shift/Ctrl), Select All
├── useVaultNavigation.js         # Thư mục hiện tại, lịch sử back/forward, tích hợp tìm kiếm
└── useVaultActions.js            # Các action từ Context Menu & Toolbar (xóa vĩnh viễn, đổi tên, move dialog, v.v.)
```

Và tách các sub-components hỗ trợ:
- `src/components/VaultActionBar.jsx`: Thanh công cụ thao tác khi có item được chọn (Move, Tag, Download, Delete).
- `src/components/VaultDropZone.jsx`: Xử lý overlay kéo thả file vào thư mục.

`VaultShell.jsx` chỉ còn đóng vai trò kết nối layout chính: Sidebar + TopBar + Breadcrumb + Content Screen.

---

## 4. Kế hoạch Kiểm tra & Xác minh (Verification Plan)

1. **Automated Tests**:
   - `npm run test:all` (Chạy toàn bộ `@televault/core` tests: tree, duplicate scanner, caption codec, move targets).
   - `node --test electron/lib/vault/__tests__/*.test.js` (Chạy các bài test Vault: stream hash, cache eviction, part files, split planner, shared vault).
   - `node --test electron/lib/gdrive/__tests__/*.test.js` (Chạy các bài test GDrive nếu có).
2. **Build Verification**:
   - `npm run build` (Kiểm tra Vite build cho Renderer, bảo đảm không có lỗi cú pháp hoặc sai đường dẫn import).
3. **Behavioral Integrity**:
   - Khởi động dev app và kiểm tra:
     - Màn hình GDrive Sync hiển thị đầy đủ các tab, thông số, hàng đợi.
     - Vault Shell duyệt thư mục, chọn file, context menu và navigation mượt mà.
