import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewerVersion, parseChangelog, cleanVersion } from '../updateUtils.js';

test('cleanVersion: normalizes version string', () => {
  assert.equal(cleanVersion('v0.3.2'), '0.3.2');
  assert.equal(cleanVersion('V1.0.0'), '1.0.0');
  assert.equal(cleanVersion('  v2.1.3  '), '2.1.3');
  assert.equal(cleanVersion(''), '0.0.0');
  assert.equal(cleanVersion(null), '0.0.0');
});

test('isNewerVersion: semver comparison', () => {
  // Newer patch
  assert.equal(isNewerVersion('0.3.2', '0.3.1'), true);
  assert.equal(isNewerVersion('v0.3.2', '0.3.1'), true);
  // Newer minor
  assert.equal(isNewerVersion('0.4.0', '0.3.9'), true);
  // Newer major
  assert.equal(isNewerVersion('1.0.0', '0.9.9'), true);
  // Equal
  assert.equal(isNewerVersion('0.3.1', '0.3.1'), false);
  assert.equal(isNewerVersion('v0.3.1', '0.3.1'), false);
  // Older
  assert.equal(isNewerVersion('0.3.0', '0.3.1'), false);
  assert.equal(isNewerVersion('0.2.9', '0.3.1'), false);
  // Invalid inputs
  assert.equal(isNewerVersion(null, '0.3.1'), false);
  assert.equal(isNewerVersion('0.3.2', null), true);
});

test('parseChangelog: categorizes items accurately', () => {
  const markdown = `
## TeleVault v0.3.2

- [Mới] Bổ sung tính năng tự động cập nhật từ GitHub Releases
- [Sửa] Khắc phục lỗi hiển thị kích thước tệp khi tải
- [Cải tiến] Tối ưu hóa hiệu năng render danh sách thư mục
- feat: Gộp nhiều tệp cùng lúc
- fix: Sửa đường dẫn Thùng rác
- Cập nhật tài liệu hướng dẫn sử dụng
  `;

  const items = parseChangelog(markdown);
  assert.equal(items.length, 6);

  assert.equal(items[0].type, 'new');
  assert.equal(items[0].text, 'Bổ sung tính năng tự động cập nhật từ GitHub Releases');

  assert.equal(items[1].type, 'fix');
  assert.equal(items[1].text, 'Khắc phục lỗi hiển thị kích thước tệp khi tải');

  assert.equal(items[2].type, 'improve');
  assert.equal(items[2].text, 'Tối ưu hóa hiệu năng render danh sách thư mục');

  assert.equal(items[3].type, 'new');
  assert.equal(items[3].text, 'Gộp nhiều tệp cùng lúc');

  assert.equal(items[4].type, 'fix');
  assert.equal(items[4].text, 'Sửa đường dẫn Thùng rác');

  assert.equal(items[5].type, 'other');
  assert.equal(items[5].text, 'Cập nhật tài liệu hướng dẫn sử dụng');
});

test('parseChangelog: handles empty or invalid inputs', () => {
  assert.deepEqual(parseChangelog(''), []);
  assert.deepEqual(parseChangelog(null), []);
  assert.deepEqual(parseChangelog(undefined), []);
});
