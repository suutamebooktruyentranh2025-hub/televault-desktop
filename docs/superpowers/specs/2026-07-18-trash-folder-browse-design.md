# Trash folder browse

## Problem

Trash UI listed folder names but blocked opening them (`onDoubleClick` disabled, breadcrumb hidden), so users could not inspect files before restore/delete forever. Backend `listFolder` already supports nested trash paths.

## Decision

Allow browsing trash folders like the normal vault: double-click to open, breadcrumb to go up, context menu “Open”. Keep trash read-only for mutate-except-restore/delete (no rename, upload, drag-drop).

## Behavior

- Double-click folder in trash (list + grid) navigates into it.
- Context menu for trash folders includes Open, Restore, Delete forever.
- Breadcrumb while in trash: `Thùng Rác › …` (trash root as first crumb; no “My Drive”).
- Sidebar Trash stays active for nested trash paths.
- Rename / upload / drag-drop remain disabled in trash.

## Out of scope

- Inline preview without navigation
- File-count summaries on folder rows
