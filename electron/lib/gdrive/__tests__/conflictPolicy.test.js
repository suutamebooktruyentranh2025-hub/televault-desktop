const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GDriveSyncService } = require('../gdriveSyncService');

function createConflictService({ policy, tempPath, upload_skipped = true }) {
  const uploaded_paths = [];
  const recorded_errors = [];
  const updated_manifests = [];
  const trashed_ids = [];
  const operation_events = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service._notifyProgress = () => {};
  sync_service._sha256OfAsync = async () => 'new-sha';
  sync_service.api = {
    downloadFile: async () => tempPath,
  };
  sync_service.vault = {
    enqueueUpload: async (_local_path, vault_path) => {
      uploaded_paths.push(vault_path);
      return {
        skipped: upload_skipped,
        task: upload_skipped ? null : {
          id: 'upload-1',
          onProgress: () => () => {},
        },
        done: Promise.resolve().then(() => operation_events.push('upload-finished')),
      };
    },
    queue: {
      cancel: () => {},
    },
    trashEntries: async (message_ids) => {
      operation_events.push('old-entry-trashed');
      trashed_ids.push(...message_ids);
    },
    db: {
      getAll: () => [{
        messageId: 101,
        path: '/GDrive/a.pdf',
        sha256: 'old-sha',
        size: 10,
      }],
    },
  };
  sync_service.db = {
    gdriveManifestGet: () => null,
    getAll: () => [{
      messageId: 101,
      path: '/GDrive/a.pdf',
      sha256: 'old-sha',
      size: 10,
    }],
    gdriveStateGet: (state_key, default_value) => {
      if (state_key === 'conflict_policy') return policy;
      return default_value;
    },
    gdriveManifestUpsert: (manifest) => updated_manifests.push(manifest),
    gdriveSyncErrorAdd: (sync_error) => recorded_errors.push(sync_error),
    gdriveSyncErrorRemove: () => {},
  };

  return {
    syncService: sync_service,
    uploadedPaths: uploaded_paths,
    recordedErrors: recorded_errors,
    updatedManifests: updated_manifests,
    trashedIds: trashed_ids,
    operationEvents: operation_events,
  };
}

function createTempFile() {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-conflict-'));
  const temp_path = path.join(temp_dir, 'a.pdf');
  fs.writeFileSync(temp_path, 'new content');
  return { tempDir: temp_dir, tempPath: temp_path };
}

const sync_input = {
  driveFileId: 'file1',
  fileName: 'a.pdf',
  drivePath: 'a.pdf',
  vaultPath: '/GDrive/a.pdf',
  size: 11,
  modifiedTime: '2026-07-16T00:00:00Z',
  md5Checksum: 'drive-md5',
};

test('_syncFile skips different vault content under skip policy', async () => {
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile();
  const {
    syncService: sync_service,
    uploadedPaths: uploaded_paths,
    recordedErrors: recorded_errors,
    updatedManifests: updated_manifests,
  } = createConflictService({ policy: 'skip', tempPath: temp_path });

  try {
    await sync_service._syncFile(sync_input);
    assert.deepEqual(uploaded_paths, []);
    assert.equal(updated_manifests.length, 0);
    assert.equal(recorded_errors.length, 1);
    assert.equal(recorded_errors[0].errorMessage, 'conflict: vault has different content');
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('_syncFile uploads a dated path under keep_both policy', async () => {
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile();
  const {
    syncService: sync_service,
    uploadedPaths: uploaded_paths,
    recordedErrors: recorded_errors,
    updatedManifests: updated_manifests,
  } = createConflictService({ policy: 'keep_both', tempPath: temp_path });

  try {
    await sync_service._syncFile(sync_input);
    assert.equal(uploaded_paths.length, 1);
    assert.match(uploaded_paths[0], /\/GDrive\/a \(conflict \d{4}-\d{2}-\d{2}\)\.pdf/);
    assert.equal(recorded_errors.length, 0);
    assert.equal(updated_manifests[0].vaultPath, uploaded_paths[0]);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('_syncFile soft-trashes the previous vault entry after overwrite upload', async () => {
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile();
  const {
    syncService: sync_service,
    uploadedPaths: uploaded_paths,
    trashedIds: trashed_ids,
    operationEvents: operation_events,
  } = createConflictService({
    policy: 'overwrite',
    tempPath: temp_path,
    upload_skipped: false,
  });

  try {
    await sync_service._syncFile(sync_input);
    assert.deepEqual(uploaded_paths, ['/GDrive/a.pdf']);
    assert.deepEqual(trashed_ids, [101]);
    assert.deepEqual(operation_events, ['upload-finished', 'old-entry-trashed']);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});
