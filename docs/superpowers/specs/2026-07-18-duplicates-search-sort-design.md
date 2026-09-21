# Duplicates search & sort

## Goal

Let users find and prioritize duplicate groups by path/name search and by wasted space or member count.

## Behavior

- **Search:** client-side, case-insensitive match on `originalPath` and member paths/file names.
- **Sort fields:** wasted bytes `(n - 1) × max(member.size)`, member count, path.
- **Direction:** ascending / descending (default: wasted desc).
- Summary shows filtered counts when a query is active; each group card shows `N files · wasted X`.

## Implementation

- Pure helpers in `@televault/core` (`duplicateListView.js`) with unit tests.
- `DuplicatesScreen` applies filter + sort via `useMemo`; no IPC changes.
