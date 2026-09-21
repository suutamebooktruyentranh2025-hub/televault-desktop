# TeleVault Application Icon & Asset Pipeline Design

**Date:** 2026-09-20  
**Topic:** TeleVault Application Icon, Cross-Platform Packaging Assets, and Electron Runtime Integration  

---

## 1. Problem Statement & Motivation
Currently, TeleVault Desktop does not configure any application icon in its Electron builder configuration or runtime window. When packaging the desktop application via `npm run electron:build:mac` or `electron:build:win`, the build system outputs:
```
default Electron icon is used  reason=application icon is not set
```
As a result, the built `.dmg` package, macOS `.app` bundle, Windows NSIS installer, Windows executable, and the runtime Dock/Taskbar icons fall back to the default Electron atom symbol. In addition, the web preview (`index.html`) lacks a favicon.

The goal is to design and implement a complete **Native Asset Pipeline**:
1. Generate a high-resolution 1024x1024 master icon adhering to modern macOS squircle 3D aesthetics (cybernetic vault with Telegram blue accents and illuminated paper plane emblem).
2. Automate cross-platform conversion:
   - macOS: Generate multi-resolution `build/icon.icns` using macOS native `sips` and `/usr/bin/iconutil`.
   - Windows: Generate multi-layer `build/icon.ico` supporting standard desktop sizes (16px, 24px, 32px, 48px, 64px, 128px, 256px).
   - Web / Runtime: Provide web favicon and icon assets in `public/` and `build/`.
3. Integrate icon paths into `package.json` build config, `electron/main.js` BrowserWindow & dock, and `index.html`.

---

## 2. Architecture & Pipeline

### 2.1 File Structure
```
televault-desktop/
├── build/
│   ├── icon.png               # 1024x1024 Master Icon (RGBA)
│   ├── icon.icns              # macOS native icon bundle
│   ├── icon.ico               # Windows multi-resolution icon
│   └── icon.iconset/          # Intermediate macOS iconset (generated & cleaned)
├── public/
│   ├── icon.png               # Web / Browser tab icon
│   └── favicon.ico            # Favicon
├── scripts/
│   └── generate-icons.js      # Asset generation and conversion script
├── electron/
│   └── main.js                # Sets BrowserWindow({ icon }) and app.dock.setIcon()
├── index.html                 # <link rel="icon" ...>
└── package.json               # build.mac.icon, build.win.icon
```

### 2.2 Icon Generation Strategy
- Master icon resolution: 1024x1024 px PNG with alpha transparency.
- Visual theme: macOS Squircle with subtle 3D bevel, metallic titanium / brushed silver vault door, electric Telegram blue neon perimeter ring (`#0088CC` / `#2AABEE`), and a glowing white & cyan 3D origami paper airplane emblem centered on the vault dial.
- Antigravity image generation tool (`generate_image`) generates the master visual asset.

### 2.3 Asset Conversion Pipeline
- **macOS (`.icns`)**:
  Using `sips` to downscale `build/icon.png` into `build/icon.iconset`:
  - `icon_16x16.png` & `icon_16x16@2x.png`
  - `icon_32x32.png` & `icon_32x32@2x.png`
  - `icon_128x128.png` & `icon_128x128@2x.png`
  - `icon_256x256.png` & `icon_256x256@2x.png`
  - `icon_512x512.png` & `icon_512x512@2x.png`
  Using `/usr/bin/iconutil -c icns build/icon.iconset -o build/icon.icns`.
- **Windows (`.ico`)**:
  A Node.js script generates valid ICO binary format containing PNG-compressed images of sizes 16, 24, 32, 48, 64, 128, 256.

### 2.4 Integration Points
1. **`package.json`**:
   ```json
   "build": {
     "mac": {
       "icon": "build/icon.icns",
       "category": "public.app-category.productivity",
       "target": ["dmg"]
     },
     "win": {
       "icon": "build/icon.ico",
       "target": [...]
     }
   }
   ```
2. **`electron/main.js`**:
   ```javascript
   const appIconPath = path.join(__dirname, '../build/icon.png');
   const win = new BrowserWindow({
     ...,
     icon: appIconPath
   });
   if (process.platform === 'darwin' && app.dock) {
     app.dock.setIcon(appIconPath);
   }
   ```
3. **`index.html`**:
   ```html
   <link rel="icon" type="image/png" href="/icon.png" />
   ```

---

## 3. Verification Plan
1. **Asset Integrity Check**:
   - Verify `build/icon.png` is 1024x1024 PNG.
   - Verify `build/icon.icns` is recognized by `file build/icon.icns` as Mac OS X icon data.
   - Verify `build/icon.ico` is recognized by `file build/icon.ico` as MS Windows icon resource.
2. **Build Output Verification**:
   - Run `npm run electron:build:mac`.
   - Confirm build output does NOT show `default Electron icon is used`.
   - Confirm `release/TeleVault-0.1.0-arm64.dmg` and `release/mac-arm64/TeleVault.app` contain the custom icon.
