# Kế Hoạch Triển Khai: Hiển Thị Tiến Độ Xoá & Dọn Dẹp Thùng Rác

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Hiển thị tiến trình trực quan (% và số lượng tệp) khi chuyển vào thùng rác hoặc xoá vĩnh viễn/dọn dẹp thùng rác, đồng thời cung cấp tính năng 1-click "Dọn sạch thùng rác" an toàn và tiện lợi.

**Architecture:** Bổ sung cơ chế broadcast tiến độ cho `trashEntries` và gộp folder message IDs cho `deletePermanent` ở Backend Electron. Lắng nghe các sự kiện tiến độ trong `useVaultActions.js` và render thanh tiến trình cùng thông tin số đếm chi tiết trên `DriveSelectionBar.jsx`. Thêm nút "Dọn sạch thùng rác" trên thanh header của Thùng rác trong `VaultContentArea.jsx`.

**Tech Stack:** React 19, Electron IPC, Tailwind CSS, i18n (`src/i18n/locales.js`).

---

### Task 1: Khai báo i18n Song Ngữ Đối Xứng Trong `src/i18n/locales.js`

**Files:**
- Modify: `src/i18n/locales.js`

**Chi tiết:**
Bổ sung các key mới cho cả `vi` và `en` đảm bảo đối xứng 100%:
- `emptyTrashButton`: 'Dọn sạch thùng rác' / 'Empty trash'
- `confirmEmptyTrashTitle`: 'Dọn sạch thùng rác' / 'Empty trash'
- `confirmEmptyTrashDesc`: 'Bạn có chắc chắn muốn xóa vĩnh viễn tất cả tệp và thư mục trong Thùng rác không? Hành động này không thể hoàn tác.' / 'Are you sure you want to permanently delete all files and folders in Trash? This action cannot be undone.'
- `emptyTrashSuccess`: 'Đã dọn sạch thùng rác' / 'Trash emptied successfully'
- `deleteForeverProgressCount`: 'Đang xóa vĩnh viễn… {done}/{total} ({percent}%)' / 'Deleting permanently… {done}/{total} ({percent}%)'
- `trashProgressCount`: 'Đang chuyển vào thùng rác… {done}/{total} ({percent}%)' / 'Moving to trash… {done}/{total} ({percent}%)'
- `emptyTrashTooltip`: 'Xóa vĩnh viễn toàn bộ mục trong Thùng rác' / 'Permanently delete all items in Trash'

---

### Task 2: Backend - Bổ sung broadcast tiến độ cho Trash, gộp Message IDs cho Folder Delete & Thêm API `vault:emptyTrash`

**Files:**
- Modify: `electron/lib/vault/vaultService.js`
- Modify: `electron/lib/ipc/vault/vaultShared.js`
- Modify: `electron/lib/ipc/vault/fileOpHandlers.js`
- Modify: `electron/preload.js`
- Modify: `preload.js`

**Chi tiết:**
1. Trong `vaultShared.js`: Thêm hàm `broadcastTrashProgress(payload)` phát sự kiện IPC `vault:trashProgress`.
2. Trong `vaultService.js`:
   - `trashEntries(messageIds, onProgress)`: gọi `onProgress({ done, total, percent })` sau mỗi tin nhắn được đổi caption sang trash.
   - Thêm phương thức `emptyTrash(onProgress)`: quét tất cả entries bắt đầu bằng `.trash/`, gộp messageId và gọi `deleteEntries` để xoá hàng loạt có tiến độ.
3. Trong `fileOpHandlers.js`:
   - `vault:trash`: truyền callback tiến độ gọi `broadcastTrashProgress(p)`.
   - `vault:deletePermanent`: gom các messageId từ `folders` thông qua `planFolderDelete` đưa vào `vault.deleteEntries` để tiến độ tính chuẩn xác toàn bộ tệp bên trong thư mục.
   - Thêm handler `vault:emptyTrash`: gọi `vault.emptyTrash(progress => broadcastDeleteProgress(progress))`.
4. Trong `electron/preload.js` và `preload.js`:
   - Expose `onTrashProgress: (callback) => ...`
   - Expose `emptyTrash: () => ipcRenderer.invoke('vault:emptyTrash')`.

---

### Task 3: Frontend Hook - Tích hợp Tiến độ & Thao tác Dọn Thùng Rác vào `useVaultActions.js`

**Files:**
- Modify: `src/hooks/vault/useVaultActions.js`

**Chi tiết:**
1. Khai báo state:
   - `deleteProgress`: `{ done: 0, total: 0, percent: 0 }` hoặc `null`.
   - `trashProgress`: `{ done: 0, total: 0, percent: 0 }` hoặc `null`.
   - `trashBusy`: boolean.
2. Hook `useEffect` lắng nghe `vaultApi?.onDeleteProgress` và `vaultApi?.onTrashProgress`.
3. Cập nhật `handleTrashSelected`: bật `trashBusy = true`, hiển thị tiến độ và dọn dẹp sau khi xong.
4. Bổ sung hàm `handleEmptyTrash()`:
   - Gọi `confirm(t('confirmEmptyTrashDesc'))`.
   - Nếu xác nhận: bật `set_delete_forever_busy(true)`, gọi `vaultApi?.emptyTrash()`, hiển thị toast `emptyTrashSuccess`.
5. Return các state và handlers mới: `trashBusy`, `trashProgress`, `deleteProgress`, `handleEmptyTrash`.

---

### Task 4: UI - Hiển thị Tiến trình chi tiết trên `DriveSelectionBar.jsx`

**Files:**
- Modify: `src/components/DriveSelectionBar.jsx`
- Modify: `src/components/VaultShell.jsx`

**Chi tiết:**
1. Trong `DriveSelectionBar.jsx`:
   - Nhận thêm props: `deleteProgress`, `trashBusy`, `trashProgress`.
   - Khi `deleteForeverBusy`: hiển thị text tiến trình rõ ràng:
     `deleteProgress?.total ? t('deleteForeverProgressCount', { done: deleteProgress.done, total: deleteProgress.total, percent: deleteProgress.percent }) : t('deleteForeverProgress')`.
   - Khi `trashBusy`: hiển thị text tiến trình:
     `trashProgress?.total ? t('trashProgressCount', { done: trashProgress.done, total: trashProgress.total, percent: trashProgress.percent }) : t('trash')`.
   - Thêm thanh `progress-bar` tinh tế nằm ở dưới đáy Selection Bar hiển thị % tiến độ thực tế khi đang xoá/chuyển rác.
2. Trong `VaultShell.jsx`: truyền các props `trashBusy`, `trashProgress`, `deleteProgress` từ `actions` sang `DriveSelectionBar`.

---

### Task 5: UI - Nút "Dọn sạch thùng rác" (Empty Trash) Trong `VaultContentArea.jsx`

**Files:**
- Modify: `src/components/vault/VaultContentArea.jsx`

**Chi tiết:**
1. Khi `isTrash = true` và thư mục Thùng rác không rỗng (`totalItems > 0`):
   - Hiển thị nút "Dọn sạch thùng rác" trên thanh breadcrumbs bar / header của Vault.
   - Nút có viền cảnh báo màu đỏ nhẹ/tinh tế, icon thùng rác, và Floating Tooltip chuẩn dark bubble (`t('emptyTrashTooltip')`).
   - Khi bấm: gọi `actions.handleEmptyTrash()`.
   - Khi `delete_forever_busy = true`, nút hiển thị trạng thái đang xử lý (loading spinner) và disabled.

---

### Task 6: Kiểm thử & Xác minh Toàn diện

**Files:**
- Chạy `npm test` (@televault/core)
- Chạy `npm run build`
- Kiểm tra linting và tính toàn vẹn i18n
