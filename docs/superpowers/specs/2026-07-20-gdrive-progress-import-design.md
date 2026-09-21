# Import GDrive sync progress (account A → B)

**Date:** 2026-07-20  
**Status:** Design approved in chat (user chose: same-machine + ZIP; clear dest queue)

## Problem

GDrive progress (`gdrive_manifest`, subscriptions, queue) lives in each Telegram account’s `accounts/<id>/index.db`. Account B can target vault A for uploads, but does not inherit A’s manifest. Rescanning Drive on B re-enqueues work and can **duplicate Telegram uploads** when B’s shared-vault local `files` index is incomplete vs vault A on Telegram.

## Goal

Let B import A’s GDrive sync progress so already-synced Drive→vault files are skipped (no re-upload), then continue only remaining work.

## Decisions

| Topic | Choice |
|-------|--------|
| Delivery | **C:** Phase 1 same-machine account→account; Phase 2 ZIP export/import |
| Queue on B | **A:** Clear B’s `gdrive_sync_queue`; next scan enqueues only gaps |
| Copy | manifest, subscriptions, selected `gdrive_state` (no tokens) |
| Vault index | Merge A’s `files` (+ tags) into B’s `shared-vaults/<vaultA_chatId>/index.db` |
| Sync target | Set B `sync_target_chat_id` = A’s `vault_chat_id` |
| Not copied | `gdrive_tokens`, Telegram `td/` session, API credentials |
| Direction | One-way replace of B’s GDrive progress tables (not merge of two Drive trees) |

## Why this prevents duplicates

After import on B (target = vault A):

1. `shouldEnqueueDriveFile` — same Drive `modifiedTime` + manifest + vault entry → skip enqueue.  
2. `shouldSkipDownload` — matching md5/sha/size → no Drive download.  
3. `_syncFile` / `enqueueUpload` — same path + sha256 + size on target vault DB → no Telegram upload.

Clearing B’s queue avoids stale/wrong pending rows fighting the imported manifest.

## Phase 1 — Same machine

### Preconditions

- A and B exist under `accounts/` on this install.  
- Prefer A paused during import.  
- B is the active account (or becomes active after import).

### Steps

1. User: Settings or GDrive → **Import GDrive progress from another account**.  
2. Pick source account A; destination = current account B.  
3. Confirm warning: overwrites B’s GDrive manifest/subscriptions/selected state; clears B’s sync queue.  
4. App: stop/pause GDrive workers on B.  
5. Read A’s `index.db`:
   - `vault_chat_id` (target vault)
   - all `gdrive_manifest` rows
   - all `gdrive_subscriptions` rows
   - selected `gdrive_state` keys: filters, conflict_policy, poll_interval, propagate_deletes, temp_download_dir, etc. **Exclude** any token keys.
6. Write into B’s `index.db`:
   - Replace/upsert manifest + subscriptions
   - Apply selected state keys
   - `gdriveSyncQueueClear()`
   - `gdrive_state.sync_target_chat_id` = A’s `vault_chat_id`
7. Ensure `accounts/B/shared-vaults/<vaultA_chatId>/` exists; open that `index.db`; **upsert** all `files` (and `file_tags` / `folder_tags` if present) from A’s personal `files` that belong to that vault (typically all non-trash vault entries in A’s DB when A’s personal vault **is** that chat).  
8. Resume/notify UI; toast counts (manifest rows, files merged, target chat id).  
9. User runs **Scan Now** — queue fills only with Drive files not covered by manifest+vault entry.

### Edge cases

- Source A has no `vault_chat_id` → abort with clear error.  
- B already has different GDrive subscriptions → replaced by A’s (warned).  
- Shared vault folder missing → create + merge.  
- Import while B syncing → force pause first.

## Phase 2 — ZIP package

### Export (from A)

File: `televault-gdrive-progress-YYYYMMDD-HHMM.zip`

Contents:

- `manifest.json` — app version, source account id, `vaultChatId`, timestamps, row counts  
- `gdrive.json` — subscriptions, manifest rows, selected state (no tokens)  
- `vault-files.json` (or sqlite snippet) — files (+ tags) for dedup  

No `td/`, no GDrive OAuth tokens, no full account replace.

### Import (on B)

Same merge rules as Phase 1, reading from ZIP instead of another local account dir. Set sync target from package `vaultChatId`. Clear B queue. B still logs into Drive/Telegram separately.

## Non-goals

- Sharing live upload bandwidth between two running sessions  
- Copying Telegram session so B becomes A  
- Automatic continuous sync of progress between accounts  
- Encrypting the ZIP (warn user to protect the file)

## Testing

- Unit: merge manifest/subscriptions into empty B DB; queue cleared.  
- Unit: vault files upsert into shared-vaults DB; path+sha present for dedup.  
- Unit: ZIP round-trip of gdrive.json + vault-files.  
- Integration-style: after import, `shouldEnqueueDriveFile` false for imported unchanged Drive file with vault entry.

## Success criteria

On B, after import + scan: files already on vault A (per imported index+manifest) do **not** re-upload to Telegram; only net-new / changed Drive files enter the queue.
