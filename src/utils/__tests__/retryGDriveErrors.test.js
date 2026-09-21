import test from 'node:test';
import assert from 'node:assert/strict';
import { retryGDriveErrorsSequentially } from '../retryGDriveErrors.js';

test('retryGDriveErrorsSequentially waits for each retry before starting the next', async () => {
  const event_order = [];
  const pending_resolvers = [];
  const retry_action = (drive_file_id) => {
    event_order.push(`start:${drive_file_id}`);
    return new Promise((resolve) => {
      pending_resolvers.push(() => {
        event_order.push(`end:${drive_file_id}`);
        resolve({ ok: true });
      });
    });
  };

  const retry_promise = retryGDriveErrorsSequentially([
    { driveFileId: 'file-1' },
    { driveFileId: 'file-2' },
  ], retry_action);

  await Promise.resolve();
  assert.deepEqual(event_order, ['start:file-1']);

  pending_resolvers.shift()();
  await Promise.resolve();
  assert.deepEqual(event_order, ['start:file-1', 'end:file-1', 'start:file-2']);

  pending_resolvers.shift()();
  await retry_promise;
  assert.deepEqual(event_order, [
    'start:file-1',
    'end:file-1',
    'start:file-2',
    'end:file-2',
  ]);
});
