import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBreadcrumbs } from '../breadcrumb.js';

test('resolveBreadcrumbs: returns null and empty arrays for empty/null crumbs', () => {
  const result = resolveBreadcrumbs([]);
  assert.equal(result.isCollapsed, false);
  assert.equal(result.firstCrumb, null);
  assert.deepEqual(result.collapsedCrumbs, []);
  assert.deepEqual(result.tailCrumbs, []);
});

test('resolveBreadcrumbs: 1 crumb (root) does not collapse', () => {
  const crumbs = [{ label: 'My Drive', path: '/' }];
  const result = resolveBreadcrumbs(crumbs);
  assert.equal(result.isCollapsed, false);
  assert.deepEqual(result.firstCrumb, { label: 'My Drive', path: '/' });
  assert.deepEqual(result.collapsedCrumbs, []);
  assert.deepEqual(result.tailCrumbs, []);
});

test('resolveBreadcrumbs: 2 crumbs (root + folder) does not collapse', () => {
  const crumbs = [
    { label: 'My Drive', path: '/' },
    { label: 'GDrive', path: '/GDrive/' },
  ];
  const result = resolveBreadcrumbs(crumbs);
  assert.equal(result.isCollapsed, false);
  assert.deepEqual(result.firstCrumb, { label: 'My Drive', path: '/' });
  assert.deepEqual(result.collapsedCrumbs, []);
  assert.deepEqual(result.tailCrumbs, [{ label: 'GDrive', path: '/GDrive/' }]);
});

test('resolveBreadcrumbs: 3 crumbs (root + 2 folders) does not collapse', () => {
  const crumbs = [
    { label: 'My Drive', path: '/' },
    { label: 'GDrive', path: '/GDrive/' },
    { label: 'Danh sách 2024', path: '/GDrive/Danh sách 2024/' },
  ];
  const result = resolveBreadcrumbs(crumbs);
  assert.equal(result.isCollapsed, false);
  assert.deepEqual(result.firstCrumb, { label: 'My Drive', path: '/' });
  assert.deepEqual(result.collapsedCrumbs, []);
  assert.deepEqual(result.tailCrumbs, [
    { label: 'GDrive', path: '/GDrive/' },
    { label: 'Danh sách 2024', path: '/GDrive/Danh sách 2024/' },
  ]);
});

test('resolveBreadcrumbs: 4 crumbs collapses intermediate level (GDrive)', () => {
  const crumbs = [
    { label: 'My Drive', path: '/' },
    { label: 'GDrive', path: '/GDrive/' },
    { label: 'Danh sách 2024', path: '/GDrive/Danh sách 2024/' },
    { label: 'Danh sách truyện 2024', path: '/GDrive/Danh sách 2024/Danh sách truyện 2024/' },
  ];
  const result = resolveBreadcrumbs(crumbs);
  assert.equal(result.isCollapsed, true);
  assert.deepEqual(result.firstCrumb, { label: 'My Drive', path: '/' });
  assert.deepEqual(result.collapsedCrumbs, [{ label: 'GDrive', path: '/GDrive/' }]);
  assert.deepEqual(result.tailCrumbs, [
    { label: 'Danh sách 2024', path: '/GDrive/Danh sách 2024/' },
    { label: 'Danh sách truyện 2024', path: '/GDrive/Danh sách 2024/Danh sách truyện 2024/' },
  ]);
});

test('resolveBreadcrumbs: 5 crumbs (user screenshot case) collapses GDrive & Danh sách 2024', () => {
  const crumbs = [
    { label: 'My Drive', path: '/' },
    { label: 'GDrive', path: '/GDrive/' },
    { label: 'Danh sách 2024', path: '/GDrive/Danh sách 2024/' },
    { label: 'Danh sách truyện 2024', path: '/GDrive/Danh sách 2024/Danh sách truyện 2024/' },
    { label: '50 Million Km', path: '/GDrive/Danh sách 2024/Danh sách truyện 2024/50 Million Km/' },
  ];
  const result = resolveBreadcrumbs(crumbs);
  assert.equal(result.isCollapsed, true);
  assert.deepEqual(result.firstCrumb, { label: 'My Drive', path: '/' });
  // Intermediate folders go into collapsed dropdown
  assert.deepEqual(result.collapsedCrumbs, [
    { label: 'GDrive', path: '/GDrive/' },
    { label: 'Danh sách 2024', path: '/GDrive/Danh sách 2024/' },
  ]);
  // Only the parent and the active folder are displayed in the tail
  assert.deepEqual(result.tailCrumbs, [
    { label: 'Danh sách truyện 2024', path: '/GDrive/Danh sách 2024/Danh sách truyện 2024/' },
    { label: '50 Million Km', path: '/GDrive/Danh sách 2024/Danh sách truyện 2024/50 Million Km/' },
  ]);
});
