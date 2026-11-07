#!/usr/bin/env node
// Writes each picture's responsive markup in index.html from tools/media-manifest.json, so the files the build makes
// and the files the page offers can never drift apart:
//   - the viewer's list (data-srcset on the [data-zoom] link): every page width plus the full-resolution copy;
//   - the page picture (<img srcset sizes src width height>): every page width, the manifest's sizes, the 1x file;
//   - the phone crop (<source media="(max-width: 639px)">): its widths and sizes;
//   - thumbnails ("encode": "thumb"): one 960 px file.
//   npm run srcset        then check the diff and run npm run check
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(repo, 'index.html');
const manifest = JSON.parse(readFileSync(path.join(repo, 'tools/media-manifest.json'), 'utf8'));
/** @type {Map<string, any>} */
const byId = new Map(manifest.images.map((/** @type {any} */ i) => [i.id, i]));
let html = readFileSync(file, 'utf8');
const url = (/** @type {string} */ id, /** @type {number} */ w) => `assets/img/${id}-${w}.webp`;
const set = (/** @type {string} */ id, /** @type {number[]} */ ws) => [...new Set(ws)].sort((a, b) => a - b).map((w) => `${url(id, w)} ${w}w`).join(', ');
/** Native size of a crop: "w:h:x:y", or the whole 3840×2160 frame. */
const dims = (/** @type {any} */ i) => (i.crop ? i.crop.split(':').slice(0, 2).map(Number) : i.id.startsWith('pdf-day') ? [4678, 3308] : [3840, 2160]);
let changes = 0;
const sub = (/** @type {RegExp} */ re, /** @type {(...m: string[]) => string} */ fn) => {
  html = html.replace(re, (...m) => { const r = fn(...m); if (r !== m[0]) changes += 1; return r; });
};

// 1. The viewer's list on each zoom link, and the full-resolution size it opens.
sub(/(href="assets\/img\/)([a-z0-9-]+)-(\d+)(\.webp" data-zoom data-w=")(\d+)(" data-h=")(\d+)(" data-srcset=")([^"]*)"/g,
  (_m, a, id, _w, b, _dw, c, _dh, d) => {
    const i = byId.get(id);
    if (!i?.zoom) throw new Error(`no zoom size in the manifest for ${id}`);
    const [nw, nh] = dims(i);
    const zh = Math.round((i.zoom * nh) / nw);
    return `${a}${id}-${i.zoom}${b}${i.zoom}${c}${zh}${d}${set(id, [...i.widths, i.zoom])}"`;
  });
// 2. Phone crops.
sub(/<source media="\(max-width: 639px\)" srcset="assets\/img\/([a-z0-9-]+)-m-[^"]*" sizes="[^"]*" width="\d+" height="\d+">/g, (_m, id) => {
  const i = byId.get(`${id}-m`);
  if (!i) throw new Error(`no phone crop ${id}-m in the manifest`);
  const [nw, nh] = dims(i);
  const w = Math.max(...i.widths);
  return `<source media="(max-width: 639px)" srcset="${set(`${id}-m`, i.widths)}" sizes="${i.sizes}" width="${w}" height="${Math.round((w * nh) / nw)}">`;
});
// 3. Page pictures with a srcset, and thumbnails without one.
sub(/<img src="assets\/img\/([a-z0-9-]+?)-(\d+)\.webp"( srcset="[^"]*" sizes="[^"]*")? width="\d+" height="\d+"/g, (m, id, _w, hasSet) => {
  const i = byId.get(id);
  if (!i || i.id.startsWith('drag-loop')) return m;
  const [nw, nh] = dims(i);
  if (!hasSet || i.encode === 'thumb') {
    const w = 960;
    return `<img src="${url(id, w)}" width="${w}" height="${Math.round((w * nh) / nw)}"`;
  }
  const top = Math.max(...i.widths);
  return `<img src="${url(id, i.src)}" srcset="${set(id, i.widths)}" sizes="${i.sizes}" width="${top}" height="${Math.round((top * nh) / nw)}"`;
});
writeFileSync(file, html);
console.log(`index.html: ${changes} picture attributes rewritten from the manifest`);
