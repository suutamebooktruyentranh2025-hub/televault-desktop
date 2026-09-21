const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ZIP_STORED = 0;
const ZIP_DEFLATED = 8;

function walkFiles(root_dir) {
  /** @type {{ relativePath: string, absolutePath: string }[]} */
  const files = [];
  function walk(current_dir, relative_prefix) {
    for (const entry of fs.readdirSync(current_dir, { withFileTypes: true })) {
      const absolute_path = path.join(current_dir, entry.name);
      const relative_path = relative_prefix ? `${relative_prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute_path, relative_path);
      } else if (entry.isFile()) {
        files.push({ relativePath: relative_path.replace(/\\/g, '/'), absolutePath: absolute_path });
      }
    }
  }
  walk(root_dir, '');
  return files;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value, 0);
  return buf;
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

/**
 * Create an uncompressed ZIP from all files under sourceDir.
 * @param {string} sourceDir
 * @param {string} zipPath
 */
function createZipFromDirectory(sourceDir, zipPath) {
  const files = walkFiles(sourceDir);
  /** @type {Buffer[]} */
  const parts = [];
  /** @type {{ name: Buffer, crc: number, size: number, offset: number }[]} */
  const central = [];
  let offset = 0;

  for (const file of files) {
    const data = fs.readFileSync(file.absolutePath);
    const name_buf = Buffer.from(file.relativePath, 'utf8');
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(ZIP_STORED),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name_buf.length),
      u16(0),
      name_buf,
      data,
    ]);
    central.push({ name: name_buf, crc, size: data.length, offset });
    parts.push(local);
    offset += local.length;
  }

  const central_start = offset;
  /** @type {Buffer[]} */
  const central_parts = [];
  for (const entry of central) {
    central_parts.push(Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(ZIP_STORED),
      u16(0),
      u16(0),
      u32(entry.crc),
      u32(entry.size),
      u32(entry.size),
      u16(entry.name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(entry.offset),
      entry.name,
    ]));
  }
  const central_buf = Buffer.concat(central_parts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(central.length),
    u16(central.length),
    u32(central_buf.length),
    u32(central_start),
    u16(0),
  ]);

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.writeFileSync(zipPath, Buffer.concat([...parts, central_buf, end]));
}

/**
 * Extract a ZIP created by createZipFromDirectory (stored or deflated entries).
 * @param {string} zipPath
 * @param {string} destDir
 */
function extractZipToDirectory(zipPath, destDir) {
  const buffer = fs.readFileSync(zipPath);
  let offset = 0;
  fs.mkdirSync(destDir, { recursive: true });

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compression = buffer.readUInt16LE(offset + 8);
    const compressed_size = buffer.readUInt32LE(offset + 18);
    const name_length = buffer.readUInt16LE(offset + 26);
    const extra_length = buffer.readUInt16LE(offset + 28);
    const name_start = offset + 30;
    const name = buffer.subarray(name_start, name_start + name_length).toString('utf8');
    const data_start = name_start + name_length + extra_length;
    const compressed = buffer.subarray(data_start, data_start + compressed_size);

    let data;
    if (compression === ZIP_STORED) {
      data = compressed;
    } else if (compression === ZIP_DEFLATED) {
      data = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression: ${compression}`);
    }

    const out_path = path.join(destDir, name);
    if (!path.resolve(out_path).startsWith(path.resolve(destDir) + path.sep)
      && path.resolve(out_path) !== path.resolve(destDir)) {
      throw new Error(`Unsafe ZIP path: ${name}`);
    }
    fs.mkdirSync(path.dirname(out_path), { recursive: true });
    fs.writeFileSync(out_path, data);
    offset = data_start + compressed_size;
  }
}

module.exports = {
  createZipFromDirectory,
  extractZipToDirectory,
};
