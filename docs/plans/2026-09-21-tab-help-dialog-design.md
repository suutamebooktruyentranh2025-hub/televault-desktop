# Tab Help Dialog Design

## Overview
Cung cấp nút trợ giúp (Help `?`) thống nhất trên thanh tiêu đề `DriveTopBar` cho tất cả các tab trong TeleVault (`vault`, `gdrive`, `dashboard`, `transfers`, `duplicates`, `settings`, `shared-vault`), giúp người dùng nhanh chóng nắm bắt các tính năng chính và cách sử dụng của từng màn hình.

## Components & Architecture

### 1. `DriveTopBar.jsx`
- Hiển thị nút `(?)` trợ giúp cho mọi tab (thay vì chỉ hiện khi `navigation.section === 'gdrive'`).
- Bấm nút sẽ kích hoạt `helpAction()` được truyền từ `VaultShell`.

### 2. `VaultShell.jsx`
- Quản lý trạng thái mở modal `showHelpDialog`.
- Xác định `currentSection` chính xác:
  - Nếu `navigation.vaultView === 'duplicates'` -> `'duplicates'`
  - Ngược lại -> `navigation.section` (`vault`, `gdrive`, `dashboard`, `transfers`, `settings`, `shared-vault`).
- Render `<HelpDialog section={currentSection} onClose={() => actions.setShowHelpDialog(false)} />`.

### 3. `HelpDialog.jsx`
- Nhận prop `section`.
- Header: Icon và tiêu đề tương ứng theo tab.
- Body: Danh sách các thẻ tính năng chính (Feature Cards) với icon, tiêu đề và mô tả.
- Footer: Nút đóng modal.

### 4. `src/i18n/locales.js`
- Khai báo đầy đủ, đồng bộ song ngữ đối xứng cho cả `vi` và `en` cho toàn bộ tiêu đề, tính năng và mô tả của 7 tab.
