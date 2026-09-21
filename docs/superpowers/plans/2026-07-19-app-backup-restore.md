# App Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export/import local account state so GDrive sync does not re-upload files already in the Telegram vault.

**Architecture:** Pure backup helpers under `electron/lib/backup/` build a ZIP (`manifest.json` + `index.db` [+ optional `td/`, API creds]). IPC stops services, replaces active account files, relaunches. Settings UI + factory-reset hint.

**Tech Stack:** Electron, better-sqlite3, Node fs, store-only ZIP (no new deps), React settings.

## Global Constraints

- Import = full replace of active account local data; warn to backup first.
- Safe export clears `gdrive_tokens`; advanced may keep tokens + sessions.
- No encryption.
- Success criterion: restored manifest + vault files enable skip/dedup (no duplicate Telegram uploads).

---

### Task 1: ZIP store + DB sanitize (TDD)

- [x] Write failing tests for zip round-trip and token stripping
- [x] Implement `zipStore.js` + sanitize helper in `appBackup.js`
- [x] Verify tests pass

### Task 2: createBackup / restoreBackup helpers

- [x] Tests for safe vs session packages
- [x] Implement packaging against a temp account dir
- [x] Verify tests pass

### Task 3: IPC + preload

- [x] `backup:export` / `backup:import` handlers (dialog, stop services, relaunch on import)
- [x] Expose on `window.televault.backup`

### Task 4: Settings UI + login hint + i18n

- [x] Settings section with export/import + include-sessions checkbox
- [x] Factory-reset confirm mentions backup
- [x] vi/en strings
