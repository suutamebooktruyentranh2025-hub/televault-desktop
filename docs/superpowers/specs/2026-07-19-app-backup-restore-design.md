# App backup & restore

## Problem

Factory reset / reinstall wipes local `index.db` (vault index + GDrive manifest/subscriptions). Re-syncing Drive can re-download everything; without a restored vault index, path/hash dedup may fail and Telegram can get duplicate uploads.

## Goal

Let users export/import local app state so GDrive→Telegram sync does **not** re-upload files that already exist in the vault.

## Decisions

| Topic | Choice |
|-------|--------|
| Goals | Preserve GDrive progress + move state across machines |
| Package | ZIP (`*.televault-backup.zip`) with `manifest.json` |
| Default (safe) | `index.db` copy with `gdrive_tokens` cleared; no `td/` session, no API creds |
| Advanced (optional) | Also include `td/`, GDrive tokens (full DB), Telegram API creds file |
| Import | Full replace of active account data; mandatory warning to backup first |
| Encryption | None — warn user to protect the file |

## Why this prevents duplicates

After restore of vault `files` + `gdrive_manifest` (same Telegram account):

1. Early skip: `shouldSkipDownload` when Drive md5 matches manifest + vault entry.
2. Upload skip: `_syncFile` / `enqueueUpload` when same vault path + sha256 + size already exists.

Safe mode still requires re-login to Telegram/Drive; progress tables remain so re-auth does not force re-upload.

## Flows

### Export

1. Settings → Backup & restore → Export.
2. Optional checkbox: include login sessions (warning).
3. Save dialog → write ZIP.
4. Toast success with path.

### Import

1. Settings (or login screen) → Import.
2. Confirm: replaces current local data; urge export first.
3. App stops sync/telegram, replaces files for active account, relaunches.

### Factory reset

Login-screen factory reset copy mentions exporting a backup first.

## Out of scope

- Password-encrypted archives
- Merge import
- Cloud auto-backup
- Backing up media cache / temp downloads

## Files (implementation)

- `electron/lib/backup/` — pack/unpack + DB sanitize
- IPC + preload under `session` or `backup`
- Settings UI + i18n
- Unit tests for sanitize + zip round-trip
