# GDrive Sync Target Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the logged-in Telegram account choose personal or shared vault as the GDrive upload target.

**Architecture:** Persist `sync_target_chat_id` in account GDrive state. Keep GDrive tables on account DB; bind uploads/dedup to a `VaultService` for the selected chat (personal or shared).

**Tech Stack:** Electron main (`GDriveSyncService`, `SharedVaultManager`, IPC), React `GDriveSyncScreen`, node:test.

## Global Constraints

- Do not move GDrive OAuth/manifest between Telegram accounts in this change.
- Shared vault UI remains read-oriented except for this GDrive upload path.
- Reuse existing `VaultService.enqueueUpload`; do not fork upload logic.
- TDD: failing test before production change for each behavior below.

---

## File map

| File | Role |
|------|------|
| `electron/lib/gdrive/gdriveSyncService.js` | Target state, vault resolve, use `vault.db` for entries |
| `electron/lib/vault/sharedVaultManager.js` | `ensureUploadVault(chatId, deps)` |
| `electron/lib/ipc/sessionHandlers.js` | Inject vault resolver into GDrive service |
| `electron/lib/ipc/gdriveHandlers.js` | IPC get/set target + list options |
| `electron/preload.js` (or existing bridge) | Expose IPC |
| `src/screens/GDriveSyncScreen.jsx` | Target dropdown |
| `src/i18n/locales.js` | Labels |
| `electron/lib/gdrive/__tests__/syncTargetVault.test.js` | New tests |
| `electron/lib/vault/__tests__/sharedVaultManager.test.js` | ensureUploadVault |

---

### Task 1: Use vault.db for entry lookups

**Files:** `gdriveSyncService.js`, `syncTargetVault.test.js`

- [ ] Write failing test: `_syncFile` md5-skip / dedup reads entries from `vault.db.getAll()`, not account `db.getAll()`, when they differ.
- [ ] Replace `this.db.getAll()` vault-entry reads in `gdriveSyncService` with `this.vault.db.getAll()` (helper `_vaultEntries()`).
- [ ] Keep `this.db` for all `gdrive_*` tables.
- [ ] Run test — pass.

### Task 2: Persist and apply sync target

**Files:** `gdriveSyncService.js`, tests

- [ ] Write failing test: `setSyncTargetChatId(chatId)` stores state and calls injected `resolveVault(chatId)`.
- [ ] Add `getSyncTargetChatId` / `setSyncTargetChatId` / snapshot fields (`syncTargetChatId`, `syncTargetLabel` optional).
- [ ] Constructor opts: `resolveVault: async (chatId|null) => VaultService`, `getPersonalVault: () => VaultService`.
- [ ] On set: pause if needed, resolve, assign `this.vault`, persist `sync_target_chat_id`, `onChange`.
- [ ] On construct/startPolling: re-apply saved target via `resolveVault`.
- [ ] Run tests — pass.

### Task 3: SharedVaultManager.ensureUploadVault

**Files:** `sharedVaultManager.js`, tests

- [ ] Write failing test: returns object with `chatId`, `db`, `enqueueUpload` (VaultService).
- [ ] Implement: `_ensureInstance` + `scanVault` if needed + `new VaultService({ client, db, channel, queue, chatId, onChange })`.
- [ ] Cache VaultService per chatId (dispose with instance cleanup).
- [ ] Run tests — pass.

### Task 4: Wire IPC + session

**Files:** `sessionHandlers.js`, `gdriveHandlers.js`, preload

- [ ] When creating `GDriveSyncService`, pass `resolveVault` that returns personal vault or `sharedVaults.ensureUploadVault`.
- [ ] IPC: `gdrive:getSyncTargets`, `gdrive:setSyncTarget`.
- [ ] Expose on `window.televault.gdrive`.

### Task 5: UI

**Files:** `GDriveSyncScreen.jsx`, `locales.js`

- [ ] Settings field: sync target select (Personal + shared vault titles).
- [ ] Load targets on mount / gdrive:changed; call setSyncTarget on change.
- [ ] Show toast on failure.

### Task 6: Verify

- [ ] Run gdrive + sharedVault related node tests.
- [ ] Manual checklist: login B → select vault A → scan → file appears under shared vault A.
