# Merge Duplicates into My Drive Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Merge the Duplicate Scanner into the My Drive section as a toolbar action and sub-view, removing the standalone sidebar tab.

**Architecture:** Update `DriveSidebar.jsx` to remove `duplicates`, add `vaultView` state to `useVaultNavigation.js`, add action button in `BrowserScreen.jsx` toolbar, route `DuplicatesScreen` with back button in `VaultContentArea.jsx`, and ensure `gd-navigate` resets `vaultView`.

**Tech Stack:** React, Electron, Vitest / Node test runner.

---

### Task 1: Update Navigation Hook and Sidebar
- Modify `src/hooks/vault/useVaultNavigation.js`: Add `vaultView` (`'files'` | `'duplicates'`), `setVaultView`, reset `vaultView` on section changes.
- Modify `src/components/DriveSidebar.jsx`: Remove `NavItem` for `duplicates`.

### Task 2: Add Duplicate Action Button in Browser Toolbar
- Modify `src/components/BrowserScreen.jsx`: Add `onOpenDuplicates` prop and render `[ 👯 Tìm trùng lặp ]` button in the top action toolbar beside List/Grid view toggles.

### Task 3: Support Back Navigation & Render in Vault Content Area
- Modify `src/screens/DuplicatesScreen.jsx`: Accept `onBack` prop and display a return button in the screen header.
- Modify `src/components/vault/VaultContentArea.jsx`: Render `DuplicatesScreen` when `section === 'vault'` and `vaultView === 'duplicates'`.
- Modify `src/components/VaultShell.jsx`: Pass `vaultView` and `setVaultView` to `VaultContentArea`, handle `onOpenDuplicates`, and ensure `gd-navigate` resets `vaultView` to `'files'`.

### Task 4: Automated Verification & Manual Sanity Testing
- Run test suites (`npm test`) to ensure zero regressions.
- Verify Electron dev app state and clean up console/HMR warnings if any.
