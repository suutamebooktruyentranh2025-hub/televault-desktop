# Release Notes - TeleVault Desktop v0.5.0

**Ngày phát hành / Release Date:** 2026-10-20  
**Phiên bản / Version:** `v0.5.0` (So sánh với `v0.4.0`)  
**Mục tiêu chính / Milestone:** Tự động trích xuất Nhật ký Thay đổi (Changelog) chi tiết lên GitHub Release, Nâng cấp bộ phân tích changelog sinh động với Badge & Emoji, Sửa triệt để lỗi hiển thị phiên bản tĩnh `v0.3.1` sang phiên bản động thực tế.

---

## 🌟 Điểm nổi bật v0.5.0 (Release Highlights)

- 📝 **Tự động Trích xuất & Đồng bộ Nhật ký Thay đổi (Automated Release Notes)**:
  - Tự động trích xuất nội dung từ `RELEASE_NOTES.md` hoặc git commits để đưa vào thân bài GitHub Release, loại bỏ hoàn toàn hiện tượng chỉ hiển thị link so sánh của GitHub.
  - Tích hợp script `extract-release-notes.js` trực tiếp trong quy trình CI/CD GitHub Actions.
- 🎨 **Nâng cấp Bộ phân tích Changelog với Badge & Emoji (Smart Changelog Parser)**:
  - Tự động nhận diện các emoji (`✨`, `⚡`, `🐛`, `🔄`, v.v.) và tiền tố (`[Mới]`, `[Sửa lỗi]`, `[Cải tiến]`, Conventional Commits `feat:`, `fix:`, `perf:`).
  - Tự động lọc bỏ các metadata không cần thiết và gán badge màu sắc trực quan trong hộp thoại cập nhật.
- 🔧 **Sửa lỗi Hiển thị Phiên bản Ứng dụng (Dynamic Version Resolution)**:
  - Khắc phục lỗi hiển thị cố định `v0.3.1` trong Cài đặt và Kiểm tra cập nhật do gọi nhầm vào API chưa tồn tại.
  - Inject trực tiếp biến `__APP_VERSION__` từ `package.json` vào Vite và bổ sung IPC handler `update:getVersion` trả về phiên bản thực tế của Electron.
- 🧪 **Bổ sung Kiểm thử Đơn vị (Unit Tests)**:
  - Bổ sung bộ test cho script trích xuất ghi chú và bộ bóc tách changelog.

---

# Release Notes - TeleVault Desktop v0.4.0

**Ngày phát hành / Release Date:** 2026-10-20  
**Phiên bản / Version:** `v0.4.0` (So sánh với `v0.3.3`)  
**Mục tiêu chính / Milestone:** Tự động cài đặt và khởi động lại bản cập nhật mới trên macOS (Seamless Silent DMG Auto-Install), Khắc phục triệt để lỗi "File is in use" và nhu cầu kéo thả thủ công vào Applications, Chuẩn hóa đồng bộ nút Cài đặt và Khởi động lại trên mọi nền tảng.

---

## 🌟 Điểm nổi bật v0.4.0 (Release Highlights)

- ⚡ **Tự động Cài đặt và Khởi động lại trên macOS (Seamless DMG Auto-Install)**:
  - Tự động mount tệp `.dmg` cập nhật ở chế độ ẩn (`hdiutil attach ... -nobrowse -quiet`).
  - Tự động thay thế tệp ứng dụng trong thư mục `/Applications/` (hoặc bundle `.app` đang chạy) mà người dùng không cần phải thoát app thủ công trước hay kéo thả bằng tay trong Finder.
  - Tự động unmount ổ đĩa cập nhật và kích hoạt Electron relaunch vào phiên bản mới tức thì.
  - Tích hợp cơ chế fallback an toàn: tự động mở DMG nếu gặp lỗi phân quyền hệ thống.
- 🔄 **Đồng bộ hóa Trải nghiệm Cập nhật trên mọi Nền tảng (Cross-platform Consistency)**:
  - Nút cài đặt trên cả Windows và macOS giờ đây đều hiển thị thống nhất: **"Cài đặt và Khởi động lại"** / **"Install and Restart"**.
- 🌐 **Chuẩn hóa Quốc tế hóa (i18n)**:
  - Đồng bộ đối xứng 100% giữa hai từ điển `vi` và `en` trong `locales.js`.
- 🧪 **Kiểm thử Toàn diện (Unit Tests)**:
  - Bổ sung bộ test mô phỏng toàn diện quy trình mount, copy, unmount, relaunch và fallback của updater.

---

# Release Notes - TeleVault Desktop v0.3.3

**Ngày phát hành / Release Date:** 2026-10-19  
**Phiên bản / Version:** `v0.3.3` (So sánh với `v0.3.2`)  
**Mục tiêu chính / Milestone:** Bộ sưu tập 12 Chủ đề giao diện (Themes) & Thiết kế lại Cài đặt, Bảng xếp hạng Top Thư mục & Top File (Phân trang, Sắp xếp đa cột, Tooltip nổi), Tối ưu hoá Bộ lọc Thẻ (Tag Filter) & Thanh công cụ Quản lý tệp trùng lặp.

---

## 🌟 Điểm nổi bật v0.3.3 (Release Highlights)

- 🎨 **Bộ sưu tập 12 Chủ đề giao diện & Bộ chọn trực quan (12 Theme Options & Card Picker)**:
  - Hỗ trợ 12 phong cách giao diện cá nhân hóa: Dark, Light, Telegram, Midnight, Slate, Ocean, Forest, Sunset, Cyberpunk, Rose, Lavender, Amber.
  - Bộ chọn chủ đề dạng thẻ (`ThemeCardPicker`) trực quan, hiển thị bảng màu thực tế (palette preview) giúp dễ dàng lựa chọn.
- ⚙️ **Thiết kế lại khu vực Cài đặt (Settings Screen Redesign)**:
  - Phân vùng cấu hình rõ ràng: Giao diện & Hiển thị, Kiểm tra Cập nhật phần mềm (Update Checker), và Khối Liên hệ Admin / Hỗ trợ (`AdminContactLinks`).
  - Chuẩn hoá toàn bộ các dropdown chọn lựa bằng component tuỳ chỉnh `SettingsSelect`, loại bỏ select mặc định thô của trình duyệt và đồng bộ visual hoàn hảo theo mọi theme.
- 📊 **Nâng cấp Bảng điều khiển (Dashboard Rank Lists & Upload Details)**:
  - Mở rộng hiển thị Top 100 thư mục truyện và Top 100 file tải lên nhiều nhất.
  - Tích hợp phân trang phía client linh hoạt (25 / 50 / 100 mục mỗi trang) kèm thanh điều khiển một hàng cực kỳ tinh gọn.
  - Bổ sung sắp xếp đa cột (theo tên, số tệp/dung lượng) với chuẩn tooltip nổi cao cấp (Floating Dark Bubble) chống trễ và hiển thị rõ ràng.
  - Tối ưu thẻ "Chi tiết tải lên ngày...": tự động hiển thị ngày gần nhất ở trạng thái thu gọn, loại bỏ viền focus thừa, hỗ trợ đóng/mở mượt mà.
- 🏷️ **Sửa lỗi triệt để Bộ lọc Thẻ (Tag Filter Stability)**:
  - Khắc phục hiện tượng lặp vô hạn và nhấp nháy khi duyệt file theo tag (loại bỏ side-effect đệ quy trong IPC handler `vault:allTags` và debounce listener).
- 🧹 **Tinh gọn Giao diện Quản lý tệp trùng lặp (Duplicates Screen)**:
  - Tinh gọn thanh công cụ, đồng bộ bộ lọc trạng thái và phương thức sắp xếp bằng `SettingsSelect`.
- 🌐 **Chuẩn hóa Quốc tế hóa (i18n)**:
  - Toàn bộ tên theme, mô tả, nhãn phân trang và tooltip sắp xếp được đồng bộ song ngữ đối xứng 100% giữa Tiếng Việt và Tiếng Anh (`vi` và `en` trong `locales.js`).

---

# Release Notes - TeleVault Desktop v0.3.2

**Ngày phát hành / Release Date:** 2026-10-16  
**Phiên bản / Version:** `v0.3.2` (So sánh với `v0.3.1`)  
**Mục tiêu chính / Milestone:** Tích hợp cơ chế Tự động Cập nhật ứng dụng (GitHub Releases Auto-Update), Thử lại hàng loạt trong Hàng đợi đồng bộ Google Drive, Tối ưu hóa toàn diện giao diện & điều khiển Đồng bộ Drive, Cải tiến bố cục dọn dẹp Thùng rác.

---

## 🌟 Điểm nổi bật v0.3.2 (Release Highlights)

- 🚀 **Tự động Cập nhật ứng dụng (GitHub Releases Auto-Update)**: Tích hợp hệ thống kiểm tra và cập nhật phiên bản mới trực tiếp từ GitHub Releases, hiển thị badge thông báo trực quan và modal xem changelog/tải về.
- 🔁 **Thử lại hàng loạt trong Hàng đợi Drive (Batch Retry Sync Queue)**: Cho phép chọn và thử lại đồng loạt các tệp gặp lỗi trong hàng đợi Google Drive, giúp việc đồng bộ dữ liệu gián đoạn diễn ra thuận tiện và nhanh chóng.
- 🎯 **Ghim thanh điều khiển & Khóa hàng trên cùng Google Drive**: Ghim cố định các nút hành động (`Đồng bộ`, `Tạm dừng`, `Quét Drive`) trên Header Action Bar không bị rớt dòng khi gặp lỗi; tách thông báo lỗi thành Error Banner riêng biệt bên dưới kèm nút Reconnect nhanh.
- ⚡ **Tối ưu hóa phản hồi & Trạng thái Đồng bộ Drive**:
  - Thêm hiệu ứng loading spinner quay tròn trên nút Đồng bộ khi đang gửi tệp.
  - Tự động vô hiệu hóa Quét Drive khi đang đồng bộ để tránh nghẽn luồng và xung đột tác vụ.
  - Tự động ẩn nút Tạm dừng khi đang quét để làm rõ ranh giới chức năng giữa quét dữ liệu Drive và hàng đợi tải lên Telegram.
- 🧹 **Tinh gọn giao diện & Loại bỏ trùng lặp**:
  - Cân đối các thẻ thống kê bộ đệm (`GDriveCacheSummaryBar`), loại bỏ thanh tiến độ thừa trên thẻ "Đã lên Telegram".
  - Loại bỏ checkbox trùng lặp "Ẩn tệp bỏ qua" ở bảng bên phải, tập trung điều khiển tại cây thư mục bên trái.
  - Loại bỏ badge trạng thái dư thừa cạnh tiêu đề Google Drive ở thanh điều hướng trên.
- 🗑️ **Cải tiến giao diện Dọn dẹp Thùng rác (Trash Cleanup Layout)**: Bổ sung thanh tiến độ xoá thời gian thực và bố cục nút thao tác dọn dẹp an toàn.
- 🌐 **Chuẩn hóa Quốc tế hóa (i18n)**: Toàn bộ chuỗi giao diện, thông báo lỗi và badge mới được đồng bộ song ngữ đối xứng 100% giữa Tiếng Việt và Tiếng Anh.

---

# Release Notes - TeleVault Desktop v0.3.1

**Ngày phát hành / Release Date:** 2026-10-15  
**Phiên bản / Version:** `v0.3.1` (So sánh với `v0.3.0`)  
**Mục tiêu chính / Milestone:** Tối ưu hóa toàn diện luồng Đồng bộ Google Drive (1-Click Sync & Realtime Rescan), Tinh gọn thanh công cụ Explorer, Bổ sung tài liệu hướng dẫn tệp lớn > 2GB & ghép nối file `.bin`.

---

## 🌟 Điểm nổi bật v0.3.1 (Release Highlights)

- ⚡ **Đồng bộ 1-Click (1-Click Sync All Pending)**: Bổ sung nút `[+ Đồng bộ tất cả file chưa tải]` ngay tại Thẻ "Chưa đồng bộ", đưa toàn bộ tệp vào hàng đợi chỉ với 1 click chuột kèm trạng thái loading spinner trực quan.
- 🔄 **Tiến độ Quét lại Televault thời gian thực & Huỷ an toàn**: Card "Đã lên Telegram" hiển thị trực tiếp số lượng tin nhắn đã quét (`Đang quét Televault… {n} tin nhắn`) kèm nút huỷ tác vụ tức thời `[✕]` an toàn, tách biệt độc lập với quá trình quét Google Drive.
- 🧹 **Tinh gọn thanh công cụ Thư mục (Toolbar Streamlining)**: Loại bỏ các nút thừa (`Nhận diện file đã có`, `Thêm vào hàng đợi`) do backend đã tự động nhận diện và đối soát ngầm ở mọi sự kiện (quét Drive, quét Telegram, import link).
- 🧩 **Trợ giúp & Hướng dẫn Tệp lớn > 2GB & Ghép file `.bin`**: Bổ sung tài liệu chi tiết trong hộp thoại Trợ giúp My Vault, hướng dẫn cơ chế chunking tự động vượt giới hạn 2GB của Telegram và cách ghép nối file (`copy /b` trên Windows, `cat` trên macOS/Linux, 7-Zip).
- 🛡️ **Cải thiện Shared Vault & Định tuyến IPC**: Tối ưu hóa quản lý phiên và xử lý ngắt kết nối an toàn cho Kho chia sẻ, bổ sung unit test cho `sharedVaultManager`.
- 🌐 **Chuẩn hóa Quốc tế hóa (i18n)**: Mọi tính năng, nút bấm và nội dung trợ giúp mới được đồng bộ song ngữ đối xứng 100% giữa Tiếng Việt và Tiếng Anh.

---

# Release Notes - TeleVault Desktop v0.3.0

**Ngày phát hành / Release Date:** 2026-10-14  
**Phiên bản / Version:** `v0.3.0` (So sánh với `v0.2.0`)  
**Mục tiêu chính / Milestone:** Đồng bộ trải nghiệm Kho lưu trữ được chia sẻ (Shared Vault Parity), Quét lại lịch sử Vault có kiểm soát huỷ (Rescan Vault & Cancellation), Tối ưu hoá điều hướng & Keep-Alive DOM, Tự động hoá CI/CD GitHub Actions Matrix Build.

---

## 🌟 Điểm nổi bật v0.3.0 (Release Highlights)

- 🌐 **Đồng bộ tính năng Shared Vault (Chia sẻ với tôi)**: Bổ sung bộ lọc Thẻ (Tag Filter), duyệt Theo thư mục / Bộ truyện / Tệp lẻ (`BrowseScope`), sắp xếp đa chiều và Breadcrumb phân cấp tương tự My Vault.
- ⚡ **Tối ưu trải nghiệm chuyển Tab & Keep-Alive DOM**: Khắc phục triệt để tình trạng phải nhấn F5 để làm mới dữ liệu khi chuyển tab hoặc mở lại app; lưu bộ đệm tức thì 0ms, giữ nguyên vị trí cuộn và trạng thái cây thư mục.
- 🔄 **Quét lại lịch sử Vault có huỷ (Rescan Vault & Cancel)**: Hỗ trợ quét lại toàn bộ lịch sử tin nhắn Telegram với thanh hiển thị tiến độ thời gian thực và nút huỷ tác vụ an toàn, hỗ trợ cả My Vault và Shared Vault.
- 🤖 **CI/CD Tự động với GitHub Actions**: Thiết lập workflow Matrix Build song song cho Windows (bản cài đặt NSIS `.exe`) và macOS (`.dmg`), tự động đóng gói và xuất bản GitHub Release khi gắn thẻ phiên bản (`v*`).

---

# Release Notes - TeleVault Desktop v0.2.0

**Ngày phát hành dự kiến / Release Date:** 2026-09-25  
**Phiên bản / Version:** `v0.2.0` (So sánh với `v0.1.0`)  
**Mục tiêu chính / Milestone:** Tái cấu trúc kiến trúc toàn diện (Modular Refactor), Hệ thống Google Drive Cache Explorer, Quản lý File Multi-part Telegram, Quét trùng lặp SHA-256, Bảng điều khiển mới và Chuẩn hóa Quốc tế hóa (i18n).

---

## 🌟 Điểm nổi bật (Release Highlights)

- ⚡ **Google Drive Cache Explorer & Parallel Downloader**: Khám phá và duyệt cây thư mục Drive cực nhanh qua SQLite Cache cục bộ mà không phụ thuộc độ trễ API Google; tải song song đa luồng tối ưu băng thông.
- 🧩 **Hỗ trợ tệp lớn Multi-part trên Telegram**: Tự động phân mảnh (chunking) các file dung lượng lớn vượt giới hạn Telegram, tải lên/tải xuống đa luồng và ghép file nguyên vẹn với kiểm tra checksum SHA-256/MD5.
- 🔍 **Trình quét & xử lý tệp trùng lặp (SHA-256 Duplicate Scanner)**: Phát hiện chính xác các file trùng lặp nội dung trong kho lưu trữ, hỗ trợ giữ lại bản mới nhất/cũ nhất và dọn dẹp dung lượng an toàn.
- 🎨 **Tái thiết kế Bảng điều khiển (Dashboard Redesign)**: Biểu đồ tải lên tương tác, phân tích chi tiết dung lượng theo ngày/tháng, xếp hạng tệp tin và thống kê tốc độ thời gian thực.
- 📁 **Trải nghiệm My Drive nâng cấp**: Hỗ trợ Kéo & Thả (Drag-and-Drop) để di chuyển tệp tin/thư mục, hệ thống gắn Thẻ (Tagging), bộ nhớ đệm điều hướng thư mục tức thì.
- 🛡️ **Kiểm soát nghẽn mạng & Flood Wait thông minh**: Cơ chế tự động điều tiết tốc độ (Pacing & Circuit Breaker) khi Telegram hoặc Google Drive áp giới hạn Rate Limit / 429 Flood Wait, có huy hiệu trạng thái trực quan.
- 🌐 **Chuẩn hóa Quốc tế hóa (i18n) 100%**: Hỗ trợ song ngữ Tiếng Việt & Tiếng Anh toàn diện, đối xứng 100% các phím từ điển, không còn chuỗi văn bản cứng trong giao diện.
- 🎯 **Nhận diện thương hiệu & Icon mới**: Pipeline tự động tạo icon ứng dụng hình học hiện đại cho macOS (.icns, Retina) và Windows (.ico, đa độ phân giải).

---

## 📋 Chi tiết các thay đổi (Changelog)

### 🚀 Tính năng mới (New Features)

#### 1. Google Drive Sync & Cache Explorer
- **Local Metadata Cache**: Lưu trữ metadata cây thư mục và tệp của Google Drive vào SQLite cục bộ, giảm thiểu tối đa số lượng request tới Drive API.
- **Cache Explorer UI**:
  - Cây thư mục tương tác đa cấp (`GDriveFolderTree`) với khả năng mở rộng/thu gọn nhanh.
  - Bảng danh sách tệp đệm (`GDriveCacheTable`) hỗ trợ tìm kiếm theo tên, MIME type, kích thước và phân trang mượt mà.
  - Xem chi tiết thư mục và thống kê dung lượng (`GDriveFolderDetail`, `GDriveStatsBar`).
  - Feed theo dõi tiến trình quét tệp trực tiếp (`GDriveLiveScanFeed`).
- **Parallel Downloader & Flood Controller**:
  - Tải song song nhiều tệp từ Google Drive với kiểm soát số luồng đồng thời (`gdriveParallelDownloader`).
  - Điều tiết tốc độ thích ứng (`gdriveFloodController`) và tự động thử lại khi gặp Rate Limit.
  - Quản lý hàng đợi và giám sát tiến trình xử lý chi tiết (`GDriveQueueTab`, `GDriveProcessInspector`).

#### 2. Telegram Vault & Multi-part Storage
- **Multi-Part Splitter & Downloader**: Tự động lập kế hoạch phân tách file (`splitPlanner`), tải lên nhiều phần (`multiPartUpload`) và ráp lại khi tải xuống (`multiPartDownload`), cho phép lưu trữ file có kích thước lớn hơn giới hạn bot thông thường.
- **SHA-256 Stream Hashing**: Tính toán hash theo dạng luồng (`streamHash`) bảo vệ toàn vẹn dữ liệu, kèm Semaphore (`hashSemaphore`) giới hạn tải CPU/RAM.
- **Flood Retry Circuit Breaker**: Tự động bắt mã lỗi Telegram Flood Wait, hiển thị đếm ngược thời gian chờ trên giao diện qua `TelegramRateLimitBadge` và tự động khôi phục chuyển tải.

#### 3. Quản lý tệp trùng lặp (Duplicates Management)
- **SHA-256 Deep Scan**: Quét và nhóm các tệp trùng khớp mã băm SHA-256 (`duplicateScanner`).
- **Giao diện Duplicates Screen**:
  - Xem danh sách nhóm trùng lặp theo dạng bảng hoặc thẻ (`DuplicatesScreen`, `duplicateListView`).
  - Lựa chọn nhanh: Chọn tất cả bản sao trừ bản gốc, chọn theo thời gian tải lên.
  - Thao tác xóa mềm (vào Thùng rác) hoặc xóa vĩnh viễn (Hard delete).

#### 4. Quản lý Thẻ (Tagging System)
- Hỗ trợ tạo thẻ với bảng màu đa dạng (`CreateTagDialog`).
- Thanh chip lọc nhanh theo thẻ (`TagChipBar`).
- Menu thả xuống gán thẻ nhanh cho một hoặc nhiều tệp/thư mục được chọn (`TagSelectDropdown`, `useTagFilter`).

#### 5. Bảng điều khiển mới (Dashboard)
- Biểu đồ thống kê tải lên theo thời gian (`DashboardUploadChart`) hỗ trợ tooltip và khoảng thời gian linh hoạt.
- Chi tiết hoạt động từng ngày (`DashboardDayDetail`) với danh sách các tệp được nạp trong ngày.
- Bảng xếp hạng dung lượng và loại tệp sử dụng nhiều nhất (`DashboardRankList`).

#### 6. Thao tác tệp nâng cao trong My Drive
- **Drag & Drop Move**: Kéo thả tệp hoặc thư mục trực tiếp vào thư mục cha hoặc breadcrumb để di chuyển (`dragDropMove`).
- **Folder Navigation Cache**: Lưu vết breadcrumb và kích thước thư mục tức thời (`folderSummary`, `breadcrumb`).
- **Modular Shell**: Tách giao diện `VaultShell` nguyên khối thành các hook chuyên biệt (`useVaultActions`, `useVaultNavigation`, `useVaultSelection`).

---

### 🛠️ Cải tiến & Tối ưu hóa (Improvements & Refactoring)

- **Kiến trúc IPC & Modular Services**: Tách `vaultService.js` và IPC handlers thành các module chuyên biệt: `browseHandlers`, `duplicateHandlers`, `fileOpHandlers`, `transferHandlers`, `sharedVaultHandlers`.
- **Hiệu năng giao diện**:
  - Giảm thiểu re-render không cần thiết trên danh sách tệp lớn nhờ ảo hóa và memoization.
  - Tối ưu hóa bộ nhớ đệm cache metadata với `cacheEvictor`.
- **Hộp thoại Trợ giúp theo ngữ cảnh (HelpDialog)**: Bổ sung tài liệu hướng dẫn và phím tắt chi tiết cho từng tab chức năng.
- **Icon Pipeline tự động**: Bộ script `generate-icons.js`, `render-master-icon.js` và `verify-icons.js` giúp sinh ra đầy đủ các kích thước icon chuẩn cho macOS dmg/app và Windows exe.

---

### 🌐 Quốc tế hóa (Internationalization)

- Mọi chuỗi hiển thị đều được trích xuất vào `src/i18n/locales.js`.
- Bổ sung hơn 1.200 cụm từ đồng bộ song ngữ Việt - Anh.
- Chuẩn hóa thông báo lỗi, trạng thái kết nối, nhãn biểu đồ và các tooltip điều hướng.

---

### 🧪 Kiểm thử & Ổn định (Testing & Quality Assurance)

- Bổ sung hơn **25 bộ test tự động** (unit test & integration test) cho:
  - Phân luồng GDrive downloader, cache indexer, retry controller.
  - Phân mảnh Multi-part upload/download Telegram.
  - Trình quét trùng lặp SHA-256 và giải quyết xung đột khi khởi động (`resolveConflictsBoot`).
  - Thao tác kéo thả, breadcrumb và format thời gian chờ.

---

## 📦 Hướng dẫn cài đặt & Đóng gói (Installation & Build)

### Dành cho nhà phát triển (Developers)
```bash
# Cài đặt phụ thuộc
npm install

# Chạy môi trường phát triển Electron + Vite
npm run electron:dev

# Chạy toàn bộ test suite
npm run test:all
```

### Đóng gói ứng dụng (Production Builds)
```bash
# Đóng gói cho macOS (DMG)
npm run electron:build:mac

# Đóng gói cho Windows (NSIS Installer)
npm run electron:build:win

# Đóng gói đồng thời cả hai nền tảng
npm run electron:build:all
```

---

## 🏷️ Gợi ý lệnh gắn Git Tag (Tagging Command)

```bash
git tag -a v0.2.0 -m "Release v0.2.0: Modular Refactor, GDrive Cache Explorer & Dashboard Redesign"
git push origin v0.2.0
```
