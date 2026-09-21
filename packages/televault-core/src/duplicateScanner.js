const { isDir } = require('./vaultEntry');

const TELEVAULT_CONFLICT_SEGMENT = /\(conflict \d{4}-\d{2}-\d{2}(?:\s+\d+)?\)/i;
const COPY_OR_CONFLICT_SEGMENT =
  /(\s*\(conflict \d{4}-\d{2}-\d{2}(?:\s+\d+)?\)|\s*\(\d{1,2}\)|\s*-\s*Copy(?:\s*\(\d+\))?|\s*\(Copy(?:\s*\d+)?\))$/i;

function toNfc(str) {
  return typeof str === 'string' ? str.normalize('NFC') : str;
}

/**
 * Strips conflict and copy suffixes (e.g. " (1)", " (Copy)", " - Copy", " (conflict 2026-07-15)")
 * from filename stem and folder segments.
 *
 * @param {string} filePath
 * @returns {{ originalPath: string, isConflictName: boolean }}
 */
function stripConflictSuffixes(filePath) {
  const normFilePath = toNfc(filePath);
  if (typeof normFilePath !== 'string') {
    return { originalPath: normFilePath, isConflictName: false };
  }

  const segments = normFilePath.split('/');
  let was_stripped = false;

  const stripped_segments = segments.map((segment, idx) => {
    if (!segment) return segment;
    const is_last_segment = idx === segments.length - 1;

    if (is_last_segment) {
      const dot_index = segment.lastIndexOf('.');
      const has_extension = dot_index > 0;
      let name_stem = has_extension ? segment.slice(0, dot_index) : segment;
      const file_extension = has_extension ? segment.slice(dot_index) : '';

      while (COPY_OR_CONFLICT_SEGMENT.test(name_stem)) {
        name_stem = name_stem.replace(COPY_OR_CONFLICT_SEGMENT, '');
        was_stripped = true;
      }
      return `${name_stem}${file_extension}`;
    } else {
      let dir_name = segment;
      while (COPY_OR_CONFLICT_SEGMENT.test(dir_name)) {
        dir_name = dir_name.replace(COPY_OR_CONFLICT_SEGMENT, '');
        was_stripped = true;
      }
      return dir_name;
    }
  });

  return {
    originalPath: stripped_segments.join('/'),
    isConflictName: was_stripped,
  };
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
  const file_entries = entries.filter((e) => !isDir(e) && !e.path.endsWith('/'));
  /** @type {Map<string, typeof file_entries>} */
  const entries_by_path = new Map();
  for (const entry of file_entries) {
    const normPath = toNfc(entry.path);
    const path_list = entries_by_path.get(normPath) || [];
    path_list.push(entry);
    entries_by_path.set(normPath, path_list);
  }

  /** @type {Set<string>} */
  const original_paths_with_conflicts = new Set();
  for (const entry of file_entries) {
    const { originalPath, isConflictName } = stripConflictSuffixes(entry.path);
    if (isConflictName) {
      original_paths_with_conflicts.add(originalPath);
    }
  }

  /** @type {Array<{ id: string, kind: string, originalPath: string, sameContent: boolean, mixedContent: boolean, members: ReturnType<typeof toMember>[] }>} */
  const duplicate_groups = [];

  for (const [path_key, path_entries] of entries_by_path) {
    if (path_entries.length < 2) continue;
    if (stripConflictSuffixes(path_key).isConflictName) continue;
    if (original_paths_with_conflicts.has(path_key)) continue;
    const members = [...path_entries]
      .sort((a, b) => a.messageId - b.messageId)
      .map((entry) =>
        toMember(entry, {
          isConflictName: stripConflictSuffixes(entry.path).isConflictName,
          isOriginal: false,
        }),
      );
    const flags = contentFlags(members);
    duplicate_groups.push({
      id: `exact:${path_key}`,
      kind: 'exact_path',
      originalPath: path_key,
      ...flags,
      members,
    });
  }

  /** @type {Map<string, { originals: import('./vaultEntry').VaultEntry[], conflicts: typeof file_entries }>} */
  const conflict_buckets = new Map();
  for (const entry of file_entries) {
    const { originalPath, isConflictName } = stripConflictSuffixes(entry.path);
    if (isConflictName) {
      let conflict_bucket = conflict_buckets.get(originalPath);
      if (!conflict_bucket) {
        conflict_bucket = { originals: [], conflicts: [] };
        conflict_buckets.set(originalPath, conflict_bucket);
      }
      conflict_bucket.conflicts.push(entry);
      continue;
    }
    const normPath = toNfc(entry.path);
    if (original_paths_with_conflicts.has(normPath)) {
      let conflict_bucket = conflict_buckets.get(normPath);
      if (!conflict_bucket) {
        conflict_bucket = { originals: [], conflicts: [] };
        conflict_buckets.set(normPath, conflict_bucket);
      }
      conflict_bucket.originals.push(entry);
    }
  }

  for (const [original_path, conflict_bucket] of conflict_buckets) {
    if (conflict_bucket.conflicts.length === 0) continue;

    // If there's no original and only 1 conflict entry:
    // Only emit if it contains an actual TeleVault sync conflict marker (legacy behavior).
    // Standalone files that happen to end in a copy suffix (e.g. "file (1).cbz") with no counterpart should NOT be treated as duplicates.
    if (conflict_bucket.originals.length === 0 && conflict_bucket.conflicts.length === 1) {
      const singleConflict = conflict_bucket.conflicts[0];
      if (!TELEVAULT_CONFLICT_SEGMENT.test(singleConflict.path)) {
        continue;
      }
    }

    const members = [];
    for (const entry of [...conflict_bucket.originals].sort((a, b) => a.messageId - b.messageId)) {
      members.push(toMember(entry, { isConflictName: false, isOriginal: true }));
    }
    for (const entry of [...conflict_bucket.conflicts].sort((a, b) => a.messageId - b.messageId)) {
      members.push(toMember(entry, { isConflictName: true, isOriginal: false }));
    }
    const flags = contentFlags(members);
    duplicate_groups.push({
      id: `conflict:${original_path}`,
      kind: 'conflict_name',
      originalPath: original_path,
      ...flags,
      members,
    });
  }

  // Collect messageIds already claimed by exact_path or conflict_name groups
  const claimed_message_ids = new Set();
  for (const group of duplicate_groups) {
    for (const member of group.members) {
      claimed_message_ids.add(member.messageId);
    }
  }

  // Group remaining files by sha256 (cross-folder & cross-name)
  /** @type {Map<string, typeof file_entries>} */
  const sha_buckets = new Map();
  for (const entry of file_entries) {
    if (claimed_message_ids.has(entry.messageId)) continue;
    const sha = typeof entry.sha256 === 'string' ? entry.sha256.trim() : '';
    if (!sha) continue;
    let list = sha_buckets.get(sha);
    if (!list) {
      list = [];
      sha_buckets.set(sha, list);
    }
    list.push(entry);
  }

  for (const [sha, entries] of sha_buckets) {
    if (entries.length < 2) continue;
    // Sort by mtime ascending (earliest first), or messageId if equal
    const sorted = [...entries].sort((a, b) => {
      const timeA = a.mtime instanceof Date ? a.mtime.getTime() : new Date(a.mtime).getTime() || 0;
      const timeB = b.mtime instanceof Date ? b.mtime.getTime() : new Date(b.mtime).getTime() || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.messageId - b.messageId;
    });

    const members = sorted.map((entry, index) =>
      toMember(entry, {
        isConflictName: false,
        isOriginal: index === 0,
      }),
    );

    duplicate_groups.push({
      id: `hash:${sha}`,
      kind: 'same_hash',
      originalPath: members[0].path,
      sameContent: true,
      mixedContent: false,
      members,
    });
  }

  duplicate_groups.sort((a, b) => a.originalPath.localeCompare(b.originalPath));
  return duplicate_groups;
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
