const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { GDriveApi } = require('../gdriveApi');

test('_downloadStream throttles onProgress to ~100ms (not every chunk)', async (test_context) => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-prog-'));
  const temp_path = path.join(temp_dir, 'file.bin');
  const original_request = https.request;
  test_context.after(() => {
    https.request = original_request;
    fs.rmSync(temp_dir, { recursive: true, force: true });
  });

  let fake_now = 1_000_000;
  const progress_at = [];

  https.request = (_request_options, response_callback) => {
    const request_stream = new EventEmitter();
    request_stream.end = () => {
      const response_stream = new PassThrough({ highWaterMark: 16 });
      response_stream.statusCode = 200;
      response_stream.headers = { 'content-length': '1000' };
      response_callback(response_stream);
      // Emit many small chunks quickly (same "wall clock" for throttle)
      for (let i = 0; i < 20; i += 1) {
        response_stream.write(Buffer.alloc(50, i));
      }
      // Advance clock and emit more so a second progress tick can fire
      fake_now += 150;
      response_stream.write(Buffer.alloc(50, 1));
      response_stream.end();
    };
    request_stream.destroy = () => {};
    return request_stream;
  };

  const drive_api = new GDriveApi({ auth: {} });
  drive_api._now = () => fake_now;

  await drive_api._downloadStream('https://example.com/file', 'token', temp_path, 0, () => {
    progress_at.push(fake_now);
  }, { expectedSize: 1000 });

  // Without throttle: 21 progress callbacks. With ~100ms throttle: 2 (start + after +150ms).
  assert.ok(progress_at.length <= 3, `expected throttled progress, got ${progress_at.length}`);
  assert.ok(progress_at.length >= 1);
});
