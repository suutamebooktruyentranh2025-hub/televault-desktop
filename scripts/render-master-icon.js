const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const SVG_PATH = path.join(BUILD_DIR, 'icon.svg');
const MASTER_ICON_PATH = path.join(BUILD_DIR, 'icon.png');

if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

// 1. Save standard macOS squircle SVG vector definition (824x824 squircle centered inside 1024x1024 with r=185)
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- macOS squircle shadow: Apple HIG standard -->
    <filter id="shadow" x="-15%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.24" />
    </filter>
  </defs>
  
  <!-- Rounded squircle base (Apple HIG macOS standard: 824x824 at (100, 100) with r=185) -->
  <rect x="100" y="100" width="824" height="824" rx="185" ry="185" fill="#ffffff" filter="url(#shadow)" stroke="rgba(0,0,0,0.08)" stroke-width="1.5" />
  
  <!-- Centered geometric brand motif -->
  <g transform="translate(116, 182) scale(16.5)">
    <!-- Top Green Polygon -->
    <path fill="#34A853" d="M14 20L22 6h12l-8 14H14z" />
    <!-- Bottom Blue Trapezoid -->
    <path fill="#4285F4" d="M6 34L14 20h20l8 14H6z" />
  </g>
</svg>`;

fs.writeFileSync(SVG_PATH, svgContent);
console.log(`Saved master SVG to ${SVG_PATH}`);

// 2. High-Fidelity Supersampled Master PNG Generation (2048x2048 supersampled -> 1024x1024 Lanczos)
// Using Python Pillow for true RGBA transparency and smooth Gaussian drop shadow
const pythonRenderScript = `
import sys
from PIL import Image, ImageDraw, ImageFilter

scale = 2
canvas_size = 1024 * scale
im = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))

# macOS HIG standard squircle: 824x824 centered inside 1024x1024 (inset 100)
inset = 100
w = 824
h = 824
r = 185

x0 = inset * scale
y0 = inset * scale
sw = w * scale
sh = h * scale
sr = r * scale

# 1. macOS Drop Shadow Layer
shadow_img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
shadow_draw = ImageDraw.Draw(shadow_img)
dy = int(18 * scale)
shadow_draw.rounded_rectangle([x0, y0 + dy, x0 + sw, y0 + sh + dy], radius=sr, fill=(0, 0, 0, int(255 * 0.24)))
shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(radius=24 * scale))
im.alpha_composite(shadow_img)

# 2. Base Squircle Layer
base_img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
base_draw = ImageDraw.Draw(base_img)
base_draw.rounded_rectangle([x0, y0, x0 + sw, y0 + sh], radius=sr, fill=(255, 255, 255, 255))
# Subtle stroke border for crispness across light/dark backgrounds
base_draw.rounded_rectangle([x0, y0, x0 + sw, y0 + sh], radius=sr, outline=(0, 0, 0, 20), width=max(1, int(1.5 * scale)))

# 3. TeleVault Geometric Brand Motif (Green Polygon & Blue Trapezoid)
center_x = canvas_size / 2.0
center_y = canvas_size / 2.0
s = 16.5 * scale
tx = center_x - 24.0 * s
ty = center_y - 20.0 * s

poly_green = [
    (tx + 14 * s, ty + 20 * s),
    (tx + 22 * s, ty + 6 * s),
    (tx + 34 * s, ty + 6 * s),
    (tx + 26 * s, ty + 20 * s)
]
base_draw.polygon(poly_green, fill=(52, 168, 83, 255))

poly_blue = [
    (tx + 6 * s, ty + 34 * s),
    (tx + 14 * s, ty + 20 * s),
    (tx + 34 * s, ty + 20 * s),
    (tx + 42 * s, ty + 34 * s)
]
base_draw.polygon(poly_blue, fill=(66, 133, 244, 255))

im.alpha_composite(base_img)

# Downsample with Lanczos for subpixel anti-aliasing
final_icon = im.resize((1024, 1024), Image.Resampling.LANCZOS)
final_icon.save('${MASTER_ICON_PATH}', 'PNG')

# Verification checks
corner_alpha = final_icon.getpixel((0, 0))[3]
if corner_alpha != 0:
    print(f'ERROR: Master icon corner is not transparent! Alpha={corner_alpha}', file=sys.stderr)
    sys.exit(1)
print(f'Master icon successfully saved with transparent squircle to ${MASTER_ICON_PATH}')
`;

const renderPyPath = path.join(BUILD_DIR, '.render_icon.py');
fs.writeFileSync(renderPyPath, pythonRenderScript);

try {
  execSync(`python3 "${renderPyPath}"`, { stdio: 'inherit' });
} finally {
  if (fs.existsSync(renderPyPath)) {
    fs.unlinkSync(renderPyPath);
  }
}
