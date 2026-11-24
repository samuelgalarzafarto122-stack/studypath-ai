// Generates the app icons from one SVG design (run: node tools/icons.mjs).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFile } from 'node:fs/promises';

const GLYPH = '<circle cx="6" cy="18" r="2.3"/><circle cx="18" cy="6" r="2.3"/><path d="M8.3 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.7"/>';
const BLUE = '#2f6bff';

function svg({ size = 512, rounded = true, scale = 16, bg = BLUE, fg = '#fff', stroke = 2.2 }) {
  const glyph = 24 * scale * (size / 512);
  const off = (size - glyph) / 2;
  const k = glyph / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${
    bg ? `<rect width="${size}" height="${size}" ${rounded ? `rx="${size * 0.22}"` : ''} fill="${bg}"/>` : ''
  }<g transform="translate(${off} ${off}) scale(${k})" fill="none" stroke="${fg}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g></svg>`;
}

const out = 'assets/icons/';
await writeFile(out + 'favicon.svg', svg({ size: 64, scale: 15 }));
await writeFile(out + 'icon.svg', svg({ size: 512 }));

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(name, markup, size, transparent = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.screenshot({ path: out + name, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}
await png('icon-192.png', svg({ size: 192 }), 192, true);
await png('icon-512.png', svg({ size: 512 }), 512, true);
await png('icon-maskable-512.png', svg({ size: 512, rounded: false, scale: 12 }), 512);
await png('apple-touch-icon.png', svg({ size: 180, rounded: false, scale: 14 }), 180);
await png('badge-96.png', svg({ size: 96, bg: '', scale: 20, stroke: 2.6 }), 96, true);
await browser.close();
console.log('icons written');
