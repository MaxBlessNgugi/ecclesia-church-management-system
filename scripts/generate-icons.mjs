// =============================================================================
// ECCLESIA — Brand Icon Set Generator
// =============================================================================
//
// PURPOSE
//   Renders the brand icon — a dark charcoal rounded tile with a delicate
//   monoline E+Cross monogram and the word "ECCLESIA" beneath it in cool
//   brushed silver — at every size the app, the OS, and the PWA need, with
//   zero image dependencies (pure Node: zlib + hand-rolled PNG/ICO/ICNS
//   encoders). Re-run after any brand tweak:
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
// DESIGN (matches electron/assets/icon.svg)
//   - Tile:      dark charcoal radial gradient (#22252A centre → #121316 edge)
//                on a rounded square (margin 32/512, corner radius 96/512).
//   - Monogram:  a thin monoline "E" drawn as a single continuous outline
//                (stroke width 16/512, round caps/joins) whose hollow centre
//                carries a free-floating vertical cross beam that pokes above
//                the E's top bar and crosses the outlined middle bar.
//   - Lettering: "ECCLESIA" in a 5×7 geometric sans-serif pixel font rendered
//                as rounded blocks, centred beneath the monogram (≈26px at
//                512, ~7px letter-spacing).
//   - Finish:    cool brushed silver diagonal gradient (#FFFFFF → #D1D5DB →
//                #9CA3AF → #E5E7EB → #6B7280) with a soft 4px drop shadow
//                (50% black) offset beneath the monogram.
//   - Quality:   6x supersampled coverage anti-aliasing (4x on the 1024px
//                render); ICO/ICNS bundles embed native-size frames (16–256 /
//                16–1024) so the OS never downscales a single large image.
// =============================================================================

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Brand palette ────────────────────────────────────────────────────────────
const TILE_CENTER = [34, 37, 42]; // #22252A — charcoal radial centre
const TILE_EDGE = [18, 19, 22]; // #121316 — charcoal radial edge
const METAL_STOPS = [
  [0.0, [255, 255, 255]], // #FFFFFF
  [0.25, [209, 213, 219]], // #D1D5DB
  [0.5, [156, 163, 175]], // #9CA3AF
  [0.75, [229, 231, 235]], // #E5E7EB
  [1.0, [107, 114, 128]], // #6B7280
];

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

// ── Deterministic hash (for grain / brushed texture) ─────────────────────────
function hash2(x, y, seed) {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// ── 5×7 geometric sans-serif glyphs for "ECCLESIA" ───────────────────────────
const FONT = {
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  S: ['11111', '10000', '10000', '01110', '00001', '00001', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
};

/**
 * Build the list of lit cells for a word, laid out left→right with
 * `gapCells` empty columns between characters. Returns [col, row, cx, cy]
 * in fractions of the canvas, centred on (cxCentre, cyCentre).
 */
function layoutWord(word, cell, cxCentre, cyCentre, gapCells = 1) {
  const cells = [];
  const halfW = (word.length * (5 + gapCells) - 1) / 2;
  let col = 0;
  for (const ch of word) {
    const rows = FONT[ch];
    if (!rows) throw new Error(`No glyph for "${ch}"`);
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] === '1') {
          const cx = cxCentre + (col + c + 0.5 - halfW) * cell;
          const cy = cyCentre + (r + 0.5 - rows.length / 2) * cell;
          cells.push([cx, cy]);
        }
      }
    }
    col += 5 + gapCells;
  }
  return cells;
}

// ── Separable box blur (drop-shadow approximation) ───────────────────────────
function boxBlur(src, size, radius) {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const clamp = (v) => (v < 0 ? 0 : v > size - 1 ? size - 1 : v);
  // Horizontal pass
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[row + clamp(x)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc / (radius * 2 + 1);
      acc += src[row + clamp(x + radius + 1)] - src[row + clamp(x - radius)];
    }
  }
  // Vertical pass
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[clamp(y) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc / (radius * 2 + 1);
      acc += tmp[clamp(y + radius + 1) * size + x] - tmp[clamp(y - radius) * size + x];
    }
  }
  return out;
}

// ── Rasterizer (supersampled coverage AA) ────────────────────────────────────
// Geometry is expressed as fractions of the 512px SVG canvas so every output
// size shares the same optical proportions.

function renderIcon(size, { maskable = false } = {}) {
  // Composition scale: normal tiles fill the canvas; maskable variants shrink
  // the artwork into the PWA safe zone on a full-bleed tile.
  const comp = maskable ? 0.8 : 1;
  const cx0 = (v) => 0.5 + (v - 0.5) * comp;
  const cy0 = (v) => 0.5 + (v - 0.5) * comp;

  // Tile geometry (fractions of size)
  const margin = maskable ? 0 : 0.0625; // 32/512
  const radius = maskable ? 0 : 0.1875; // 96/512 — corner radius
  const square = 1 - 2 * margin;

  // ── Monogram: monoline E outline + central cross beam (stroke 16/512) ─────
  const BW = 0.015625; // half stroke width (16/512 / 2)

  // Outer 'E' frame — the SVG path `M 320 160 H 220 A … 180 200 V 220 H 280
  // V 260 V 300 H 180 V 312 A … 220 352 H 320`, decomposed into capsules for
  // the straight runs and 90° arc bands for the two rounded left corners.
  const topBar = [cx0(0.4296875), cy0(0.3125), cx0(0.625), cy0(0.3125)]; // (220,160)→(320,160)
  const cornerTL = { cx: cx0(0.4296875), cy: cy0(0.390625), r: 0.078125, quad: 'TL' }; // arc centre (220,200) r40
  const leftSpine = [cx0(0.3515625), cy0(0.390625), cx0(0.3515625), cy0(0.609375)]; // (180,200)→(180,312)
  const midTop = [cx0(0.3515625), cy0(0.4296875), cx0(0.546875), cy0(0.4296875)]; // (180,220)→(280,220)
  const midRight = [cx0(0.546875), cy0(0.4296875), cx0(0.546875), cy0(0.5859375)]; // (280,220)→(280,300)
  const midBottom = [cx0(0.546875), cy0(0.5859375), cx0(0.3515625), cy0(0.5859375)]; // (280,300)→(180,300)
  const cornerBL = { cx: cx0(0.4296875), cy: cy0(0.609375), r: 0.078125, quad: 'BL' }; // arc centre (220,312) r40
  const botBar = [cx0(0.4296875), cy0(0.6875), cx0(0.625), cy0(0.6875)]; // (220,352)→(320,352)
  const crossBeam = [cx0(0.5), cy0(0.3515625), cx0(0.5), cy0(0.6484375)]; // (256,180)→(256,332)
  const capsules = [topBar, leftSpine, midTop, midRight, midBottom, botBar, crossBeam];
  const arcs = [cornerTL, cornerBL];

  // Metal gradient bbox = monogram extents (stroke edges), comp-scaled.
  const gx0 = cx0(0.3359375); // 172/512 (left spine outer edge)
  const gx1 = cx0(0.640625); // 328/512 (top/bottom bar outer edge)
  const gy0 = cy0(0.296875); // 152/512 (top bar outer edge)
  const gy1 = cy0(0.703125); // 360/512 (bottom bar outer edge)

  // "ECCLESIA" lettering beneath the monogram (≈26px font at 512, baseline
  // at 412/512 ≈ 0.8047, letter-spacing ≈ 7px).
  const cell = 0.0052 * comp;
  const gapCells = 2.6; // 7px spacing / 2.66px cell
  const textCy = 0.8046875 - 3.5 * cell; // bottom edge at baseline 412/512
  const wordCells = layoutWord('ECCLESIA', cell, cx0(0.5), cy0(textCy), gapCells);

  const textY0 = cy0(textCy) - 3.5 * cell;
  const textY1 = cy0(textCy) + 3.5 * cell;
  const textHalfW = (8 * (5 + gapCells) - 1) / 2;
  const textX0 = cx0(0.5) - textHalfW * cell;
  const textX1 = cx0(0.5) + textHalfW * cell;

  const SS = size <= 512 ? 6 : 4; // supersample factor
  const SS2 = SS * SS;
  const cov = new Float32Array(size * size); // monogram coverage (0..1)
  const tileA = new Float32Array(size * size); // tile coverage (0..1)

  // Rounded-rect inside test (coordinates relative to the rect centre).
  const inRRect = (dx, dy, half, r) => {
    if (r <= 0) return Math.abs(dx) <= half && Math.abs(dy) <= half; // plain square
    const ax = Math.max(Math.abs(dx) - (half - r), 0);
    const ay = Math.max(Math.abs(dy) - (half - r), 0);
    return ax * ax + ay * ay <= r * r;
  };

  // Capsule test: point within radius r of the segment (x1,y1)-(x2,y2).
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

  // 90° arc band test for the E's two rounded left corners.
  const inArcBand = (pxN, pyN, arc, halfW) => {
    const dx = pxN - arc.cx;
    const dy = pyN - arc.cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(d - arc.r) > halfW) return false;
    if (arc.quad === 'TL') return dx < 0 && dy < 0; // top-left quadrant
    return dx < 0 && dy > 0; // bottom-left quadrant
  };

  // ── Pass 1: supersampled coverage ─────────────────────────────────────────
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let mono = 0;
      let tile = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const pxN = (x + (sx + 0.5) / SS) / size;
          const pyN = (y + (sy + 0.5) / SS) / size;
          if (inRRect(pxN - 0.5, pyN - 0.5, square / 2, radius)) tile++;

          let hit = false;
          for (const [x1, y1, x2, y2] of capsules) {
            if (inCapsule(pxN, pyN, x1, y1, x2, y2, BW)) {
              hit = true;
              break;
            }
          }
          if (!hit) {
            for (const arc of arcs) {
              if (inArcBand(pxN, pyN, arc, BW)) {
                hit = true;
                break;
              }
            }
          }
          if (!hit && pyN >= textY0 && pyN <= textY1 && pxN >= textX0 && pxN <= textX1) {
            // "ECCLESIA" lettering — rounded blocks, one per lit glyph cell.
            const cellHalf = cell * 0.49;
            const cellR = cell * 0.22;
            for (const [cxx, cyy] of wordCells) {
              if (inRRect(pxN - cxx, pyN - cyy, cellHalf, cellR)) {
                hit = true;
                break;
              }
            }
          }
          if (hit) mono++;
        }
      }
      cov[y * size + x] = mono / SS2;
      tileA[y * size + x] = tile / SS2;
    }
  }

  // ── Pass 2: drop shadow — blurred monogram shifted down 4px (50% black) ───
  const blurR = Math.max(1, Math.round(0.0195 * size)); // σ≈6 at 512
  const offY = Math.round(0.0078125 * size); // 4px at 512
  const blurred = boxBlur(cov, size, blurR);

  // ── Pass 3: composite ─────────────────────────────────────────────────────
  const rgba = Buffer.alloc(size * size * 4);

  /** Cool brushed-silver diagonal gradient at a normalised point. */
  const metal = (pxN, pyN) => {
    const t = Math.min(
      Math.max(((pxN - gx0) / (gx1 - gx0) + (pyN - gy0) / (gy1 - gy0)) / 2, 0),
      1,
    );
    let i = 0;
    while (i < METAL_STOPS.length - 2 && t > METAL_STOPS[i + 1][0]) i++;
    const [t0, c0] = METAL_STOPS[i];
    const [t1, c1] = METAL_STOPS[i + 1];
    const f = Math.min(Math.max((t - t0) / (t1 - t0), 0), 1);
    // Subtle dither so smooth gradients don't band at small sizes.
    const d = 1 + 0.004 * (hash2(Math.round(pxN * 1024), Math.round(pyN * 1024), 3) - 0.5) * 2;
    return [
      Math.min(255, (c0[0] + (c1[0] - c0[0]) * f) * d),
      Math.min(255, (c0[1] + (c1[1] - c0[1]) * f) * d),
      Math.min(255, (c0[2] + (c1[2] - c0[2]) * f) * d),
    ];
  };

  /** Matte charcoal radial-gradient tile colour (centre (0.5,0.4), r 0.6). */
  const tileColor = (pxN, pyN) => {
    const dx = pxN - 0.5;
    const dy = pyN - 0.4;
    const t = Math.min(Math.max(Math.sqrt(dx * dx + dy * dy) / 0.6, 0), 1);
    let r = TILE_CENTER[0] + (TILE_EDGE[0] - TILE_CENTER[0]) * t;
    let g = TILE_CENTER[1] + (TILE_EDGE[1] - TILE_CENTER[1]) * t;
    let b = TILE_CENTER[2] + (TILE_EDGE[2] - TILE_CENTER[2]) * t;
    // Fine matte grain.
    const grain = (hash2(Math.round(pxN * 1024), Math.round(pyN * 1024), 11) - 0.5) * 5;
    r += grain;
    g += grain;
    b += grain;
    return [r, g, b];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = tileA[y * size + x];
      if (a <= 0) {
        rgba[i + 3] = 0;
        continue;
      }
      const pxN = (x + 0.5) / size;
      const pyN = (y + 0.5) / size;
      let [r, g, b] = tileColor(pxN, pyN);

      // Drop shadow: darken by the offset blurred monogram (opacity 0.5).
      const sy = y - offY;
      if (sy >= 0) {
        const s = 0.5 * blurred[sy * size + x];
        if (s > 0) {
          r *= 1 - s;
          g *= 1 - s;
          b *= 1 - s;
        }
      }

      // Monogram + lettering, blended by coverage for smooth AA edges.
      const m = cov[y * size + x];
      if (m > 0) {
        const [mr, mg, mb] = metal(pxN, pyN);
        r += (mr - r) * m;
        g += (mg - g) * m;
        b += (mb - b) * m;
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

// ── SVG source (vector twin of the raster design) ────────────────────────────
function svgIcon(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Dark Charcoal Background Gradient -->
    <radialGradient id="bg-grad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#22252a"/>
      <stop offset="100%" stop-color="#121316"/>
    </radialGradient>

    <!-- Metallic Brushed Silver Gradient -->
    <linearGradient id="silver-metal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="25%" stop-color="#D1D5DB"/>
      <stop offset="50%" stop-color="#9CA3AF"/>
      <stop offset="75%" stop-color="#E5E7EB"/>
      <stop offset="100%" stop-color="#6B7280"/>
    </linearGradient>

    <!-- Subtle Drop Shadow -->
    <filter id="subtle-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Base Icon Background (Rounded App Tile) -->
  <rect x="32" y="32" width="448" height="448" rx="96" fill="url(#bg-grad)"/>

  <!-- Monoline E + Cross Symbol -->
  <g filter="url(#subtle-shadow)">
    <!-- Outer 'E' Frame & Integrated Cross -->
    <path d="
      M 320 160 
      H 220 
      A 40 40 0 0 0 180 200 
      V 220 
      H 280 
      V 260 
      H 280 
      V 300 
      H 180 
      V 312 
      A 40 40 0 0 0 220 352 
      H 320" 
      fill="none" 
      stroke="url(#silver-metal)" 
      stroke-width="16" 
      stroke-linecap="round" 
      stroke-linejoin="round"/>

    <!-- Central Vertical Beam of the Cross -->
    <path d="M 256 180 V 332" 
      fill="none" 
      stroke="url(#silver-metal)" 
      stroke-width="16" 
      stroke-linecap="round"/>
  </g>

  <!-- ECCLESIA Typography -->
  <text x="256" y="412" 
    text-anchor="middle" 
    fill="url(#silver-metal)" 
    font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
    font-size="26" 
    font-weight="600" 
    letter-spacing="7">ECCLESIA</text>
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
