# TeleVault App Icon Pipeline Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Create a complete native icon pipeline for TeleVault, including 1024x1024 master icon generation, cross-platform packaging assets (`.icns` for macOS, `.ico` for Windows), and Electron runtime & web favicon integration.

**Architecture:** Antigravity AI generates the 1024x1024 master squircle icon. A dedicated Node.js script orchestrates macOS `sips` + `/usr/bin/iconutil` to produce `icon.icns` and binary multi-layer packaging for `icon.ico`. Electron main process, index.html, and package.json build configurations are updated to reference the new assets.

**Tech Stack:** Node.js, macOS `sips`, macOS `iconutil`, Electron 34, Electron-Builder 24, Vite 8.

---

### Task 23: Master Icon Generation (1024x1024 PNG)

**Files:**
- Create: `build/icon.png`
- Create: `public/icon.png`

**Step 1: Generate Master Icon using generate_image tool**
Generate 1024x1024 master PNG featuring modern macOS squircle style, 3D metallic vault door with glowing cyan/blue Telegram paper plane emblem.

**Step 2: Verify Master Icon properties**
Run: `sips -g pixelWidth -g pixelHeight build/icon.png`
Expected: 1024x1024 pixelWidth and pixelHeight.

**Step 3: Copy to public directory for web frontend**
Copy `build/icon.png` to `public/icon.png`.

---

### Task 24: Cross-Platform Asset Conversion Script

**Files:**
- Create: `scripts/generate-icons.js`
- Test/Run: `node scripts/generate-icons.js`
- Outputs: `build/icon.icns`, `build/icon.ico`, `public/favicon.ico`

**Step 1: Write `scripts/generate-icons.js`**
Write script to:
1. Validate `build/icon.png` exists and is 1024x1024.
2. Generate intermediate `build/icon.iconset` with 16, 32, 128, 256, 512, 1024 sizes (@1x, @2x).
3. Invoke `/usr/bin/iconutil -c icns` to output `build/icon.icns`.
4. Generate Windows multi-layer `.ico` with sizes [16, 24, 32, 48, 64, 128, 256] using standard ICO header and directory format.
5. Clean up temporary `.iconset` directory.

**Step 2: Run script**
Run: `node scripts/generate-icons.js`
Expected: Successfully generated `build/icon.icns` and `build/icon.ico`.

**Step 3: Verify output formats**
Run: `file build/icon.icns build/icon.ico`
Expected: macOS icon data and MS Windows icon resource.

---

### Task 25: Electron Builder, Runtime Window & Web Favicon Integration

**Files:**
- Modify: `package.json`
- Modify: `electron/main.js`
- Modify: `index.html`

**Step 1: Update `package.json`**
Configure `build.mac.icon` to `"build/icon.icns"` and `build.win.icon` to `"build/icon.ico"`.

**Step 2: Update `electron/main.js`**
Add `icon: path.join(__dirname, '../build/icon.png')` in `BrowserWindow` options and call `app.dock.setIcon(...)` on macOS.

**Step 3: Update `index.html`**
Add `<link rel="icon" type="image/png" href="/icon.png" />`.

---

### Task 26: End-to-End Build & DMG Verification

**Files:**
- Run: `npm run electron:build:mac`
- Output: `release/mac-arm64/TeleVault.app`, `release/TeleVault-0.1.0-arm64.dmg`

**Step 1: Execute macOS Electron Build**
Run: `npm run electron:build:mac`
Expected: Exit code 0, no warning `default Electron icon is used reason=application icon is not set`.

**Step 2: Inspect Packaged App Icon**
Run: `ls -la release/mac-arm64/TeleVault.app/Contents/Resources/icon.icns` or verify bundle resource.
Expected: File exists and is identical to `build/icon.icns`.
