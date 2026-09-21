const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchChangeToSubscription,
  buildVaultPath,
  resolveConflictVaultPath,
} = require('../gdriveDiscovery');
const { GDriveSyncService } = require('../gdriveSyncService');

test('skip leaves the conflicting vault path unchanged', () => {
  const conflict_result = resolveConflictVaultPath({
    policy: 'skip',
    vaultPath: '/GDrive/a.pdf',
    existingPaths: ['/GDrive/a.pdf'],
    now: new Date('2026-07-16T00:00:00Z'),
  });

  assert.deepEqual(conflict_result, {
    action: 'skip',
    vaultPath: '/GDrive/a.pdf',
  });
});

test('overwrite uploads to the conflicting vault path', () => {
  const conflict_result = resolveConflictVaultPath({
    policy: 'overwrite',
    vaultPath: '/GDrive/a.pdf',
    existingPaths: ['/GDrive/a.pdf'],
    now: new Date('2026-07-16T00:00:00Z'),
  });

  assert.deepEqual(conflict_result, {
    action: 'upload',
    vaultPath: '/GDrive/a.pdf',
  });
});

test('keep_both adds conflict date suffix', () => {
  const conflict_result = resolveConflictVaultPath({
    policy: 'keep_both',
    vaultPath: '/GDrive/a.pdf',
    existingPaths: ['/GDrive/a.pdf'],
    now: new Date('2026-07-16T00:00:00Z'),
  });

  assert.equal(conflict_result.action, 'upload');
  assert.match(conflict_result.vaultPath, /conflict 2026-07-16/);
});

test('keep_both makes repeated conflict paths unique', () => {
  const conflict_result = resolveConflictVaultPath({
    policy: 'keep_both',
    vaultPath: '/GDrive/a.pdf',
    existingPaths: [
      '/GDrive/a.pdf',
      '/GDrive/a (conflict 2026-07-16).pdf',
    ],
    now: new Date('2026-07-16T00:00:00Z'),
  });

  assert.equal(conflict_result.action, 'upload');
  assert.equal(conflict_result.vaultPath, '/GDrive/a (conflict 2026-07-16) (1).pdf');
});

test('folder sub matches new file when parent is subscription root', () => {
  const sub = { driveId: 'folder1', vaultPath: '/GDrive/Docs/', isFolder: true, enabled: true };
  const change = {
    fileId: 'file9',
    removed: false,
    file: { id: 'file9', name: 'new.pdf', parents: ['folder1'], modifiedTime: 't', size: '10', md5Checksum: 'm' },
  };
  const hit = matchChangeToSubscription(change, sub, { manifest: null, folderIds: new Set(['folder1']) });
  assert.ok(hit);
  assert.equal(hit.vaultPath, '/GDrive/Docs/new.pdf');
});

test('folder sub ignores file outside folder tree', () => {
  const sub = { driveId: 'folder1', vaultPath: '/GDrive/Docs/', isFolder: true };
  const change = {
    fileId: 'x',
    file: { name: 'x.bin', parents: ['other'], modifiedTime: 't', size: '1' },
  };
  assert.equal(
    matchChangeToSubscription(change, sub, { manifest: null, folderIds: new Set(['folder1']) }),
    null,
  );
});

test('service resolves a new file through nested parent folders', async () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.api = {
    getFile: async (file_id) => {
      assert.equal(file_id, 'nested1');
      return { id: 'nested1', name: 'Nested', parents: ['folder1'] };
    },
  };
  sync_service._folderIdCache = new Map([['folder1', new Set(['folder1'])]]);
  const folder_sub = { driveId: 'folder1', vaultPath: '/GDrive/Docs/', isFolder: true };

  const resolved_hit = await sync_service._resolveUnderSubscription(
    { id: 'file9', name: 'new.pdf', parents: ['nested1'] },
    folder_sub,
  );

  assert.deepEqual(resolved_hit, {
    drivePath: 'Nested/new.pdf',
    vaultPath: '/GDrive/Docs/Nested/new.pdf',
  });
  assert.equal(sync_service._folderIdCache.get('folder1').has('nested1'), true);
});

test('poll enqueues a new file directly under a subscribed folder', async () => {
  const queued_items = [];
  const state_values = new Map([['changes_page_token', 'token1']]);
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service.status = 'idle';
  sync_service.lastError = null;
  sync_service.lastSyncAt = null;
  sync_service.pendingCount = 0;
  sync_service.totalCount = 0;
  sync_service._folderIdCache = new Map([['folder1', new Set(['folder1'])]]);
  sync_service.auth = { isConnected: () => true };
  sync_service.onChange = () => {};
  sync_service._shouldSyncFile = () => true;
  sync_service.api = {
    getChanges: async () => ({
      changes: [{
        fileId: 'file9',
        removed: false,
        file: {
          id: 'file9',
          name: 'new.pdf',
          parents: ['folder1'],
          mimeType: 'application/pdf',
          modifiedTime: 't',
          size: '10',
        },
      }],
      newStartPageToken: 'token2',
    }),
  };
  sync_service.db = {
    gdriveStateGet: (state_key) => state_values.get(state_key),
    gdriveStateSet: (state_key, state_value) => state_values.set(state_key, state_value),
    gdriveSubscriptionsAll: () => [{
      driveId: 'folder1',
      vaultPath: '/GDrive/Docs/',
      isFolder: true,
      enabled: true,
    }],
    gdriveManifestGet: () => null,
    getAll: () => [],
    gdriveSyncQueueCount: () => queued_items.length,
    gdriveSyncQueueAdd: (queue_item) => queued_items.push(queue_item),
  };

  await sync_service._runPollSync();

  assert.equal(queued_items.length, 1);
  assert.equal(queued_items[0].vaultPath, '/GDrive/Docs/new.pdf');
  assert.equal(state_values.get('changes_page_token'), 'token2');
});

test('poll does not enqueue an update deleted later in the same batch', async () => {
  const queued_items = [];
  const removed_items = [];
  const state_values = new Map([
    ['changes_page_token', 'token1'],
    ['propagate_deletes', '1'],
  ]);
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service.status = 'idle';
  sync_service.lastError = null;
  sync_service.lastSyncAt = null;
  sync_service.pendingCount = 0;
  sync_service.totalCount = 0;
  sync_service._folderIdCache = new Map([['folder1', new Set(['folder1'])]]);
  sync_service.auth = { isConnected: () => true };
  sync_service.onChange = () => {};
  sync_service._shouldSyncFile = () => true;
  sync_service.api = {
    getChanges: async () => ({
      changes: [
        {
          fileId: 'file9',
          removed: false,
          file: {
            id: 'file9',
            name: 'updated.pdf',
            parents: ['folder1'],
            mimeType: 'application/pdf',
            modifiedTime: 'new-time',
            size: '10',
          },
        },
        { fileId: 'file9', removed: true },
      ],
      newStartPageToken: 'token2',
    }),
  };
  sync_service.vault = { trashEntries: async () => {} };
  sync_service.db = {
    gdriveStateGet: (state_key, default_value) => state_values.get(state_key) ?? default_value,
    gdriveStateSet: (state_key, state_value) => state_values.set(state_key, state_value),
    gdriveSubscriptionsAll: () => [{
      driveId: 'folder1',
      vaultPath: '/GDrive/Docs/',
      isFolder: true,
      enabled: true,
    }],
    gdriveManifestGet: () => ({
      driveFileId: 'file9',
      vaultPath: '/GDrive/Docs/updated.pdf',
      driveModifiedTime: 'old-time',
    }),
    gdriveManifestDelete: () => {},
    gdriveSyncQueueRemove: (drive_file_id) => removed_items.push(drive_file_id),
    gdriveSyncQueueCount: () => queued_items.length,
    gdriveSyncQueueAdd: (queue_item) => queued_items.push(queue_item),
    getAll: () => [],
  };

  await sync_service._runPollSync();

  assert.deepEqual(queued_items, []);
  assert.deepEqual(removed_items, ['file9']);
  assert.equal(sync_service.totalCount, 0);
  assert.equal(state_values.get('changes_page_token'), 'token2');
});

for (const deleted_change of [
  { fileId: 'file9', removed: true },
  { fileId: 'file9', removed: false, file: { trashed: true } },
]) {
  test(`poll soft-trashes the vault entry for ${deleted_change.removed ? 'removed' : 'trashed'} Drive files when enabled`, async () => {
    const trashed_batches = [];
    const deleted_manifests = [];
    const removed_queue_items = [];
    const cleanup_actions = [];
    const state_values = new Map([
      ['changes_page_token', 'token1'],
      ['propagate_deletes', '1'],
    ]);
    const sync_service = Object.create(GDriveSyncService.prototype);
    sync_service._syncInProgress = false;
    sync_service.status = 'idle';
    sync_service.lastError = null;
    sync_service.lastSyncAt = null;
    sync_service.pendingCount = 0;
    sync_service.totalCount = 0;
    sync_service.auth = { isConnected: () => true };
    sync_service.onChange = () => {};
    sync_service.api = {
      getChanges: async () => ({
        changes: [deleted_change],
        newStartPageToken: 'token2',
      }),
    };
    sync_service.vault = {
      trashEntries: async (message_ids) => trashed_batches.push(message_ids),
    };
    sync_service.db = {
      gdriveStateGet: (state_key, default_value) => state_values.get(state_key) ?? default_value,
      gdriveStateSet: (state_key, state_value) => state_values.set(state_key, state_value),
      gdriveSubscriptionsAll: () => [],
      gdriveManifestGet: () => ({ driveFileId: 'file9', vaultPath: '/GDrive/Docs/old.pdf' }),
      gdriveManifestDelete: (drive_file_id) => {
        cleanup_actions.push('manifest-delete');
        deleted_manifests.push(drive_file_id);
      },
      gdriveSyncQueueRemove: (drive_file_id) => {
        cleanup_actions.push('queue-remove');
        removed_queue_items.push(drive_file_id);
      },
      gdriveSyncQueueCount: () => 0,
      getAll: () => [
        { messageId: 42, path: '/GDrive/Docs/old.pdf' },
        { messageId: 84, path: '/Rác/GDrive/Docs/old.pdf' },
      ],
    };

    await sync_service._runPollSync();

    assert.deepEqual(trashed_batches, [[42]]);
    assert.deepEqual(deleted_manifests, ['file9']);
    assert.deepEqual(removed_queue_items, ['file9']);
    assert.deepEqual(cleanup_actions, ['queue-remove', 'manifest-delete']);
  });
}

test('poll does not advance the changes token when delete propagation fails', async () => {
  const state_values = new Map([
    ['changes_page_token', 'token1'],
    ['propagate_deletes', '1'],
  ]);
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service.status = 'idle';
  sync_service.lastError = null;
  sync_service.lastSyncAt = null;
  sync_service.pendingCount = 0;
  sync_service.totalCount = 0;
  sync_service.auth = { isConnected: () => true };
  sync_service.onChange = () => {};
  sync_service.api = {
    getChanges: async () => ({
      changes: [{ fileId: 'file9', removed: true }],
      newStartPageToken: 'token2',
    }),
  };
  sync_service.vault = {
    trashEntries: async () => {
      throw new Error('trash failed');
    },
  };
  sync_service.db = {
    gdriveStateGet: (state_key, default_value) => state_values.get(state_key) ?? default_value,
    gdriveStateSet: (state_key, state_value) => state_values.set(state_key, state_value),
    gdriveSubscriptionsAll: () => [],
    gdriveManifestGet: () => ({ driveFileId: 'file9', vaultPath: '/GDrive/Docs/old.pdf' }),
    gdriveManifestDelete: () => {},
    gdriveSyncQueueRemove: () => {},
    gdriveSyncQueueCount: () => 0,
    getAll: () => [{ messageId: 42, path: '/GDrive/Docs/old.pdf' }],
  };

  await sync_service._runPollSync();

  assert.equal(sync_service.status, 'error');
  assert.equal(state_values.get('changes_page_token'), 'token1');
});

test('poll leaves vault, manifest, and queue unchanged when delete propagation is disabled', async () => {
  const recorded_actions = [];
  const state_values = new Map([['changes_page_token', 'token1']]);
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service.status = 'idle';
  sync_service.lastError = null;
  sync_service.lastSyncAt = null;
  sync_service.pendingCount = 0;
  sync_service.totalCount = 0;
  sync_service.auth = { isConnected: () => true };
  sync_service.onChange = () => {};
  sync_service.api = {
    getChanges: async () => ({
      changes: [{ fileId: 'file9', removed: true }],
      newStartPageToken: 'token2',
    }),
  };
  sync_service.vault = {
    trashEntries: async () => recorded_actions.push('trash'),
  };
  sync_service.db = {
    gdriveStateGet: (state_key, default_value) => state_values.get(state_key) ?? default_value,
    gdriveStateSet: (state_key, state_value) => state_values.set(state_key, state_value),
    gdriveSubscriptionsAll: () => [],
    gdriveManifestGet: () => {
      recorded_actions.push('manifest-get');
      return { driveFileId: 'file9', vaultPath: '/GDrive/Docs/old.pdf' };
    },
    gdriveManifestDelete: () => recorded_actions.push('manifest-delete'),
    gdriveSyncQueueRemove: () => recorded_actions.push('queue-remove'),
    gdriveSyncQueueCount: () => 0,
    getAll: () => [{ messageId: 42, path: '/GDrive/Docs/old.pdf' }],
  };

  await sync_service._runPollSync();

  assert.deepEqual(recorded_actions, []);
});
