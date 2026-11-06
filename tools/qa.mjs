#!/usr/bin/env node
// Browser QA for the showcase, with the Chrome installed on this computer (playwright-core, no download).
//   npm run qa                                   local copy, served at /CFIT-Showcase/ like GitHub Pages
//   QA_URL=https://cfit-timetable-development.github.io/CFIT-Showcase/ npm run qa    the live site
// Writes qa-output/report.json, qa-output/QA_REPORT.md and screenshots in qa-output/screens/.
// Exits with 1 if any check fails.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
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
const browser = await chromium.launch({ channel: process.env.QA_CHANNEL ?? 'chrome' });
console.log(`QA target: ${target}\n`);

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
];

/**
 * @param {import('playwright-core').BrowserContextOptions} options
 */
async function openPage(options) {
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
    // A paused or replaced video cancels its own range request; that is not an error.
    if (!(why.includes('ERR_ABORTED') && /\.mp4/.test(r.url()))) failed.push(`${why} ${r.url()}`);
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
      if (el.closest('dialog, .sr-only')) continue;
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

// ── 1. Every viewport: loads clean, no overflow, every picture loads; screenshots ─────────────────
/** @type {Record<string, any>} */
const perViewport = {};
for (const vp of VIEWPORTS) {
  const { context, page, errors, failed, requests } = await openPage({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile,
  });
  const res = await page.goto(target, { waitUntil: 'load' });
  check(`${vp.name}: page loads (HTTP ${res?.status()})`, res?.ok() ?? false);
  await page.waitForTimeout(1200);
  const initialBytes = requests.reduce((s, r) => s + r.bytes, 0);
  const filmEarly = requests.some((r) => r.url.includes('cfit-product-film'));
  await page.screenshot({ path: path.join(screens, `${vp.name}-first-view.jpg`), type: 'jpeg', quality: 82 });
  await scrollThrough(page);
  const ov = await horizontalOverflow(page);
  check(`${vp.name}: no horizontal overflow`, ov.offenders.length === 0 && ov.scrollWidth <= ov.width,
    ov.offenders.length ? ov.offenders.join('; ') : `scrollWidth ${ov.scrollWidth} = viewport ${ov.width}`);
  const broken = await brokenImages(page);
  check(`${vp.name}: every visible picture loaded`, broken.length === 0, broken.join(', '));
  check(`${vp.name}: the film is not downloaded before it is played`, !filmEarly && !requests.some((r) => r.url.includes('cfit-product-film')));
  const shots = await sequence(page, vp.name);
  check(`${vp.name}: no console errors`, errors.length === 0, errors.join(' | '));
  check(`${vp.name}: no failed requests`, failed.length === 0, failed.join(' | '));
  perViewport[vp.name] = { initialKB: Math.round(initialBytes / 1024), screenshots: shots + 1 };
  note(`${vp.name}: ${Math.round(initialBytes / 1024)} KB transferred before scrolling; ${shots} scroll screenshots`);
  if (vp.name === 'desktop-1440' || vp.name === 'mobile-390') await axe(page, vp.name);
  await context.close();
}

// ── 2. Desktop interactions ────────────────────────────────────────────────────────────────────
{
  const { context, page, errors } = await openPage({ viewport: { width: 1440, height: 900 } });
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
  await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.getElementById('film-video')).pause());

  // Tabs.
  await page.locator('#tab-stage').scrollIntoViewIfNeeded();
  await page.click('#tab-stage');
  const tabState = await page.evaluate(() => ({
    stage: !(/** @type {HTMLElement} */ (document.getElementById('panel-stage')).hidden),
    day: !(/** @type {HTMLElement} */ (document.getElementById('panel-day')).hidden),
  }));
  check('tabs: a click shows its panel and hides the others', tabState.stage && !tabState.day);
  await page.focus('#tab-stage');
  await page.keyboard.press('ArrowRight');
  const keyTab = await page.evaluate(() => ({ sel: document.getElementById('tab-week')?.getAttribute('aria-selected'), focus: document.activeElement?.id }));
  check('tabs: arrow keys move the selection and focus', keyTab.sel === 'true' && keyTab.focus === 'tab-week');

  // Lightbox.
  const trigger = page.locator('.deck-front .shot');
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await trigger.click();
  const opened = await page.waitForFunction(() => {
    const d = document.querySelector('[data-lightbox]');
    const i = /** @type {HTMLImageElement | null} */ (document.querySelector('[data-lightbox-img]'));
    return !!d && d.hasAttribute('open') && !!i && i.complete && i.naturalWidth > 0;
  }, null, { timeout: 10000 }).then(() => true, () => false);
  const firstSrc = await page.evaluate(() => /** @type {HTMLImageElement} */ (document.querySelector('[data-lightbox-img]')).src);
  check('lightbox: opens with the full-size picture', opened, firstSrc.split('/').pop());
  await page.screenshot({ path: path.join(screens, 'interaction-lightbox-1440.jpg'), type: 'jpeg', quality: 80 });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const nextSrc = await page.evaluate(() => /** @type {HTMLImageElement} */ (document.querySelector('[data-lightbox-img]')).src);
  check('lightbox: arrow key shows the next picture', nextSrc !== firstSrc, nextSrc.split('/').pop());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => ({
    open: document.querySelector('[data-lightbox]')?.hasAttribute('open'),
    focusBack: document.activeElement?.closest('.deck-front') !== null,
  }));
  check('lightbox: Escape closes it and focus returns to the picture', closed.open === false && closed.focusBack);

  // The drag-and-drop loop plays in view and can be paused.
  await page.locator('[data-loop]').scrollIntoViewIfNeeded();
  const looping = await page.waitForFunction(() => {
    const el = /** @type {HTMLVideoElement | null} */ (document.querySelector('[data-loop-video]'));
    return !!el && !el.paused && el.currentTime > 0.3;
  }, null, { timeout: 15000 }).then(() => true, () => false);
  check('loop: the drag-and-drop recording plays when in view', looping);
  await page.click('[data-loop-toggle]');
  await page.waitForTimeout(500);
  const loopPaused = await page.evaluate(() => ({
    paused: /** @type {HTMLVideoElement} */ (document.querySelector('[data-loop-video]')).paused,
    label: document.querySelector('[data-loop-label]')?.textContent,
  }));
  check('loop: the Pause button stops it', loopPaused.paused && loopPaused.label === 'Play');

  // The workflow stage cross-fades with the steps.
  await page.locator('[data-step]').nth(3).scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const el = document.querySelectorAll('[data-step]')[3];
    const r = el.getBoundingClientRect();
    window.scrollBy({ top: r.top + r.height / 2 - window.innerHeight / 2, behavior: 'instant' });
  });
  await page.waitForTimeout(900);
  const flow = await page.evaluate(() => {
    const figs = Array.from(document.querySelectorAll('.flow-media .flow-figure'));
    return { enhanced: !!document.querySelector('.flow.is-enhanced'), active: figs.findIndex((f) => f.classList.contains('is-active')), inert: figs.filter((f) => /** @type {HTMLElement} */ (f).inert).length };
  });
  check('workflow: sticky stage shows the picture of the step in view', flow.enhanced && flow.active === 3 && flow.inert === 5, JSON.stringify(flow));
  await page.screenshot({ path: path.join(screens, 'interaction-workflow-step4-1440.jpg'), type: 'jpeg', quality: 80 });

  // Internal links.
  const anchors = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="#"]'))
    .map((a) => a.getAttribute('href') ?? '').filter((h) => h.length > 1 && !document.getElementById(h.slice(1))));
  check('links: every in-page link has a target', anchors.length === 0, anchors.join(', '));
  check('desktop interactions: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ── 3. Mobile menu ───────────────────────────────────────────────────────────────────────────────
{
  const { context, page } = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(target, { waitUntil: 'load' });
  await page.click('[data-nav-toggle]');
  const open = await page.evaluate(() => ({
    expanded: document.querySelector('[data-nav-toggle]')?.getAttribute('aria-expanded'),
    visible: getComputedStyle(/** @type {Element} */ (document.querySelector('[data-nav]'))).display !== 'none',
  }));
  await page.screenshot({ path: path.join(screens, 'interaction-menu-390.jpg'), type: 'jpeg', quality: 80 });
  check('mobile menu: the button opens it', open.expanded === 'true' && open.visible);
  await page.click('[data-nav] a[href="#features"]');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({ expanded: document.querySelector('[data-nav-toggle]')?.getAttribute('aria-expanded'), hash: location.hash }));
  check('mobile menu: choosing a section closes it and goes there', after.expanded === 'false' && after.hash === '#features');
  await context.close();
}

// ── 4. Without JavaScript, and with reduced motion ───────────────────────────────────────────────
for (const width of [390, 1440]) {
  const { context, page, failed } = await openPage({ viewport: { width, height: 900 }, javaScriptEnabled: false });
  await page.goto(target, { waitUntil: 'load' });
  await scrollThrough(page);
  const state = await page.evaluate(() => ({
    panels: Array.from(document.querySelectorAll('[role="tabpanel"]')).filter((p) => /** @type {HTMLElement} */ (p).offsetParent !== null).length,
    flowPictures: document.querySelectorAll('.flow-step .flow-figure').length,
    hiddenReveal: Array.from(document.querySelectorAll('[data-reveal]')).filter((el) => getComputedStyle(el).opacity !== '1').length,
  }));
  const broken = await brokenImages(page);
  const ov = await horizontalOverflow(page);
  check(`no JavaScript (${width}px): all content visible, pictures load, no overflow`,
    state.panels === 4 && state.flowPictures === 6 && state.hiddenReveal === 0 && broken.length === 0 && ov.offenders.length === 0 && failed.length === 0,
    JSON.stringify({ ...state, broken: broken.length, overflow: ov.offenders.length, failed: failed.length }));
  if (width === 390) await sequence(page, 'nojs-390');
  await context.close();
}
{
  const { context, page } = await openPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(target, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const hidden = await page.evaluate(() => Array.from(document.querySelectorAll('[data-reveal]')).filter((el) => getComputedStyle(el).opacity !== '1').length);
  await page.locator('[data-loop]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const loopPaused = await page.evaluate(() => /** @type {HTMLVideoElement} */ (document.querySelector('[data-loop-video]')).paused);
  check('reduced motion: content shows without animation and the loop does not start by itself', hidden === 0 && loopPaused, `hidden ${hidden}, loop paused ${loopPaused}`);
  await context.close();
}

// ── 5. Files, links and the base path ────────────────────────────────────────────────────────────
{
  const html = readFileSync(path.join(repo, 'index.html'), 'utf8');
  const css = readFileSync(path.join(repo, 'assets/css/main.css'), 'utf8');
  /** @type {Set<string>} */ const refs = new Set();
  for (const m of html.matchAll(/\b(?:src|href|poster|data-full)="([^"#][^"]*)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/\bsrcset="([^"]+)"/g)) for (const part of m[1].split(',')) refs.add(part.trim().split(/\s+/)[0]);
  for (const m of css.matchAll(/url\("?(?!data:)([^")]+)"?\)/g)) refs.add(path.posix.join('assets/css', m[1]));
  const localRefs = [...refs].filter((r) => !/^(https?:|mailto:)/.test(r));
  const rootRelative = localRefs.filter((r) => r.startsWith('/'));
  check('base path: no root-relative URLs (they would miss /CFIT-Showcase/)', rootRelative.length === 0, rootRelative.join(', '));
  /** @type {string[]} */ const missing = [];
  for (const ref of localRefs) {
    const res = await fetch(new URL(ref, target), { method: 'HEAD' });
    if (!res.ok) missing.push(`${res.status} ${ref}`);
  }
  check(`files: all ${localRefs.length} referenced files are served under the base path`, missing.length === 0, missing.join(', '));

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

await browser.close();
await server?.close();

const failedChecks = results.filter((r) => !r.ok);
writeFileSync(path.join(out, 'report.json'), JSON.stringify({ target, date: new Date().toISOString(), results, notes, perViewport }, null, 2));
const md = [
  `# Showcase QA report`, '', `Target: ${target}  `, `Run: ${new Date().toISOString()}  `,
  `Result: **${failedChecks.length === 0 ? 'PASS' : 'FAIL'}** — ${results.length - failedChecks.length} of ${results.length} checks passed`, '',
  '| Check | Result | Detail |', '|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '/')} |`), '',
  '## Notes', '', ...notes.map((n) => `- ${n}`), '',
  'Screenshots: `qa-output/screens/` (viewport-sized, top to bottom, per width).', '',
].join('\n');
writeFileSync(path.join(out, 'QA_REPORT.md'), md);
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed.`);
process.exit(failedChecks.length === 0 ? 0 : 1);
