# TeleVault Desktop

🌍 *[Tiếng Việt](#phiên-bản-tiếng-việt) | [English](#english-version)*

---

## 🇻🇳 Phiên bản Tiếng Việt

TeleVault là một ứng dụng desktop mạnh mẽ dựa trên Electron, giúp biến tài khoản Telegram của bạn thành một ổ đĩa lưu trữ đám mây không giới hạn. Với giao diện lấy cảm hứng từ Google Drive, ứng dụng mang lại trải nghiệm quản lý tệp liền mạch, hoạt động hoàn toàn dựa trên TDLib của Telegram.

### Tính năng

- **Lưu trữ không giới hạn (Vault)**: Upload, quản lý và tải file sử dụng kênh Telegram Vault cá nhân của bạn.
- **Kho chia sẻ (Shared Vaults)**: Truy cập và tải file từ các kênh Telegram hoạt động như một kho lưu trữ chia sẻ ("Chia sẻ với tôi").
- **Hệ thống file ảo**: Hỗ trợ đầy đủ thư mục, truyền tải file, upload thư mục lồng nhau và đổi tên.
- **Database Cục bộ**: Siêu dữ liệu (metadata), thẻ (tags), và cấu trúc thư mục được index cục bộ bằng `better-sqlite3` giúp tải siêu tốc và tìm kiếm offline.
- **Hàng đợi Truyền tải**: Upload/Download chạy ngầm bất đồng bộ đáng tin cậy với khả năng theo dõi tiến trình, tự động tiếp tục và hỗ trợ hủy tác vụ.
- **Đa tài khoản**: Đăng nhập và chuyển đổi mượt mà giữa nhiều tài khoản Telegram.
- **Tags & Thùng rác**: Phân loại file với các tag màu sắc và quản lý file đã xóa trong Thùng rác.
- **Đồng bộ Google Drive một chiều (Drive → TeleVault, chỉ đọc).**
- **Giao diện tuyệt đẹp**: Hỗ trợ Dark Mode/Light Mode, giao diện tiếng Việt & tiếng Anh, và các component React mượt mà tối ưu.

### Công nghệ sử dụng (Tech Stack)

- **Framework**: Electron + React 18 + Vite
- **Styling**: Tailwind CSS
- **Database**: `better-sqlite3`
- **Telegram Client**: `tdl` / TDLib (`prebuilt-tdlib`)
- **State Management**: React Context, custom Hooks, và LocalStorage

### Hướng dẫn cài đặt (Development Setup)

#### 1. Cài đặt Dependencies
```bash
git clone https://github.com/suutamebooktruyentranh2025-hub/televault.git
cd televault-desktop
npm install
```

**Lưu ý về Native Modules:** `npm install` sẽ tự động chạy `electron-rebuild` để đảm bảo `better-sqlite3` tương thích với ABI của Electron. Nếu bạn gặp lỗi `MODULE_VERSION` sau này, hãy chạy:
```bash
npm run postinstall
# hoặc chạy thủ công
npx electron-rebuild -f -o better-sqlite3
```

#### 2. Chạy ứng dụng ở chế độ Dev
```bash
npm run electron:dev
```
Lệnh này sẽ khởi động dev server HMR của Vite và mở ứng dụng Electron.

### Build ứng dụng (Building for Release)

Để đóng gói ứng dụng thành file cài đặt độc lập:
```bash
npm run electron:build:mac    # Build file .dmg cho macOS
npm run electron:build:win    # Build file .exe (NSIS) cho Windows
npm run electron:build:all    # Build cho mọi nền tảng (Yêu cầu chạy trên Mac)
```

### Tổng quan cấu trúc thư mục (Structure overview)

- `electron/` — Code của Main process (IPC handlers, TDLib coordinators, Auth Service, Vault Managers, Transfer Queue).
- `src/` — Code của Renderer process (React UI, screens, components, Tailwind styles).
- `src/components/VaultShell.jsx` — UI shell chính xử lý Vault Grid và Sidebar navigation.
- `src/hooks/` — Các custom hooks quản lý đồng bộ state với IPC APIs của Electron.
- `src/i18n/` — Từ điển đa ngôn ngữ tiếng Việt (`vi`) và tiếng Anh (`en`).
- `.agent/` — Chứa hướng dẫn và quy trình tùy chỉnh cho trợ lý AI Antigravity.

### Hỗ trợ & Liên hệ

TeleVault Desktop được phát triển và bảo trì bởi admin của "Sưu tầm Ebook truyện tranh".
Để báo lỗi hoặc yêu cầu cấp quyền truy cập, vui lòng liên hệ qua:
- **Email**: suutamebooktruyentranh@gmail.com
- **Telegram (Admin)**: [@alexdandan](https://t.me/alexdandan)
- **Telegram Channel**: [Sưu tầm Ebook truyện tranh](https://t.me/suutamebooktruyentranh)

---

## 🇬🇧 English Version

TeleVault is a powerful Electron-based desktop application that transforms your Telegram account into an unlimited cloud storage drive. With a UI inspired by Google Drive, it provides a seamless file management experience powered entirely by Telegram's TDLib under the hood.

### Features

- **Unlimited Storage Vault**: Upload, organize, and download files using your private Telegram Vault channel.
- **Shared Vaults**: Access and download files from Telegram channels acting as shared file repositories ("Shared with me").
- **Virtual File System**: Fully supports folders, file transfers, nested folder uploads, and renaming.
- **Local Database**: Metadata, tags, and folder structure are indexed locally using `better-sqlite3` for blazing fast load times and offline search.
- **Transfers Queue**: Reliable async background uploads/downloads with progress tracking, auto-resume, and cancellation support.
- **Multi-Account**: Seamlessly log in and switch between multiple Telegram accounts.
- **Tags & Trash**: Organize your files with colorful tags and a dedicated Trash bin.
- **One-way Google Drive sync (Drive → TeleVault, read-only).**
- **Beautiful UI/UX**: Dark Mode/Light Mode, Vietnamese & English localization, and smooth responsive React interface.

### Tech Stack

- **Framework**: Electron + React 18 + Vite
- **Styling**: Tailwind CSS
- **Database**: `better-sqlite3`
- **Telegram Client**: `tdl` / TDLib (`prebuilt-tdlib`)
- **State Management**: React Context, custom Hooks, and LocalStorage for UI persistence

### Development Setup

#### 1. Install Dependencies
```bash
git clone https://github.com/suutamebooktruyentranh2025-hub/televault.git
cd televault-desktop
npm install
```

**Note on Native Modules:** `npm install` automatically triggers `electron-rebuild` to ensure `better-sqlite3` matches Electron's ABI. If you encounter a `MODULE_VERSION` mismatch later, run:
```bash
npm run postinstall
# or manually
npx electron-rebuild -f -o better-sqlite3
```

#### 2. Run the App in Dev Mode
```bash
npm run electron:dev
```
This boots Vite's HMR dev server and launches the Electron application.

### Building for Release

To package the application into a standalone installer:
```bash
npm run electron:build:mac    # Builds .dmg for macOS
npm run electron:build:win    # Builds .exe (NSIS) for Windows
npm run electron:build:all    # Builds for all target platforms (Requires Mac)
```

### Structure overview

- `electron/` — Main process code (IPC handlers, TDLib coordinators, Auth Service, Vault Managers, Transfer Queue).
- `src/` — Renderer process code (React UI, screens, components, Tailwind styles).
- `src/components/VaultShell.jsx` — The main UI shell handling the Vault Grid and Sidebar navigation.
- `src/hooks/` — Custom hooks managing state sync with Electron's IPC APIs.
- `src/i18n/` — Vietnamese (`vi`) and English (`en`) localization dictionary.
- `.agent/` — Contains Antigravity AI assistant guidelines and custom workflows for the codebase.

### Support & Contact

TeleVault Desktop is maintained by the admin of "Sưu tầm Ebook truyện tranh".
For bug reports or access requests, reach out via:
- **Email**: suutamebooktruyentranh@gmail.com
- **Telegram (Admin)**: [@alexdandan](https://t.me/alexdandan)
- **Telegram Channel**: [Sưu tầm Ebook truyện tranh](https://t.me/suutamebooktruyentranh)
