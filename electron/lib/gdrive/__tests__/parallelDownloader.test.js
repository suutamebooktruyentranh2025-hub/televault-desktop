const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const {
  calculateDownloadChunks,
  allocateFile,
  downloadChunk,
  downloadParallelChunks,
} = require('../gdriveParallelDownloader');

test('calculateDownloadChunks returns single chunk if below threshold', () => {
  const size = 10 * 1024 * 1024; // 10 MB
  const chunks = calculateDownloadChunks(size);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks[0].end, size - 1);
  assert.equal(chunks[0].size, size);
});

test('calculateDownloadChunks splits large file into contiguous ranges', () => {
  const size = 100 * 1024 * 1024; // 100 MB
  const chunks = calculateDownloadChunks(size, { concurrency: 4 });
  assert.equal(chunks.length, 4);

  let expectedStart = 0;
  let totalSize = 0;
  for (const chunk of chunks) {
    assert.equal(chunk.start, expectedStart);
    assert.ok(chunk.end >= chunk.start);
    assert.equal(chunk.size, chunk.end - chunk.start + 1);
    totalSize += chunk.size;
    expectedStart = chunk.end + 1;
  }
  assert.equal(totalSize, size);
  assert.equal(chunks[chunks.length - 1].end, size - 1);
});

test('calculateDownloadChunks handles odd remainder size cleanly', () => {
  const size = 100 * 1024 * 1024 + 7; // 100MB + 7 bytes
  const chunks = calculateDownloadChunks(size, { concurrency: 4 });
  assert.equal(chunks.length, 4);

  const totalCalculated = chunks.reduce((acc, c) => acc + c.size, 0);
  assert.equal(totalCalculated, size);
  assert.equal(chunks[3].end, size - 1);
});

test('calculateDownloadChunks respects minChunkSize constraint', () => {
  // 21 MB with min chunk 10 MB should yield 2 chunks instead of 4
  const size = 21 * 1024 * 1024;
  const chunks = calculateDownloadChunks(size, { concurrency: 4, minChunkSize: 10 * 1024 * 1024 });
  assert.equal(chunks.length, 2);
  assert.equal(chunks.reduce((acc, c) => acc + c.size, 0), size);
});

test('allocateFile preallocates exact file size', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-parallel-test-'));
  const targetFile = path.join(tempDir, 'test-alloc.bin');
  const targetSize = 25 * 1024 * 1024;

  try {
    allocateFile(targetFile, targetSize);
    assert.ok(fs.existsSync(targetFile));
    const stat = fs.statSync(targetFile);
    assert.equal(stat.size, targetSize);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('downloadParallelChunks returns fallback for small files', async () => {
  const result = await downloadParallelChunks({
    url: 'https://example.com/file',
    token: 'fake-token',
    destPath: '/tmp/test.bin',
    fileSize: 5 * 1024 * 1024,
  });
  assert.equal(result.parallelSuccess, false);
  assert.ok(result.fallbackReason);
});

test('downloadChunk writes byte range to specified offset in preallocated file', async (ctx) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-chunk-test-'));
  const targetFile = path.join(tempDir, 'chunk-target.bin');
  const originalRequest = https.request;

  ctx.after(() => {
    https.request = originalRequest;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  allocateFile(targetFile, 10);

  https.request = (options, cb) => {
    assert.equal(options.headers.Range, 'bytes=3-6');
    const req = new EventEmitter();
    req.end = () => {
      const res = new PassThrough();
      res.statusCode = 206;
      cb(res);
      res.end('ABCD');
    };
    req.destroy = () => {};
    return req;
  };

  let progressBytes = 0;
  await downloadChunk({
    url: 'https://example.com/file',
    token: 'token',
    destPath: targetFile,
    start: 3,
    end: 6,
    onChunkProgress: (delta) => { progressBytes += delta; },
  });

  assert.equal(progressBytes, 4);
  const buf = fs.readFileSync(targetFile);
  assert.equal(buf.subarray(3, 7).toString(), 'ABCD');
});

test('downloadParallelChunks executes multiple chunks concurrently and merges properly', async (ctx) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-parallel-run-'));
  const targetFile = path.join(tempDir, 'parallel-target.bin');
  const originalRequest = https.request;

  ctx.after(() => {
    https.request = originalRequest;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const fileSize = 20 * 1024 * 1024; // 20 MB -> triggers 4 chunks of 5 MB

  https.request = (options, cb) => {
    const rangeHeader = options.headers.Range;
    const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
    assert.ok(match);
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    const len = end - start + 1;

    const req = new EventEmitter();
    req.end = () => {
      const res = new PassThrough();
      res.statusCode = 206;
      cb(res);
      // Write sample data: first byte of range encoded as ASCII
      const sample = Buffer.alloc(len, String(start % 10));
      res.end(sample);
    };
    req.destroy = () => {};
    return req;
  };

  const progressReports = [];
  const result = await downloadParallelChunks({
    url: 'https://example.com/file',
    token: 'token',
    destPath: targetFile,
    fileSize,
    concurrency: 4,
    onProgress: (frac) => { progressReports.push(frac); },
  });

  assert.equal(result.parallelSuccess, true);
  assert.equal(fs.statSync(targetFile).size, fileSize);
  assert.ok(progressReports.length > 0);
  assert.equal(progressReports[progressReports.length - 1], 1);
});

test('downloadParallelChunks detects 200 OK and reports graceful fallback', async (ctx) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-fallback-'));
  const targetFile = path.join(tempDir, 'fallback.bin');
  const originalRequest = https.request;

  ctx.after(() => {
    https.request = originalRequest;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  https.request = (_options, cb) => {
    const req = new EventEmitter();
    req.end = () => {
      const res = new PassThrough();
      res.statusCode = 200; // Server ignores Range
      cb(res);
      res.end('entire-content');
    };
    req.destroy = () => {};
    return req;
  };

  const result = await downloadParallelChunks({
    url: 'https://example.com/file',
    token: 'token',
    destPath: targetFile,
    fileSize: 25 * 1024 * 1024,
    concurrency: 2,
  });

  assert.equal(result.parallelSuccess, false);
  assert.ok(result.fallbackReason.includes('not supported'));
});

test('GDriveApi.downloadFile automatically uses parallel download for files >= 20MB', async (ctx) => {
  const { GDriveApi } = require('../gdriveApi');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-api-parallel-'));
  const originalRequest = https.request;

  ctx.after(() => {
    https.request = originalRequest;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const targetSize = 24 * 1024 * 1024; // 24 MB
  const rangeCalls = [];

  https.request = (options, cb) => {
    const rangeHeader = options.headers.Range;
    if (rangeHeader) {
      rangeCalls.push(rangeHeader);
      const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      const len = end - start + 1;

      const req = new EventEmitter();
      req.end = () => {
        const res = new PassThrough();
        res.statusCode = 206;
        cb(res);
        res.end(Buffer.alloc(len, 'X'));
      };
      req.destroy = () => {};
      return req;
    }
    const req = new EventEmitter();
    req.end = () => {
      const res = new PassThrough();
      res.statusCode = 200;
      cb(res);
      res.end('fallback');
    };
    req.destroy = () => {};
    return req;
  };

  const api = new GDriveApi({
    auth: { getValidToken: async () => 'mock-token' },
  });

  const downloadedPath = await api.downloadFile('large-file-id', 'test.bin', tempDir, null, {
    expectedSize: targetSize,
  });

  assert.ok(fs.existsSync(downloadedPath));
  assert.equal(fs.statSync(downloadedPath).size, targetSize);
  // Verified that Range header requests were dispatched in chunks
  assert.ok(rangeCalls.length >= 2);
});

