# Google Drive → TeleVault Sync Harden — Design

> Harden one-way Drive→Vault sync. No Vault→Drive.

**Date:** 2026-07-16  
**Status:** Approved for spec (user chose scope A, approaches Option 1, design sections OK)  
**Branch context:** builds on transfer improvements already shipped

---

## 1. Goal

Make Drive→Vault sync correct and reliable: auto-poll discovers new files, workers do not double-claim, large downloads resume, bandwidth is saved via md5 skip, deletes/conflicts are explicit policies, and lifecycle/UI match real behavior.

## 2. Non-goals

- Vault → Google Drive upload
- Changing OAuth to write scopes
- Google Drive push webhooks / watch channels
- Two-way conflict resolution like local folder sync
- Rewriting the entire GDrive stack from scratch

## 3. Approach

**Option 1 — patch in place** with small extracted helpers where needed (`queueClaim`, resume download). Reuse vault `streamHash.js`. Keep `GDriveSyncService` as orchestrator.

## 4. Architecture

```
Poll / Scan
    → Discovery (new + changed files under subscriptions)
    → Queue (atomic claim)
    → Transfer (resume download → stream hash → conflict policy → vault upload)
    → Policy (optional delete propagation)
    → AbortController (pause cancels in-flight)
```

### Modules

| Piece | Responsibility |
|---|---|
| `electron/lib/gdrive/gdriveSyncService.js` | Orchestration: connect, scan, poll, workers, pause |
| `electron/lib/db/indexDb.js` | Atomic `gdriveSyncQueueClaimNext()` |
| `electron/lib/gdrive/gdriveApi.js` | `downloadFile` with HTTP `Range` resume |
| `electron/lib/vault/streamHash.js` | Streaming SHA256 of temp files (reuse) |
| Settings / `gdrive_state` | `propagate_deletes`, `conflict_policy` |
| `src/screens/GDriveSyncScreen.jsx` | Toggles + throttle UI |
| `README.md` | Document one-way only |

## 5. Feature designs

### 5.1 Poll discovery (P0)

**Bug today:** `_runPollSync` only enqueues folder-sub files that already exist in `gdrive_manifest`. New files in a subscribed folder require manual Scan Now.

**Fix:**
1. For each change with a binary file (not Google Docs, not folder, not trashed unless delete policy):
2. Match against subscriptions:
   - **File subscription:** `sub.driveId === change.fileId` (unchanged)
   - **Folder subscription:** file is in-scope if any of:
     - existing manifest `vaultPath` starts with `sub.vaultPath`, or
     - `change.file.parents` intersects the subscribed folder tree (resolve via parent walk / cached folder ids under that subscription)
3. If in-scope and (`!manifest` or `manifest.driveModifiedTime !== change.file.modifiedTime`) → enqueue with resolved `drivePath` / `vaultPath`

**Path resolution:** Prefer Drive `name` + parent chain under the subscription root to build relative path; map to `sub.vaultPath + relativePath`. If parents cannot be resolved in one poll page, fall back to `files.get` with `fields=id,name,parents,modifiedTime,size,md5Checksum,mimeType,trashed`.

### 5.2 Atomic queue claim (P0)

**Bug today:** `gdriveSyncQueueGetNext()` is `SELECT ... LIMIT 1` with no claim; concurrency > 1 can process the same row twice.

**Fix:** Add `gdriveSyncQueueClaimNext(workerId)`:

```sql
-- Prefer single-statement claim (SQLite 3.35+ RETURNING) or transaction:
UPDATE gdrive_sync_queue
SET status = 'running', claimed_at = ?, claimed_by = ?
WHERE drive_file_id = (
  SELECT drive_file_id FROM gdrive_sync_queue
  WHERE status = 'queued' OR status IS NULL OR status = ''
  ORDER BY added_at ASC
  LIMIT 1
)
RETURNING *;
```

Migration: ensure `status`, `claimed_at`, `claimed_by` columns exist (add if missing). On worker start / crash recovery: reset stale `running` rows older than N minutes back to `queued`.

Workers must only process the claimed row. On success → remove. On retryable failure → set `queued` + bump `retry_count`. On final failure → move to sync errors + remove from queue.

### 5.3 md5 skip (P1)

Queue/manifest already can store `md5Checksum`. In `_syncFile`, before download:

1. If `manifest` exists for `driveFileId` and `manifest.md5` equals Drive `md5Checksum` and vault entry at `vaultPath` still matches stored sha256/size → skip entirely (treat as synced, update `driveModifiedTime` if needed).
2. Else if md5 matches but vault missing → still download (or re-upload from nowhere — must download).

Store md5 on manifest upsert.

### 5.4 Resume download + streaming hash (P1)

**Download (`gdriveApi.downloadFile`):**
- Write to temp path; if partial file exists with size `S > 0` and `S < expectedSize`, request `Range: bytes=S-`
- On 206: append; on 200: truncate and rewrite
- Retry 429 with existing rate limiter; keep partial file across retries

**Hash:** Replace `_sha256Of` (`readFileSync`) with `sha256Stream` from `electron/lib/vault/streamHash.js`.

**Abort:** Pass `AbortSignal` into download; pause aborts signal so in-flight download stops and queue item returns to `queued`.

### 5.5 Conflict policy (P1–P2)

Setting key: `conflict_policy` ∈ `skip` | `overwrite` | `keep_both` (default `skip`).

When vault already has a non-trash file at `vaultPath` with different sha256 than the incoming file:

| Policy | Behavior |
|---|---|
| `skip` | Do not upload; record sync error `conflict`; leave queue item removed |
| `overwrite` | Upload to same `vaultPath` (existing vault upload/index behavior) |
| `keep_both` | Upload to `uniqueVaultPath`-style name: `name (conflict YYYY-MM-DD).ext` under same folder |

UI: select in GDrive settings/panel.

### 5.6 Delete propagation (P1–P2, opt-in)

Setting: `propagate_deletes` boolean, default **`false`**.

When poll sees `change.removed` or `change.file.trashed` and a manifest exists for that `driveFileId`:

- If `propagate_deletes` is false → ignore (current behavior)
- If true → find vault entry by `manifest.vaultPath` / message mapping → **trash** (soft delete via existing vault trash), delete manifest row, remove any queued jobs for that id

Never hard-delete Telegram messages via this path.

### 5.7 Lifecycle cleanup (P2)

| Action | Cleanup |
|---|---|
| `disconnect` | Clear tokens, subs, manifest, page token, **queue**, **sync errors**, stop workers/poll |
| `removeSubscription` | Remove sub + manifest under vaultPath prefix + **queue/errors** for those drive ids / vaultPath prefix |
| `setPaused(true)` | Stop poll + abort active worker signals; claimed rows → `queued` |

### 5.8 UI / docs (P2)

- Expose `throttleInfo` from snapshot (concurrency, throttled flag, recent 429 count) on GDrive screen
- Controls for `propagate_deletes` and `conflict_policy`
- `retryAll`: process sequentially (await each), do not parallel fire-and-forget
- README: replace “two-way” GDrive wording with **Drive → TeleVault (one-way, read-only)**

### 5.9 OAuth hardening (small, in scope)

Verify OAuth `state` on localhost callback in `gdriveAuth.js` (CSRF). No scope change.

## 6. Data model changes

`gdrive_sync_queue` (migration as needed):

- `status` TEXT — `queued` | `running`
- `claimed_at` TEXT nullable
- `claimed_by` TEXT nullable

`gdrive_state` / settings:

- `propagate_deletes` — `'0'` / `'1'`
- `conflict_policy` — `skip` | `overwrite` | `keep_both`

`gdrive_manifest`:

- Persist `md5` if column missing (migration `md5 TEXT`)

## 7. Error handling

| Scenario | Behavior |
|---|---|
| 429 / network during download | Keep partial file; retry with backoff; re-claim later |
| Stall / abort on pause | Item back to `queued` |
| Conflict + `skip` | Sync error row; no upload |
| Delete prop + vault entry missing | Clear manifest only |
| md5 present but size mismatch | Ignore md5; full download |

## 8. Testing

| Test | Assert |
|---|---|
| Queue claim | Two concurrent claims get different rows |
| Poll discovery | New file under folder sub enqueued without prior manifest |
| md5 skip | Matching md5+vault → no download call |
| Conflict keep_both | Dest path gets conflict suffix |
| Resume | Partial temp + Range header used (mock HTTP) |
| propagate_deletes off | removed change does not trash vault |

## 9. Rollout phases

1. **P0:** queue claim + poll discovery + README fix  
2. **P1:** md5 skip + resume download + stream hash + conflict policy  
3. **P2:** propagate deletes + lifecycle cleanup + throttle UI + OAuth state + sequential retryAll  

Each phase is independently testable.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Parent walk expensive on large Changes pages | Cache subscribed folder id sets; batch `files.get` |
| Partial downloads corrupt | Verify size + sha256 before upload; delete bad temp on hash fail |
| Users enable delete prop accidentally | Default off; clear label in UI |
| SQLite RETURNING unavailable | Fallback transaction: select + update where status=queued |

## 11. Success criteria

- New file added to a subscribed Drive folder appears in queue after the next poll without Scan Now
- With concurrency 3, each queue item is processed once
- Interrupted large download resumes from byte offset
- Identical Drive md5 + existing vault file skips download
- README and UI describe one-way sync accurately
