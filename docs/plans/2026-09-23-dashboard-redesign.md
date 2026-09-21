# Dashboard Redesign Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Thiết kế lại tab Bảng điều khiển (Dashboard) để thống kê dung lượng theo thư mục truyện con thông minh và hiển thị tương tác chi tiết số file & dung lượng tải lên theo ngày khi bấm/rê chuột trên biểu đồ.

**Architecture:** Nâng cấp `buildDashboardStats` trong `televault-core` để gom nhóm thư mục truyện con và mang theo mảng tệp rút gọn theo ngày; xây dựng lại `DashboardUploadChart` với tooltip song hành số file + dung lượng và tính năng ghim ngày; thêm component `DashboardDayDetail` xem chi tiết và danh sách file tải trong ngày; cập nhật `locales.js` đối xứng vi & en 100%.

**Tech Stack:** React, SVG interactive charts, Node.js / Electron IPC, SQLite / televault-core, i18n, CSS

---

### Task 1: Upgrade `dashboardAggregator.js` (Story Folder rollup & daily uploaded files) + Unit Tests

**Files:**
- Modify: `packages/televault-core/src/dashboardAggregator.js`
- Modify: `packages/televault-core/__tests__/dashboardAggregator.test.js`

**Step 1: Write the failing tests**
Add tests to verify:
1. Identifying story folder from nested path:
   `/Manga/Naruto/Naruto (CBZ)/Chap 01.cbz` -> story folder path `/Manga/Naruto/`, name `Naruto`, subtext `Manga`.
   `/GDrive/Danh sách 2024/One Piece/One Piece (MOBI)/Vol 01.mobi` -> `/GDrive/Danh sách 2024/One Piece/`.
   `/Manga/Doraemon/Doraemon.pdf` (direct parent) -> `/Manga/Doraemon/`.
2. `uploadsPerDay` contains `files` array with `{ messageId, path, name, bytes, mtime }`.

**Step 2: Run test to verify it fails**
Run: `npm run test --workspace=@televault/core`

**Step 3: Implement the upgrade in `dashboardAggregator.js`**
- Implement `extractStoryFolder(filePath)`
- Group by story folder path, accumulate `bytes` and `fileCount`, record `name` and `subtext`
- Populate `files` in `uploadsPerDay`

**Step 4: Run test to verify it passes**
Run: `npm run test --workspace=@televault/core`

---

### Task 2: Add symmetrical i18n keys to `src/i18n/locales.js` (vi & en)

**Files:**
- Modify: `src/i18n/locales.js`

Keys to add:
- `dashboardUploadedOn`: 'Đã tải lên vào {date}' / 'Uploaded on {date}'
- `dashboardFilesCount`: '{count} tệp' / '{count} files'
- `dashboardUploadedToday`: 'Tải lên trong ngày' / 'Uploaded on day'
- `dashboardDayDetailTitle`: 'Chi tiết tải lên ngày {date}' / 'Upload details for {date}'
- `dashboardDayFilesList`: 'Danh sách tệp tải lên' / 'Uploaded files'
- `dashboardCloseDayDetail`: 'Đóng chi tiết ngày' / 'Close day details'
- `dashboardNoUploadsOnDay`: 'Không có tệp tải lên trong ngày này' / 'No uploads on this day'
- `dashboardColParentFolder`: 'Đường dẫn' / 'Path'

---

### Task 3: Redesign `DashboardUploadChart.jsx`

**Files:**
- Modify: `src/components/DashboardUploadChart.jsx`

Features:
- Track mouse position with invisible hover bars / hitzones across the days.
- Floating tooltip displaying: formatted date, file count (`dashboardFilesCount`), and size (`formatSize(bytes)`).
- Crosshair vertical indicator.
- Support `selectedDate` prop and `onSelectDate(dateStr)` callback.
- Highlight active day with distinct ring/pulse styling.

---

### Task 4: Create `DashboardDayDetail.jsx`

**Files:**
- Create: `src/components/DashboardDayDetail.jsx`

Features:
- Display header with selected date, total files, total bytes, and close `✕` button.
- Table of uploaded files for that date (File name, size, time).
- Click on file calls `onOpenFile(file)` to open file in Vault.

---

### Task 5: Update `DashboardScreen.jsx` & `DashboardRankList.jsx`

**Files:**
- Modify: `src/screens/DashboardScreen.jsx`
- Modify: `src/components/DashboardRankList.jsx`

Features:
- Maintain `selectedDate` state in `DashboardScreen`.
- Support rendering `subtext` in `DashboardRankList` for story folders (e.g. `Naruto` as title, `Manga` as breadcrumb subtext).
- Render `DashboardDayDetail` between chart and top rank lists when a date is selected.

---

### Task 6: Style new dashboard elements in `src/index.css`

**Files:**
- Modify: `src/index.css`

Styles:
- Tooltip styling (`.gd-dashboard-tooltip`) with modern dark backdrop blur, glowing borders.
- Crosshair line (`.gd-dashboard-chart-crosshair`).
- Active day marker (`.gd-dashboard-chart-dot--active`).
- Day detail container (`.gd-dashboard-day-detail`).
- Story folder subtext (`.gd-dashboard-cell-subtext`).

---

### Task 7: Verification

**Actions:**
1. Run all unit tests: `npm test`.
2. Run build verification: `npm run build` or Vite dry-run.
3. Validate i18n symmetry with script / verification.
