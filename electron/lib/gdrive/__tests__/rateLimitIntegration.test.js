const test = require('node:test');
const assert = require('node:assert/strict');
const { GDriveSyncService } = require('../gdriveSyncService');

test('Integration: GDriveSyncService handles rate limits and retries', async (t) => {
  // Mock DB
  const mockDb = {
    gdriveSyncQueueCount: () => 0,
    gdriveSyncQueueGetNext: () => null,
    gdriveSyncQueueRemove: () => {},
    gdriveStateGet: () => '',
    gdriveSubscriptionsAll: () => [],
    gdriveSyncErrorsAll: () => [],
    gdriveManifestRecent: () => [],
    gdriveTokenGet: () => null,
    gdriveSyncQueueGetAll: () => [],
  };

  // Mock Vault
  const mockVault = {};

  const service = new GDriveSyncService({ db: mockDb, vault: mockVault });

  // Initial state checks
  assert.equal(service.throttleController.getConcurrency(), 1);
  assert.equal(service.rateLimiter.isThrottled(), false);

  // Mock a 429 error
  const error429 = new Error('Request failed with status code 429');
  error429.message = '429 Too Many Requests';

  const type429 = service._classifyError(error429);
  assert.equal(type429, 'throttle');

  service.throttleController.reportError(type429);
  
  // Concurrency should stay at 1 (or drop to 1)
  assert.equal(service.throttleController.getConcurrency(), 1);

  // Mock successes to scale up
  for(let i=0; i<10; i++) {
    // we need to clear cooldown first
    service.throttleController._lastScaleDownAt = 0; 
    service.throttleController.reportSuccess();
  }
  
  // It should have scaled up
  assert.equal(service.throttleController.getConcurrency(), 3);

  // Mock a timeout error
  const errorTimeout = new Error('timeout of 15000ms exceeded');
  const typeTimeout = service._classifyError(errorTimeout);
  assert.equal(typeTimeout, 'timeout');

  service.throttleController.reportError(typeTimeout);

  // Concurrency should drop back to 1
  assert.equal(service.throttleController.getConcurrency(), 1);
  
  // Check stats exposed
  const snapshot = service.getSnapshot();
  assert.equal(snapshot.throttleInfo.concurrency, 1);
  assert.equal(snapshot.throttleInfo.throttled, false);
  assert.ok(snapshot.throttleInfo.stats);
  // Keep legacy aliases for existing UI consumers.
  assert.equal(snapshot.throttleInfo.currentConcurrency, 1);
  assert.equal(snapshot.throttleInfo.isThrottled, false);
  assert.ok(snapshot.throttleInfo.syncStats);
  assert.ok(snapshot.throttleInfo.apiStats);
});
