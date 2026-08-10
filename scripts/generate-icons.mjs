// =============================================================================
// ECCLESIA — Brand Icon Set Generator
// =============================================================================
//
// PURPOSE
//   Renders the brand icon — a dark rounded square with a stylised
//   golden-cream E — at
//   every size the app, the OS, and the PWA need, with zero image dependencies
//   (pure Node: zlib + hand-rolled PNG/ICO/ICNS encoders). Re-run after any
//   brand tweak:
//
//     node scripts/generate-icons.mjs
//
// OUTPUTS
//   public/icons/icon-32.png / icon-192.png / icon-256.png / icon-512.png
//   public/icons/icon-maskable-512.png      (full-bleed variant for PWA masks)
//   public/icons/tray-icon.png              (32px — favicon / badge fallback)
//   public/icons/icon-192.svg / icon-512.svg (vector sources, PWA metadata)
//   electron/assets/icon-16.png … icon-512.png (BrowserWindow + Linux icons)
//   electron/assets/icon.png                (512px — electron-builder Linux)
//   electron/assets/tray-icon.png           (32px — system tray fallback)
//   electron/assets/icon.ico                (multi-size — Windows installer,
//                                            desktop shortcut, taskbar)
//   electron/assets/icon.icns               (multi-size — macOS app bundle)
//   electron/assets/icon.svg                (vector source for the desktop app)
//
// DESIGN
//   - Tile:     dark rounded square (#1E1E1E family) with a subtle vertical
//               gradient and a soft top rim light for depth.
//   - Glyph:    stylised golden-cream E built from four rounded bars (spine +
//               three arms; the middle arm is shorter and subtly angled for an
//               artisanal feel) with a warm gold gradient top-to-bottom.
//   - Quality:  6x supersampled coverage anti-aliasing (4x on the 1024px
//               render) gives smooth, crisp edges at every size; the ICO/ICNS
//               bundles embed native-size frames (16–256 / 16–1024) so the OS
//               never downscales a single large image.
// =============================================================================

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Brand palette ────────────────────────────────────────────────────────────
const GRAD_TOP = [43, 45, 49]; // #2B2D31 — tile highlight edge
const GRAD_BOTTOM = [21, 22, 26]; // #15161A — tile base
const GOLD_TOP = [248, 238, 208]; // #F8EED0 — golden-cream highlight
const GOLD_BOTTOM = [214, 172, 92]; // #D6AC5C — deeper gold base

// ── PNG encoder (RGBA, 8-bit) ────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // ihdr[10..12] default: compression 0, filter 0, interlace 0

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── ICO encoder (multi-size PNG entries, Vista+ compatible) ──────────────────
function encodeICO(pngsBySize) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4); // image count

  const entries = [];
  const bodies = [];
  let offset = 6 + sizes.length * 16;
  for (const size of sizes) {
    const png = pngsBySize[size];
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size; // width  (0 == 256)
    entry[1] = size === 256 ? 0 : size; // height (0 == 256)
    entry[2] = 0; // palette colors
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    entries.push(entry);
    bodies.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

// ── ICNS encoder (PNG entries; macOS 10.7+) ──────────────────────────────────
function encodeICNS(pngsBySize) {
  // [icns type, required PNG size]
  const types = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 64], // 32px @2x
    ['ic12', 512], // 256px @2x
    ['ic13', 1024], // 512px @2x
  ];
  const chunks = types.map(([type, size]) => {
    const png = pngsBySize[size];
    const chunk = Buffer.alloc(8);
    chunk.write(type, 0, 'ascii');
    chunk.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([chunk, png]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

// ── Rasterizer (supersampled coverage AA) ────────────────────────────────────
// Geometry is expressed as fractions of the canvas size so every output size
// shares the same optical proportions.

function renderIcon(size, { maskable = false } = {}) {
  // Geometry (fractions of size)
  const margin = maskable ? 0 : 0.03125; // 16/512
  const square = 1 - 2 * margin; // 480/512
  const radius = maskable ? 0 : 0.203125; // corner radius (maskable = full-bleed)
  const cy = maskable ? 0.5 : 0.4921875; // optical center (slightly raised)
  // Maskable tiles shrink the whole glyph (see `glyph` below) so it stays
  // inside the 80%-diameter safe zone that platform masks crop to.

  // Rim-light band (normal tiles only): 4px-wide ring inset 4px from the tile
  // edge, fading out over the top ~42% of the tile.
  const rimOuter = 0.0078125;
  const rimThick = 0.015625;

  const SS = size <= 512 ? 6 : 4; // supersample factor
  const SS2 = SS * SS;
  const rgba = Buffer.alloc(size * size * 4);

  // Rounded-rect inside test (coordinates relative to the tile centre).
  const inRRect = (dx, dy, half, r) => {
    if (r <= 0) return Math.abs(dx) <= half && Math.abs(dy) <= half; // plain square
    const ax = Math.max(Math.abs(dx) - (half - r), 0);
    const ay = Math.max(Math.abs(dy) - (half - r), 0);
    return ax * ax + ay * ay <= r * r;
  };

  // Capsule test: point within radius r of the segment (x1,y1)-(x2,y2). Used
  // to draw the stylised E as four rounded bars.
  const inCapsule = (pxN, pyN, x1, y1, x2, y2, r) => {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = pxN - x1;
    const wy = pyN - y1;
    const c1 = vx * wx + vy * wy;
    const c2 = vx * vx + vy * vy;
    const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, c1 / c2));
    const dx = wx - t * vx;
    const dy = wy - t * vy;
    return dx * dx + dy * dy <= r * r;
  };

  // Stylised E: vertical spine + three arms (middle one shorter and slightly
  // angled for an artisanal feel). Coordinates are fractions of the canvas;
  // the whole glyph is scaled around its optical centre for the maskable tile.
  const glyph = maskable ? 0.88 : 1;
  const gx = (v) => 0.5 + (v - 0.5) * glyph; // scale x around 0.5
  const gy = (v) => cy + (v - cy) * glyph; // scale y around cy
  const bars = [
    [gx(0.3203125), gy(0.2109375), gx(0.3203125), gy(0.7734375)], // spine
    [gx(0.3203125), gy(0.2109375), gx(0.6796875), gy(0.2109375)], // top arm
    [gx(0.3203125), gy(0.4921875), gx(0.5859375), gy(0.53125)], // middle arm (angled)
    [gx(0.3203125), gy(0.7734375), gx(0.6796875), gy(0.7734375)], // bottom arm
  ];
  const barR = 0.09375 * glyph; // bar radius (48/512)
  const eTop = gy(0.2109375) - barR; // E gradient extent (incl. caps)
  const eBot = gy(0.7734375) + barR;
  const inE = (pxN, pyN) => bars.some(([x1, y1, x2, y2]) => inCapsule(pxN, pyN, x1, y1, x2, y2, barR));

  const half = square / 2;
  const rimOuterHalf = half - rimOuter;
  const rimInnerHalf = half - rimOuter - rimThick;
  const rimOuterR = Math.max(radius - rimOuter, 0);
  const rimInnerR = Math.max(radius - rimOuter - rimThick, 0);
  const tileTop = margin * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const pxN = px / size;
          const pyN = py / size;
          // Tile geometry is centered on the canvas; only the E glyph uses the
          // optically raised center (cy).
          const dxT = pxN - 0.5;
          const dyT = pyN - 0.5;
          if (!inRRect(dxT, dyT, half, radius)) continue; // outside tile

          // Base: vertical gradient over the tile height.
          const t = Math.min(Math.max((py - tileTop) / (square * size), 0), 1);
          let r = GRAD_TOP[0] + (GRAD_BOTTOM[0] - GRAD_TOP[0]) * t;
          let g = GRAD_TOP[1] + (GRAD_BOTTOM[1] - GRAD_TOP[1]) * t;
          let b = GRAD_TOP[2] + (GRAD_BOTTOM[2] - GRAD_TOP[2]) * t;

          // Rim light: soft white sheen along the top inside edge.
          if (!maskable && inRRect(dxT, dyT, rimOuterHalf, rimOuterR) && !inRRect(dxT, dyT, rimInnerHalf, rimInnerR)) {
            const fade = 1 - Math.min(Math.max((py - tileTop) / (0.42 * square * size), 0), 1);
            const a = 0.13 * fade;
            r = r * (1 - a) + 255 * a;
            g = g * (1 - a) + 255 * a;
            b = b * (1 - a) + 255 * a;
          }

          if (inE(pxN, pyN)) {
            const tg = Math.min(Math.max((pyN - eTop) / (eBot - eTop), 0), 1);
            r = GOLD_TOP[0] + (GOLD_BOTTOM[0] - GOLD_TOP[0]) * tg;
            g = GOLD_TOP[1] + (GOLD_BOTTOM[1] - GOLD_TOP[1]) * tg;
            b = GOLD_TOP[2] + (GOLD_BOTTOM[2] - GOLD_TOP[2]) * tg;
          }

          sumR += r;
          sumG += g;
          sumB += b;
          sumA += 255;
        }
      }

      const i = (y * size + x) * 4;
      if (sumA === 0) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
        continue;
      }
      // Straight alpha: colour averaged over covered samples, alpha = coverage.
      const count = sumA / 255;
      rgba[i] = Math.round(sumR / count);
      rgba[i + 1] = Math.round(sumG / count);
      rgba[i + 2] = Math.round(sumB / count);
      rgba[i + 3] = Math.round(sumA / SS2);
    }
  }
  return rgba;
}

// ── SVG source (vector twin of the raster design) ────────────────────────────
function svgIcon(size) {
  const m = 0.03125 * size;
  const s = size - 2 * m;
  const r = 0.203125 * size;
  const cy = 0.4921875 * size;
  const rimOuter = 0.0078125 * size; // band outer inset
  const rimThick = 0.015625 * size; // band thickness
  const bar = 0.1875 * size; // E bar thickness
  const p = (v) => v * size; // fraction → px
  const gx = (v) => p(0.5 + (v - 0.5)); // E x (centred on canvas)
  const gy = (v) => p(cy / size + (v - cy / size)); // E y (centred on cy)
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="0" y1="${m}" x2="0" y2="${size - m}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2B2D31"/>
      <stop offset="1" stop-color="#15161A"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="${m}" x2="0" y2="${m + 0.42 * s}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="${gy(0.2109375) - bar / 2}" x2="0" y2="${gy(0.7734375) + bar / 2}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F8EED0"/>
      <stop offset="1" stop-color="#D6AC5C"/>
    </linearGradient>
  </defs>
  <rect x="${m}" y="${m}" width="${s}" height="${s}" rx="${r}" fill="url(#tile)"/>
  <rect x="${m + rimOuter + rimThick / 2}" y="${m + rimOuter + rimThick / 2}" width="${s - rimOuter * 2 - rimThick}" height="${s - rimOuter * 2 - rimThick}" rx="${r - rimOuter - rimThick / 2}" fill="none" stroke="url(#rim)" stroke-width="${rimThick}"/>
  <path d="M${gx(0.3203125)} ${gy(0.2109375)} V${gy(0.7734375)} M${gx(0.3203125)} ${gy(0.2109375)} H${gx(0.6796875)} M${gx(0.3203125)} ${gy(0.4921875)} L${gx(0.5859375)} ${gy(0.53125)} M${gx(0.3203125)} ${gy(0.7734375)} H${gx(0.6796875)}" stroke="url(#gold)" stroke-width="${bar}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

// ── Output ───────────────────────────────────────────────────────────────────
const pngCache = new Map();
const png = (size) => {
  if (!pngCache.has(size)) pngCache.set(size, encodePNG(size, renderIcon(size)));
  return pngCache.get(size);
};
const icoPngs = Object.fromEntries([16, 24, 32, 48, 64, 128, 256].map((s) => [s, png(s)]));
const icnsPngs = Object.fromEntries([16, 32, 64, 128, 256, 512, 1024].map((s) => [s, png(s)]));

const outputs = [
  // [relativePath, data]
  ['public/icons/icon-32.png', png(32)],
  ['public/icons/icon-192.png', png(192)],
  ['public/icons/icon-256.png', png(256)],
  ['public/icons/icon-512.png', png(512)],
  ['public/icons/icon-maskable-512.png', encodePNG(512, renderIcon(512, { maskable: true }))],
  ['public/icons/tray-icon.png', png(32)],
  ['public/icons/icon-192.svg', Buffer.from(svgIcon(192))],
  ['public/icons/icon-512.svg', Buffer.from(svgIcon(512))],
  ['electron/assets/icon.png', png(512)],
  ['electron/assets/icon-16.png', png(16)],
  ['electron/assets/icon-32.png', png(32)],
  ['electron/assets/icon-48.png', png(48)],
  ['electron/assets/icon-64.png', png(64)],
  ['electron/assets/icon-128.png', png(128)],
  ['electron/assets/icon-256.png', png(256)],
  ['electron/assets/icon-512.png', png(512)],
  ['electron/assets/tray-icon.png', png(32)],
  ['electron/assets/icon.ico', encodeICO(icoPngs)],
  ['electron/assets/icon.icns', encodeICNS(icnsPngs)],
  ['electron/assets/icon.svg', Buffer.from(svgIcon(512))],
];

for (const [rel, data] of outputs) {
  const abs = path.join(ROOT, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  console.log(`✓ ${rel} (${data.length} B)`);
}

console.log('\nIcon set regenerated.');
