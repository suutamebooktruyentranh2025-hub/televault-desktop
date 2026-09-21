# Optimize All Tab Headers — Design Document

**Date:** 2026-09-21  
**Status:** Approved  

## 1. Overview & Motivation

In the previous layout, the application displayed multiple stacked bars at the top:
1. TopBar (64px `h-16`) containing the search input and sync status. When search was hidden (on non-vault tabs), it remained an empty 64px blank space.
2. Breadcrumb bar (~36px) rendered conditionally when navigating subfolders.
3. Secondary toolbar inside `BrowserScreen` (~40px) displaying folder counts (`15 thư mục con • 7,305 tệp`) and view toggles (`[ 👯 Trùng lặp ] [ ≡ ] [ ⊞ ]`).

Combined, these stacked bars consumed up to ~140px of vertical space. Furthermore, tabs like Google Drive, Tags, Dashboard, Transfers, and Settings suffered from an empty top bar followed by inconsistent secondary headers.

This design unifies all headers into a **single, responsive 56px (`h-14`) Header** across all tabs.

---

## 2. Key Decisions

| Tab / Context | Left Slot | Center Slot | Right Slot |
|---|---|---|---|
| **My Drive** (normal) | Breadcrumb (`My Drive > ...`) + count badge (`X thư mục • Y tệp`) | Search box (`max-w-[360px]`) | `[ 👯 Trùng lặp ]`, `[ ≡ ] [ ⊞ ]`, divider, `DriveSyncIndicator` |
| **My Drive** (selection) | Selection count + clear button | Selection action buttons (Download, Move, Trash, Delete forever) | `DriveSyncIndicator` |
| **Shared Vault** | Shared Breadcrumb + count badge | Search box (`max-w-[360px]`) | `[ ≡ ] [ ⊞ ]`, divider, `DriveSyncIndicator` |
| **Google Drive** | Icon + Title `Google Drive` (or connected email) | Status badge (Đang đồng bộ / Sẵn sàng / Quét) | Help button `?`, `DriveSyncIndicator` |
| **Nhãn (Tags)** | Icon + Title `Nhãn` | — | `DriveSyncIndicator` |
| **Tổng quan (Dashboard)** | Icon + Title `Tổng quan` | — | `DriveSyncIndicator` |
| **Truyền tải (Transfers)** | Icon + Title `Truyền tải` | — | `DriveSyncIndicator` |
| **Cài đặt (Settings)** | Icon + Title `Cài đặt` | — | `DriveSyncIndicator` |
| **Trùng lặp (Duplicates)** | `[ ← Quay lại ]` + Title `Tập tin trùng lặp` | — | `DriveSyncIndicator` |

---

## 3. Architecture & Component Changes

### 3.1 Unified `DriveTopBar.jsx`
- Reduce height to `h-14` (56px).
- Support slots:
  - `leftContent` (or fallback to `title` with icon)
  - `centerContent` (search or null)
  - `rightContent` (screen-specific actions)
  - `syncStatus` + `onNavigateSection`
  - `selectionMode` / `selectionBar` overlay when items are selected

### 3.2 Simplify `BrowserScreen.jsx` & `VaultShell.jsx`
- Remove the separate breadcrumb row from `VaultShell.jsx` (now rendered in `leftContent` of `DriveTopBar`).
- Remove the top toolbar container (`folderSummary` + `onOpenDuplicates` + viewMode toggles) from `BrowserScreen.jsx`.
- When `selectionCount > 0`, render selection actions in `DriveTopBar`.

### 3.3 Screen Headers
- Remove duplicate title rows from secondary screens where applicable so they start cleanly right below the 56px TopBar.

---

## 4. Verification Plan

1. **My Drive layout**: Verify Breadcrumbs, folder counts, search box, `Trùng lặp`, and List/Grid buttons all live in the 56px top row without overflow.
2. **Selection Bar**: Select 1+ files in My Drive. Confirm the header transforms into the selection action bar with all actions working.
3. **Non-search Tabs**: Switch to GDrive, Tags, Dashboard, Transfers, Settings, and Duplicates. Confirm each has a clean title and relevant tools without an empty blank bar.
4. **Automated Tests**: Run `npm test` and `node --test src/utils/__tests__/*.test.js` to ensure zero regressions.
5. **Build Test**: Run `npm run build` to verify clean bundle.
