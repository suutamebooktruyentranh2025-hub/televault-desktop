const test = require('node:test');
const assert = require('node:assert/strict');
const { createSpeedTracker } = require('../transferMetrics');

test('speed tracker computes positive speed after progress', () => {
  let fakeNow = 1_000_000;
  const tracker = createSpeedTracker({ now: () => fakeNow });
  tracker.update(0, 1000);
  fakeNow += 500;
  tracker.update(0.5, 1000);
  const snap = tracker.getSnapshot();
  assert.ok(snap.speedBps > 0);
  assert.ok(snap.etaSeconds != null && snap.etaSeconds > 0);
  assert.equal(snap.bytesDone, 500);
});

test('speed resets when progress goes backwards', () => {
  let fakeNow = 1_000_000;
  const tracker = createSpeedTracker({ now: () => fakeNow });
  tracker.update(0, 1000);
  fakeNow += 500;
  tracker.update(0.8, 1000);
  fakeNow += 500;
  tracker.update(0.1, 1000);
  assert.equal(tracker.getSnapshot().speedBps, 0);
});
