# Optimize All Tab Headers Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Unify all tab headers into a single-row 56px (`h-14`) Dynamic TopBar, moving breadcrumbs, counts, view mode, and duplicate buttons to the header and eliminating secondary toolbars.

**Architecture:** Refactor `DriveTopBar.jsx` to support slot-based dynamic rendering (left, center, right, selection bar). Update `VaultShell.jsx` to supply tab-specific headers. Remove secondary toolbars from `BrowserScreen.jsx`.

**Tech Stack:** React, Tailwind CSS, Electron.

---

### Task 1: Refactor `DriveTopBar.jsx` for Slot-Based & Selection Rendering
- Add support for `leftContent`, `centerContent`, `rightContent`, `selectionBar`, and reduce height from `h-16` (64px) to `h-14` (56px).
- Provide clean fallbacks for tab titles with icons.

### Task 2: Update `BrowserScreen.jsx` & Selection Flow
- Remove secondary toolbar row (`folderSummary`, `onOpenDuplicates`, view mode buttons).
- Pass `folderSummary` up or render directly in `DriveTopBar`.
- Render `DriveSelectionBar` directly in `DriveTopBar` when `selectionCount > 0`.

### Task 3: Update `VaultShell.jsx` to Unify All Tab Headers
- Wire `leftContent` (breadcrumb + item count), `centerContent` (search), `rightContent` (`Trùng lặp` + List/Grid + Sync) for Vault.
- Wire clean titles & badges for GDrive, Tags, Dashboard, Transfers, Settings, and Duplicates.
- Remove the separate `DriveBreadcrumb` row below TopBar.

### Task 4: Verification & Automated Tests
- Verify My Drive, Shared Vault, GDrive, Tags, Dashboard, Transfers, Settings, Duplicates.
- Run `npm test` and `node --test src/utils/__tests__/*.test.js`.
- Run `npm run build` to ensure clean bundle.
