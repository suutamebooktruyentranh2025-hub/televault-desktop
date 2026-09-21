const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const https = require('https');
const { GDriveApi } = require('../gdriveApi');

test('GDriveApi._get preserves multi-byte UTF-8 Vietnamese characters across chunk boundaries', async (test_context) => {
  const original_request = https.request;
  test_context.after(() => {
    https.request = original_request;
  });

  const payload = {
    files: [
      { id: '1', name: 'Saga Kiếm Thánh Sử T06.cbz' },
      { id: '2', name: 'Salman Người Cá Hồi T01.cbz' },
      { id: '3', name: 'Thanh Kiếm Biến Hình T03.cbz' },
      { id: '4', name: 'Thiên Tử Truyền Kỳ 5 Chap 181-200.cbz' }
    ]
  };
  const jsonStr = JSON.stringify(payload);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  // Find a multi-byte character in the buffer and split right inside it
  // In 'Thánh', 'Th' = 2 bytes, 'á' is 2 bytes: 0xC3 0xA1.
  const thIdx = jsonBuf.indexOf(Buffer.from('Thá', 'utf8'));
  assert.ok(thIdx !== -1, 'Substring "Thá" must be found in json buffer');
  // 'Th' is 2 bytes, so 0xC3 is at thIdx + 2. Split right after 0xC3:
  const splitPoint = thIdx + 3;

  const chunk1 = jsonBuf.subarray(0, splitPoint);
  const chunk2 = jsonBuf.subarray(splitPoint);

  https.request = (_request_options, response_callback) => {
    const request_stream = new EventEmitter();
    request_stream.end = () => {
      const response_stream = new PassThrough();
      response_stream.statusCode = 200;
      response_stream.headers = { 'content-type': 'application/json' };
      response_callback(response_stream);

      // Emit chunk 1 (ends with partial UTF-8 byte 0xC3)
      response_stream.write(chunk1);
      // Emit chunk 2 (starts with continuation byte 0xA1)
      response_stream.write(chunk2);
      response_stream.end();
    };
    request_stream.destroy = () => {};
    return request_stream;
  };

  const fakeAuth = {
    getValidToken: async () => 'fake-token'
  };
  const api = new GDriveApi({ auth: fakeAuth });
  const result = await api._get('https://example.com/files');

  assert.equal(result.files[0].name, 'Saga Kiếm Thánh Sử T06.cbz');
  assert.equal(result.files[1].name, 'Salman Người Cá Hồi T01.cbz');
  assert.equal(result.files[2].name, 'Thanh Kiếm Biến Hình T03.cbz');
  assert.equal(result.files[3].name, 'Thiên Tử Truyền Kỳ 5 Chap 181-200.cbz');
});
