#!/usr/bin/env node
// Browser QA for the showcase.
//   npm run qa                                   local copy, served at /CFIT-Showcase/ like GitHub Pages
//   QA_URL=https://cfit-timetable-development.github.io/CFIT-Showcase/ npm run qa    the live site
//
// Engines: the Chrome installed on this computer (playwright-core, channel "chrome"), and Playwright's WebKit build
// for iPhone emulation if it is installed (`npx playwright-core install webkit`; QA_WEBKIT=0 skips it).
// WebKit here is the engine Safari uses, run on this computer with an iPhone's screen size, pixel density and
// touch input. It is automated testing, not a real iPhone: Safari's own gesture handling and safe areas differ.
//
// Writes qa-output/report.json, qa-output/QA_REPORT.md and screenshots in qa-output/screens/.
// Exits with 1 if any check fails.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, webkit } from 'playwright-core';
import { serve } from './serve.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repo, 'qa-output');
const screens = path.join(out, 'screens');
rmSync(out, { recursive: true, force: true });
mkdirSync(screens, { recursive: true });

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
/** @type {string[]} */
const notes = [];
/** @param {string} text */
const note = (text) => { notes.push(text); console.log(`NOTE  ${text}`); };

const local = !process.env.QA_URL;
const server = local ? await serve(0) : null;
const target = process.env.QA_URL ?? server?.url ?? '';
const chrome = await chromium.launch({ channel: process.env.QA_CHANNEL ?? 'chrome' });
/** @type {import('playwright-core').Browser | null} */
let safari = null;
if (process.env.QA_WEBKIT !== '0') {
  safari = await webkit.launch().catch((e) => { note(`WebKit not available, iPhone emulation skipped: ${String(e.message).split('\n')[0]}`); return null; });
}
console.log(`QA target: ${target}${safari ? ` (Chrome ${chrome.version()}, WebKit ${safari.version()})` : ''}\n`);

const manifest = JSON.parse(readFileSync(path.join(repo, 'tools/media-manifest.json'), 'utf8'));
/** Source crop width (px of the 4K recording) of each phone crop, by file stem. */
const phoneCrops = new Map(manifest.images.filter((/** @type {any} */ i) => i.mobileOf).map((/** @type {any} */ i) => [i.id, Number(i.crop.split(':')[0])]));

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
];

/**
 * @param {import('playwright-core').Browser} browser
 * @param {import('playwright-core').BrowserContextOptions} options
 */
async function openPage(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const failed = [];
  /** @type {{ url: string, bytes: number }[]} */ const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    const len = Number(r.headers()['content-length'] ?? 0);
    requests.push({ url: r.url(), bytes: len });
  });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    // A paused or replaced video cancels its own range request, and a picture the viewer no longer needs is
    // cancelled when the next one is shown; neither is an error.
    if (!(/ERR_ABORTED|cancelled|Load request cancelled/i.test(why) && /\.(mp4|webp)/.test(r.url()))) failed.push(`${why} ${r.url()}`);
  });
  return { context, page, errors, failed, requests };
}

/**
 * Scrolls to the bottom in steps so lazy pictures load and sections reveal, then waits for pictures.
 * The waiting happens in Node, not in the page, so it also works with JavaScript turned off.
 * @param {import('playwright-core').Page} page
 */
async function scrollThrough(page) {
  const step = await page.evaluate(() => Math.round(window.innerHeight * 0.6));
  for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(70);
  }
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  for (let i = 0; i < 100; i += 1) {
    const pending = await page.evaluate(() => Array.from(document.images)
      .filter((img) => img.getAttribute('src') && img.offsetParent !== null && !img.complete).length);
    if (pending === 0) break;
    await page.waitForTimeout(250);
  }
}

/** @param {import('playwright-core').Page} page */
async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    /** @type {string[]} */ const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.pswp, .sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= width + 1 && r.left >= -1) continue;
      // Ignore content clipped by an ancestor that itself fits.
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible') {
          const pr = p.getBoundingClientRect();
          if (pr.right <= width + 1 && pr.left >= -1) { clipped = true; break; }
        }
      }
      if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} [${Math.round(r.left)}…${Math.round(r.right)}]`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, width, offenders: offenders.slice(0, 8) };
  });
}

/** @param {import('playwright-core').Page} page */
async function brokenImages(page) {
  return page.evaluate(() => Array.from(document.images)
    .filter((i) => i.getAttribute('src') && i.offsetParent !== null)
    .filter((i) => !i.complete || i.naturalWidth === 0)
    .map((i) => i.currentSrc || i.src));
}

/** Viewport-sized screenshots from top to bottom, as a visitor scrolls. */
/** @param {import('playwright-core').Page} page @param {string} name */
async function sequence(page, name) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const h = await page.evaluate(() => window.innerHeight);
  let i = 0;
  for (let y = 0; y < total; y += Math.round(h * 0.92), i += 1) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(screens, `${name}-${String(i).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 78 });
  }
  return i;
}

const axeSource = readFileSync(path.join(repo, 'node_modules/axe-core/axe.min.js'), 'utf8');
/** @param {import('playwright-core').Page} page @param {string} label */
async function axe(page, label) {
  await page.addScriptTag({ content: axeSource });
  /** @type {any} */
  const res = await page.evaluate(async () => {
    // @ts-ignore axe is injected above
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return {
      violations: r.violations.map((/** @type {any} */ v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((/** @type {any} */ n) => n.target.join(' ')) })),
      incomplete: r.incomplete.length,
    };
  });
  const serious = res.violations.filter((/** @type {any} */ v) => v.impact === 'serious' || v.impact === 'critical');
  check(`axe accessibility (${label}): no serious or critical violations`, serious.length === 0,
    res.violations.map((/** @type {any} */ v) => `${v.impact} ${v.id}: ${v.nodes.join(', ')}`).join(' | ') || `0 violations, ${res.incomplete} to review by hand`);
  return res;
}

// ── Image viewer helpers. Measured from the page itself, so they work the same in every engine. ──────────
/** @param {import('playwright-core').Page} page */
async function viewerState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.pswp.pswp--open');
    if (!root) return null;
    const img = /** @type {HTMLImageElement | null} */ (root.querySelector('.pswp__item[aria-hidden="false"] img.pswp__img'));
    const r = img?.getBoundingClientRect();
    const caption = /** @type {HTMLElement | null} */ (root.querySelector('.cfit-caption'));
    const cr = caption?.getBoundingClientRect();
    const box = (/** @type {string} */ s) => { const b = root.querySelector(s)?.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null; };
    const rr = root.getBoundingClientRect();
    return {
      counter: root.querySelector('.pswp__counter')?.textContent ?? '',
      src: img?.currentSrc.split('/').pop() ?? '',
      natural: img?.naturalWidth ?? 0,
      complete: img?.complete ?? false,
      img: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null,
      zoomed: root.classList.contains('is-zoomed'),
      captionTop: cr?.top ?? 0, captionBottom: cr?.bottom ?? 0, captionText: caption?.textContent ?? '',
      captionOpacity: caption ? Number(getComputedStyle(caption).opacity) : 0,
      hint: root.querySelector('.cfit-hint')?.textContent ?? '',
      zoomLabel: root.querySelector('.pswp__button--zoom')?.getAttribute('aria-label') ?? '',
      buttons: { close: box('.pswp__button--close'), zoom: box('.pswp__button--zoom'), prev: box('.pswp__button--arrow--prev'), next: box('.pswp__button--arrow--next') },
      root: { w: rr.width, h: rr.height }, viewport: { w: window.innerWidth, h: window.innerHeight },
      label: root.getAttribute('aria-label'), modal: root.getAttribute('aria-modal'),
    };
  });
}
/** @param {import('playwright-core').Page} page @param {(s: any) => boolean} fn @param {number} [timeout] */
async function waitViewer(page, fn, timeout = 6000) {
  const end = Date.now() + timeout;
  let s = await viewerState(page);
  while (Date.now() < end) {
    if (s && fn(s)) return s;
    await page.waitForTimeout(120);
    s = await viewerState(page);
  }
  return s;
}
/** Item width (data-w) of the picture currently shown, to turn its on-screen width into a zoom level. */
/** @param {import('playwright-core').Page} page @param {any} s */
async function zoomLevel(page, s) {
  if (!s?.img) return 0;
  const width = await page.evaluate(() => {
    const img = /** @type {HTMLImageElement | null} */ (document.querySelector('.pswp__item[aria-hidden="false"] img.pswp__img'));
    const name = img?.currentSrc.split('/').pop()?.replace(/-\d+\.webp$/, '') ?? '';
    const t = Array.from(document.querySelectorAll('[data-zoom]')).find((a) => (a.getAttribute('href') ?? '').includes(`/${name}-`));
    return Number(/** @type {HTMLElement | undefined} */ (t)?.dataset.w ?? 0);
  });
  return width ? s.img.width / width : 0;
}

/**
 * Synthetic touch pointers for engines without a multi-touch API (WebKit). Each step waits two animation frames,
 * as a real gesture would. paths: one array of points per finger.
 * @param {import('playwright-core').Page} page @param {{x:number,y:number}[][]} paths
 */
async function syntheticGesture(page, paths) {
  await page.evaluate(async (fingers) => {
    const wrap = document.querySelector('.pswp__scroll-wrap');
    if (!wrap) return;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    /** @param {string} type @param {number} id @param {{x:number,y:number}} p */
    const send = (type, id, p) => wrap.dispatchEvent(new PointerEvent(type, {
      pointerId: id + 1, pointerType: 'touch', isPrimary: id === 0, clientX: p.x, clientY: p.y,
      bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
    fingers.forEach((f, id) => send('pointerdown', id, f[0]));
    await frame();
    for (let i = 1; i < fingers[0].length; i += 1) {
      fingers.forEach((f, id) => send('pointermove', id, f[i]));
      await frame();
    }
    fingers.forEach((f, id) => send('pointerup', id, f[f.length - 1]));
    await frame();
  }, paths);
}
/** Real touch input through the Chrome DevTools Protocol (trusted events, as a phone would send). */
/** @param {import('playwright-core').CDPSession} cdp @param {{x:number,y:number}[][]} paths @param {import('playwright-core').Page} page */
async function cdpGesture(cdp, page, paths) {
  const at = (/** @type {number} */ i) => paths.map((f, id) => ({ x: f[Math.min(i, f.length - 1)].x, y: f[Math.min(i, f.length - 1)].y, id }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i < paths[0].length; i += 1) {
    await page.waitForTimeout(16);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
  }
  await page.waitForTimeout(16);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b @param {number} n */
const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));

/**
 * The touch tests of the image viewer on a phone-sized page: open, fit, double-tap zoom, pan, reset,
 * pinch, swipe to the next picture, control sizes, caption placement, close.
 * @param {import('playwright-core').Page} page @param {string} label
 * @param {(paths: {x:number,y:number}[][]) => Promise<void>} gesture
 */
async function touchViewer(page, label, gesture) {
  const trigger = page.locator('#f-conflicts').locator('xpath=ancestor::article').locator('[data-zoom]').first();
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await trigger.tap();
  let s = await waitViewer(page, (v) => v.complete && v.natural > 0 && v.img && v.img.width > 50, 10000);
  await page.waitForTimeout(500);
  s = await viewerState(page);
  check(`${label} viewer: a tap opens it, sized to the screen, with a label`, !!s && Math.abs(s.root.w - s.viewport.w) < 2 && Math.abs(s.root.h - s.viewport.h) < 2 && s.label === 'Picture viewer' && s.modal === 'true',
    s ? `${Math.round(s.root.w)}×${Math.round(s.root.h)} in ${s.viewport.w}×${s.viewport.h}` : 'not open');
  if (!s?.img) return;
  const fit = await zoomLevel(page, s);
  check(`${label} viewer: the picture first fits the screen`, s.img.left >= -1 && s.img.right <= s.viewport.w + 1 && s.img.top >= 0 && s.img.bottom <= s.viewport.h && !s.zoomed,
    `${Math.round(s.img.width)}×${Math.round(s.img.height)} at zoom ${fit.toFixed(3)}`);
  check(`${label} viewer: the caption sits under the picture, not over it`, s.captionText.length > 20 && s.captionTop >= s.img.bottom - 1 && s.captionBottom <= s.viewport.h,
    `picture ends ${Math.round(s.img.bottom)}, caption ${Math.round(s.captionTop)}–${Math.round(s.captionBottom)}`);
  const small = Object.entries(s.buttons).filter(([, b]) => !b || b.w < 44 || b.h < 44).map(([k, b]) => `${k} ${b ? `${b.w}×${b.h}` : 'missing'}`);
  check(`${label} viewer: close, zoom, previous and next are at least 44×44`, small.length === 0, small.join(', ') || Object.entries(s.buttons).map(([k, b]) => `${k} ${b?.w}×${b?.h}`).join(', '));
  await page.screenshot({ path: path.join(screens, `viewer-${label}-fit.jpg`), type: 'jpeg', quality: 80 });

  // Double-tap on the picture zooms in where it was tapped.
  const centre = { x: s.img.left + s.img.width * 0.42, y: s.img.top + s.img.height * 0.6 };
  await page.touchscreen.tap(centre.x, centre.y);
  await page.waitForTimeout(90);
  await page.touchscreen.tap(centre.x, centre.y);
  let z = await waitViewer(page, (v) => v.zoomed, 3000);
  await page.waitForTimeout(600);
  z = await viewerState(page);
  const zoomed = await zoomLevel(page, z);
  check(`${label} viewer: double-tap zooms in (to the app's real size or more)`, !!z?.zoomed && zoomed >= fit * 2 - 0.01, `zoom ${fit.toFixed(3)} → ${zoomed.toFixed(3)}`);
  check(`${label} viewer: zoomed, the caption fades away and the zoom button says "Fit to screen"`, !!z && z.captionOpacity < 0.1 && z.zoomLabel === 'Fit to screen', z ? `caption opacity ${z.captionOpacity}, button "${z.zoomLabel}", hint "${z.hint}"` : '');
  // The full-resolution file is fetched for zoom.
  const hi = await waitViewer(page, (v) => /-(3840|3700|3440|2794|2800|2480|2000|1160|1120|1080)\.webp$/.test(v.src) && v.complete, 8000);
  check(`${label} viewer: zoomed, it shows the full-resolution file`, !!hi && /-3840\.webp$/.test(hi.src), hi?.src ?? '');
  await page.screenshot({ path: path.join(screens, `viewer-${label}-zoomed.jpg`), type: 'jpeg', quality: 80 });

  // One finger pans the zoomed picture and stays on the same picture.
  const before = await viewerState(page);
  const mid = { x: before?.viewport.w ? before.viewport.w / 2 : 195, y: (before?.viewport.h ?? 800) / 2 };
  await gesture([line({ x: mid.x + 60, y: mid.y }, { x: mid.x - 60, y: mid.y + 40 }, 14)]);
  await page.waitForTimeout(700);
  const panned = await viewerState(page);
  const moved = before?.img && panned?.img ? Math.hypot(panned.img.left - before.img.left, panned.img.top - before.img.top) : 0;
  check(`${label} viewer: one finger pans the zoomed picture`, moved > 30 && panned?.counter === before?.counter && !!panned?.zoomed, `moved ${Math.round(moved)} px, still ${panned?.counter}`);

  // The zoom button resets to fit.
  await page.locator('.pswp__button--zoom').tap();
  const reset = await waitViewer(page, (v) => !v.zoomed, 3000);
  await page.waitForTimeout(500);
  const resetLevel = await zoomLevel(page, await viewerState(page));
  check(`${label} viewer: the zoom button resets to fit`, !!reset && !reset.zoomed && Math.abs(resetLevel - fit) < fit * 0.05, `zoom ${resetLevel.toFixed(3)}`);

  // Two fingers pinch to zoom.
  const c = await viewerState(page);
  const cy = c?.img ? c.img.top + c.img.height / 2 : mid.y;
  await gesture([line({ x: mid.x - 30, y: cy }, { x: mid.x - 150, y: cy }, 16), line({ x: mid.x + 30, y: cy }, { x: mid.x + 150, y: cy }, 16)]);
  await page.waitForTimeout(900);
  const pinched = await viewerState(page);
  const pinchLevel = await zoomLevel(page, pinched);
  check(`${label} viewer: two fingers pinch to zoom`, pinchLevel > fit * 1.8, `zoom ${fit.toFixed(3)} → ${pinchLevel.toFixed(3)}`);

  // Double-tap again goes back to fit, then a swipe moves to the next picture.
  const p = await viewerState(page);
  if (p?.zoomed) {
    await page.touchscreen.tap(mid.x, mid.y);
    await page.waitForTimeout(90);
    await page.touchscreen.tap(mid.x, mid.y);
    await waitViewer(page, (v) => !v.zoomed, 3000);
    await page.waitForTimeout(500);
  }
  const unz = await viewerState(page);
  check(`${label} viewer: double-tap when zoomed goes back to fit`, !!unz && !unz.zoomed);
  const counterBefore = unz?.counter;
  await gesture([line({ x: mid.x + 120, y: mid.y }, { x: mid.x - 140, y: mid.y }, 10)]);
  const swiped = await waitViewer(page, (v) => v.counter !== counterBefore, 3000);
  check(`${label} viewer: a swipe at fit shows the next picture`, !!swiped && swiped.counter !== counterBefore, `${counterBefore} → ${swiped?.counter}`);

  // The close button closes it; the page has not moved underneath.
  await page.locator('.pswp__button--close').tap();
  await page.waitForTimeout(800);
  const closed = await page.evaluate(() => ({ open: !!document.querySelector('.pswp--open'), y: window.scrollY }));
  check(`${label} viewer: the close button closes it and the page stays where it was`, !closed.open && Math.abs(closed.y - scrollBefore) < 4, `scroll ${scrollBefore} → ${closed.y}`);
}

/**
 * Phone checks of the pictures in the page: the phone crops are chosen, each picture has enough pixels for the
 * screen's density, and the application's interface shows at a readable size.
 * @param {import('playwright-core').Page} page @param {string} label
 */
async function phonePictures(page, label) {
  const data = await page.evaluate(() => {
    const dpr = window.devicePixelRatio;
    return {
      dpr,
      images: Array.from(document.querySelectorAll('main img')).filter((i) => /** @type {HTMLElement} */ (i).offsetParent !== null).map((i) => {
        const img = /** @type {HTMLImageElement} */ (i);
        const r = img.getBoundingClientRect();
        const set = (img.parentElement?.tagName === 'PICTURE' && window.matchMedia(img.parentElement.querySelector('source')?.getAttribute('media') ?? 'not all').matches
          ? img.parentElement.querySelector('source')?.getAttribute('srcset') : img.getAttribute('srcset')) ?? img.getAttribute('src') ?? '';
        const widths = set.split(',').map((s) => Number(s.trim().split(/\s+/)[1]?.replace('w', '') ?? 0)).filter(Boolean);
        // naturalWidth is corrected for the srcset density, so read the file's own width from its name (name-1600.webp).
        const file = Number(/-(\d+)\.\w+$/.exec(img.currentSrc)?.[1] ?? img.naturalWidth);
        return { src: img.currentSrc.split('/').pop() ?? '', css: r.width, natural: file, max: Math.max(0, ...widths), inPicture: img.parentElement?.tagName === 'PICTURE' };
      }),
    };
  });
  const inPictures = data.images.filter((i) => i.inPicture);
  const notPhone = inPictures.filter((i) => !/-m-\d+\.webp$/.test(i.src)).map((i) => i.src);
  check(`${label}: every picture with a phone crop shows the crop`, inPictures.length >= 6 && notPhone.length === 0, notPhone.join(', ') || `${inPictures.length} phone crops`);
  // Enough pixels: at least 85% of the screen's pixels, unless the largest file is already in use.
  const thin = data.images.filter((i) => i.natural < i.css * data.dpr * 0.85 && i.natural < i.max).map((i) => `${i.src} ${i.natural}px for ${Math.round(i.css * data.dpr)}`);
  check(`${label}: pictures have enough pixels for a ${data.dpr}× screen`, thin.length === 0, thin.join(', ') || `${data.images.length} pictures checked`);
  // Readability: the recordings are at 2× density, so the interface shows at (on-screen width ÷ (crop width ÷ 2)).
  const scale = inPictures.map((i) => {
    const stem = i.src.replace(/-\d+\.webp$/, '');
    const crop = phoneCrops.get(stem);
    // The PDF page is paper, not the 2x screen recording, so this measure does not apply to it.
    return crop && !stem.startsWith('pdf-') ? { stem, scale: i.css / (crop / 2) } : null;
  }).filter((x) => x !== null);
  const minScale = Math.min(...scale.map((x) => x?.scale ?? 0));
  check(`${label}: phone crops show the app's interface at 60% of its real size or more`, scale.length >= 5 && minScale >= 0.6,
    scale.map((x) => `${x?.stem} ${(x?.scale ?? 0).toFixed(2)}`).join(', '));
}

/** Smallest text and smallest touch targets on a phone-sized page. @param {import('playwright-core').Page} page @param {string} label */
async function phoneSizes(page, label) {
  const res = await page.evaluate(() => {
    /** @type {{t:string,s:number}[]} */ const tiny = [];
    for (const el of document.querySelectorAll('main *, header *, footer *')) {
      if (el.closest('.sr-only, svg, .pswp, [hidden], .tech-mark')) continue;
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 1);
      if (!own || /** @type {HTMLElement} */ (el).offsetParent === null) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 11) tiny.push({ t: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 24)}"`, s: size });
    }
    /** @type {string[]} */ const small = [];
    for (const el of document.querySelectorAll('.btn, .nav-toggle, .brand, .chapters button, .eng-nav a, .tech-link, .steps a, .proof a, [data-loop-toggle], .transcript summary, .site-footer a, .player-start')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || /** @type {HTMLElement} */ (el).offsetParent === null) continue;
      const pad = el.matches('[data-loop-toggle]') ? 12 : 0; // its ::before extends the touch area by 6 px each way
      if (r.width < 44 || r.height + pad < 44) small.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return { tiny: tiny.slice(0, 8), small: small.slice(0, 8) };
  });
  check(`${label}: no text smaller than 11 px`, res.tiny.length === 0, res.tiny.map((x) => `${x.t} ${x.s}px`).join('; '));
  check(`${label}: buttons and links in controls are at least 44 px`, res.small.length === 0, res.small.join('; '));
}

// ── 1. Every viewport (Chrome): loads clean, no overflow, every picture loads; screenshots ───────────
/** @type {Record<string, any>} */
const perViewport = {};
for (const vp of VIEWPORTS) {
  const { context, page, errors, failed, requests } = await openPage(chrome, {
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile,
  });
  const res = await page.goto(target, { waitUntil: 'load' });
  check(`${vp.name}: page loads (HTTP ${res?.status()})`, res?.ok() ?? false);
  await page.waitForTimeout(1200);
  const initialBytes = requests.reduce((s, r) => s + r.bytes, 0);
  const filmEarly = requests.some((r) => r.url.includes('cfit-product-film'));
  // The loop and its poster belong far down the page: nothing of it loads at first view.
  const loopEarly = requests.filter((r) => r.url.includes('drag-loop')).map((r) => r.url.split('/').pop());
  await page.screenshot({ path: path.join(screens, `${vp.name}-first-view.jpg`), type: 'jpeg', quality: 82 });
  await scrollThrough(page);
  const ov = await horizontalOverflow(page);
  check(`${vp.name}: no horizontal overflow`, ov.offenders.length === 0 && ov.scrollWidth <= ov.width,
    ov.offenders.length ? ov.offenders.join('; ') : `scrollWidth ${ov.scrollWidth} = viewport ${ov.width}`);
  const broken = await brokenImages(page);
  check(`${vp.name}: every visible picture loaded`, broken.length === 0, broken.join(', '));
  check(`${vp.name}: the film, the loop and the viewer's full-size files are not downloaded early`,
    !filmEarly && loopEarly.length === 0 && !requests.some((r) => r.url.includes('cfit-product-film') || /-(3840|3700|3440|2794|2800|2480)\.webp/.test(r.url) || r.url.includes('photoswipe.esm')),
    loopEarly.length ? `at first view: ${loopEarly.join(', ')}` : 'film and viewer files only on demand; loop only near view');
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const shots = await sequence(page, vp.name);
  check(`${vp.name}: no console errors`, errors.length === 0, errors.join(' | '));
  check(`${vp.name}: no failed requests`, failed.length === 0, failed.join(' | '));
  perViewport[vp.name] = { initialKB: Math.round(initialBytes / 1024), pageHeight: height, screenshots: shots + 1 };
  note(`${vp.name}: ${Math.round(initialBytes / 1024)} KB transferred before scrolling; page ${height} px tall; ${shots} scroll screenshots`);
  if (vp.name === 'desktop-1440' || vp.name === 'mobile-390') await axe(page, vp.name);
  await context.close();
}

// ── 2. Desktop interactions (Chrome) ───────────────────────────────────────────────────────────
{
  const { context, page, errors } = await openPage(chrome, { viewport: { width: 1440, height: 900 } });
  await page.goto(target, { waitUntil: 'load' });

  // The film: Watch Product Film scrolls to the player and starts it, with sound.
  await page.click('.hero [data-watch-film]');
  const playing = await page.waitForFunction(() => {
    const v = /** @type {HTMLVideoElement | null} */ (document.getElementById('film-video'));
    return !!v && !v.paused && v.currentTime > 1.5;
  }, null, { timeout: 30000 }).then(() => true, () => false);
  check('film: Watch Product Film starts playback', playing);
  const v = await page.evaluate(() => {
    const el = /** @type {HTMLVideoElement} */ (document.getElementById('film-video'));
    const r = el.getBoundingClientRect();
    return { w: el.videoWidth, h: el.videoHeight, dur: el.duration, muted: el.muted, controls: el.controls, inView: r.top >= 0 && r.bottom <= window.innerHeight };
  });
  check('film: 1920×1080 and about 100.8 s', v.w === 1920 && v.h === 1080 && Math.abs(v.dur - 100.8) < 0.5, `${v.w}×${v.h}, ${v.dur.toFixed(2)} s`);
  check('film: sound on when the visitor starts it, native controls shown', !v.muted && v.controls);
  check('film: player scrolled fully into view', v.inView);
  await page.click('[data-chapters] button[data-time="54.2"]');
  const sought = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement} */ (document.getElementById('film-video'));
    return Math.abs(el.currentTime - 54.2) < 2.5;
  }, null, { timeout: 15000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  const current = await page.evaluate(() => document.querySelector('[data-chapters] button[aria-current="true"]')?.textContent?.trim() ?? '');
  check('film: a chapter button seeks and is marked current', sought && current.includes('A coordinated fix'), current);

  // Film quality. On this 1440×900 screen at 1× Auto plays 1080p; 4K UHD switches in place, keeps the position, and
  // decodes at 3840×2160 and 60 frames per second; chapters still seek; back to 1080p keeps the position too.
  const filmState = () => page.evaluate(async () => {
    const el = /** @type {HTMLVideoElement} */ (document.getElementById('film-video'));
    // Frame rate from the frames the browser actually presents: the shortest gap between their media times.
    /** @type {number[]} */ const times = [];
    if ('requestVideoFrameCallback' in el && !el.paused) {
      await new Promise((resolve) => {
        const end = performance.now() + 1500;
        const step = (/** @type {number} */ _now, /** @type {any} */ meta) => { times.push(meta.mediaTime); if (performance.now() < end) el.requestVideoFrameCallback(step); else resolve(undefined); };
        el.requestVideoFrameCallback(step);
      });
    }
    const gaps = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0.001);
    return {
      src: el.currentSrc.split('/').pop() ?? '', w: el.videoWidth, h: el.videoHeight, t: el.currentTime, paused: el.paused,
      fps: gaps.length ? Math.round(1 / Math.min(...gaps)) : 0, presented: times.length,
      status: document.querySelector('[data-quality-status]')?.textContent ?? '',
    };
  });
  const auto = await filmState();
  check('film quality: Auto plays 1080p on a 1440×900 screen at 1×', auto.src === 'cfit-product-film-1080p60.mp4' && /Auto: 1080p/.test(auto.status), `${auto.src} · "${auto.status}"`);
  const beforeSwitch = auto.t;
  await page.click('.quality label:has(input[value="uhd"])');
  const uhdPlaying = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement} */ (document.getElementById('film-video'));
    return el.videoWidth === 3840 && !el.paused && el.readyState >= 3;
  }, null, { timeout: 60000 }).then(() => true, () => false);
  await page.waitForTimeout(800);
  const uhdState = await filmState();
  check('film quality: 4K UHD plays a 3840×2160 file (AV1 in Chrome)', uhdPlaying && uhdState.w === 3840 && uhdState.h === 2160 && /2160p60-(av1|hevc)\.mp4$/.test(uhdState.src), `${uhdState.src} ${uhdState.w}×${uhdState.h} · "${uhdState.status}"`);
  check('film quality: switching keeps the position', Math.abs(uhdState.t - beforeSwitch) < 4, `${beforeSwitch.toFixed(1)} s → ${uhdState.t.toFixed(1)} s`);
  check('film quality: 4K plays at 60 frames per second', uhdState.fps >= 58 && uhdState.fps <= 62, `${uhdState.fps} fps from ${uhdState.presented} presented frames`);
  await page.click('[data-chapters] button[data-time="80.5"]');
  const uhdSeek = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement} */ (document.getElementById('film-video'));
    return Math.abs(el.currentTime - 80.5) < 2.5 && el.videoWidth === 3840;
  }, null, { timeout: 20000 }).then(() => true, () => false);
  check('film quality: chapters seek in 4K', uhdSeek);
  const atSwitchBack = (await filmState()).t;
  await page.click('.quality label:has(input[value="hd"])');
  const hdBack = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement} */ (document.getElementById('film-video'));
    return el.videoWidth === 1920 && !el.paused;
  }, null, { timeout: 30000 }).then(() => true, () => false);
  const hdState = await filmState();
  check('film quality: back to 1080p, at the same position', hdBack && Math.abs(hdState.t - atSwitchBack) < 4, `${atSwitchBack.toFixed(1)} s → ${hdState.t.toFixed(1)} s`);
  const radios = await page.evaluate(() => ({
    legend: document.querySelector('.quality legend')?.textContent, count: document.querySelectorAll('.quality input[type="radio"]').length,
    labelled: Array.from(document.querySelectorAll('.quality label')).every((l) => (l.textContent ?? '').trim().length > 2),
  }));
  check('film quality: a labelled group of three radio buttons', radios.legend === 'Quality' && radios.count === 3 && radios.labelled, JSON.stringify(radios));
  await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.getElementById('film-video')).pause());

  // The image viewer with a mouse and the keyboard.
  const trigger = page.locator('#f-conflicts').locator('xpath=ancestor::article').locator('[data-zoom]').first();
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await trigger.click();
  let s = await waitViewer(page, (x) => x.complete && x.natural > 0 && x.img && x.img.width > 100, 10000);
  await page.waitForTimeout(500);
  s = await viewerState(page);
  check('viewer (desktop): opens with the picture, fitted, caption under it', !!s?.img && s.img.right <= s.viewport.w && s.img.bottom <= s.viewport.h && s.captionTop >= s.img.bottom - 1,
    s ? `${s.src}, ${Math.round(s.img?.width ?? 0)}×${Math.round(s.img?.height ?? 0)}, caption at ${Math.round(s.captionTop)}` : 'not open');
  await page.screenshot({ path: path.join(screens, 'viewer-desktop-1440.jpg'), type: 'jpeg', quality: 80 });
  const fit = await zoomLevel(page, s);
  await page.keyboard.press('z');
  let z = await waitViewer(page, (x) => x.zoomed, 3000);
  await page.waitForTimeout(600);
  z = await viewerState(page);
  const zl = await zoomLevel(page, z);
  check('viewer (desktop): Z zooms in; the button then reads "Fit to screen"', !!z?.zoomed && zl > fit * 1.5 && z.zoomLabel === 'Fit to screen', `zoom ${fit.toFixed(3)} → ${zl.toFixed(3)}`);
  await page.locator('.pswp__button--zoom').click();
  const back = await waitViewer(page, (x) => !x.zoomed, 3000);
  check('viewer (desktop): the zoom button returns to fit', !!back && !back.zoomed);
  const first = (await viewerState(page))?.counter;
  await page.keyboard.press('ArrowRight');
  const next = await waitViewer(page, (x) => x.counter !== first, 3000);
  check('viewer (desktop): the right arrow key shows the next picture', !!next && next.counter !== first, `${first} → ${next?.counter}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const closed = await page.evaluate(() => ({ open: !!document.querySelector('.pswp--open'), focusBack: !!document.activeElement?.closest('#f-conflicts, article')?.querySelector('#f-conflicts') }));
  check('viewer (desktop): Escape closes it and focus returns to the picture', !closed.open && closed.focusBack, JSON.stringify(closed));

  // Every viewer item: data-w and data-h match the file it opens.
  const sizes = await page.evaluate(async () => {
    /** @type {string[]} */ const bad = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('[data-zoom]')) {
      const href = a.getAttribute('href') ?? '';
      if (seen.has(href)) continue;
      seen.add(href);
      const img = new Image();
      img.src = href;
      await img.decode().catch(() => {});
      const el = /** @type {HTMLElement} */ (a);
      if (img.naturalWidth !== Number(el.dataset.w) || img.naturalHeight !== Number(el.dataset.h)) bad.push(`${href} is ${img.naturalWidth}×${img.naturalHeight}, says ${el.dataset.w}×${el.dataset.h}`);
    }
    return { count: seen.size, bad };
  });
  check(`viewer: all ${sizes.count} pictures open at their full resolution, with matching sizes`, sizes.bad.length === 0, sizes.bad.join('; '));

  // The drag-and-drop loop plays in view and can be paused.
  await page.locator('[data-loop]').scrollIntoViewIfNeeded();
  const looping = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement | null} */ (document.querySelector('[data-loop-video]'));
    return !!el && !el.paused && el.currentTime > 0.3;
  }, null, { timeout: 15000 }).then(() => true, () => false);
  const loopSrc = await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.querySelector('[data-loop-video]')).currentSrc.split('/').pop());
  check('loop: the drag-and-drop recording plays when in view (desktop cut)', looping && loopSrc === 'drag-loop.mp4', loopSrc);
  await page.click('[data-loop-toggle]');
  await page.waitForTimeout(500);
  const loopPaused = await page.evaluate(() => ({
    paused: /** @type {HTMLVideoElement} */ (document.querySelector('[data-loop-video]')).paused,
    label: document.querySelector('[data-loop-label]')?.textContent,
  }));
  check('loop: the Pause button stops it', loopPaused.paused && loopPaused.label === 'Play');

  // Engineering is reachable from the header and the hero.
  const eng = await page.evaluate(() => ({
    nav: !!document.querySelector('.site-nav a.nav-eng[href="#engineering"]'),
    hero: !!document.querySelector('.hero .tech-link[href="#engineering"]'),
    marks: document.querySelectorAll('.hero .tech-list li').length,
    parts: ['architecture', 'delivery', 'quality'].filter((id) => document.getElementById(id)).length,
  }));
  check('engineering: header shortcut, hero link, 8 technology marks, three parts', eng.nav && eng.hero && eng.marks === 8 && eng.parts === 3, JSON.stringify(eng));
  const marksDrawn = await page.evaluate(() => Array.from(document.querySelectorAll('.hero .tech-mark')).every((svg) => svg.getBoundingClientRect().width >= 16));
  check('engineering: the technology marks render', marksDrawn);

  // Internal links.
  const anchors = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="#"]'))
    .map((a) => a.getAttribute('href') ?? '').filter((h) => h.length > 1 && !document.getElementById(h.slice(1))));
  check('links: every in-page link has a target', anchors.length === 0, anchors.join(', '));
  check('desktop interactions: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ── 2b. Auto on a large screen: 4K is chosen, and nothing downloads before play ───────────────────────
{
  const { context, page, requests } = await openPage(chrome, { viewport: { width: 2560, height: 1440 } });
  await page.goto(target, { waitUntil: 'load' });
  await page.waitForFunction(() => (document.querySelector('[data-quality-status]')?.textContent ?? '').length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => ({
    status: document.querySelector('[data-quality-status]')?.textContent ?? '',
    src: document.getElementById('film-video')?.getAttribute('src') ?? '',
  }));
  const fetched = requests.filter((r) => r.url.includes('cfit-product-film')).map((r) => r.url.split('/').pop());
  check('film quality: Auto chooses 4K on a 2560×1440 screen and downloads nothing before play',
    /Auto: 4K UHD/.test(s.status) && /2160p60-(av1|hevc)\.mp4$/.test(s.src) && fetched.length === 0, `"${s.status}" · ${s.src.split('/').pop()} · fetched: ${fetched.join(', ') || 'nothing'}`);
  // On a connection that cannot carry 4K (1.2 Mbit/s here), Auto falls back to 1080p and keeps playing.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 150000, uploadThroughput: 150000 });
  await page.locator('[data-player-start]').scrollIntoViewIfNeeded();
  await page.click('[data-player-start]');
  const fell = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement} */ (document.getElementById('film-video'));
    return /switched from 4K/.test(document.querySelector('[data-quality-status]')?.textContent ?? '') && el.currentSrc.endsWith('1080p60.mp4');
  }, null, { timeout: 30000 }).then(() => true, () => false);
  const after = await page.evaluate(() => ({ status: document.querySelector('[data-quality-status]')?.textContent ?? '', src: /** @type {HTMLVideoElement} */ (document.getElementById('film-video')).currentSrc.split('/').pop() }));
  check('film quality: on a slow connection Auto falls back from 4K to 1080p by itself', fell, `"${after.status}" · ${after.src}`);
  await context.close();
}

// ── 2c. Sharpness on desktop screens: every main screenshot gets the pixels the screen needs ────────────
// Density = file pixels ÷ (CSS width × device pixel ratio). Below 0.98 the browser would enlarge it (soft); above 1.6
// it would shrink a much larger file (wasted bytes and a second resampling). Nothing may scale or tilt the hero.
for (const [width, height, dpr] of [[1440, 900, 1], [1440, 900, 2], [1920, 1080, 1.5], [2560, 1440, 1]]) {
  const { context, page } = await openPage(chrome, { viewport: { width, height }, deviceScaleFactor: dpr });
  await page.goto(target, { waitUntil: 'load' });
  await scrollThrough(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('main [data-zoom]:not(.shot-thumb) img')).map((i) => {
      const img = /** @type {HTMLImageElement} */ (i);
      const file = Number(/-(\d+)\.webp$/.exec(img.currentSrc)?.[1] ?? 0);
      const w = img.getBoundingClientRect().width;
      return { src: img.currentSrc.split('/').pop() ?? '', density: file / (w * window.devicePixelRatio) };
    });
    /** @type {string[]} */ const tf = [];
    for (let el = document.querySelector('.hero-shot img'); el && el !== document.body; el = el.parentElement) {
      const t = getComputedStyle(el).transform;
      if (t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') tf.push(`${el.className}: ${t}`);
    }
    return { list, tf };
  });
  const off = res.list.filter((x) => x.density < 0.98 || x.density > 1.6).map((x) => `${x.src} ${x.density.toFixed(2)}`);
  const range = res.list.map((x) => x.density);
  check(`sharpness ${width}×${height} @${dpr}: every main screenshot drawn at 0.98–1.6 file pixels per screen pixel, hero untransformed`,
    off.length === 0 && res.tf.length === 0 && res.list.length >= 9,
    off.join(', ') || res.tf.join('; ') || `${res.list.length} pictures, ${Math.min(...range).toFixed(2)}–${Math.max(...range).toFixed(2)}`);
  await context.close();
}

// ── 3. Phone with real touch input (Chrome, 390 × 844 at 3×) ────────────────────────────────────────
{
  const { context, page, errors } = await openPage(chrome, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(target, { waitUntil: 'load' });
  await scrollThrough(page);
  await phonePictures(page, 'Chrome 390 @3×');
  await phoneSizes(page, 'Chrome 390');
  const phoneFilm = await page.evaluate(() => document.querySelector('[data-quality-status]')?.textContent ?? '');
  check('film quality (phone): Auto stays at 1080p', /Auto: 1080p/.test(phoneFilm), phoneFilm);
  const cdp = await context.newCDPSession(page);
  await touchViewer(page, 'Chrome-390-touch', (paths) => cdpGesture(cdp, page, paths));
  // The phone cut of the loop.
  await page.locator('[data-loop]').scrollIntoViewIfNeeded();
  const phoneLoop = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement | null} */ (document.querySelector('[data-loop-video]'));
    return !!el && !el.paused && el.currentTime > 0.3 && el.currentSrc.includes('drag-loop-mobile');
  }, null, { timeout: 15000 }).then(() => true, () => false);
  check('loop (phone): plays the phone cut of the recording, with its own poster', phoneLoop && await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.querySelector('[data-loop-video]')).poster.includes('mobile')));
  check('phone touch tests: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ── 4. Mobile menu ───────────────────────────────────────────────────────────────────────────────
{
  const { context, page } = await openPage(chrome, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(target, { waitUntil: 'load' });
  await page.click('[data-nav-toggle]');
  const open = await page.evaluate(() => ({
    expanded: document.querySelector('[data-nav-toggle]')?.getAttribute('aria-expanded'),
    visible: getComputedStyle(/** @type {Element} */ (document.querySelector('[data-nav]'))).display !== 'none',
  }));
  await page.screenshot({ path: path.join(screens, 'interaction-menu-390.jpg'), type: 'jpeg', quality: 80 });
  check('mobile menu: the button opens it', open.expanded === 'true' && open.visible);
  await page.click('[data-nav] a[href="#engineering"]');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({ expanded: document.querySelector('[data-nav-toggle]')?.getAttribute('aria-expanded'), hash: location.hash }));
  check('mobile menu: choosing a section closes it and goes there', after.expanded === 'false' && after.hash === '#engineering');
  await context.close();
}

// ── 5. iPhone emulation in WebKit ─────────────────────────────────────────────────────────────────
if (safari) {
  /** @type {[string, (typeof devices)[string]][]} */
  const phones = [['iPhone 13', devices['iPhone 13']], ['iPhone SE (3rd gen)', devices['iPhone SE (3rd gen)']]];
  for (const [name, device] of phones) {
    const label = `WebKit ${name}`;
    const short = name.replace(/[()]/g, '').replace(/\s+/g, '-');
    const { context, page, errors, failed } = await openPage(safari, { ...device });
    const res = await page.goto(target, { waitUntil: 'load' });
    check(`${label}: page loads (${device.viewport.width}×${device.viewport.height} at ${device.deviceScaleFactor}×)`, res?.ok() ?? false);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screens, `webkit-${short}-first-view.jpg`), type: 'jpeg', quality: 82 });
    await scrollThrough(page);
    const ov = await horizontalOverflow(page);
    check(`${label}: no horizontal overflow`, ov.offenders.length === 0 && ov.scrollWidth <= ov.width,
      ov.offenders.length ? ov.offenders.join('; ') : `scrollWidth ${ov.scrollWidth} = viewport ${ov.width}`);
    const broken = await brokenImages(page);
    check(`${label}: every visible picture loaded`, broken.length === 0, broken.join(', '));
    await phonePictures(page, label);
    await phoneSizes(page, label);
    // The header stays fixed at the top while the long page scrolls.
    const header = [];
    for (const frac of [0.1, 0.4, 0.7, 0.98]) {
      await page.evaluate((f) => window.scrollTo({ top: document.documentElement.scrollHeight * f, behavior: 'instant' }), frac);
      await page.waitForTimeout(150);
      header.push(await page.evaluate(() => {
        const h = /** @type {HTMLElement} */ (document.querySelector('[data-header]'));
        const r = h.getBoundingClientRect();
        return { top: Math.round(r.top), solid: h.classList.contains('is-scrolled'), fixed: getComputedStyle(h).position === 'fixed' };
      }));
    }
    check(`${label}: the header stays fixed at the top, with its solid background, all the way down`, header.every((h) => h.top === 0 && h.solid && h.fixed), JSON.stringify(header));
    if (name === 'iPhone 13') await sequence(page, `webkit-${short}`);
    await touchViewer(page, `WebKit-${short}`, (paths) => syntheticGesture(page, paths));
    // The film plays in WebKit too.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('.hero [data-watch-film]').tap();
    const plays = await page.waitForFunction(() => {
      const el = /** @type {HTMLVideoElement | null} */ (document.getElementById('film-video'));
      return !!el && !el.paused && el.currentTime > 1;
    }, null, { timeout: 30000 }).then(() => true, () => false);
    check(`${label}: Watch Product Film plays the film`, plays);
    const wk = await page.evaluate(() => ({
      status: document.querySelector('[data-quality-status]')?.textContent ?? '',
      src: /** @type {HTMLVideoElement} */ (document.getElementById('film-video')).currentSrc.split('/').pop(),
      uhdDisabled: /** @type {HTMLInputElement | null} */ (document.querySelector('.quality input[value="uhd"]'))?.disabled ?? null,
      av1: document.createElement('video').canPlayType('video/mp4; codecs="av01.0.13M.10"'),
      hevc: document.createElement('video').canPlayType('video/mp4; codecs="hvc1.2.4.L153.B0"'),
    }));
    check(`${label}: the quality control says what plays here (phone: 1080p)`, /Auto: 1080p/.test(wk.status) && wk.src === 'cfit-product-film-1080p60.mp4', `"${wk.status}" · ${wk.src}`);
    note(`${label}: canPlayType AV1 "${wk.av1}", HEVC "${wk.hevc}"; 4K option ${wk.uhdDisabled ? 'disabled' : 'available'} in this WebKit build.`);
    await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.getElementById('film-video')).pause());
    check(`${label}: no console errors`, errors.length === 0, errors.join(' | '));
    check(`${label}: no failed requests`, failed.length === 0, failed.join(' | '));
    await context.close();
  }
  // Reduced motion in WebKit: everything shows, the loop waits for the visitor, the viewer opens without animation.
  {
    const { context, page } = await openPage(safari, { ...devices['iPhone 13'], reducedMotion: 'reduce' });
    await page.goto(target, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const hidden = await page.evaluate(() => Array.from(document.querySelectorAll('[data-reveal]')).filter((el) => getComputedStyle(el).opacity !== '1' && getComputedStyle(el).display !== 'contents').length);
    await page.locator('[data-loop]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    const loopPaused = await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.querySelector('[data-loop-video]')).paused);
    check('WebKit iPhone 13, reduced motion: content shows without animation and the loop does not start by itself', hidden === 0 && loopPaused, `hidden ${hidden}, loop paused ${loopPaused}`);
    await context.close();
  }
  note('WebKit runs here as Playwright\'s WebKit build on Windows with iPhone screen sizes and touch, not as Safari on an iPhone. Pinch and pan in WebKit use synthetic touch pointers; in Chrome they are real touch events. Safe-area insets are 0 in automation; the page reserves them with env(safe-area-inset-*).');
}

// ── 6. Without JavaScript, and with reduced motion (Chrome) ──────────────────────────────────────────
for (const width of [390, 1440]) {
  const { context, page, failed } = await openPage(chrome, { viewport: { width, height: 900 }, javaScriptEnabled: false });
  await page.goto(target, { waitUntil: 'load' });
  await scrollThrough(page);
  const state = await page.evaluate(() => ({
    steps: document.querySelectorAll('.steps a').length,
    features: document.querySelectorAll('.cap').length,
    links: Array.from(document.querySelectorAll('[data-zoom]')).filter((a) => /\.webp$/.test(a.getAttribute('href') ?? '')).length,
    hiddenReveal: Array.from(document.querySelectorAll('[data-reveal]')).filter((el) => getComputedStyle(el).opacity !== '1').length,
  }));
  const broken = await brokenImages(page);
  const ov = await horizontalOverflow(page);
  check(`no JavaScript (${width}px): all content visible, pictures load and link to their full-size files, no overflow`,
    state.steps === 6 && state.features === 6 && state.links >= 18 && state.hiddenReveal === 0 && broken.length === 0 && ov.offenders.length === 0 && failed.length === 0,
    JSON.stringify({ ...state, broken: broken.length, overflow: ov.offenders.length, failed: failed.length }));
  if (width === 390) await sequence(page, 'nojs-390');
  await context.close();
}
{
  const { context, page } = await openPage(chrome, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(target, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const hidden = await page.evaluate(() => Array.from(document.querySelectorAll('[data-reveal]')).filter((el) => getComputedStyle(el).opacity !== '1').length);
  await page.locator('[data-loop]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const loopPaused = await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.querySelector('[data-loop-video]')).paused);
  check('reduced motion: content shows without animation and the loop does not start by itself', hidden === 0 && loopPaused, `hidden ${hidden}, loop paused ${loopPaused}`);
  await context.close();
}

// ── 7. Files, links and the base path ────────────────────────────────────────────────────────────
{
  const html = readFileSync(path.join(repo, 'index.html'), 'utf8');
  const css = readFileSync(path.join(repo, 'assets/css/main.css'), 'utf8');
  /** @type {Set<string>} */ const refs = new Set();
  for (const m of html.matchAll(/\b(?:src|href|poster|data-poster|data-poster-phone|data-hd|data-uhd-av1|data-uhd-hevc)="([^"#][^"]*)"/g)) refs.add(m[1].split('#')[0]);
  for (const m of html.matchAll(/\b(?:srcset|data-srcset)="([^"]+)"/g)) for (const part of m[1].split(',')) refs.add(part.trim().split(/\s+/)[0]);
  for (const m of css.matchAll(/url\("?(?!data:)([^")]+)"?\)/g)) refs.add(path.posix.join('assets/css', m[1]));
  // Loaded by the script when a picture is first opened.
  for (const f of ['assets/vendor/photoswipe/photoswipe.esm.min.js', 'assets/vendor/photoswipe/photoswipe.css']) refs.add(f);
  const localRefs = [...refs].filter((r) => !/^(https?:|mailto:)/.test(r));
  const rootRelative = localRefs.filter((r) => r.startsWith('/'));
  check('base path: no root-relative URLs (they would miss /CFIT-Showcase/)', rootRelative.length === 0, rootRelative.join(', '));
  /** @type {string[]} */ const missing = [];
  for (const ref of localRefs) {
    const res = await fetch(new URL(ref, target), { method: 'HEAD' });
    if (!res.ok) missing.push(`${res.status} ${ref}`);
  }
  check(`files: all ${localRefs.length} referenced files are served under the base path`, missing.length === 0, missing.join(', '));
  check('safe areas: viewport-fit=cover, and the header, footer and viewer reserve env(safe-area-inset-*)',
    /viewport-fit=cover/.test(html) && /--safe-top: env\(safe-area-inset-top/.test(css) && /\.site-header \{[^}]*var\(--safe-top\)/.test(css) && /cfit-viewer \.pswp__top-bar \{[^}]*--safe-top/.test(css) && /--safe-bottom/.test(css));

  const external = [...refs].filter((r) => /^https?:/.test(r));
  /** @type {string[]} */ const bad = [];
  for (const url of external) {
    const res = await fetch(url, { redirect: 'follow' }).catch((e) => ({ ok: false, status: String(e) }));
    if (!res.ok) bad.push(`${res.status} ${url}`);
  }
  check(`links: all ${external.length} external links answer`, bad.length === 0, bad.join(', '));

  const used = new Set(localRefs.map((r) => path.posix.normalize(r)));
  const unused = [];
  for (const dir of ['assets/img', 'assets/video', 'assets/fonts']) {
    for (const f of readdirSync(path.join(repo, dir))) {
      const rel = `${dir}/${f}`;
      if (!used.has(rel) && !/LICENSE|\.vtt$|og-card/.test(f)) unused.push(rel);
    }
  }
  check('files: no unused pictures or videos in assets/', unused.length === 0, unused.join(', '));

  if (local) {
    const outside = await fetch(new URL('/index.html', target));
    check('base path: the local server serves nothing outside /CFIT-Showcase/', outside.status === 404);
  }
}

await chrome.close();
await safari?.close();
await server?.close();

const failedChecks = results.filter((r) => !r.ok);
writeFileSync(path.join(out, 'report.json'), JSON.stringify({ target, date: new Date().toISOString(), engines: { chrome: chrome.version(), webkit: safari?.version() ?? null }, results, notes, perViewport }, null, 2));
const md = [
  `# Showcase QA report`, '', `Target: ${target}  `, `Run: ${new Date().toISOString()}  `,
  `Engines: Chrome ${chrome.version()}${safari ? `, WebKit ${safari.version()} (iPhone emulation, not a real device)` : ''}  `,
  `Result: **${failedChecks.length === 0 ? 'PASS' : 'FAIL'}** — ${results.length - failedChecks.length} of ${results.length} checks passed`, '',
  '| Check | Result | Detail |', '|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '/')} |`), '',
  '## Notes', '', ...notes.map((n) => `- ${n}`), '',
  'Screenshots: `qa-output/screens/` (viewport-sized, top to bottom, per width; viewer states; WebKit iPhone views).', '',
].join('\n');
writeFileSync(path.join(out, 'QA_REPORT.md'), md);
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed.`);
process.exit(failedChecks.length === 0 ? 0 : 1);
