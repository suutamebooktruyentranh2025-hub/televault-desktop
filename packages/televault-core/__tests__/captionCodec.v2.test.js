const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createVaultEntry,
  encodeCaption,
  encodePartCaption,
  decodeCaption,
  CAPTION_VERSION_V2,
} = require('../src');

describe('captionCodec v2', () => {
  it('encode/decode v2 manifest with parts', () => {
    const entry = createVaultEntry({
      messageId: 1,
      path: '/big.iso',
      size: 5_000_000_000,
      sha256: 'abc',
      mtime: new Date('2026-07-16T00:00:00.000Z'),
      parts: [
        { messageId: 1, offset: 0, size: 2097152000 },
        { messageId: 2, offset: 2097152000, size: 2097152000 },
        { messageId: 3, offset: 4194304000, size: 805696000 },
      ],
    });
    const encoded = encodeCaption(entry);
    const payload = JSON.parse(encoded);
    assert.equal(payload.v, CAPTION_VERSION_V2);
    const decoded = decodeCaption(1, encoded);
    assert.ok(decoded);
    assert.equal(decoded.path, '/big.iso');
    assert.equal(decoded.size, 5_000_000_000);
    assert.equal(decoded.sha256, 'abc');
    assert.ok(decoded.parts);
    assert.equal(decoded.parts.length, 3);
    assert.equal(decoded.parts[2].messageId, 3);
  });

  it('keeps v1 encode when parts are absent', () => {
    const entry = createVaultEntry({
      messageId: 10,
      path: '/small.bin',
      size: 100,
      sha256: 'ff',
      mtime: new Date('2026-07-16T00:00:00.000Z'),
    });
    const payload = JSON.parse(encodeCaption(entry));
    assert.equal(payload.v, 1);
    assert.equal(payload.parts, undefined);
  });

  it('part shard captions are not vault entries', () => {
    const caption = encodePartCaption(99, 2);
    assert.equal(decodeCaption(100, caption), null);
  });

  it('v1 captions still decode', () => {
    const caption =
      '{"v":1,"path":"/a.txt","size":10,"sha256":"aa","mtime":"2026-01-01T00:00:00.000Z"}';
    const decoded = decodeCaption(5, caption);
    assert.ok(decoded);
    assert.equal(decoded.path, '/a.txt');
    assert.equal(decoded.parts, null);
  });
});
