# TeleVault Geometric Dual-Tone App Icon Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement the new geometric dual-tone (Green `#34A853` and Blue `#4285F4`) master application icon, generate multi-resolution assets for macOS (`.icns`), Windows (`.ico`), web favicon (`favicon.ico`), and verify integration.

**Architecture:** A standalone vector-to-PNG generator script creates the 1024x1024 master icon matching the exact reference geometry and colors. `scripts/generate-icons.js` processes the master icon into macOS `.icns` and multi-layer Windows `.ico` & web `favicon.ico`. Electron runtime and web preview verify the asset pipeline.

**Tech Stack:** SVG, macOS `qlmanage` / `sips`, macOS `iconutil`, Node.js binary ICO builder, Electron 34, Vite.

---

### Task 1: Generate High-Resolution Master Icon (1024x1024 PNG)

**Files:**
- Create: `scripts/render-master-icon.js`
- Create / Overwrite: `build/icon.png`
- Create / Overwrite: `public/icon.png`
- Create / Overwrite: `electron/assets/icon.png`

**Step 1: Write `scripts/render-master-icon.js`**
Write a Node script that defines the exact SVG vector geometry (white squircle container with drop shadow, Green `#34A853` polygon top, Blue `#4285F4` trapezoid bottom), and renders it to a 1024x1024 RGBA PNG file at `build/icon.png`.

**Step 2: Execute `scripts/render-master-icon.js`**
Run: `node scripts/render-master-icon.js`
Expected: `build/icon.png` created.

**Step 3: Verify Master Icon dimensions**
Run: `sips -g pixelWidth -g pixelHeight build/icon.png`
Expected: `pixelWidth: 1024` and `pixelHeight: 1024`.

---

### Task 2: Generate Multi-Resolution Native Assets (.icns, .ico, favicon)

**Files:**
- Run: `node scripts/generate-icons.js`
- Output: `build/icon.icns`
- Output: `build/icon.ico`
- Output: `public/favicon.ico`
- Output: `public/icon.png`
- Output: `electron/assets/icon.png`

**Step 1: Execute `scripts/generate-icons.js`**
Run: `node scripts/generate-icons.js`
Expected: Outputs indicating macOS `.icns`, Windows `.ico`, and Favicon generated successfully.

**Step 2: Verify binary formats**
Run: `file build/icon.icns build/icon.ico public/favicon.ico`
Expected:
- `build/icon.icns`: Mac OS X icon data
- `build/icon.ico`: MS Windows icon resource
- `public/favicon.ico`: MS Windows icon resource

---

### Task 3: Build & Verification

**Files:**
- Test build: `npm run build`

**Step 1: Run Vite production build**
Run: `npm run build`
Expected: Vite build succeeds with 0 errors.

**Step 2: Update task tracker & walkthrough**
Document results in `docs/plans/task.md` and walkthrough.
