const test = require('node:test');
const assert = require('node:assert/strict');
const { planSplits, SPLIT_SIZE, needsSplit } = require('../splitPlanner');

test('5GB file splits into 3 parts', () => {
  const parts = planSplits(5_000_000_000);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].offset, 0);
  assert.equal(parts[0].size, SPLIT_SIZE);
  assert.equal(parts[2].size, 5_000_000_000 - 2 * SPLIT_SIZE);
});

test('exact split size is a single part', () => {
  const parts = planSplits(SPLIT_SIZE);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].size, SPLIT_SIZE);
  assert.equal(needsSplit(SPLIT_SIZE), false);
  assert.equal(needsSplit(SPLIT_SIZE + 1), true);
});
