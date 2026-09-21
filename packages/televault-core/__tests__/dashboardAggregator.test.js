const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry, dirMarker, buildDashboardStats } = require('../src');

function f(id, path, size, mtime) {
  return createVaultEntry({
    messageId: id,
    path,
    size,
    sha256: 'h',
    mtime: new Date(mtime),
  });
}

describe('buildDashboardStats', () => {
  it('totals exclude trash and dir markers', () => {
    const entries = [
      f(1, '/a.txt', 100, '2026-07-01T10:00:00Z'),
      f(2, '/docs/b.pdf', 900, '2026-07-02T10:00:00Z'),
      f(3, '/Rác/deleted.txt', 5000, '2026-07-03T10:00:00Z'),
      dirMarker({ messageId: 4, path: '/docs/' }),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 30, today: new Date('2026-07-04T12:00:00Z') });
    assert.equal(stats.totalFiles, 2);
    assert.equal(stats.totalBytes, 1000);
  });

  it('top folders aggregate nested bytes', () => {
    const entries = [
      f(1, '/big/x.txt', 100, '2026-07-01T10:00:00Z'),
      f(2, '/big/sub/y.txt', 400, '2026-07-01T11:00:00Z'),
      f(3, '/small.txt', 50, '2026-07-01T12:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 7, today: new Date('2026-07-04T12:00:00Z') });
    assert.equal(stats.topFolders[0].path, '/big/');
    assert.equal(stats.topFolders[0].bytes, 500);
    assert.equal(stats.topFolders[0].fileCount, 2);
  });

  it('top files sorted by size desc', () => {
    const entries = [
      f(1, '/a.txt', 10, '2026-07-01T10:00:00Z'),
      f(2, '/b.txt', 100, '2026-07-01T10:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 7, today: new Date('2026-07-04T12:00:00Z') });
    assert.deepEqual(stats.topFiles.map((x) => x.messageId), [2, 1]);
  });

  it('uploadsPerDay buckets by date and zero-fills range', () => {
    const entries = [
      f(1, '/a.txt', 100, '2026-07-03T12:00:00Z'),
      f(2, '/b.txt', 200, '2026-07-04T12:00:00Z'),
    ];
    const statsWithFiles = buildDashboardStats(entries, {
      rangeDays: 3,
      today: new Date('2026-07-04T12:00:00Z'),
      timeZone: 'UTC',
      includeDayFiles: true,
    });
    assert.equal(statsWithFiles.uploadsPerDay.length, 3);
    const lastWithFiles = statsWithFiles.uploadsPerDay.at(-1);
    assert.equal(lastWithFiles.date, '2026-07-04');
    assert.equal(lastWithFiles.fileCount, 1);
    assert.equal(lastWithFiles.bytes, 200);
    assert.equal(statsWithFiles.uploadsPerDay[0].fileCount, 0);
    assert.equal(lastWithFiles.files.length, 1);
    assert.equal(lastWithFiles.files[0].messageId, 2);
    assert.equal(lastWithFiles.files[0].name, 'b.txt');

    const statsLight = buildDashboardStats(entries, {
      rangeDays: 3,
      today: new Date('2026-07-04T12:00:00Z'),
      timeZone: 'UTC',
    });
    assert.equal(statsLight.uploadsPerDay.at(-1).files, undefined);
  });

  it('aggregates story folders rolling up from format subfolders', () => {
    const entries = [
      f(1, '/Manga/Naruto/Naruto (CBZ)/Chap 01.cbz', 100, '2026-07-01T10:00:00Z'),
      f(2, '/Manga/Naruto/Naruto (MOBI)/Vol 01.mobi', 200, '2026-07-01T11:00:00Z'),
      f(3, '/Manga/One Piece/One Piece (CBZ)/Chap 01.cbz', 150, '2026-07-01T12:00:00Z'),
      f(4, '/Comics/Batman/Batman Issue 01.cbr', 80, '2026-07-01T13:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 7, today: new Date('2026-07-04T12:00:00Z') });
    // Naruto total = 300, One Piece total = 150, Batman total = 80
    assert.equal(stats.topFolders[0].name, 'Naruto');
    assert.equal(stats.topFolders[0].path, '/Manga/Naruto/');
    assert.equal(stats.topFolders[0].subtext, 'Manga');
    assert.equal(stats.topFolders[0].bytes, 300);
    assert.equal(stats.topFolders[0].fileCount, 2);

    assert.equal(stats.topFolders[1].name, 'One Piece');
    assert.equal(stats.topFolders[1].path, '/Manga/One Piece/');
    assert.equal(stats.topFolders[1].bytes, 150);

    assert.equal(stats.topFolders[2].name, 'Batman');
    assert.equal(stats.topFolders[2].path, '/Comics/Batman/');
    assert.equal(stats.topFolders[2].bytes, 80);
  });
});
