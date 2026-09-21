# TeleVault Geometric Dual-Tone App Icon Design

**Date:** 2026-09-21  
**Topic:** Exact Geometric Dual-Tone (Green & Blue) Master App Icon and Multi-Platform Asset Pipeline  

---

## 1. Context & Motivation

The user requested the TeleVault application icon to be redesigned to match the exact geometric shape and dual-tone color palette of the reference image:
- **Top Element:** Vibrant slanted parallelogram in Green (`#34A853`).
- **Bottom Element:** Solid trapezoidal foundation in Blue (`#4285F4`).
- **Background Container:** Standard macOS Squircle with soft ambient drop shadow and crisp white card styling.

This replaces the previous skeuomorphic 3D vault dial icon with a modern, minimalist, vector-accurate brand identity.

---

## 2. Visual Specification & Vector Geometry

### 2.1 Colors
- **Green Element:** `#34A853` (sRGB: 52, 168, 83)
- **Blue Element:** `#4285F4` (sRGB: 66, 133, 244)
- **Squircle Background:** `#FFFFFF` with drop shadow `#00000026`

### 2.2 Geometry (1024x1024 Master)
In a 1024x1024 canvas:
- Outer Squircle: `rect` from (64, 64) with size 896x896 and corner radius 200px.
- Centered 18x scaled vector paths:
  - Top Polygon (Green): `M14 20L22 6h12l-8 14H14z`
  - Bottom Trapezoid (Blue): `M6 34L14 20h20l8 14H6z`
  - Translated by `(80, 152)` to be mathematically centered within the 1024x1024 bounds.

---

## 3. Asset Pipeline & Deliverables

1. **Master High-Res Asset:** `build/icon.png` (1024x1024 RGBA PNG)
2. **macOS Native Bundle:** `build/icon.icns` (multi-resolution 16 to 1024px generated via `sips` + `iconutil`)
3. **Windows Executable Icon:** `build/icon.ico` (multi-size 16, 24, 32, 48, 64, 128, 256px)
4. **Web Favicon:** `public/favicon.ico` (16, 32, 48px)
5. **Web & Runtime Previews:** `public/icon.png` and `electron/assets/icon.png` (mirrored from master)

---

## 4. Verification Plan

- `sips -g pixelWidth -g pixelHeight build/icon.png` ensures 1024x1024 dimension.
- `file build/icon.icns build/icon.ico public/favicon.ico` verifies valid container binary formats.
- `npm run build` verifies frontend bundle compiles cleanly with the new favicon/icon.
