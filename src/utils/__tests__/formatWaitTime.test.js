import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWaitTime } from '../format.js';

test('formatWaitTime returns 0s for non-positive input', () => {
  assert.equal(formatWaitTime(0), '0s');
  assert.equal(formatWaitTime(-5), '0s');
});

test('formatWaitTime formats seconds correctly', () => {
  assert.equal(formatWaitTime(45, false), '45s');
  assert.equal(formatWaitTime(45, true), '45 giây');
});

test('formatWaitTime formats minutes and seconds correctly', () => {
  assert.equal(formatWaitTime(60, false), '1m');
  assert.equal(formatWaitTime(60, true), '1 phút');
  assert.equal(formatWaitTime(125, false), '2m 5s');
  assert.equal(formatWaitTime(125, true), '2 phút 5 giây');
});
