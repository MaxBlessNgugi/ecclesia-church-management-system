// =============================================================================
// ECCLESIA — Cream + Black Icon Set Generator
// =============================================================================
//
// PURPOSE
//   Renders the brand icon (cream circle + black cross) at every size the app
//   needs, with zero image dependencies (pure Node: zlib + hand-rolled PNG/ICO
//   encoders). Re-run after any brand tweak:
//
//     node scripts/generate-icons.mjs
//
// OUTPUTS
//   public/icons/icon-32.png / icon-192.png / icon-256.png / icon-512.png
//   public/icons/tray-icon.png            (32px — favicon / badge fallback)
//   public/icons/icon-192.svg             (vector source, PWA metadata)
//   public/icons/icon-512.svg
//   electron/assets/icon.png              (256px — BrowserWindow icon)
//   electron/assets/tray-icon.png         (32px — system tray icon)
//   electron/assets/icon.ico              (256px PNG-in-ICO — Windows installer)
//   electron/assets/icon.svg              (vector source for the desktop app)
//
// DESIGN
//   - Background: cream circle  #F5EFE0
//   - Cross:      black #1A1C1C, rounded caps, ~23% bar thickness
//   - 4x supersampling gives smooth anti-aliased edges at every size
// =============================================================================

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Brand palette ────────────────────────────────────────────────────────────
const CREAM = [245, 239, 224]; // #F5EFE0
const BLACK = [26, 28, 28]; // #1A1C1C

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

// ── ICO encoder (single 256×256 PNG entry, Vista+ compatible) ────────────────
function encodeICO(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width  (0 == 256)
  entry[1] = 0; // height (0 == 256)
  entry[2] = 0; // palette colors
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // size of image data
  entry.writeUInt32LE(22, 12); // offset of image data
  return Buffer.concat([header, entry, png]);
}

// ── Rasterizer (4× supersampled coverage) ────────────────────────────────────
function renderIcon(size) {
  const SS = 4; // supersample factor
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.48; // cream circle
  const barHalf = size * 0.115; // half cross thickness
  const barLen = size * 0.335; // half cross arm length
  const SS2 = SS * SS;

  // Cross test: vertical or horizontal bar, with rounded caps at the 4 ends.
  const inCross = (dx, dy) => {
    if (Math.abs(dx) <= barHalf && Math.abs(dy) <= barLen) return true;
    if (Math.abs(dy) <= barHalf && Math.abs(dx) <= barLen) return true;
    const cap = (ex, ey) => (dx - ex) ** 2 + (dy - ey) ** 2 <= barHalf * barHalf;
    return cap(0, barLen) || cap(0, -barLen) || cap(barLen, 0) || cap(-barLen, 0);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cream = 0;
      let black = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - cx;
          const py = y + (sy + 0.5) / SS - cy;
          if (px * px + py * py > radius * radius) continue; // outside circle
          if (inCross(px, py)) black++;
          else cream++;
        }
      }
      const total = cream + black;
      const i = (y * size + x) * 4;
      if (total === 0) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0; // transparent
        continue;
      }
      rgba[i] = Math.round((cream * CREAM[0] + black * BLACK[0]) / total);
      rgba[i + 1] = Math.round((cream * CREAM[1] + black * BLACK[1]) / total);
      rgba[i + 2] = Math.round((cream * CREAM[2] + black * BLACK[2]) / total);
      rgba[i + 3] = Math.round((total / SS2) * 255); // partial edge alpha
    }
  }
  return rgba;
}

// ── SVG source (vector twin of the raster design) ────────────────────────────
function svgIcon(size) {
  const r = size * 0.48;
  const sw = size * 0.23;
  const arm = size * 0.34;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#F5EFE0"/>
  <path d="M${size / 2} ${size / 2 - arm} V${size / 2 + arm} M${size / 2 - arm} ${size / 2} H${size / 2 + arm}" stroke="#1A1C1C" stroke-width="${sw}" stroke-linecap="round"/>
</svg>
`;
}

// ── Output ───────────────────────────────────────────────────────────────────
const outputs = [
  // [relativePath, size, format]
  ['public/icons/icon-32.png', 32, 'png'],
  ['public/icons/icon-192.png', 192, 'png'],
  ['public/icons/icon-256.png', 256, 'png'],
  ['public/icons/icon-512.png', 512, 'png'],
  ['public/icons/tray-icon.png', 32, 'png'],
  ['electron/assets/icon.png', 256, 'png'],
  ['electron/assets/tray-icon.png', 32, 'png'],
  ['electron/assets/icon.ico', 256, 'ico'],
  ['public/icons/icon-192.svg', 192, 'svg'],
  ['public/icons/icon-512.svg', 512, 'svg'],
  ['electron/assets/icon.svg', 512, 'svg'],
];

for (const [rel, size, format] of outputs) {
  const abs = path.join(ROOT, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  let data;
  if (format === 'svg') {
    data = svgIcon(size);
  } else {
    const rgba = renderIcon(size);
    const png = encodePNG(size, rgba);
    data = format === 'ico' ? encodeICO(png) : png;
  }
  writeFileSync(abs, data);
  console.log(`✓ ${rel} (${size}px, ${format})`);
}

console.log('\nIcon set regenerated.');
