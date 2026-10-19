const test = require('node:test');
const assert = require('node:assert/strict');
const { registerGDriveHandlers } = require('../../ipc/gdriveHandlers');

test('gdrive:disconnect handler handles null, undefined and valid opts safely', async () => {
  const handlers = new Map();
  const mockIpcMain = {
    handle: (channel, handler) => {
      handlers.set(channel, handler);
    },
  };

  let disconnectCalledWith = null;
  let broadcastCount = 0;

  const mockSvc = {
    disconnect: (opts) => {
      disconnectCalledWith = opts;
    },
    getSnapshot: () => ({ status: 'disconnected', connected: false }),
  };

  const mockCtx = {
    getDb: () => null,
    getGDriveSyncService: () => mockSvc,
    isReady: () => true,
    broadcastToAllWindows: () => {
      broadcastCount++;
    },
  };

  registerGDriveHandlers(mockIpcMain, mockCtx);

  const disconnectHandler = handlers.get('gdrive:disconnect');
  assert.ok(disconnectHandler, 'gdrive:disconnect handler must be registered');

  // Test 1: null opts should be safely normalized to {}
  const res1 = await disconnectHandler(null, null);
  assert.deepEqual(res1, { ok: true });
  assert.deepEqual(disconnectCalledWith, {});

  // Test 2: undefined opts should be safely normalized to {}
  const res2 = await disconnectHandler(null, undefined);
  assert.deepEqual(res2, { ok: true });
  assert.deepEqual(disconnectCalledWith, {});

  // Test 3: non-object primitive (e.g. number/string) should be safely normalized to {}
  const res3 = await disconnectHandler(null, 'invalid');
  assert.deepEqual(res3, { ok: true });
  assert.deepEqual(disconnectCalledWith, {});

  // Test 4: valid object opts passed through
  const res4 = await disconnectHandler(null, { clearSubscriptions: true });
  assert.deepEqual(res4, { ok: true });
  assert.deepEqual(disconnectCalledWith, { clearSubscriptions: true });

  // Test 5: when service is not available
  const noSvcCtx = {
    getDb: () => null,
    getGDriveSyncService: () => null,
    isReady: () => true,
  };
  const handlers2 = new Map();
  registerGDriveHandlers({ handle: (c, h) => handlers2.set(c, h) }, noSvcCtx);
  const disconnectHandler2 = handlers2.get('gdrive:disconnect');
  const res5 = await disconnectHandler2(null, null);
  assert.equal(res5.ok, false);
});
