const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const MASTER_ICON = path.join(BUILD_DIR, 'icon.png');

if (!fs.existsSync(MASTER_ICON)) {
  console.log(`Master icon not found at ${MASTER_ICON}, rendering...`);
  execSync(`node "${path.join(__dirname, 'render-master-icon.js')}"`, { stdio: 'inherit' });
}

const ELECTRON_ASSETS_DIR = path.join(ROOT_DIR, 'electron', 'assets');
if (!fs.existsSync(ELECTRON_ASSETS_DIR)) {
  fs.mkdirSync(ELECTRON_ASSETS_DIR, { recursive: true });
}
fs.copyFileSync(MASTER_ICON, path.join(ELECTRON_ASSETS_DIR, 'icon.png'));
fs.copyFileSync(MASTER_ICON, path.join(PUBLIC_DIR, 'icon.png'));

// 1. macOS .icns generation using sips and iconutil
function generateMacIcon() {
  console.log('Generating macOS .icns...');
  const iconsetDir = path.join(BUILD_DIR, 'icon.iconset');
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(iconsetDir, { recursive: true });

  const sizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const { name, size } of sizes) {
    const dest = path.join(iconsetDir, name);
    execSync(`sips -z ${size} ${size} "${MASTER_ICON}" --out "${dest}"`, { stdio: 'ignore' });
  }

  const icnsOutput = path.join(BUILD_DIR, 'icon.icns');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsOutput}"`);
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  console.log(`macOS icon generated: ${icnsOutput}`);
}

// 2. Windows & Favicon .ico generation (valid ICO binary with PNG frames)
function buildIcoBuffer(pngBuffersWithSize) {
  const count = pngBuffersWithSize.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + count * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4);

  const entries = [];
  const images = [];

  for (const { size, buffer } of pngBuffersWithSize) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset

    entries.push(entry);
    images.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

function generateWindowsIcon() {
  console.log('Generating Windows .ico and Favicon...');
  const tmpDir = path.join(BUILD_DIR, '.tmp_ico');
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  const winSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of winSizes) {
    const tmpPng = path.join(tmpDir, `icon_${size}.png`);
    execSync(`sips -z ${size} ${size} "${MASTER_ICON}" --out "${tmpPng}"`, { stdio: 'ignore' });
    const buffer = fs.readFileSync(tmpPng);
    pngBuffers.push({ size, buffer });
  }

  const icoBuffer = buildIcoBuffer(pngBuffers);
  const icoOutput = path.join(BUILD_DIR, 'icon.ico');
  fs.writeFileSync(icoOutput, icoBuffer);
  console.log(`Windows icon generated: ${icoOutput}`);

  // Also create public/favicon.ico with 16, 32, 48
  const faviconBuffers = pngBuffers.filter((p) => [16, 32, 48].includes(p.size));
  const faviconBuffer = buildIcoBuffer(faviconBuffers);
  const faviconOutput = path.join(PUBLIC_DIR, 'favicon.ico');
  fs.writeFileSync(faviconOutput, faviconBuffer);
  console.log(`Favicon generated: ${faviconOutput}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

generateMacIcon();
generateWindowsIcon();
console.log('All icons generated successfully!');
