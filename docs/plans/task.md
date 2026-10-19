| # | Task | Status |
|---|------|--------|
| 1 | Bổ sung 26 key i18n đối xứng song ngữ cho 12 theme presets (`src/i18n/locales.js`) | `[x]` |
| 2 | Cập nhật `src/theme/applyTheme.js` & `src/context/ThemeContext.jsx` hỗ trợ `AVAILABLE_THEMES` và quản lý preset | `[x]` |
| 3 | Hỗ trợ lưu trữ `themePreset` trong IPC electron (`electron/lib/ipc/vault/transferHandlers.js`) | `[x]` |
| 4 | Xây dựng component `src/components/ThemeCardPicker.jsx` trực quan với color swatches và check badge | `[x]` |
| 5 | Bổ sung bộ biến màu CSS cho 12 theme (Light & Dark) trong `src/index.css` | `[x]` |
| 6 | Tích hợp `ThemeCardPicker` vào mục Giao diện trong `src/screens/SettingsScreen.jsx` | `[x]` |
| 7 | Tích hợp cơ chế collapse/expand trực tiếp khi nhấp vào header của các mục nhiều dòng (không dùng nút bên phải) | `[x]` |
| 8 | Loại bỏ dropdown "Chế độ màu", tích hợp chuyển đổi Sáng/Tối trực tiếp trong `ThemeCardPicker` | `[x]` |
| 9 | Kiểm thử build (`npm run build`) và unit tests (`npm test`) | `[x]` |
