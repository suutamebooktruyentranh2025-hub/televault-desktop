# Kế Hoạch Triển Khai: Hệ Thống Auto-Update TeleVault Qua GitHub Releases

> **Dành cho Antigravity:** REQUIRED WORKFLOW: Sử dụng `.agent/workflows/execute-plan.md` để thực thi kế hoạch này theo chế độ single-flow.

**Goal:** Thêm tính năng tự động kiểm tra, tải về và cài đặt các phiên bản phát hành mới của TeleVault trực tiếp từ GitHub Releases với trải nghiệm UI/UX kế thừa từ `crawler_pc` (UpdateBadge, AppUpdateModal, UpdateChecker).

**Architecture:** 
- Main process: Module `updater.js` truy vấn GitHub Releases API công khai (`/releases/latest`), so sánh semver, tải file installer về thư mục temp kèm progress và kích hoạt quy trình cài đặt theo nền tảng (Windows NSIS silent update / macOS DMG).
- IPC layer: Đăng ký các handler `update:check`, `update:download`, `update:install` và stream event `update:download-progress`.
- Renderer UI: Bộ components gồm `UpdateBadge` (trên thanh Header), `AppUpdateModal` (popup thông tin, phân loại changelog và thanh tiến độ tải), `UpdateChecker` (trong màn hình Cài đặt).
- i18n: Đồng bộ đối xứng 100% tiếng Việt - tiếng Anh trong `src/i18n/locales.js`.

**Tech Stack:** Node.js `https`, Electron `app`, `shell`, React, Tailwind CSS, i18n locales.

---

### Task 1: Utility bóc tách Changelog và so sánh Semver

**Files:**
- Create: `src/utils/updateUtils.js`
- Test: `src/utils/__tests__/updateUtils.test.js`

**Step 1: Viết test kiểm tra semver và parse changelog**
- Kiểm tra `isNewerVersion('0.3.2', '0.3.1') === true`
- Kiểm tra `isNewerVersion('0.3.1', '0.3.1') === false`
- Kiểm tra `isNewerVersion('0.3.0', '0.3.1') === false`
- Kiểm tra `parseChangelog` phân loại các mục `[Mới]`, `[Sửa]`, `[Cải tiến]` (hoặc `feat:`, `fix:`, `refactor:`) thành dạng structured list.

**Step 2: Chạy test để xác nhận test fail**
- Lệnh: `node --test src/utils/__tests__/updateUtils.test.js`

**Step 3: Viết mã nguồn cho `src/utils/updateUtils.js`**
- Cung cấp `isNewerVersion` và `parseChangelog`.

**Step 4: Chạy lại test để xác nhận pass**
- Lệnh: `node --test src/utils/__tests__/updateUtils.test.js`

---

### Task 2: Core Updater Backend trong Electron Main Process

**Files:**
- Create: `electron/lib/updater/githubUpdater.js`
- Test: `electron/lib/updater/__tests__/githubUpdater.test.js`

**Step 1: Viết test cho GitHub Releases parsing và download resolution**
- Test kiểm tra `resolveDownloadAsset(releaseData, 'win32', 'x64')` trả về link file `.exe`.
- Test kiểm tra `resolveDownloadAsset(releaseData, 'darwin', 'arm64')` trả về link file `.dmg`.

**Step 2: Viết mã nguồn `electron/lib/updater/githubUpdater.js`**
- `checkForUpdate(repoUrl)`: Fetch JSON từ GitHub API, lấy release mới nhất, parse changelog và asset.
- `downloadUpdate(assetUrl, filename, onProgress)`: Stream tải file về `temp/televault-update/` kèm tính toán % và MB.
- `installUpdate(filePath)`: Windows chạy NSIS `/S --updated` detached rồi quit; macOS mount DMG hoặc mở file.

**Step 3: Chạy test xác nhận pass**
- Lệnh: `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/lib/updater/__tests__/githubUpdater.test.js`

---

### Task 3: IPC Handlers & Preload Bridge

**Files:**
- Create: `electron/lib/ipc/updateHandlers.js`
- Modify: `electron/lib/ipc/index.js` (hoặc nơi đăng ký ipc chính)
- Modify: `preload.js`
- Modify: `electron/preload.js`

**Step 1: Đăng ký IPC handlers**
- `update:check`: gọi `checkForUpdate`.
- `update:download`: gọi `downloadUpdate` và gửi event `update:download-progress` về webContents.
- `update:install`: gọi `installUpdate`.

**Step 2: Khai báo vào `preload.js` và `electron/preload.js`**
- Thêm `window.televault.updater`:
  - `checkUpdate()`
  - `downloadUpdate(downloadInfo)`
  - `installUpdate(filePath)`
  - `onDownloadProgress(callback)`

---

### Task 4: Đồng bộ Song Ngữ i18n (`src/i18n/locales.js`)

**Files:**
- Modify: `src/i18n/locales.js`

**Step 1: Bổ sung bộ key cập nhật đối xứng 100% cho `vi` và `en`**
- `updateAutoCheck`, `updateAutoCheckSub`, `updateChecking`, `updateCheckBtn`
- `updateCurrentVersion`, `updateUpToDate`, `updateAvailable`, `updateDownload`
- `updateDownloading`, `updateDownloaded`, `updateInstallWin`, `updateInstallMac`
- `updateModalTitle`, `updateModalSubtitle`, `updateModalRemindLater`, `updateModalSkipVersion`
- `updateBadgeNewVersionTitle`, `updateBadgeDismissTitle`

**Step 2: Chạy script kiểm tra đối xứng**
- Lệnh: `node -e "const { vi, en } = require('./src/i18n/locales'); ..."`

---

### Task 5: Xây dựng Giao diện UI (UpdateBadge, AppUpdateModal, UpdateChecker)

**Files:**
- Create: `src/components/updater/UpdateBadge.jsx`
- Create: `src/components/updater/AppUpdateModal.jsx`
- Create: `src/components/updater/UpdateChecker.jsx`
- Modify: `src/components/VaultShell.jsx` (gắn `UpdateBadge` và `AppUpdateModal`)
- Modify: `src/screens/SettingsScreen.jsx` (hoặc màn hình Settings hiện tại, tích hợp `UpdateChecker`)

**Step 1: Tạo `UpdateBadge.jsx`**
- Hiển thị nút `v0.3.2` với icon và hiệu ứng chấm pulse ping ở góc trên header.
- Có nút `x` để dismiss tạm thời.

**Step 2: Tạo `AppUpdateModal.jsx`**
- Dialog sang trọng với backdrop blur.
- Danh sách Changelog phân loại màu sắc (Xanh lá, Vàng, Xanh dương).
- Thanh tiến độ tải file thời gian thực (0-100%).
- 3 nút hành động: "Cập nhật ngay", "Để sau", "Bỏ qua phiên bản này".

**Step 3: Tạo `UpdateChecker.jsx` và tích hợp vào tab Cài đặt**
- Switch bật/tắt tự động kiểm tra khi mở app.
- Nút kiểm tra thủ công.

---

### Task 6: Kiểm thử Toàn diện & Xác thực (Verification)

**Step 1: Chạy Vite build kiểm tra bundle frontend**
- Lệnh: `npm run build`

**Step 2: Chạy toàn bộ test suites**
- Lệnh: `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/lib/gdrive/__tests__/*.test.js`
- Lệnh: `node --test src/utils/__tests__/*.test.js`

**Step 3: Kiểm tra tính đối xứng i18n**
- Xác nhận không có key lệch hay fallback thô.
