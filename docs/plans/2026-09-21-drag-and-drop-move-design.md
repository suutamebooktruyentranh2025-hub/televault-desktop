# Design Document: Drag & Drop File/Folder Moving

## Overview
Cho phép người dùng kéo (drag) một hoặc nhiều file/folder trong danh sách tập tin và thả (drop) trực tiếp vào một thư mục đích (Folder Grid Card hoặc Folder Table Row) để di chuyển nhanh chóng, trực quan tương tự như Google Drive hoặc macOS Finder / Windows Explorer.

## Requirements
1. **Khởi tạo kéo (Drag Source)**:
   - File và Folder ở cả 2 chế độ (Grid View & List/Table View) có thể kéo được khi không ở chế độ readonly và không ở trong Thùng rác.
   - Nếu mục được kéo đang nằm trong danh sách đã chọn (`selectedIds` / `selectedFolders`), kéo toàn bộ các mục được chọn.
   - Nếu mục được kéo chưa được chọn, chỉ kéo duy nhất mục đó.
   - Đóng gói dữ liệu chuẩn với MIME type `application/x-televault-move`.
   - Hiển thị badge kéo preview ("Di chuyển X mục").

2. **Tiếp nhận thả (Drop Target)**:
   - Các thẻ thư mục (`FolderGridCard`) và các hàng thư mục trong bảng (`<tr>`).
   - Kiểm tra an toàn: Không cho phép thả vào chính thư mục đang kéo hoặc thư mục con cháu bên trong nó.
   - Hiệu ứng thị giác khi rê chuột vào (visual highlight): viền bo sáng, đổi màu nền nhẹ nhàng, nổi bật rõ ràng.

3. **Thực thi di chuyển (Execution)**:
   - Di chuyển trực tiếp mà không cần popup xác nhận để tối đa hóa tốc độ thao tác.
   - Gọi `vaultApi.moveEntries(messageIds, folders, destFolder)`.
   - Hiển thị thanh tiến độ di chuyển và toast thông báo kết quả.
   - Tự động bỏ chọn (`clearSelection`) sau khi di chuyển các mục đang chọn.

4. **Tương thích với tính năng Upload ngoài**:
   - `VaultShell.jsx` bỏ qua sự kiện có MIME `application/x-televault-move` để không nhầm với việc kéo file từ Desktop vào upload.

## Technical Architecture
- **MIME type**: `application/x-televault-move`
- **Payload format**:
  ```json
  {
    "messageIds": [123, 456],
    "folders": ["/Docs/Work/", "/Docs/Personal/"]
  }
  ```
- **Drop verification**:
  `isValidDropTarget(targetFolderPath, { messageIds, folders })`:
  - `folders.includes(targetFolderPath)` -> false
  - `folders.some(f => targetFolderPath.startsWith(f))` -> false
  - else -> true
