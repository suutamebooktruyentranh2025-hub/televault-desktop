import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFolderSummary } from '../folderSummary.js';

// Mock translation function mimicking I18nContext
const dict = {
  folderItemCountEmpty: 'Trống',
  fileCountLabel: '{n} tệp',
  folderSummaryCounts: '{folders} thư mục con • {files} tệp',
  folderSummaryCountsWithTotal: '{folders} thư mục con • {files} tệp ({totalFiles} tất cả)',
  folderItemCountDetail: '{folderCount} thư mục con ({totalFolders} tất cả), {fileCount} tệp ({totalFiles} tất cả)',
};

function t(key, params = {}) {
  let text = dict[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
}

test('formatFolderSummary: counts total files when directFiles is 0 (user screenshot case)', () => {
  const folders = [
    { name: 'A-BOUT', folderCount: 0, totalFolders: 0, fileCount: 6, totalFiles: 6 },
    { name: 'Cây Bảo Đao', folderCount: 0, totalFolders: 0, fileCount: 4, totalFiles: 4 },
    { name: 'GDrive', folderCount: 1, totalFolders: 50, fileCount: 0, totalFiles: 7093 },
    { name: 'GoogleDrive', folderCount: 2, totalFolders: 7, fileCount: 77, totalFiles: 85 },
  ];
  const files = [];

  const summary = formatFolderSummary({ folders, files, t });
  // 6 + 4 + 7093 + 85 = 7188 total files
  assert.equal(summary.text, '4 thư mục con • 7,188 tệp');
  assert.match(summary.tooltip, /4 thư mục con/);
  assert.match(summary.tooltip, /0 tệp \(7,188 tất cả\)/);
});

test('formatFolderSummary: uses backend counts when provided', () => {
  const folders = [{ name: 'A-BOUT' }];
  const files = [];
  const counts = {
    fileCount: 0,
    folderCount: 15,
    totalFiles: 7305,
    totalFolders: 1181,
  };

  const summary = formatFolderSummary({ folders, files, counts, t });
  assert.equal(summary.text, '1 thư mục con • 7,305 tệp');
  assert.match(summary.tooltip, /7,305 tất cả/);
});

test('formatFolderSummary: shows both direct and total files when directFiles > 0 and totalFiles > directFiles', () => {
  const folders = [
    { name: 'Sub', folderCount: 0, totalFolders: 0, fileCount: 10, totalFiles: 10 },
  ];
  const files = [{ name: 'file1.txt' }, { name: 'file2.txt' }];

  const summary = formatFolderSummary({ folders, files, t });
  assert.equal(summary.text, '1 thư mục con • 2 tệp (12 tất cả)');
});

test('formatFolderSummary: only shows file count when there are no subfolders', () => {
  const folders = [];
  const files = [{ name: 'file1.txt' }, { name: 'file2.txt' }, { name: 'file3.txt' }];

  const summary = formatFolderSummary({ folders, files, t });
  assert.equal(summary.text, '3 tệp');
});

test('formatFolderSummary: shows empty when both folders and files are 0', () => {
  const summary = formatFolderSummary({ folders: [], files: [], t });
  assert.equal(summary.text, 'Trống');
});

test('formatFolderSummary: shows 0 tệp when subfolders exist but all are completely empty', () => {
  const folders = [
    { name: 'Empty1', folderCount: 0, totalFolders: 0, fileCount: 0, totalFiles: 0 },
    { name: 'Empty2', folderCount: 0, totalFolders: 0, fileCount: 0, totalFiles: 0 },
  ];
  const files = [];

  const summary = formatFolderSummary({ folders, files, t });
  assert.equal(summary.text, '2 thư mục con • 0 tệp');
});
