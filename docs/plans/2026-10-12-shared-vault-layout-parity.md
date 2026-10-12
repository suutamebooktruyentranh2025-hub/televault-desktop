# Shared Vault Layout Parity Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Standardize the TopBar header and breadcrumb layout of Shared Vault to match My Vault symmetrically, separating the breadcrumb sub-header and enabling column sort toggling.

**Architecture:** Update `VaultShell.jsx` to render an `IconSharedDrive` + Title header on the top bar for Shared Vault, and update `VaultContentArea.jsx` to place `DriveBreadcrumb` in an identical sub-header bar below the TopBar with `onToggleSort` enabled on `BrowserScreen`.

**Tech Stack:** React, Tailwind CSS, Lucide-style SVG Icons (`IconSharedDrive`), TeleVault i18n (`useI18n`).

---

### Task 1: Update TopBar Header in `VaultShell.jsx`

**Files:**
- Modify: `src/components/VaultShell.jsx`

**Step 1: Inspect and update `topBarLeftContent` for `isSharedSection`**
- Import `IconSharedDrive` from `./DriveIcons`.
- Replace the breadcrumb in `topBarLeftContent` with the section icon and active vault title:
  ```jsx
  <div className="flex items-center gap-2.5 min-w-0">
    <IconSharedDrive className="h-5 w-5 shrink-0 text-[var(--gd-primary)]" />
    <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">
      {sharedVaults.activeVault?.title || t('navSharedWithMe')}
    </h1>
  </div>
  ```

---

### Task 2: Add Breadcrumb Sub-Header and Sort Toggle in `VaultContentArea.jsx`

**Files:**
- Modify: `src/components/vault/VaultContentArea.jsx`

**Step 1: Add Breadcrumb Sub-Header in `renderSharedVault`**
- In `renderSharedVault()`, wrap content in a container containing the breadcrumb bar:
  ```jsx
  <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--gd-border)] bg-[var(--gd-bg)] min-h-[40px] shrink-0">
    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
      <DriveBreadcrumb
        crumbs={sharedVaults.breadcrumbs}
        onNavigate={sharedVaults.goTo}
        showSingle={true}
      />
      {folderSummary?.text && (
        <span
          className="text-xs text-[var(--gd-text-secondary)] whitespace-nowrap select-none opacity-75 hidden sm:inline shrink-0"
          title={folderSummary.tooltip}
        >
          • {folderSummary.text}
        </span>
      )}
    </div>
  </div>
  ```

**Step 2: Connect Column Sorting in `BrowserScreen`**
- Pass `onToggleSort={sharedVaults.toggleSort}` to `<BrowserScreen ... />` in `renderSharedVault()`.

---

### Task 3: Verification & Parity Check

**Files:**
- Verify: Run `npm test` and `npm run build`.
- Verify: Visual parity and no console/render errors.
