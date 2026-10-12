# Rescan Vault Context Refactoring Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Move and expose Telegram Vault Rescan functionality to its primary context in My Vault & Shared Vaults, standardizing the IPC layer (`vault:rescanHistory`) while keeping Google Drive tab streamlined.

**Architecture:** 
1. Expose `vault:rescanHistory` in `electron/lib/ipc/vault/browseHandlers.js`, capable of performing a full history walk (`forceFull: true`) for both personal vault and shared vaults.
2. Bind the new method in `electron/preload.js` and `preload.js`.
3. Provide a prominent Rescan button with real-time feedback (`IconRefresh` + spinning state) in `DriveTopBar` / `VaultShell` for both My Vault and Shared Vaults.
4. Add symmetrical i18n keys in `src/i18n/locales.js` (`vi` and `en`).
5. Ensure tests and Vite build pass without errors.

**Tech Stack:** Electron IPC, React, Tailwind CSS, Node.js test runner, Vite.

---

### Task 1: Expose `vault:rescanHistory` in Electron IPC and Preload
**Files:**
- Modify: `electron/lib/ipc/sessionHandlers.js`
- Modify: `electron/lib/ipc/vault/browseHandlers.js`
- Modify: `electron/preload.js`
- Modify: `preload.js`

### Task 2: Add Symmetrical i18n Translation Keys
**Files:**
- Modify: `src/i18n/locales.js`

### Task 3: Add Rescan Button & Action to My Vault & Shared Vaults UI
**Files:**
- Modify: `src/components/VaultShell.jsx`

### Task 4: Verify and Build
**Files:**
- Verify with `npm test` and `npm run build`
