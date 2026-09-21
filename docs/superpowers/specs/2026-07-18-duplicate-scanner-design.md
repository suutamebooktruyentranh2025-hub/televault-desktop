# Duplicate Scanner (Conflict + Exact Path) — Design

**Date:** 2026-07-18  
**Status:** Approved for planning  
**Goal:** Add a dedicated vault screen that scans duplicate files (exact same path and `(conflict …)` names with their originals) and lets the user keep one copy while moving the others to Telegram trash.

## Background

TeleVault already produces paths like `name (conflict YYYY-MM-DD).ext` via `resolvePathConflicts` and GDrive `keep_both`. Users also have groups of multiple Telegram messages sharing the same vault path. There is no UI to inspect these groups with the original file side-by-side, or to resolve them by keeping one entry.

Out of scope for this feature:

- Blocking new duplicate uploads at ingest time (separate workstream)
- Same-sha256 groups across different paths
- Bulk “keep all originals” without per-group review
- Remote caption mass-edit / `resolveConflictsNow({ syncRemote: true })`

## Decisions

| Topic | Choice |
|---|---|
| Entry point | Dedicated nav item **Trùng lặp** / **Duplicates** in VaultShell |
| Actions | View + **keep one / trash others** |
| Scan coverage | `(conflict …)` + matched original, **and** exact path duplicate groups |
| Delete semantics | Existing `trashEntries` (Telegram trash), not hard delete |

## Architecture

```
UI DuplicatesScreen
  → IPC vault.scanDuplicates
      → db.getAll()
      → scanDuplicateGroups(entries)   // @televault/core (pure)
  → IPC vault.resolveDuplicateGroup({ keepMessageId, trashMessageIds })
      → validate membership
      → VaultService.trashEntries(trashMessageIds)
```

### 1. Pure scanner (`@televault/core`)

`scanDuplicateGroups(entries) → DuplicateGroup[]`

**Group kind `exact_path`**

- File entries (not directories) with identical `path`
- Group id stable, e.g. `exact:${path}`
- Members: all entries sharing that path

**Group kind `conflict_name`**

- Detect conflict basename suffix with regex covering:
  - `(conflict YYYY-MM-DD)`
  - `(conflict YYYY-MM-DD N)` (numbered)
  - Nested / repeated conflict suffixes (strip all trailing conflict segments when deriving original)
- Original candidate path = same directory + basename with all conflict suffixes removed + extension restored
- Group id e.g. `conflict:${originalPath}`
- Members: original entry if present (`isOriginal: true`) + all conflict-named entries that strip to that original
- If original missing, still emit the group with `originalPath` set and no original member

**Member fields**

- `messageId`, `path`, `size`, `sha256`, `mtime`
- `isConflictName`, `isOriginal`
- Group-level flags derived for UI: `sameContent` (all members share one sha256), `mixedContent` (otherwise)

**Ordering**

- Groups sorted by `originalPath` / path
- Within group: original first, then conflicts by `messageId` ascending

Do not create `exact_path` and `conflict_name` groups that double-count the same set when an exact path group is already emitted for that path; prefer a single `exact_path` group for identical paths. Conflict-name grouping applies when names differ (original vs conflict-suffixed paths).

### 2. IPC / main process

| Channel | Behavior |
|---|---|
| `vault.scanDuplicates` | Require ready vault; return `{ ok, groups, summary: { groupCount, fileCount } }` |
| `vault.resolveDuplicateGroup` | Body: `{ keepMessageId, trashMessageIds: number[] }`. Reject if keep is in trash list, lists empty, or ids are not a coherent subset of one scanned group (re-scan or pass `groupId` + re-validate against current `getAll()`). Call `trashEntries(trashMessageIds)`. Return `{ ok }` or `{ ok: false, error }`. |

No new DB tables.

### 3. UI (`DuplicatesScreen`)

- Nav entry next to Transfer / GDrive
- **Quét lại** button
- Summary line: `N nhóm · M file`
- Accordion list per group:
  - Header: kind label, member count, suggested original path
  - Rows: name, size, short sha, mtime; badges Gốc / Conflict; Cùng nội dung / Khác nội dung
  - Per-row **Giữ bản này** → confirm dialog listing how many files go to trash → resolve IPC → remove group from local state or re-scan

i18n: Vietnamese + English keys for all new strings.

## Error handling

- Trash / Telegram failure: toast with error; leave group visible; do not optimistically remove
- Stale ids (already trashed): treat as success for missing ids or re-scan and refresh
- Flood / rate limit: surface existing error string; user retries later

## Testing

1. Unit (`televault-core`): parse conflict suffixes; find original; nested conflict names; missing original; exact path group; no false group for unique paths
2. Unit/integration (electron mock): resolve rejects keep∈trash list; calls trash with expected ids only
3. Manual: open Duplicates on account with known conflict samples; keep original; confirm conflict copies appear under Trash

## Success criteria

- User can open **Trùng lặp**, scan, see conflict files alongside originals (when present) and exact-path duplicate groups
- User can keep one member and move the rest to trash without leaving the screen
- Scanner logic is covered by unit tests without Telegram network

## Non-goals (explicit)

- Auto-resolve on boot
- Deleting from Telegram permanently in this flow
- Preventing future duplicate uploads (follow-up design)
