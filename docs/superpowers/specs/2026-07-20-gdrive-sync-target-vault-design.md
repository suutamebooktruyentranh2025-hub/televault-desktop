# GDrive Sync Target Vault Design

**Date:** 2026-07-20  
**Status:** Approved for implementation (user waived Q&A)

## Problem

GDrive sync always uploads into the **personal** TeleVault channel of the logged-in Telegram account (Creator-only). Account B who is admin on vault A can browse A as a shared vault but cannot continue a Drive → vault A sync while logged in as B.

## Goal

While logged in as Telegram account B, allow GDrive sync to upload into a **selected target vault**: either B’s personal vault (default) or a shared vault channel A that B can access (e.g. admin with post rights).

## Non-goals

- Migrating GDrive OAuth / queue / manifest between Telegram accounts automatically
- Making shared vaults fully writable in the main file browser UI
- Multi-target sync (one Drive subscription → many vaults) in v1

## Approaches considered

1. **Sync-target chat selector (recommended)** — Persist `sync_target_chat_id` in account GDrive state; resolve a `VaultService` bound to that chat’s index DB for uploads/dedup; keep GDrive tables on the active account DB.
2. **Promote shared vault to “active vault” globally** — Larger blast radius; breaks personal vault assumptions across the app.
3. **Copy/re-bind account A’s `index.db` onto B** — Fragile, mixes identities, unsafe for tokens/sessions.

**Choice:** Approach 1.

## Architecture

```
Account B index.db          Shared vault A index.db
├─ gdrive_* tables    ──┐   ├─ files (dedup / index)
├─ gdrive_state         │   └─ (scanned via SharedVaultManager)
│   sync_target_chat_id─┼──► VaultService(chatId=A, db=A, channel=A)
└─ (personal vault B)   └──► enqueueUpload → Telegram channel A
```

- **GDrive control plane** (OAuth, subscriptions, queue, manifest, errors): stays on active account `index.db`.
- **Vault data plane** (file index, upload, trash-on-overwrite): uses the target vault’s DB + `chatId`.
- Default target = personal vault (`sync_target_chat_id` empty / unset).

## Components

| Unit | Responsibility |
|------|----------------|
| `gdrive_state.sync_target_chat_id` | Persisted target; empty = personal |
| `GDriveSyncService` | Resolve active vault; use `vault.db` for entry lookups; expose get/set target |
| `SharedVaultManager.ensureUploadVault` | Scan if needed; build `VaultService` for shared chat |
| `sessionHandlers` / `gdriveHandlers` | Wire resolve + IPC |
| `GDriveSyncScreen` | Dropdown: personal + discovered shared vaults |

## Behavior

1. On set target → persist, swap `this.vault`, ensure shared vault scanned, `onChange`.
2. If target chat disappears / inaccessible → fall back to personal and surface `lastError`.
3. Changing target while syncing: pause workers, swap vault, restart workers (or reject until paused — prefer auto-pause/resume).
4. Upload failures (no post permission) → normal sync error path; do not write false success manifest (already fixed).

## Testing

- Unit: vault entry lookups use `vault.db`, not account `db`, when they differ.
- Unit: `setSyncTarget` persists and swaps vault handle.
- Unit: `ensureUploadVault` returns VaultService with correct `chatId`.

## Success criteria

Account B can select vault A, connect Drive, subscribe a folder, and see new files appear in vault A (Telegram channel A / shared vault browser), not in B’s personal vault.
