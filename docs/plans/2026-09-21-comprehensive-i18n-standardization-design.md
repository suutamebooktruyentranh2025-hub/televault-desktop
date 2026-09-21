# Comprehensive i18n Standardization Design

## Context & Background
During the initial development of the tag filtering enhancements, dialog improvements, and various screens (TransferScreen, Google Drive sync, DriveSidebar, TelegramAuthScreen), several Vietnamese strings were left hardcoded or relied on missing i18n keys with hardcoded fallbacks. When switching language to English, these UI elements remained in Vietnamese or displayed raw/fallback strings.

## Goals
1. Provide 100% bilingual parity (`vi` and `en`) for all user-facing UI labels, placeholders, tooltips, dialogs, badges, and headers.
2. Ensure every `t('key')` call points to a key that exists in both `vi` and `en` in `src/i18n/locales.js`.
3. Fix all hardcoded Vietnamese text across components in `src/`.
4. Maintain backwards compatibility with existing keys and format functions.

---

## Architectural Changes & Key Additions

### 1. Locale Dictionary Extensions (`src/i18n/locales.js`)
Add symmetric keys in both `export const vi` and `export const en`:
- **Tag Combobox & Dialog**:
  - `tagFolderCount`: `'{n} thư mục trong kho lưu trữ'` / `'{n} folders in vault'`
  - `tagFolderMatched`: `'Khớp {n}'` / `'Matched {n}'`
  - `tagCreateNamePlaceholder`: `'ví dụ: Truyện tranh, Tài liệu, Yêu thích...'` / `'e.g. Comics, Documents, Favorites...'`
  - `tagChipTooltip`: `'{tag} ({count}) - Chuột phải để đổi tên / xóa'` / `'{tag} ({count}) - Right click to rename / delete'`
  - `clearAllTags`: `'Bỏ chọn tất cả thẻ'` / `'Deselect all tags'`
  - `searchNoResults`: `'Không tìm thấy thư mục phù hợp'` / `'No matching folders found'`
- **Confirmation & Move Dialogs**:
  - `confirmTitle`: `'Xác nhận thao tác'` / `'Confirm action'`
  - `confirmAction`: `'Xác nhận'` / `'Confirm'`
  - `moving`: `'Đang di chuyển...'` / `'Moving...'`
  - `close`: `'Đóng'` / `'Close'`
- **Sidebar & Account Navigation**:
  - `refreshList`: `'Làm mới danh sách'` / `'Refresh list'`
  - `switchAccount`: `'Chuyển tài khoản'` / `'Switch account'`
  - `addNewAccount`: `'Thêm tài khoản mới'` / `'Add new account'`
  - `signOutDevice`: `'Đăng xuất khỏi thiết bị'` / `'Sign out of device'`
  - `defaultUserName`: `'Người dùng'` / `'User'`
- **BrowserScreen & Row Actions**:
  - `openFolder`: `'Mở thư mục'` / `'Open folder'`
  - `dragItemCount`: `'📁 {count} mục'` / `'📁 {count} items'`
  - `saveToVault`: `'Lưu vào Vault:'` / `'Save to Vault:'`
  - `emptyTrash`: missing in `en`, add `'Trash is empty'`
- **Transfers & Upload Activity**:
  - `transfersStatusRunningBadge`: `'⟳ Đang tải'` / `'⟳ Transferring'`
  - `transfersStatusQueuedBadge`: `'⏳ Đang chờ'` / `'⏳ Queued'`
  - `transfersStatusPausedBadge`: `'⏸ Tạm dừng'` / `'⏸ Paused'`
  - `transfersStatusDoneBadge`: `'✓ Hoàn tất'` / `'✓ Done'`
  - `transfersStatusFailedBadge`: `'✕ Lỗi'` / `'✕ Failed'`
  - `transfersManageTitle`: `'Quản lý truyền tải'` / `'Transfer Manager'`
  - `transfersActiveCount`: `'{n} tệp đang tải'` / `'{n} files transferring'`
  - `transfersDoneCount`: `'{n} đã hoàn tất'` / `'{n} completed'`
  - `transfersFailedCount`: `'{n} lỗi'` / `'{n} failed'`
  - `transfersEmptySubtitle`: `'Không có tệp nào đang truyền tải'` / `'No files currently transferring'`
  - `transfersTabActive`: `'Đang tải ({n})'` / `'Transferring ({n})'`
  - `transfersTabFinished`: `'Đã hoàn tất ({n})'` / `'Completed ({n})'`
  - `transfersClearAll`: `'Xóa tất cả'` / `'Clear all'`
  - `transfersEmptyActive`: `'Không có tệp nào đang tải'` / `'No files transferring'`
  - `transfersEmptyFinished`: `'Chưa có tệp nào hoàn tất'` / `'No files completed'`
  - `transfersColFile`: `'Tên tệp'` / `'File name'`
  - `transfersColProgress`: `'Tiến trình'` / `'Progress'`
  - `transfersColStatus`: `'Trạng thái'` / `'Status'`
  - `transfersActionCancel`: `'Hủy'` / `'Cancel'`
  - `transfersSummaryUploadingAndDownloading`: `'Đang tải lên {uploads}, tải xuống {downloads}'` / `'Uploading {uploads}, downloading {downloads}'`
  - `transfersSummaryUploading`: `'Đang tải lên {n} mục...'` / `'Uploading {n} item(s)...'`
  - `transfersSummaryDownloading`: `'Đang tải xuống {n} mục...'` / `'Downloading {n} item(s)...'`
  - `transfersSummaryDone`: `'Đã hoàn tất {n} mục'` / `'{n} item(s) completed'`
  - `transfersSummaryProgress`: `'Tiến trình đồng bộ'` / `'Sync progress'`
- **Vault Actions & Home Shell**:
  - `deleted`: `'Đã xóa'` / `'Deleted'`
  - `homeReady`: `'Sẵn sàng sử dụng'` / `'Ready to use'`
  - `homeEntryCount`: `'Số lượng mục'` / `'Number of entries'`
- **Telegram Auth**:
  - `authApiErrorRequired`: `'Vui lòng nhập API ID và API Hash từ my.telegram.org'` / `'Please enter API ID and API Hash from my.telegram.org'`
  - `authPhoneLabelWithCode`: `'{label} (CÓ MÃ VÙNG)'` / `'{label} (WITH COUNTRY CODE)'`
  - `authApiConfigTitle`: `'Cấu hình API'` / `'API Configuration'`
  - `authApiConfigDesc`: `'Bắt buộc: Vui lòng đăng ký và nhập API ID cùng API Hash từ my.telegram.org.'` / `'Required: Please register and enter API ID and API Hash from my.telegram.org.'`
  - `authApiIdPlaceholder`: `'VD: 12345678'` / `'e.g. 12345678'`
  - `authApiHashPlaceholder`: `'VD: abcdef1234567890abcdef'` / `'e.g. abcdef1234567890abcdef'`
  - `authChangeApiConfig`: `'Thay đổi cấu hình API (API ID/Hash)'` / `'Change API configuration (API ID/Hash)'`
  - `authWipeAllData`: `'Xóa toàn bộ dữ liệu ứng dụng'` / `'Wipe all application data'`
- **Google Drive Explorer & Tabs**:
  - `gdriveSyncThisFolder`: `'Đồng bộ folder này'` / `'Sync this folder'`
  - `gdriveSyncSubfolders`: `'Đồng bộ cả subfolders'` / `'Sync subfolders as well'`
  - `gdriveOpenInGDrive`: `'Mở trên Google Drive'` / `'Open in Google Drive'`
  - `gdriveSearchFolderPlaceholder`: `'Tìm thư mục...'` / `'Search folders...'`
  - `gdriveFolderTreeLoading`: `'Đang tải cây thư mục...'` / `'Loading folder tree...'`
  - `gdriveSearchFilePlaceholder`: `'Tìm kiếm tệp...'` / `'Search files...'`
  - `gdriveFolderEmptyOrUnscanned`: `'Thư mục trống hoặc chưa quét'` / `'Folder is empty or not yet scanned'`
  - `gdriveColFileName`: `'Tên file'` / `'File name'`
  - `gdriveColSize`: `'Kích thước'` / `'Size'`
  - `gdriveColTime`: `'Thời gian'` / `'Time'`
  - `gdriveColStatus`: `'Trạng thái'` / `'Status'`
  - `gdriveBtnRefresh`: `'Làm mới'` / `'Refresh'`
  - `gdriveBtnSyncFolder`: `'🔄 Đồng bộ folder'` / `'🔄 Sync folder'`
  - `gdriveShowMore`: `'Hiển thị thêm'` / `'Show more'`
  - `gdriveSelectedFilesCount`: `'Đã chọn {n} file'` / `'{n} files selected'`
  - `gdriveBtnDeselect`: `'Bỏ chọn'` / `'Deselect'`
  - `gdriveBtnSelectAll`: `'Chọn tất cả'` / `'Select all'`
  - `gdriveBtnRetrySelected`: `'Thử lại mục đã chọn'` / `'Retry selected'`
  - `gdriveBtnDeleteSelected`: `'Xóa mục đã chọn'` / `'Remove selected'`
  - `gdriveBtnExportCsv`: `'Xuất CSV'` / `'Export CSV'`
  - `gdriveStatsScanningDrive`: `'Đang quét Drive...'` / `'Scanning Drive...'`
  - `gdriveStatsPaused`: `'Đã tạm dừng'` / `'Paused'`
  - `gdriveStatsStartSync`: `'▶ Bắt đầu đồng bộ ({n})'` / `'▶ Start sync ({n})'`
  - `gdriveStatsScanning`: `'Đang quét...'` / `'Scanning...'`
  - `gdriveStatsResume`: `'▶ Tiếp tục'` / `'▶ Resume'`
  - `gdriveStatsPause`: `'⏸ Tạm dừng'` / `'⏸ Pause'`
  - `gdriveStatsIndexing`: `'Đang nạp toàn bộ danh mục Google Drive vào cache...'` / `'Loading full Google Drive directory into cache...'`
  - `gdriveStatsScanningFolder`: `'Đang quét thư mục trên Google Drive...'` / `'Scanning folders on Google Drive...'`
  - `gdriveStatsFilesFound`: `'📄 Đã tìm thấy: {count} file'` / `'📄 Found: {count} files'`
  - `gdriveStatsWaitingFiles`: `'Đang chờ file...'` / `'Waiting for files...'`
  - `gdrivePaginationDisplay`: `'Hiển thị:'` / `'Display:'`
  - `gdrivePaginationRange`: `'{start} - {end} / {total} mục'` / `'{start} - {end} of {total} items'`

---

## Verification Plan
1. Automated Node.js audit script verifying:
   - Every `t('key')` used in `src/` exists in `vi` in `locales.js`.
   - Every `t('key')` used in `src/` exists in `en` in `locales.js`.
   - Symmetry: `vi` and `en` dictionaries have zero missing counterpart keys.
2. Build check: `npm run build` exits 0 without syntax or lint errors.
3. Unit test check: `npm test` passes all tests.
