# Thiết Kế Lại Tab Bảng Điều Khiển (Dashboard Redesign)

**Ngày lập**: 2026-09-23  
**Trạng thái**: Đã được người dùng phê duyệt

---

## 1. Mục Tiêu & Vấn Đề Cần Giải Quyết

1. **Thống kê dung lượng thư mục truyện con (Smart Story Folder Rollup)**:
   - Trước đây: `buildDashboardStats` trong `televault-core` chỉ lấy thư mục gốc cấp 1 (`topLevelFolderPath`, ví dụ `/Manga/` hoặc `/GDrive/`), dẫn đến việc toàn bộ dung lượng bị dồn vào 1-2 thư mục cha bao trùm, không thể đánh giá dung lượng của từng bộ truyện con (như `Naruto`, `One Piece`).
   - Giải pháp: Thuật toán thông minh lần ngược từ file lên:
     - Nếu file nằm trong thư mục định dạng con như `(CBZ)`, `(MOBI)`, `(PDF)`, `(EPUB)` hoặc chứa `Chap`, `Vol`, `Tập`...: Lấy thư mục ông bà (`grandParentFolder`) làm Thư mục Truyện chính.
     - Nếu file nằm trực tiếp trong thư mục truyện: Lấy thư mục cha trực tiếp làm Thư mục Truyện.
     - Dung lượng của mọi định dạng/chương con của truyện được gom chung về Thư mục Truyện để hiển thị trong Top Thư Mục.

2. **Chi tiết số file & dung lượng tải lên theo ngày (Interactive Chart & Day Details)**:
   - Trước đây: Biểu đồ SVG tĩnh, không có tooltip khi hover, không có tương tác click để xem chi tiết theo ngày.
   - Giải pháp:
     - `DashboardUploadChart`: Bổ sung đường gióng dọc (crosshair) và Tooltip nổi hiển thị song hành cả 2 chỉ số: Số lượng file và Tổng dung lượng tải của ngày đó.
     - Cho phép bấm click chọn một ngày (`selectedDate`) để ghim xem chi tiết.
     - Bổ sung Thẻ chi tiết ngày tải (`DashboardDayDetail`): Hiển thị thống kê tóm tắt ngày được chọn kèm bảng danh sách các tệp đã tải trong ngày (nhấp vào tệp để mở trong Vault).
     - Nâng cấp `uploadsPerDay` trong `dashboardAggregator.js` mang theo mảng tệp rút gọn (`files`) để hiển thị 0ms latency phía client.

---

## 2. Kiến Trúc Kỹ Thuật

### 2.1. Backend Aggregator (`packages/televault-core/src/dashboardAggregator.js`)
- Hàm `getStoryFolder(filePath)`:
  - Tách các phần tử đường dẫn: `parts = filePath.split('/').filter(Boolean)`.
  - Kiểm tra hậu tố folder định dạng `/\((CBZ|MOBI|PDF|EPUB|AZW3|RAW|ZIP|RAR)\)$/i` hoặc pattern tập/chương.
  - Trả về `{ path, name, subtext }` của thư mục truyện.
- Cập nhật `uploadsPerDay`:
  - Mỗi phần tử ngày mang theo `files: [{ messageId, name, bytes, path, mtime }]`.

### 2.2. Giao Diện Người Dùng (Frontend UI Components)
- `src/components/DashboardUploadChart.jsx`:
  - Bổ sung lắng nghe sự kiện chuột (`onMouseMove`, `onMouseLeave`, `onClick`).
  - Đường gióng dọc `crosshair` và điểm nổi bật `active dot`.
  - Tooltip hiển thị: Ngày, Số file, Dung lượng.
  - Callback `onSelectDate(dateStr)`.
- `src/components/DashboardRankList.jsx`:
  - Hỗ trợ hiển thị `subtext` đường dẫn thư mục cha dưới tên truyện để tạo cảm giác trực quan, sang trọng.
- `src/screens/DashboardScreen.jsx`:
  - Quản lý state `selectedDate`.
  - Render khối `DashboardDayDetail` khi có ngày được chọn, gồm nút `✕` đóng, tổng số file, dung lượng ngày đó và danh sách file đã tải trong ngày.
- `src/i18n/locales.js`:
  - Bổ sung đối xứng 100% key song ngữ Việt & Anh cho toàn bộ chuỗi mới (tooltip, ngày tải lên, file tải trong ngày, v.v.).

---

## 3. Kế Hoạch Kiểm Thử (Verification Plan)
1. Unit tests:
   - Chạy bộ test của `dashboardAggregator.test.js` trong `packages/televault-core`.
   - Bổ sung test case kiểm tra thuật toán nhận diện Thư mục Truyện từ các đường dẫn lồng nhau: `/Manga/Naruto/Naruto (CBZ)/Chap 01.cbz` -> Thư mục Truyện `/Manga/Naruto/`.
2. UI verification:
   - Kiểm tra giao diện Dashboard, hover biểu đồ hiển thị tooltip mượt mà.
   - Click chọn ngày hiển thị danh sách file tải trong ngày.
   - Click vào folder truyện nhảy đến đúng thư mục trong Vault.
   - Kiểm tra đối xứng i18n không còn bất kỳ chuỗi hardcode nào.
