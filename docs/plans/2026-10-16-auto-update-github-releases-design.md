# Thiết Kế Hệ Thống Tự Động Cập Nhật (Auto-Update) TeleVault Qua GitHub Releases

**Ngày:** 2026-10-16  
**Trạng thái:** Đã duyệt thiết kế (Approved)  
**Nguồn cảm hứng:** Kế thừa trải nghiệm UI/UX từ dự án `crawler_pc` kết hợp API tự động của GitHub Releases.

---

## 1. Mục tiêu & Yêu cầu

1. **Tự động hóa phát hành**:
   - Khi nhà phát triển push mã nguồn kèm tag (ví dụ `git tag v0.3.2 && git push --tags`), GitHub Actions sẽ tự động build các gói cài đặt (`.exe` cho Windows, `.dmg` cho macOS) và xuất bản lên GitHub Release public.
2. **Tự động kiểm tra phiên bản**:
   - Ứng dụng TeleVault tự động kiểm tra phiên bản mới từ GitHub Release khi khởi động (nếu người dùng bật tùy chọn) hoặc kiểm tra thủ công trong tab Cài đặt.
3. **Trải nghiệm người dùng cao cấp (UI/UX)**:
   - **UpdateBadge**: Huy hiệu nhỏ gọn trên Header kèm hiệu ứng xung nhịp (pulse ping).
   - **AppUpdateModal**: Hộp thoại thông tin bản phát hành, hiển thị phân loại Changelog (Tính năng mới, Sửa lỗi, Cải tiến), 3 lựa chọn (Cập nhật ngay, Để sau, Bỏ qua phiên bản này).
   - **UpdateChecker**: Thành phần cấu hình và kiểm tra trong tab Cài đặt (Settings).
4. **Cài đặt thông minh không gián đoạn**:
   - Tải ngầm file cài đặt về thư mục tạm với hiển thị tiến trình (%, dung lượng đã tải).
   - **Windows**: Chạy NSIS silent update (`/S --updated`), tự khởi động lại app mới.
   - **macOS**: Hỗ trợ mount DMG và cài đặt vào `/Applications` hoặc mở DMG trực tiếp.
5. **Đồng bộ đa ngôn ngữ**:
   - Đảm bảo 100% văn bản hiển thị qua `t('key')` và đối xứng trong `src/i18n/locales.js`.

---

## 2. Kiến trúc Hệ Thống

```
                     ┌────────────────────────────────────────┐
                     │          GitHub Repository             │
                     │  suutamebooktruyentranh2025-hub/televault│
                     └───────────────────┬────────────────────┘
                                         │ Push Git Tag (vX.Y.Z)
                                         ▼
                     ┌────────────────────────────────────────┐
                     │   GitHub Actions (.github/workflows)   │
                     │  - Build Windows NSIS (.exe)           │
                     │  - Build macOS DMG (.dmg)              │
                     │  - Publish GitHub Release (Public)     │
                     └───────────────────┬────────────────────┘
                                         │
                                         │ GET /releases/latest
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             TeleVault Desktop                               │
│                                                                             │
│  [Main Process (electron/lib/updater)]                                      │
│   ├── checkForUpdate(): Gọi GitHub API, so sánh semver                      │
│   ├── downloadUpdate(): Stream tải file về temp với tiến trình              │
│   └── installUpdate(): Windows (spawn detached NSIS), macOS (hdiutil/open)  │
│                                                                             │
│  [IPC Layer]                                                                │
│   ├── update:check, update:download, update:install                         │
│   └── Event: update:download-progress                                       │
│                                                                             │
│  [Renderer / UI Components]                                                 │
│   ├── UpdateBadge (Header)                                                  │
│   ├── AppUpdateModal (Changelog & Download progress modal)                  │
│   └── UpdateChecker (Settings screen)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Chi tiết Kỹ thuật

### 3.1. GitHub Releases API Client
- **Endpoint:** `https://api.github.com/repos/suutamebooktruyentranh2025-hub/televault/releases/latest`
- **Headers:** `User-Agent: TeleVault-Desktop`
- **Dữ liệu phân tích:**
  - `tag_name`: Chuỗi tag (ví dụ: `v0.3.2` -> phiên bản `0.3.2`).
  - `published_at`: Ngày phát hành.
  - `body`: Ghi chú phát hành dạng Markdown.
  - `assets`: Danh sách các tệp đính kèm (`.exe` cho win32, `.dmg` cho darwin arm64/x64).

### 3.2. Bộ phân loại Changelog (`parseChangelog`)
Phân tích `body` của release notes theo quy tắc:
- `[Mới]` / `[New]` / `feat:` ➔ Loại `new` (Màu xanh lá)
- `[Sửa]` / `[Fix]` / `fix:` ➔ Loại `fix` (Màu vàng cam)
- `[Cải tiến]` / `[Improve]` / `perf:` / `refactor:` ➔ Loại `improve` (Màu xanh dương)

### 3.3. Quy trình Cài đặt (Installation Process)
- **Windows (`win32`)**:
  - Tải về file `.exe` cài đặt.
  - Khi cài đặt, gọi:
    ```javascript
    const child = spawn(filePath, ['/S', '--updated'], { detached: true, stdio: 'ignore' });
    child.unref();
    setTimeout(() => app.quit(), 500);
    ```
- **macOS (`darwin`)**:
  - Tải về file `.dmg`.
  - Thực hiện mount và copy vào `/Applications` nếu có quyền, hoặc mở file DMG qua `shell.openPath(filePath)`.

---

## 4. Quản lý Trạng thái & Lưu trữ Cài đặt (Settings Storage)

Các khóa lưu trữ cấu hình trong `electron-store` hoặc `localStorage`:
- `auto_check_update`: `boolean` (mặc định: `true`).
- `skipped_update_version`: `string` (phiên bản người dùng chọn bỏ qua, ví dụ: `"0.3.2"`).

---

## 5. Kế hoạch Kiểm thử & Xác minh

1. **Unit Tests**:
   - Kiểm tra `isNewerVersion`: `0.3.2` > `0.3.1`, `0.3.1` = `0.3.1`, `0.3.0` < `0.3.1`.
   - Kiểm tra `parseChangelog`: bóc tách đúng tag và nội dung.
   - Kiểm tra `resolveDownloadInfo`: chọn đúng file exe trên win32, dmg trên darwin.
2. **i18n Symmetry**:
   - Kiểm tra đối xứng 100% các khóa `update.*`, `updateModal.*`, `updateBadge.*` trong `src/i18n/locales.js`.
3. **Build & Syntax**:
   - `npm run build` không có lỗi lint/bundle.
