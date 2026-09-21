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

test('scanDuplicateGroups merges exact path dups into conflict group when conflicts exist', () => {
  const groups = scanDuplicateGroups([
    file(1, '/a/T01.cbz', 'a'.repeat(64)),
    file(2, '/a/T01.cbz', 'b'.repeat(64)),
    file(3, '/a/T01 (conflict 2026-07-15).cbz', 'c'.repeat(64)),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'conflict_name');
  assert.equal(groups[0].originalPath, '/a/T01.cbz');
  assert.equal(groups[0].members.length, 3);
  assert.equal(
    groups[0].members.filter((m) => m.isOriginal).length,
    2,
  );
  assert.equal(
    groups[0].members.filter((m) => m.isConflictName).length,
    1,
  );
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

test('scanDuplicateGroups skips exact_path for duplicate conflict-named paths', () => {
  const conflict_path = '/a/T01 (conflict 2026-07-15).cbz';
  const groups = scanDuplicateGroups([
    file(1, conflict_path, 'a'.repeat(64)),
    file(2, conflict_path, 'b'.repeat(64)),
    file(3, '/a/T01.cbz', 'c'.repeat(64)),
  ]);
  assert.equal(groups.filter((g) => g.kind === 'exact_path').length, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'conflict_name');
  assert.equal(groups[0].originalPath, '/a/T01.cbz');
  assert.equal(groups[0].members.length, 3);
  const exact_path_member_ids = groups
    .filter((g) => g.kind === 'exact_path')
    .flatMap((g) => g.members.map((m) => m.messageId));
  assert.deepEqual(exact_path_member_ids, []);
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

test('scanDuplicateGroups groups identical SHA-256 files across different paths', () => {
  const hash = 'f'.repeat(64);
  const groups = scanDuplicateGroups([
    file(1, '/FolderA/Document.pdf', hash),
    file(2, '/FolderB/Copy of Doc.pdf', hash),
    file(3, '/FolderC/Sub/Archive.pdf', hash),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'same_hash');
  assert.equal(groups[0].id, `hash:${hash}`);
  assert.equal(groups[0].sameContent, true);
  assert.equal(groups[0].members.length, 3);
  assert.equal(groups[0].members[0].isOriginal, true);
  assert.equal(groups[0].members[1].isOriginal, false);
  assert.equal(groups[0].members[2].isOriginal, false);
});

test('scanDuplicateGroups does not duplicate files already in exact_path into same_hash', () => {
  const hash = 'e'.repeat(64);
  const groups = scanDuplicateGroups([
    file(1, '/a/x.cbz', hash),
    file(2, '/a/x.cbz', hash),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'exact_path');
});

test('scanDuplicateGroups groups exact path duplicates across NFC and NFD encodings', () => {
  const nfcPath = '/a/Anh N\u00f4ng D\u00e2n C\u1ea7n Ki\u1ec7m.cbz';
  const nfdPath = nfcPath.normalize('NFD');
  const groups = scanDuplicateGroups([
    file(1, nfdPath, 'a'.repeat(64)),
    file(2, nfcPath, 'a'.repeat(64)),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'exact_path');
  assert.equal(groups[0].originalPath, nfcPath.normalize('NFC'));
  assert.equal(groups[0].members.length, 2);
});

test('stripConflictSuffixes strips copy suffixes from directory and file segments', () => {
  const r1 = stripConflictSuffixes('/GDrive/Manga/Boku Girl (1)/Boku Girl T01.cbz');
  assert.equal(r1.isConflictName, true);
  assert.equal(r1.originalPath, '/GDrive/Manga/Boku Girl/Boku Girl T01.cbz');

  const r2 = stripConflictSuffixes('/GDrive/Manga (2)/Chapter 01 (1).cbz');
  assert.equal(r2.isConflictName, true);
  assert.equal(r2.originalPath, '/GDrive/Manga/Chapter 01.cbz');

  const r3 = stripConflictSuffixes('/Folder/Document - Copy.pdf');
  assert.equal(r3.isConflictName, true);
  assert.equal(r3.originalPath, '/Folder/Document.pdf');

  const r4 = stripConflictSuffixes('/Folder/Document (Copy 2).pdf');
  assert.equal(r4.isConflictName, true);
  assert.equal(r4.originalPath, '/Folder/Document.pdf');

  // Should NOT strip publication years
  const rYear = stripConflictSuffixes('/GDrive/Manga/One Piece (2003).cbz');
  assert.equal(rYear.isConflictName, false);
  assert.equal(rYear.originalPath, '/GDrive/Manga/One Piece (2003).cbz');
});

test('scanDuplicateGroups detects duplicate folders with copy suffixes like Boku Girl (1)', () => {
  const groups = scanDuplicateGroups([
    file(1, '/GDrive/Manga/Boku Girl/Boku Girl T01.cbz', 'a'.repeat(64), 200),
    file(2, '/GDrive/Manga/Boku Girl (1)/Boku Girl T01.cbz', 'b'.repeat(64), 100),
    file(3, '/GDrive/Manga/Boku Girl/Boku Girl T02.cbz', 'c'.repeat(64), 200),
    file(4, '/GDrive/Manga/Boku Girl (1)/Boku Girl T02.cbz', 'd'.repeat(64), 100),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].originalPath, '/GDrive/Manga/Boku Girl/Boku Girl T01.cbz');
  assert.equal(groups[0].kind, 'conflict_name');
  assert.equal(groups[0].members.length, 2);
  assert.equal(groups[0].members[0].isOriginal, true);
  assert.equal(groups[0].members[1].isOriginal, false);

  assert.equal(groups[1].originalPath, '/GDrive/Manga/Boku Girl/Boku Girl T02.cbz');
  assert.equal(groups[1].kind, 'conflict_name');
  assert.equal(groups[1].members.length, 2);
});

test('scanDuplicateGroups ignores singleton copy file when original does not exist', () => {
  const groups = scanDuplicateGroups([
    file(1, '/GDrive/Manga/Standalone (1).cbz', 'x'.repeat(64)),
    file(2, '/GDrive/Manga/Another Folder (1)/Sole Chapter.cbz', 'y'.repeat(64)),
  ]);
  assert.equal(groups.length, 0);
});

test('scanDuplicateGroups groups multiple copy files when original is missing', () => {
  const groups = scanDuplicateGroups([
    file(1, '/GDrive/Manga/Chapter (1).cbz', 'x'.repeat(64)),
    file(2, '/GDrive/Manga/Chapter (2).cbz', 'y'.repeat(64)),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].originalPath, '/GDrive/Manga/Chapter.cbz');
  assert.equal(groups[0].members.length, 2);
});
