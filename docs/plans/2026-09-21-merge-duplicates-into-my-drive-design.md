# Merge Duplicates into My Drive — Design Document

**Date:** 2026-09-21  
**Status:** Approved  

## 1. Overview & Motivation

Previously, the **Trùng lặp** (Duplicates) feature existed as an independent top-level navigation item on the sidebar alongside *My Drive*, *Google Drive*, *Nhãn*, etc. Because duplicate scanning and resolution is fundamentally an operation on files within **My Drive** (the user's Vault), having it as an isolated sidebar tab cluttered the main navigation.

This design merges the Duplicate Scanner experience directly into **My Drive**, streamlining the sidebar navigation and providing an intuitive toolbar action inside the Vault file browser.

---

## 2. Key Decisions

| Topic | Decision |
|---|---|
| **Sidebar Entry** | Remove the dedicated **Trùng lặp** item from the sidebar navigation. |
| **Trigger Point** | Add an action button `[ 👯 Tìm trùng lặp ]` in `BrowserScreen`'s top toolbar next to view toggles (List/Grid). |
| **State Management** | Introduce `vaultView` (`'files'` \| `'duplicates'`) in Vault navigation state. Default is `'files'`. |
| **Back Navigation** | Provide an explicit `[ ← Quay lại ]` button on the duplicate screen to instantly return to the previously browsed folder without full app reload. |
| **"Open Folder" Action** | When clicking the folder icon on a duplicate member, switch `vaultView` back to `'files'`, navigate to that folder, and auto-scroll/highlight the file. |
| **Sidebar Highlight** | While viewing Duplicates inside My Drive, the sidebar keeps **My Drive** highlighted. |

---

## 3. Architecture & Component Changes

### 3.1 Sidebar ([`src/components/DriveSidebar.jsx`](file:///Users/admin/Documents/Projects/televault-desktop/src/components/DriveSidebar.jsx))
- Remove `NavItem` for `duplicates`.
- Sidebar items remain:
  1. My Drive
  2. Google Drive
  3. Tags / Nhãn
  4. Dashboard / Tổng quan
  5. Transfers / Hàng đợi truyền tải
  6. Trash / Thùng rác

### 3.2 Vault Navigation Hook ([`src/hooks/vault/useVaultNavigation.js`](file:///Users/admin/Documents/Projects/televault-desktop/src/hooks/vault/useVaultNavigation.js))
- Add state `vaultView` (`'files'` \| `'duplicates'`) with setter `setVaultView`.
- Whenever `section` changes away from `'vault'` or `currentFolder` is navigated via sidebar/breadcrumb, reset `vaultView` to `'files'`.
- Update section title logic so when `section === 'vault' && vaultView === 'duplicates'`, it reflects duplicate scanning.

### 3.3 Toolbar Button in ([`src/components/BrowserScreen.jsx`](file:///Users/admin/Documents/Projects/televault-desktop/src/components/BrowserScreen.jsx))
- In the top action bar (beside List/Grid view toggle buttons):
  - Add button `onOpenDuplicates`:
    - Shows `IconDuplicate` + label `t('scanDuplicates')` (or icon with title on smaller screens).
    - Hidden or disabled when inside Trash (`isTrash`) or when `readonly` is true.

### 3.4 Content Rendering in ([`src/components/vault/VaultContentArea.jsx`](file:///Users/admin/Documents/Projects/televault-desktop/src/components/vault/VaultContentArea.jsx) & [`src/components/VaultShell.jsx`](file:///Users/admin/Documents/Projects/televault-desktop/src/components/VaultShell.jsx))
- When `section === 'vault'`:
  - If `vaultView === 'duplicates'`: render `<DuplicatesScreen onBack={() => setVaultView('files')} />`.
  - Else: render `BrowserScreen` as usual.
- Ensure `gd-navigate` handler in `VaultShell.jsx` resets `vaultView` to `'files'` before navigating to a target folder and highlighting file.

### 3.5 Duplicate Screen UI ([`src/screens/DuplicatesScreen.jsx`](file:///Users/admin/Documents/Projects/televault-desktop/src/screens/DuplicatesScreen.jsx))
- Accept `onBack` prop.
- Render a header bar with `[ ← Quay lại ]` button (and optional path info) allowing quick return to file browsing.

---

## 4. Verification Plan

1. **Sidebar Navigation**:
   - Confirm "Trùng lặp" is removed from the sidebar.
   - Confirm "My Drive" remains active when toggling into duplicate view.
2. **Toolbar Trigger**:
   - Navigate to `/` or subfolders (e.g., `/Work/`).
   - Click `Tìm trùng lặp` button.
   - Confirm `DuplicatesScreen` mounts and performs scan.
3. **Return Navigation**:
   - Click `[ ← Quay lại ]`.
   - Confirm user returns to `/Work/` (same folder as before).
4. **Navigate to Duplicate File**:
   - From a duplicate group item, click "Mở thư mục" (Open folder).
   - Confirm it switches to file view, opens the item's parent folder, and scrolls to/highlights the file.
5. **Automated Tests**:
   - Run `npm test` to ensure all existing test suites pass.
