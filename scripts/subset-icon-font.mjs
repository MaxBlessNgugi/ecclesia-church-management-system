// =============================================================================
// Icon font subsetting — build-time step of `npm run build`
// -----------------------------------------------------------------------------
// The app ships the full Material Symbols Outlined variable font (~3.87 MB,
// ~3,000 icons) while using 69. Measured with Lighthouse (desktop, cold cache):
// it dominated the login-page load (LCP 3.9 s, 4.3 MB transfer → now 0.9 s).
//
// Icons render as ligatures (`<span class="material-symbols-outlined">menu</span>`),
// so the subset text IS the icon names; subset-font keeps layout features
// ('liga') by default, which is what makes this work.
//
// Source font: src/assets/fonts/material-symbols-full.woff2 — do not delete;
// it's the permanent input this script re-subsets when icons are added.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT = path.join(ROOT, 'src', 'assets', 'fonts', 'material-symbols-full.woff2');
const CSS = path.join(ROOT, 'src', 'assets', 'fonts.css');

// ── 1. Scan src/**.{ts,tsx} for icon names ─────────────────────────────────
// - span children: static ("menu") or expression string literals
//   ({cond ? 'light_mode' : 'dark_mode'})
// - code references: { icon: 'dashboard' } (nav arrays, toast maps)
const iconSet = new Set();
const SPAN_CHILD = /material-symbols-outlined[^>]*>([\s\S]{0,200}?)<\/span>/g;

for (const file of fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })) {
  if (!/\.(tsx|ts)$/.test(file)) continue;
  const text = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');

  for (const [, inner] of text.matchAll(SPAN_CHILD)) {
    const bare = inner.match(/^\s*([a-z][a-z0-9_]*)\s*$/); // static ligature name
    if (bare) iconSet.add(bare[1]);
    for (const [, lit] of inner.matchAll(/'([a-z0-9_]+)'/g)) iconSet.add(lit);
  }
  for (const [, name] of text.matchAll(/icon:\s*'([a-z0-9_]+)'/g)) iconSet.add(name);
}
// The one icon rendered from a plain variable (dark-mode toggle in Header.tsx).
iconSet.add('light_mode');
iconSet.add('dark_mode');

// ── 2. Subset the full variable font ───────────────────────────────────────
// Pin every variation axis (FILL/wght/GRAD/opsz): the app only ever sets
// FILL 0|1 and wght 400 (index.css), so instancing the other axes is safe.
const buf = fs.readFileSync(FONT);
const subset = await subsetFont(buf, [...iconSet].sort().join('\n'), {
  targetFormat: 'woff2',
  variationAxes: { FILL: { min: 0, max: 1, default: 0 }, wght: 400, GRAD: 0, opsz: 24 },
});

// ── 3. Content-hashed artifact + fonts.css URL rewrite ─────────────────────
const outName = `material-symbols-subset-${
  crypto.createHash('sha256').update(subset).digest('hex').slice(0, 10)
}.woff2`;
const fontsDir = path.join(ROOT, 'public', 'fonts');
fs.writeFileSync(path.join(fontsDir, outName), subset);

// Keep exactly one subset artifact: stale hashed files would be copied into
// dist/ by Vite and dead weights the repo forever.
for (const f of fs.readdirSync(fontsDir)) {
  if (f.startsWith('material-symbols-subset-') && f !== outName) {
    fs.unlinkSync(path.join(fontsDir, f));
    console.log(`[subset-font] removed stale ${f}`);
  }
}

// Rewrite the URL inside the 'Material Symbols Outlined' @font-face block —
// covers both the original Google-served file and a previous subset build.
const css = fs.readFileSync(CSS, 'utf8');
const cut = css.indexOf("'Material Symbols Outlined'");
const cur = cut === -1 ? null : css.slice(cut).match(/\/fonts\/[^')]+\.woff2/)?.[0];
if (cur && cur !== `/fonts/${outName}`) {
  fs.writeFileSync(CSS, css.slice(0, cut) + css.slice(cut).replace(cur, `/fonts/${outName}`));
  console.log(`[subset-font] fonts.css updated: ${cur} → /fonts/${outName}`);
}
console.log(
  `[subset-font] ${(buf.length / 1024).toFixed(0)} KB → ${(subset.length / 1024).toFixed(0)} KB ` +
    `(${iconSet.size} icons) → ${outName}`,
);
