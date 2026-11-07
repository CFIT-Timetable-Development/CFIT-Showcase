#!/usr/bin/env node
// Image audit: which file each main screenshot actually loads, at which on-screen size, on which screen.
//   node tools/image-audit.mjs <url> <out-dir>
// For every configuration (desktop widths at 1×, 1.5× and 2×, phones in Chrome and WebKit) it scrolls the page,
// then records for each screenshot: the file the browser chose (currentSrc), that file's pixel width, the rendered
// CSS width, the device pixel ratio and the resulting density (file pixels ÷ screen pixels: below 1 the browser
// enlarges the picture, which softens it), and any transform on the picture or its ancestors.
// Writes audit.json and AUDIT.md in <out-dir>.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices, webkit } from 'playwright-core';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) throw new Error('usage: node tools/image-audit.mjs <url> <out-dir>');
mkdirSync(outDir, { recursive: true });

/** The pictures that matter, by a selector for the picture's link. */
const TARGETS = [
  ['Hero (Day view)', '.hero-shot [data-zoom]'],
  ['Workbooks (before)', '.before-shot [data-zoom]'],
  ['Conflict detection', '.cap-wide .cap-media [data-zoom]'],
  ['Suggest fixes', '#f-fixes ~ * [data-zoom], .cap-split:has(#f-fixes) figure [data-zoom]'],
  ['Split', '.cap-pair .pair figure:nth-child(1) [data-zoom]'],
  ['Merge', '.cap-pair .pair figure:nth-child(2) [data-zoom]'],
  ['History', '.history-shot [data-zoom]'],
  ['PDF page', '.paper [data-zoom]'],
  ['Export dialog', '.paper-dialog [data-zoom]'],
  ['Gallery thumbnail (Week)', '.gallery-grid li:nth-child(3) [data-zoom]'],
];

const CONFIGS = [
  { name: 'Chrome 1440×900 @1', engine: 'chrome', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'Chrome 1440×900 @2', engine: 'chrome', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'Chrome 1920×1080 @1', engine: 'chrome', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  { name: 'Chrome 1920×1080 @1.5', engine: 'chrome', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 },
  { name: 'Chrome 2560×1440 @1', engine: 'chrome', viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 },
  { name: 'Chrome 3840×2160 @1', engine: 'chrome', viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 },
  { name: 'Chrome 375 @2', engine: 'chrome', viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'Chrome 390 @3', engine: 'chrome', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'WebKit iPhone 13', engine: 'webkit', device: 'iPhone 13' },
  { name: 'WebKit iPhone SE (3rd gen)', engine: 'webkit', device: 'iPhone SE (3rd gen)' },
];

const chrome = await chromium.launch({ channel: 'chrome' });
const safari = await webkit.launch().catch(() => null);
/** @type {any[]} */
const rows = [];
for (const cfg of CONFIGS) {
  const browser = cfg.engine === 'webkit' ? safari : chrome;
  if (!browser) continue;
  const options = cfg.device ? { ...devices[cfg.device] } : { viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch };
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  // Scroll through so lazy pictures load, then wait for them.
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(40); }
  await page.waitForTimeout(1500);
  for (const [label, selector] of TARGETS) {
    // The hero is measured at the top of the page, where a visitor first sees it.
    if (label.startsWith('Hero')) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600); }
    const info = await page.evaluate((sel) => {
      const link = document.querySelector(sel);
      const img = /** @type {HTMLImageElement | null} */ (link?.querySelector('img') ?? null);
      if (!img) return null;
      const r = img.getBoundingClientRect();
      const file = /-(\d+)\.(\w+)$/.exec(img.currentSrc);
      /** @type {string[]} */ const transforms = [];
      for (let el = /** @type {Element | null} */ (img); el && el !== document.body; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (s.transform !== 'none') transforms.push(`${el.className.toString().split(' ')[0] || el.tagName.toLowerCase()}: ${s.transform}`);
        if (s.perspective !== 'none') transforms.push(`${el.className.toString().split(' ')[0]}: perspective ${s.perspective}`);
      }
      return {
        currentSrc: img.currentSrc.split('/').pop(), fileWidth: file ? Number(file[1]) : img.naturalWidth, format: file ? file[2] : '',
        cssWidth: Math.round(r.width * 10) / 10, cssHeight: Math.round(r.height * 10) / 10, dpr: window.devicePixelRatio,
        sizes: img.closest('picture')?.querySelector('source')?.getAttribute('sizes') && window.matchMedia(img.closest('picture')?.querySelector('source')?.getAttribute('media') ?? 'not all').matches
          ? img.closest('picture')?.querySelector('source')?.getAttribute('sizes') : img.getAttribute('sizes'),
        transforms,
      };
    }, selector);
    if (!info) continue;
    const density = info.fileWidth / (info.cssWidth * info.dpr);
    rows.push({ config: cfg.name, label, ...info, density: Math.round(density * 100) / 100 });
  }
  await context.close();
}
await chrome.close();
await safari?.close();

writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify({ url, date: new Date().toISOString(), rows }, null, 2));
const md = [
  `# Image audit`, '', `Page: ${url}  `, `Run: ${new Date().toISOString()}`, '',
  'Density = file pixels ÷ (rendered CSS width × device pixel ratio). Below 1.0 the browser enlarges the picture (soft);',
  'about 1.0–1.6 is sharp; far above 2 wastes bytes. Transforms list any transform on the picture or its ancestors at the',
  'moment of measuring (the hero is measured at the top of the page).', '',
  '| Screen | Picture | File chosen | File px | CSS px | DPR | Density | Transform |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.config} | ${r.label} | \`${r.currentSrc}\` | ${r.fileWidth} | ${r.cssWidth} | ${r.dpr} | ${r.density < 1 ? `**${r.density}**` : r.density} | ${r.transforms.join('; ').replace(/\|/g, '/') || '—'} |`),
  '',
].join('\n');
writeFileSync(path.join(outDir, 'AUDIT.md'), md);
const soft = rows.filter((r) => r.density < 0.95);
console.log(`${rows.length} measurements; ${soft.length} below density 0.95`);
for (const r of soft) console.log(`  ${r.config} · ${r.label}: ${r.currentSrc} ${r.fileWidth}px for ${Math.round(r.cssWidth * r.dpr)} screen px (${r.density})`);
const tf = rows.filter((r) => r.transforms.length);
for (const r of tf) console.log(`  transform · ${r.config} · ${r.label}: ${r.transforms.join('; ')}`);
