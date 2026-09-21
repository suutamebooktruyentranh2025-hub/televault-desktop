const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  groupWastedBytes,
  filterDuplicateGroups,
  sortDuplicateGroups,
} = require('../src/duplicateListView');

function member(path, size, messageId = 1) {
  return { messageId, path, size, sha256: 'a'.repeat(64), mtime: new Date() };
}

describe('groupWastedBytes', () => {
  it('uses (n - 1) * max member size', () => {
    const group_item = {
      members: [member('/a.txt', 100, 1), member('/a.txt', 100, 2), member('/a.txt', 80, 3)],
    };
    assert.equal(groupWastedBytes(group_item), 200);
  });

  it('returns 0 for fewer than 2 members', () => {
    assert.equal(groupWastedBytes({ members: [member('/a.txt', 100)] }), 0);
  });
});

describe('filterDuplicateGroups', () => {
  const groups = [
    {
      id: 'exact:/Docs/report.pdf',
      originalPath: '/Docs/report.pdf',
      members: [member('/Docs/report.pdf', 10, 1), member('/Docs/report.pdf', 10, 2)],
    },
    {
      id: 'conflict:/Photos/cat.jpg',
      originalPath: '/Photos/cat.jpg',
      members: [
        member('/Photos/cat.jpg', 20, 3),
        member('/Photos/cat (conflict 2026-01-01).jpg', 20, 4),
      ],
    },
  ];

  it('matches originalPath case-insensitively', () => {
    const filtered = filterDuplicateGroups(groups, 'photos');
    assert.deepEqual(
      filtered.map((g) => g.id),
      ['conflict:/Photos/cat.jpg'],
    );
  });

  it('matches member file names', () => {
    const filtered = filterDuplicateGroups(groups, 'conflict 2026');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'conflict:/Photos/cat.jpg');
  });

  it('returns all groups for empty query', () => {
    assert.equal(filterDuplicateGroups(groups, '   ').length, 2);
  });
});

describe('sortDuplicateGroups', () => {
  const groups = [
    {
      id: 'a',
      originalPath: '/z.txt',
      members: [member('/z.txt', 50, 1), member('/z.txt', 50, 2)],
    },
    {
      id: 'b',
      originalPath: '/a.txt',
      members: [member('/a.txt', 10, 3), member('/a.txt', 10, 4), member('/a.txt', 10, 5)],
    },
    {
      id: 'c',
      originalPath: '/m.txt',
      members: [member('/m.txt', 1000, 6), member('/m.txt', 1000, 7)],
    },
  ];

  it('sorts by member count descending', () => {
    const sorted = sortDuplicateGroups(groups, { field: 'count', direction: 'desc' });
    assert.deepEqual(
      sorted.map((g) => g.id),
      ['b', 'a', 'c'],
    );
  });

  it('sorts by wasted bytes descending', () => {
    // a: 50, b: 20, c: 1000
    const sorted = sortDuplicateGroups(groups, { field: 'wasted', direction: 'desc' });
    assert.deepEqual(
      sorted.map((g) => g.id),
      ['c', 'a', 'b'],
    );
  });

  it('sorts by path ascending', () => {
    const sorted = sortDuplicateGroups(groups, { field: 'path', direction: 'asc' });
    assert.deepEqual(
      sorted.map((g) => g.id),
      ['b', 'c', 'a'],
    );
  });

  it('sorts original-smaller-than-conflict by size deficit descending', () => {
    const size_groups = [
      {
        id: 'ok',
        originalPath: '/ok.txt',
        members: [
          { ...member('/ok.txt', 100, 1), isOriginal: true },
          { ...member('/ok (conflict).txt', 50, 2), isConflictName: true },
        ],
      },
      {
        id: 'mild',
        originalPath: '/mild.txt',
        members: [
          { ...member('/mild.txt', 50, 3), isOriginal: true },
          { ...member('/mild (conflict).txt', 60, 4), isConflictName: true },
        ],
      },
      {
        id: 'bad',
        originalPath: '/bad.txt',
        members: [
          { ...member('/bad.txt', 10, 5), isOriginal: true },
          { ...member('/bad (conflict).txt', 100, 6), isConflictName: true },
        ],
      },
    ];
    const sorted = sortDuplicateGroups(size_groups, {
      field: 'originalSmaller',
      direction: 'desc',
    });
    assert.deepEqual(
      sorted.map((g) => g.id),
      ['bad', 'mild', 'ok'],
    );
  });
});
