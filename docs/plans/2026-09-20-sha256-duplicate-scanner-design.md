# Thiết Kế: Quét Trùng Lặp Theo Nội Dung SHA-256 (Cross-Folder & Cross-Name Duplicate Detection)

## 1. Mục tiêu
Mở rộng khả năng phát hiện file trùng lặp trong kho lưu trữ TeleVault desktop, không chỉ giới hạn ở các file cùng đường dẫn (`exact_path`) hoặc cùng tên có đuôi conflict (`conflict_name`), mà phát hiện được tất cả các file trùng nội dung (có cùng mã băm SHA-256) dù đặt tên khác nhau hay nằm ở các thư mục khác nhau.

---

## 2. Kiến trúc & Mô hình dữ liệu

### 2.1. Phân loại nhóm trùng lặp (Duplicate Group Kinds)
Hệ thống hỗ trợ 3 loại nhóm trùng lặp:
1. `exact_path`: Các file có cùng chính xác đường dẫn `path` trong Vault.
2. `conflict_name`: File gốc kèm các bản sao xung đột tên có đuôi ` (conflict YYYY-MM-DD...)`.
3. `same_hash` (Mới): Các file có cùng mã băm `sha256` không rỗng nhưng có đường dẫn khác nhau và không thuộc 2 loại nhóm trên.

### 2.2. Thuật toán gom nhóm (`duplicateScanner.js`)
- Bước 1: Quét và tạo các nhóm `exact_path`.
- Bước 2: Quét và tạo các nhóm `conflict_name`.
- Bước 3: Đưa tất cả `messageId` của các file trong nhóm 1 và nhóm 2 vào tập `claimed_message_ids`.
- Bước 4: Duyệt qua các file còn lại chưa được gán nhóm (`!claimed_message_ids.has(e.messageId)`):
  - Bỏ qua các file không có `sha256` hoặc rỗng.
  - Gom các file có cùng `sha256` vào bảng băm `entries_by_sha`.
  - Các nhóm có từ 2 file trở lên được tạo thành nhóm `kind: 'same_hash'`:
    - `id`: `hash:${sha256}`
    - `originalPath`: Đường dẫn của file có `mtime` sớm nhất (hoặc `messageId` nhỏ nhất nếu cùng mtime).
    - `sameContent`: `true`
    - `mixedContent`: `false`
    - `members`: Danh sách các file sắp xếp theo `mtime` tăng dần.
      - `members[0].isOriginal = true` (File cũ nhất - tải lên trước).
      - `members[i > 0].isOriginal = false` (Các file bản sao tải lên sau).

---

## 3. Giao diện & Trải nghiệm người dùng (`DuplicatesScreen.jsx`)

### 3.1. Huy hiệu phân loại nhóm (Kind Badge)
Mỗi nhóm trùng lặp hiển thị một badge trực quan bên cạnh tiêu đề:
- `exact_path`: Huy hiệu `Cùng đường dẫn`
- `conflict_name`: Huy hiệu `Xung đột tên`
- `same_hash`: Huy hiệu `Trùng nội dung SHA-256` (màu nổi bật)

### 3.2. Hiển thị đường dẫn đầy đủ cho nhóm `same_hash`
Trong nhóm `same_hash`, các file nằm ở các thư mục khác nhau. Thay vì chỉ hiển thị tên file:
- Hiển thị đường dẫn thư mục cha hoặc đường dẫn đầy đủ của từng file.
- Kèm icon thư mục và nút nhảy nhanh tới thư mục chứa file (`gd-navigate`).

### 3.3. Cơ chế Pre-select & Giữ bản cũ/mới
- Mặc định: Giữ bản tải lên trước (bản gốc), pre-select các bản tải sau để xoá.
- Nút "Giữ bản mới nhất" / "Giữ bản cũ nhất" để người dùng dễ dàng đổi chiều lựa chọn trong nhóm `same_hash`.

---

## 4. Kế hoạch kiểm thử (Test Plan)
1. Unit tests trong `@televault/core`:
   - Kiểm tra phát hiện file trùng SHA-256 ở 2 thư mục khác nhau.
   - Kiểm tra loại trừ không để trùng lặp file giữa nhóm `exact_path`/`conflict_name` và nhóm `same_hash`.
   - Kiểm tra sắp xếp đúng file cũ nhất làm file gốc.
2. Unit tests kiểm tra `filterDuplicateGroups` và `sortDuplicateGroups` với nhóm `same_hash`.
3. Kiểm tra build và giao diện hiển thị.
