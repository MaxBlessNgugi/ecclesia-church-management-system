// =============================================================================
// Builds icon-preview.html — a self-contained page showing the regenerated
// brand icon at multiple sizes on light/dark/checkerboard backgrounds, plus
// the vector SVG rendered inline. Run after `node scripts/generate-icons.mjs`.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b64 = (p) => readFileSync(path.join(ROOT, p)).toString('base64');
const svg = readFileSync(path.join(ROOT, 'electron', 'assets', 'icon.svg'), 'utf8');

const png = (p, px, label) => `
  <div class="cell">
    <img width="${px}" height="${px}" src="data:image/png;base64,${b64(p)}" alt="${label}"/>
    <div>${label} — ${px}px</div>
  </div>`;

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ecclesia Icon — Monoline E + Cross</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 28px; background: #e8e8ea; color: #222; }
  h2 { margin: 28px 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #444; }
  .bg-light { background: #ffffff; padding: 20px; border-radius: 12px; display: inline-flex; gap: 20px; align-items: center; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .bg-dark { background: #141518; padding: 20px; border-radius: 12px; display: inline-flex; gap: 20px; align-items: center; }
  .bg-check { background: repeating-conic-gradient(#d5d5d8 0% 25%, #fff 0% 50%) 50% / 18px 18px; padding: 20px; border-radius: 12px; display: inline-flex; gap: 20px; align-items: center; }
  .cell { text-align: center; font-size: 10px; color: #666; }
  .svg-tile { background: #ffffff; padding: 20px; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
</style></head><body>
  <h2>512px — light / dark / checkerboard</h2>
  <div class="bg-light">${png('public/icons/icon-512.png', 160, '512')}</div>
  <div class="bg-dark">${png('public/icons/icon-512.png', 160, '512')}</div>
  <div class="bg-check">${png('public/icons/icon-512.png', 160, '512')}</div>

  <h2>Sizes — 256 / 192 / 128 / 64 / 32 / 16</h2>
  <div class="bg-light">
    ${png('public/icons/icon-256.png', 96, '256')}
    ${png('public/icons/icon-192.png', 72, '192')}
    ${png('electron/assets/icon-128.png', 48, '128')}
    ${png('electron/assets/icon-64.png', 48, '64')}
    ${png('public/icons/icon-32.png', 32, '32')}
    ${png('electron/assets/icon-16.png', 32, '16')}
  </div>

  <h2>PWA maskable (full-bleed safe zone)</h2>
  <div class="bg-check">${png('public/icons/icon-maskable-512.png', 160, 'maskable 512')}</div>

  <h2>Vector source (electron/assets/icon.svg)</h2>
  <div class="svg-tile">
    <div style="width:200px;height:200px;border-radius:18px;overflow:hidden;display:inline-block;background:#141518">${svg.replace('<svg', '<svg width="200" height="200"')}</div>
  </div>
</body></html>
`;

writeFileSync(path.join(ROOT, 'icon-preview.html'), html);
console.log('✓ icon-preview.html rebuilt');
