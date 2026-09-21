const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const ELECTRON_ASSETS_DIR = path.join(ROOT_DIR, 'electron', 'assets');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

function verifyPng(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[${label}] File does not exist at ${filePath}`);
  }

  const pythonCheck = `
import sys
from PIL import Image

im = Image.open("${filePath}").convert("RGBA")
w, h = im.size
alpha = list(im.split()[-1].getdata())
transparent_count = sum(1 for p in alpha if p == 0)
semitransparent_count = sum(1 for p in alpha if 0 < p < 255)

c00 = im.getpixel((0, 0))[3]
p1 = (max(0, int(w * 0.02)), max(0, int(h * 0.02)))
p2 = (max(0, int(w * 0.05)), max(0, int(h * 0.05)))
c1 = im.getpixel(p1)[3]
c2 = im.getpixel(p2)[3]

if c00 != 0 or c1 != 0 or c2 != 0:
    print(f"ERROR: Corners are not transparent! (0,0)={c00}, {p1}={c1}, {p2}={c2}", file=sys.stderr)
    sys.exit(1)

min_transparent = max(10, int(len(alpha) * 0.10))
min_semitransparent = max(10, int(len(alpha) * 0.02))

if transparent_count < min_transparent:
    print(f"ERROR: Insufficient transparent pixels ({transparent_count} < {min_transparent})", file=sys.stderr)
    sys.exit(1)

if semitransparent_count < min_semitransparent:
    print(f"ERROR: Insufficient semi-transparent pixels ({semitransparent_count} < {min_semitransparent})", file=sys.stderr)
    sys.exit(1)

print(f"OK: {w}x{h}, transparent={transparent_count}, semitransparent={semitransparent_count}")
`;

  execSync(`python3 -c '${pythonCheck}'`, { stdio: 'inherit' });
  console.log(`[PASS] ${label} (${filePath}) meets macOS squircle requirements.`);
}

console.log('=== Verifying TeleVault Icon Assets ===');
verifyPng(path.join(BUILD_DIR, 'icon.png'), 'Master Icon');
verifyPng(path.join(ELECTRON_ASSETS_DIR, 'icon.png'), 'Electron Assets Icon');
verifyPng(path.join(PUBLIC_DIR, 'icon.png'), 'Public Web Icon');

// Also verify build/icon.icns
const icnsPath = path.join(BUILD_DIR, 'icon.icns');
if (!fs.existsSync(icnsPath)) {
  throw new Error(`[macOS ICNS] Missing file at ${icnsPath}`);
}
const tmpIconset = path.join(BUILD_DIR, '.tmp_verify_icns.iconset');
if (fs.existsSync(tmpIconset)) {
  fs.rmSync(tmpIconset, { recursive: true, force: true });
}
try {
  execSync(`iconutil -c iconset "${icnsPath}" -o "${tmpIconset}"`, { stdio: 'ignore' });
  verifyPng(path.join(tmpIconset, 'icon_512x512@2x.png'), 'ICNS 1024x1024 Layer');
  verifyPng(path.join(tmpIconset, 'icon_128x128.png'), 'ICNS 128x128 Layer');
  console.log(`[PASS] macOS .icns multi-resolution asset verified.`);
} finally {
  if (fs.existsSync(tmpIconset)) {
    fs.rmSync(tmpIconset, { recursive: true, force: true });
  }
}

console.log('All icons successfully verified!');
