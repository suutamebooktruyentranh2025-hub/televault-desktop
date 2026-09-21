# Duplicate Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated **Trùng lặp / Duplicates** screen that scans exact-path duplicates and `(conflict …)` files (with originals), and lets the user keep one member while trashing the rest via existing `trashEntries`.

**Architecture:** Pure `scanDuplicateGroups` + `validateDuplicateResolve` in `@televault/core`; Electron IPC `vault:scanDuplicates` / `vault:resolveDuplicateGroup`; React `DuplicatesScreen` wired through `DriveSidebar` + `VaultShell`.

**Tech Stack:** Node `node:test`, `@televault/core` (CommonJS), Electron IPC, React 19, existing i18n + `trashEntries`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-duplicate-scanner-design.md`
- Scan kinds only: `exact_path` and `conflict_name` (no cross-path sha groups)
- Delete = Telegram trash via `VaultService.trashEntries`, not permanent delete
- No boot auto-resolve; no remote caption mass-edit in this feature
- Variable names: adjective_noun where new locals are introduced
- Code comments in English; UI strings vi + en in `src/i18n/locales.js`
- TDD: failing test before implementation for each logic task

## File map

| File | Role |
|---|---|
| Create: `packages/televault-core/src/duplicateScanner.js` | Pure scan + resolve validation |
| Create: `packages/televault-core/__tests__/duplicateScanner.test.js` | Unit tests for scanner |
| Modify: `packages/televault-core/src/index.js` | Export scanner |
| Create: `electron/lib/vault/__tests__/duplicateResolveIpc.test.js` | IPC-style resolve validation / handler helper tests |
| Modify: `electron/lib/ipc/vaultHandlers.js` | Register scan + resolve handlers |
| Modify: `electron/preload.js` | Expose `vault.scanDuplicates` / `vault.resolveDuplicateGroup` |
| Create: `src/screens/DuplicatesScreen.jsx` | UI |
| Modify: `src/components/DriveSidebar.jsx` | Nav item |
| Modify: `src/components/VaultShell.jsx` | Route `section === 'duplicates'` |
| Modify: `src/i18n/locales.js` | vi/en strings |

---

### Task 1: Pure duplicate scanner (core)

**Files:**
- Create: `packages/televault-core/src/duplicateScanner.js`
- Create: `packages/televault-core/__tests__/duplicateScanner.test.js`
- Modify: `packages/televault-core/src/index.js`

**Interfaces:**
- Consumes: `createVaultEntry` / entries with `messageId`, `path`, `size`, `sha256`, `mtime`; `isDir` from `./vaultEntry`
- Produces:
  - `stripConflictSuffixes(filePath: string) → { originalPath: string, isConflictName: boolean }`
  - `scanDuplicateGroups(entries: VaultEntry[]) → DuplicateGroup[]`
  - `validateDuplicateResolve(groups, keepMessageId, trashMessageIds) → { ok: true } | { ok: false, error: string }`
  - `DuplicateGroup`: `{ id, kind: 'exact_path'|'conflict_name', originalPath, sameContent, mixedContent, members: DuplicateMember[] }`
  - `DuplicateMember`: `{ messageId, path, size, sha256, mtime, isConflictName, isOriginal }`

- [ ] **Step 1: Write the failing tests**

Create `packages/televault-core/__tests__/duplicateScanner.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry } = require('../src/vaultEntry');
const {
  stripConflictSuffixes,
  scanDuplicateGroups,
  validateDuplicateResolve,
} = require('../src/duplicateScanner');

function file(messageId, path, sha = 'a'.repeat(64), size = 1) {
  return createVaultEntry({
    messageId,
    path,
    size,
    sha256: sha,
    mtime: new Date('2024-01-01T00:00:00.000Z'),
    tags: [],
  });
}

test('stripConflictSuffixes removes nested conflict segments', () => {
  const r = stripConflictSuffixes(
    '/GDrive/Abyss Rage T01 (conflict 2026-07-15) (conflict 2026-07-15).cbz',
  );
  assert.equal(r.isConflictName, true);
  assert.equal(r.originalPath, '/GDrive/Abyss Rage T01.cbz');
});

test('scanDuplicateGroups groups exact path duplicates', () => {
  const groups = scanDuplicateGroups([
    file(1, '/a/x.cbz', 'a'.repeat(64)),
    file(2, '/a/x.cbz', 'b'.repeat(64)),
    file(3, '/a/y.cbz', 'c'.repeat(64)),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'exact_path');
  assert.equal(groups[0].id, 'exact:/a/x.cbz');
  assert.equal(groups[0].members.length, 2);
  assert.equal(groups[0].mixedContent, true);
});

test('scanDuplicateGroups pairs conflict name with original', () => {
  const groups = scanDuplicateGroups([
    file(10, '/a/T01.cbz', 'a'.repeat(64)),
    file(11, '/a/T01 (conflict 2026-07-15).cbz', 'a'.repeat(64)),
    file(12, '/a/T01 (conflict 2026-07-12).cbz', 'b'.repeat(64)),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'conflict_name');
  assert.equal(groups[0].originalPath, '/a/T01.cbz');
  assert.equal(groups[0].members.length, 3);
  assert.equal(groups[0].members[0].isOriginal, true);
  assert.equal(groups[0].members[0].messageId, 10);
  assert.equal(groups[0].sameContent, false);
});

test('scanDuplicateGroups emits conflict group when original missing', () => {
  const groups = scanDuplicateGroups([
    file(11, '/a/T01 (conflict 2026-07-15).cbz'),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 1);
  assert.equal(groups[0].members[0].isOriginal, false);
});

test('scanDuplicateGroups ignores directories and unique files', () => {
  const groups = scanDuplicateGroups([
    createVaultEntry({
      messageId: 1,
      path: '/a/',
      size: 0,
      sha256: '',
      mtime: new Date(),
      tags: [],
    }),
    file(2, '/a/solo.cbz'),
  ]);
  assert.equal(groups.length, 0);
});

test('validateDuplicateResolve accepts subset trash of one group', () => {
  const groups = scanDuplicateGroups([
    file(1, '/a/x.cbz'),
    file(2, '/a/x.cbz', 'b'.repeat(64)),
    file(3, '/a/x.cbz', 'c'.repeat(64)),
  ]);
  assert.deepEqual(validateDuplicateResolve(groups, 1, [2, 3]), { ok: true });
});

test('validateDuplicateResolve rejects keep in trash list', () => {
  const groups = scanDuplicateGroups([file(1, '/a/x.cbz'), file(2, '/a/x.cbz', 'b'.repeat(64))]);
  const r = validateDuplicateResolve(groups, 1, [1, 2]);
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=@televault/core`

Expected: FAIL — `Cannot find module '../src/duplicateScanner'` (or missing exports).

- [ ] **Step 3: Implement `duplicateScanner.js`**

```js
const { isDir } = require('./vaultEntry');

const CONFLICT_SEGMENT = /\s*\(conflict \d{4}-\d{2}-\d{2}(?: \d+)?\)$/;

/**
 * @param {string} filePath
 * @returns {{ originalPath: string, isConflictName: boolean }}
 */
function stripConflictSuffixes(filePath) {
  const slash = filePath.lastIndexOf('/');
  const dir = slash >= 0 ? filePath.slice(0, slash + 1) : '';
  const base = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  const dot = base.lastIndexOf('.');
  const hasExt = dot > 0;
  let stem = hasExt ? base.slice(0, dot) : base;
  const ext = hasExt ? base.slice(dot) : '';
  let stripped = false;
  while (CONFLICT_SEGMENT.test(stem)) {
    stem = stem.replace(CONFLICT_SEGMENT, '');
    stripped = true;
  }
  return { originalPath: `${dir}${stem}${ext}`, isConflictName: stripped };
}

function toMember(entry, { isConflictName, isOriginal }) {
  return {
    messageId: entry.messageId,
    path: entry.path,
    size: entry.size,
    sha256: entry.sha256,
    mtime: entry.mtime,
    isConflictName,
    isOriginal,
  };
}

function contentFlags(members) {
  const shas = new Set(members.map((m) => m.sha256).filter(Boolean));
  const sameContent = shas.size === 1 && members.length > 1;
  return { sameContent, mixedContent: !sameContent && members.length > 1 };
}

/**
 * @param {import('./vaultEntry').VaultEntry[]} entries
 */
function scanDuplicateGroups(entries) {
  const files = entries.filter((e) => !isDir(e) && !e.path.endsWith('/'));
  /** @type {Map<string, typeof files>} */
  const byPath = new Map();
  for (const e of files) {
    const list = byPath.get(e.path) || [];
    list.push(e);
    byPath.set(e.path, list);
  }

  /** @type {ReturnType<typeof buildExact>[]} */
  const groups = [];
  const pathsInExact = new Set();

  for (const [pathKey, list] of byPath) {
    if (list.length < 2) continue;
    pathsInExact.add(pathKey);
    const members = [...list]
      .sort((a, b) => a.messageId - b.messageId)
      .map((e, idx, arr) =>
        toMember(e, {
          isConflictName: stripConflictSuffixes(e.path).isConflictName,
          isOriginal: idx === arr.length - 1 ? false : false,
        }),
      );
    // For exact_path: no single "original" by name; mark none as original
    for (const m of members) {
      m.isOriginal = false;
      m.isConflictName = stripConflictSuffixes(m.path).isConflictName;
    }
    const flags = contentFlags(members);
    groups.push({
      id: `exact:${pathKey}`,
      kind: 'exact_path',
      originalPath: pathKey,
      ...flags,
      members,
    });
  }

  /** @type {Map<string, { original: import('./vaultEntry').VaultEntry|null, conflicts: typeof files }>} */
  const conflictBuckets = new Map();
  for (const e of files) {
    if (pathsInExact.has(e.path)) continue;
    const { originalPath, isConflictName } = stripConflictSuffixes(e.path);
    if (!isConflictName) continue;
    if (pathsInExact.has(originalPath)) continue;
    let bucket = conflictBuckets.get(originalPath);
    if (!bucket) {
      bucket = { original: null, conflicts: [] };
      conflictBuckets.set(originalPath, bucket);
    }
    bucket.conflicts.push(e);
  }
  for (const e of files) {
    if (pathsInExact.has(e.path)) continue;
    const { isConflictName } = stripConflictSuffixes(e.path);
    if (isConflictName) continue;
    if (conflictBuckets.has(e.path)) {
      conflictBuckets.get(e.path).original = e;
    }
  }

  for (const [originalPath, bucket] of conflictBuckets) {
    if (bucket.conflicts.length === 0) continue;
    const members = [];
    if (bucket.original) {
      members.push(toMember(bucket.original, { isConflictName: false, isOriginal: true }));
    }
    for (const e of [...bucket.conflicts].sort((a, b) => a.messageId - b.messageId)) {
      members.push(toMember(e, { isConflictName: true, isOriginal: false }));
    }
    const flags = contentFlags(members);
    groups.push({
      id: `conflict:${originalPath}`,
      kind: 'conflict_name',
      originalPath,
      ...flags,
      members,
    });
  }

  groups.sort((a, b) => a.originalPath.localeCompare(b.originalPath));
  return groups;
}

/**
 * @param {ReturnType<typeof scanDuplicateGroups>} groups
 * @param {number} keepMessageId
 * @param {number[]} trashMessageIds
 */
function validateDuplicateResolve(groups, keepMessageId, trashMessageIds) {
  if (!Number.isInteger(keepMessageId)) {
    return { ok: false, error: 'invalid keepMessageId' };
  }
  if (!Array.isArray(trashMessageIds) || trashMessageIds.length === 0) {
    return { ok: false, error: 'trashMessageIds required' };
  }
  if (trashMessageIds.includes(keepMessageId)) {
    return { ok: false, error: 'keepMessageId cannot be trashed' };
  }
  for (const group of groups) {
    const memberIds = new Set(group.members.map((m) => m.messageId));
    if (!memberIds.has(keepMessageId)) continue;
    const others = new Set(
      group.members.map((m) => m.messageId).filter((id) => id !== keepMessageId),
    );
    if (!trashMessageIds.every((id) => others.has(id))) continue;
    return { ok: true };
  }
  return { ok: false, error: 'ids are not a coherent subset of one duplicate group' };
}

module.exports = {
  stripConflictSuffixes,
  scanDuplicateGroups,
  validateDuplicateResolve,
};
```

Fix exact_path member loop: remove the dead `idx === arr.length` ternary — use the second loop only (already in snippet).

Export from `packages/televault-core/src/index.js`:

```js
module.exports = {
  ...require('./vaultEntry'),
  ...require('./captionCodec'),
  ...require('./moveTargets'),
  ...require('./trash'),
  ...require('./vaultTree'),
  ...require('./searchText'),
  ...require('./folderTags'),
  ...require('./vaultOps'),
  ...require('./dashboardAggregator'),
  ...require('./duplicateScanner'),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@televault/core`

Expected: all tests PASS including new `duplicateScanner` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/televault-core/src/duplicateScanner.js \
  packages/televault-core/__tests__/duplicateScanner.test.js \
  packages/televault-core/src/index.js
git commit -m "$(cat <<'EOF'
feat(core): add duplicate scanner for conflict and exact paths

EOF
)"
```

---

### Task 2: Electron IPC scan + resolve

**Files:**
- Modify: `electron/lib/ipc/vaultHandlers.js`
- Modify: `electron/preload.js`
- Create: `electron/lib/vault/__tests__/duplicateResolveIpc.test.js`

**Interfaces:**
- Consumes: `scanDuplicateGroups`, `validateDuplicateResolve` from `@televault/core`; `ctx.getDb()`, `ctx.getVault()`, `ctx.isReady()`
- Produces:
  - IPC `vault:scanDuplicates` → `{ ok: true, groups, summary: { groupCount, fileCount } } | { ok: false, error }`
  - IPC `vault:resolveDuplicateGroup` → `{ ok: true } | { ok: false, error }`
  - Preload: `window.televault.vault.scanDuplicates()`, `resolveDuplicateGroup({ keepMessageId, trashMessageIds })`

- [ ] **Step 1: Write failing IPC helper test**

Create `electron/lib/vault/__tests__/duplicateResolveIpc.test.js` that imports core validators (proves wiring contract used by handler):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry } = require('@televault/core');
const {
  scanDuplicateGroups,
  validateDuplicateResolve,
} = require('@televault/core');

function file(messageId, path, sha = 'a'.repeat(64)) {
  return createVaultEntry({
    messageId,
    path,
    size: 1,
    sha256: sha,
    mtime: new Date('2024-01-01T00:00:00.000Z'),
    tags: [],
  });
}

test('resolve contract: trash others keeps one', () => {
  const groups = scanDuplicateGroups([
    file(1, '/a/T01.cbz'),
    file(2, '/a/T01 (conflict 2026-07-15).cbz', 'b'.repeat(64)),
  ]);
  assert.equal(validateDuplicateResolve(groups, 1, [2]).ok, true);
  assert.equal(validateDuplicateResolve(groups, 2, [1]).ok, true);
  assert.equal(validateDuplicateResolve(groups, 1, [1]).ok, false);
});
```

- [ ] **Step 2: Run test**

Run: `node --test electron/lib/vault/__tests__/duplicateResolveIpc.test.js`

Expected: PASS once Task 1 is merged (if Task 1 not done, FAIL on missing export — complete Task 1 first).

- [ ] **Step 3: Add handlers in `vaultHandlers.js`**

Near other `require('@televault/core')` imports, add:

```js
const {
  // ...existing
  scanDuplicateGroups,
  validateDuplicateResolve,
} = require('@televault/core');
```

(Or extend the existing destructure.)

Inside `registerVaultHandlers`, after `vault:checkDuplicate` handler:

```js
  ipcMain.handle('vault:scanDuplicates', () => {
    if (!ctx.isReady()) return { ok: false, error: 'Vault not ready' };
    const db = ctx.getDb();
    const groups = scanDuplicateGroups(db.getAll());
    const fileCount = groups.reduce((n, g) => n + g.members.length, 0);
    return {
      ok: true,
      groups: groups.map((g) => ({
        ...g,
        members: g.members.map((m) => ({
          ...m,
          mtime: m.mtime instanceof Date ? m.mtime.toISOString() : m.mtime,
        })),
      })),
      summary: { groupCount: groups.length, fileCount },
    };
  });

  ipcMain.handle('vault:resolveDuplicateGroup', async (_evt, { keepMessageId, trashMessageIds = [] } = {}) => {
    if (!ctx.isReady()) return { ok: false, error: 'Vault not ready' };
    const db = ctx.getDb();
    const vault = ctx.getVault();
    if (!vault) return { ok: false, error: 'Vault not ready' };
    const groups = scanDuplicateGroups(db.getAll());
    const validation = validateDuplicateResolve(groups, keepMessageId, trashMessageIds);
    if (!validation.ok) return validation;
    try {
      await vault.trashEntries(trashMessageIds);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
```

- [ ] **Step 4: Expose preload APIs**

In `electron/preload.js` inside `vault: { ... }`, add:

```js
    scanDuplicates: () => ipcRenderer.invoke('vault:scanDuplicates'),
    resolveDuplicateGroup: (keepMessageId, trashMessageIds) =>
      ipcRenderer.invoke('vault:resolveDuplicateGroup', { keepMessageId, trashMessageIds }),
```

- [ ] **Step 5: Commit**

```bash
git add electron/lib/ipc/vaultHandlers.js electron/preload.js \
  electron/lib/vault/__tests__/duplicateResolveIpc.test.js
git commit -m "$(cat <<'EOF'
feat(vault): IPC for duplicate scan and resolve

EOF
)"
```

---

### Task 3: DuplicatesScreen UI + nav

**Files:**
- Create: `src/screens/DuplicatesScreen.jsx`
- Modify: `src/components/DriveSidebar.jsx`
- Modify: `src/components/VaultShell.jsx`
- Modify: `src/i18n/locales.js`

**Interfaces:**
- Consumes: `window.televault.vault.scanDuplicates`, `resolveDuplicateGroup`
- Produces: section id `'duplicates'`; i18n keys listed below

- [ ] **Step 1: Add i18n keys**

In Vietnamese block of `src/i18n/locales.js` (near `taskSection` / nav keys):

```js
  navDuplicates: 'Trùng lặp',
  duplicatesTitle: 'File trùng lặp',
  duplicatesScan: 'Quét lại',
  duplicatesSummary: '{groups} nhóm · {files} file',
  duplicatesEmpty: 'Không tìm thấy nhóm trùng lặp',
  duplicatesKindExact: 'Trùng path',
  duplicatesKindConflict: 'Conflict name',
  duplicatesBadgeOriginal: 'Gốc',
  duplicatesBadgeConflict: 'Conflict',
  duplicatesSameContent: 'Cùng nội dung',
  duplicatesMixedContent: 'Khác nội dung',
  duplicatesKeep: 'Giữ bản này',
  duplicatesConfirmTitle: 'Chuyển bản còn lại vào Rác?',
  duplicatesConfirmBody: 'Giữ 1 file, chuyển {n} file vào Rác Telegram.',
  duplicatesConfirmOk: 'Xác nhận',
  duplicatesConfirmCancel: 'Hủy',
  duplicatesError: 'Không xử lý được nhóm trùng',
  duplicatesScanning: 'Đang quét…',
```

English block:

```js
  navDuplicates: 'Duplicates',
  duplicatesTitle: 'Duplicate files',
  duplicatesScan: 'Rescan',
  duplicatesSummary: '{groups} groups · {files} files',
  duplicatesEmpty: 'No duplicate groups found',
  duplicatesKindExact: 'Same path',
  duplicatesKindConflict: 'Conflict name',
  duplicatesBadgeOriginal: 'Original',
  duplicatesBadgeConflict: 'Conflict',
  duplicatesSameContent: 'Same content',
  duplicatesMixedContent: 'Different content',
  duplicatesKeep: 'Keep this',
  duplicatesConfirmTitle: 'Move the others to Trash?',
  duplicatesConfirmBody: 'Keep 1 file, move {n} file(s) to Telegram Trash.',
  duplicatesConfirmOk: 'Confirm',
  duplicatesConfirmCancel: 'Cancel',
  duplicatesError: 'Could not resolve duplicate group',
  duplicatesScanning: 'Scanning…',
```

- [ ] **Step 2: Implement `DuplicatesScreen.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';

function shortSha(sha) {
  if (!sha || sha.length < 12) return sha || '—';
  return `${sha.slice(0, 8)}…`;
}

function formatSize(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DuplicatesScreen() {
  const { t } = useI18n();
  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState({ groupCount: 0, fileCount: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingKeep, setPendingKeep] = useState(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.televault.vault.scanDuplicates();
      if (!result?.ok) {
        setError(result?.error || t('duplicatesError'));
        setGroups([]);
        return;
      }
      setGroups(result.groups || []);
      setSummary(result.summary || { groupCount: 0, fileCount: 0 });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void runScan();
  }, [runScan]);

  async function confirmKeep() {
    if (!pendingKeep) return;
    const { keepMessageId, trashMessageIds, groupId } = pendingKeep;
    setPendingKeep(null);
    setError(null);
    const result = await window.televault.vault.resolveDuplicateGroup(
      keepMessageId,
      trashMessageIds,
    );
    if (!result?.ok) {
      setError(result?.error || t('duplicatesError'));
      return;
    }
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setSummary((prev) => ({
      groupCount: Math.max(0, prev.groupCount - 1),
      fileCount: Math.max(0, prev.fileCount - trashMessageIds.length),
    }));
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl text-[var(--gd-text)]">{t('duplicatesTitle')}</h1>
          <p className="text-sm text-[var(--gd-text-secondary)]">
            {t('duplicatesSummary', {
              groups: summary.groupCount,
              files: summary.fileCount,
            })}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-[var(--gd-primary)] px-3 py-2 text-sm text-white"
          onClick={() => void runScan()}
          disabled={loading}
        >
          {loading ? t('duplicatesScanning') : t('duplicatesScan')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && groups.length === 0 && (
        <p className="text-sm text-[var(--gd-text-secondary)]">{t('duplicatesEmpty')}</p>
      )}

      <ul className="flex flex-col gap-2 overflow-auto">
        {groups.map((group) => {
          const open = expandedId === group.id;
          return (
            <li key={group.id} className="rounded-md border border-[var(--gd-border)]">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left"
                onClick={() => setExpandedId(open ? null : group.id)}
              >
                <span className="text-sm text-[var(--gd-text)]">
                  {group.kind === 'exact_path'
                    ? t('duplicatesKindExact')
                    : t('duplicatesKindConflict')}
                  {' · '}
                  {group.originalPath}
                  {' · '}
                  {group.members.length}
                </span>
                <span className="text-xs text-[var(--gd-text-secondary)]">
                  {group.sameContent
                    ? t('duplicatesSameContent')
                    : t('duplicatesMixedContent')}
                </span>
              </button>
              {open && (
                <ul className="border-t border-[var(--gd-border)] px-3 py-2">
                  {group.members.map((m) => (
                    <li
                      key={m.messageId}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <div>
                        <div className="text-[var(--gd-text)]">{m.path.split('/').pop()}</div>
                        <div className="text-xs text-[var(--gd-text-secondary)]">
                          {formatSize(m.size)} · {shortSha(m.sha256)}
                          {m.isOriginal ? ` · ${t('duplicatesBadgeOriginal')}` : ''}
                          {m.isConflictName ? ` · ${t('duplicatesBadgeConflict')}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded border border-[var(--gd-border)] px-2 py-1 text-xs"
                        onClick={() =>
                          setPendingKeep({
                            groupId: group.id,
                            keepMessageId: m.messageId,
                            trashMessageIds: group.members
                              .map((x) => x.messageId)
                              .filter((id) => id !== m.messageId),
                          })
                        }
                      >
                        {t('duplicatesKeep')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {pendingKeep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-[var(--gd-bg)] p-4 shadow-lg">
            <h2 className="text-lg text-[var(--gd-text)]">{t('duplicatesConfirmTitle')}</h2>
            <p className="mt-2 text-sm text-[var(--gd-text-secondary)]">
              {t('duplicatesConfirmBody', { n: pendingKeep.trashMessageIds.length })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="px-3 py-1 text-sm" onClick={() => setPendingKeep(null)}>
                {t('duplicatesConfirmCancel')}
              </button>
              <button
                type="button"
                className="rounded bg-[var(--gd-primary)] px-3 py-1 text-sm text-white"
                onClick={() => void confirmKeep()}
              >
                {t('duplicatesConfirmOk')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

Check how `t('…', { n })` interpolation works in this project — match existing `syncingProgress` / `t('syncingProgress', { n })` pattern. If the i18n helper uses different placeholders, align keys (`{n}`, `{groups}`, `{files}`) with `I18nContext` implementation.

- [ ] **Step 3: Wire sidebar + shell**

In `DriveSidebar.jsx`, after the transfers `NavItem`, add a duplicates item (reuse an existing icon if no dedicated one — e.g. copy `IconLabel` or `IconTransfer` temporarily, or add a simple duplicate icon in `DriveIcons.jsx` if trivial):

```jsx
            <NavItem
              active={section === 'duplicates'}
              icon={<IconTransfer className="h-5 w-5" />}
              label={t('navDuplicates')}
              onClick={() => onSectionChange('duplicates')}
            />
```

Prefer a distinct icon if one already exists; otherwise IconTransfer is acceptable for v1.

In `VaultShell.jsx`:

1. `import { DuplicatesScreen } from '../screens/DuplicatesScreen';`
2. In title helper: `if (section === 'duplicates') return t('navDuplicates');`
3. In render branch next to transfers:

```jsx
    if (section === 'duplicates') {
      return <DuplicatesScreen />;
    }
```

- [ ] **Step 4: Manual smoke**

Run: `npm run electron:dev`

Expected:
- Sidebar shows **Trùng lặp**
- Open screen → auto-scan → groups with conflict + original
- Keep one → confirm → group disappears; trashed files under Rác

- [ ] **Step 5: Commit**

```bash
git add src/screens/DuplicatesScreen.jsx \
  src/components/DriveSidebar.jsx \
  src/components/VaultShell.jsx \
  src/i18n/locales.js
git commit -m "$(cat <<'EOF'
feat(ui): add Duplicates screen for conflict cleanup

EOF
)"
```

---

### Task 4: Verification

**Files:** none new

- [ ] **Step 1: Run core tests**

Run: `npm test --workspace=@televault/core`  
Expected: PASS

- [ ] **Step 2: Run electron duplicate tests**

Run: `node --test electron/lib/vault/__tests__/duplicateResolveIpc.test.js packages/televault-core/__tests__/duplicateScanner.test.js`  
Expected: PASS

- [ ] **Step 3: Spec checklist**

Confirm against design:
- [x] Dedicated nav + screen
- [x] exact_path + conflict_name + original
- [x] Keep one / trash others via `trashEntries`
- [x] Confirm dialog
- [x] Errors leave group visible
- [x] Unit tests for scanner
- [x] No sha-cross-path groups / no boot auto-resolve

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Dedicated Duplicates nav/screen | Task 3 |
| Scan conflict + original | Task 1 |
| Scan exact path | Task 1 |
| Keep one / trash others | Task 2–3 |
| Confirm before trash | Task 3 |
| IPC scan/resolve | Task 2 |
| Pure unit tests | Task 1 |
| Error toast / keep group | Task 3 |
| No permanent delete / no sha groups / no boot auto | Out of scope — not in tasks |

No TBD placeholders remain. Types/names consistent: `scanDuplicateGroups`, `validateDuplicateResolve`, `vault:scanDuplicates`, `vault:resolveDuplicateGroup`.
