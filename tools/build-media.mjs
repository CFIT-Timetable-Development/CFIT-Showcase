#!/usr/bin/env node
// Rebuilds the site's pictures and videos from the original recordings: FFmpeg reads the sources and crops them;
// sharp (libvips) resizes the pictures with Lanczos and encodes them as WebP.
//
// The originals are not in this repository (they are several GB). Point the script at them:
//   CFIT_FOOTAGE_DIR  the 4K demo footage package (folder CFIT_4K_Cinematic_Footage)
//   CFIT_TRAILER_DIR  the trailer's final delivery folder (CFIT-Product-Trailer/out/FINAL_4K)
//
//   node tools/build-media.mjs            # every picture and both videos
//   node tools/build-media.mjs hero-day   # only the items whose id is listed
//   node tools/build-media.mjs --images --prune   # every picture, no video; remove pictures no longer listed
//
// The originals are only read, never changed. Output goes to assets/img and assets/video.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(repo, 'tools/media-manifest.json'), 'utf8'));
const roots = { footage: process.env.CFIT_FOOTAGE_DIR, trailer: process.env.CFIT_TRAILER_DIR };
const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
/** @type {Set<string>} */
const built = new Set();
const imgDir = path.join(repo, 'assets/img');
const videoDir = path.join(repo, 'assets/video');
mkdirSync(imgDir, { recursive: true });
mkdirSync(videoDir, { recursive: true });

/** @param {string} root @param {string} rel */
function source(root, rel) {
  const base = roots[/** @type {'footage'|'trailer'} */ (root)];
  if (!base) throw new Error(`Set ${root === 'footage' ? 'CFIT_FOOTAGE_DIR' : 'CFIT_TRAILER_DIR'} first.`);
  const file = path.join(base, rel);
  if (!existsSync(file)) throw new Error(`Missing source: ${file}`);
  return file;
}

/** @param {string[]} args */
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
}

const kb = (/** @type {string} */ f) => `${Math.round(statSync(f).size / 1024)} KB`;
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cfit-media-'));

/**
 * Encodes one size of a picture. Below the crop's native width: near-lossless WebP (visually lossless, sharp text
 * edges, no chroma subsampling). At native width: lossless WebP, unless it is much larger than near-lossless.
 * Small thumbnails ("encode": "thumb"): ordinary lossy WebP, since no detail would show at that size.
 * Film frames ("encode": "photo"): high-quality lossy WebP.
 * @param {string} png the full-resolution crop @param {number} w @param {number} native @param {any} item
 */
async function encode(png, w, native, item) {
  if (w > native) throw new Error(`${item.id}: ${w} px is wider than the source (${native} px); never upscale`);
  const resized = () => {
    const s = sharp(png);
    if (item.height) return s.resize({ width: w, height: item.height, fit: 'fill', kernel: 'lanczos3' });
    return w < native ? s.resize({ width: w, kernel: 'lanczos3' }) : s;
  };
  if ((item.format ?? 'webp') === 'jpg') return resized().jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  if (item.encode === 'thumb' && item.widths.includes(w) && w < native) return resized().webp({ quality: 85, smartSubsample: true, effort: 6 }).toBuffer();
  // Frames of the film (graded gradients, glow and grain rather than flat interface): high-quality lossy WebP.
  if (item.encode === 'photo') return resized().webp({ quality: w === native ? 92 : 90, smartSubsample: true, effort: 6 }).toBuffer();
  if (w < native) return resized().webp({ nearLossless: true, quality: 60, effort: 6 }).toBuffer();
  const lossless = await resized().webp({ lossless: true, effort: 6 }).toBuffer();
  const near = await resized().webp({ nearLossless: true, quality: 80, effort: 6 }).toBuffer();
  return lossless.length <= near.length * 1.25 ? lossless : near;
}

for (const item of manifest.images) {
  if (only.size && !only.has(item.id)) continue;
  const src = source(item.root, item.src);
  // A video frame is chosen by its index (60 fps): seek to one second before it, then count frames.
  const input = item.frame === undefined
    ? ['-i', src]
    : ['-ss', String(Math.max(0, (item.frame - 60) / 60)), '-i', src];
  const pick = item.frame === undefined ? [] : [`select=eq(n\\,${Math.min(60, item.frame)})`];
  // First a lossless PNG of the whole crop at the source's own resolution (Rec.709 for film frames).
  const png = path.join(tmpDir, `${item.id}.png`);
  const toRgb = item.frame === undefined ? 'format=rgb24' : 'scale=in_color_matrix=bt709:in_range=limited,format=rgb24';
  ffmpeg([...input, '-vf', [...pick, ...(item.crop ? [`crop=${item.crop}`] : []), toRgb].join(','), '-frames:v', '1', png]);
  const native = /** @type {number} */ ((await sharp(png).metadata()).width);
  // The in-page widths, then the viewer's copy at the crop's native resolution.
  const widths = [...item.widths, ...(item.zoom && !item.widths.includes(item.zoom) ? [item.zoom] : [])];
  for (const w of widths) {
    const out = path.join(imgDir, `${item.id}-${w}.${item.format ?? 'webp'}`);
    writeFileSync(out, await encode(png, w, native, item));
    built.add(path.basename(out));
    console.log(`${path.relative(repo, out)}  ${kb(out)}`);
  }
}

// --prune: remove pictures in assets/img that the manifest no longer produces (loop posters and icons are kept).
if (process.argv.includes('--prune') && only.size === 0) {
  for (const f of readdirSync(imgDir)) {
    if (/\.(webp|jpg)$/.test(f) && !built.has(f) && !/^drag-loop/.test(f)) { rmSync(path.join(imgDir, f)); console.log(`removed assets/img/${f}`); }
  }
}
rmSync(tmpDir, { recursive: true, force: true });

for (const v of manifest.videos) {
  if (process.argv.includes('--images')) break;
  if (only.size && !only.has(v.id)) continue;
  const src = source(v.root, v.src);
  if (v.id === 'cfit-product-film-1080p60') {
    // The approved film: 1080p60 H.264 from the ProRes master, the event mix copied unchanged,
    // a keyframe every 2 s so the chapter buttons seek quickly, and the index at the front (fast start).
    const out = path.join(videoDir, `${v.id}.mp4`);
    ffmpeg([
      '-i', src, '-i', source(v.root, v.audio), '-map', '0:v:0', '-map', '1:a:0',
      '-vf', 'scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slower', '-crf', '25', '-profile:v', 'high', '-level:v', '4.2',
      '-g', '120', '-keyint_min', '60', '-sc_threshold', '0',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-c:a', 'copy', '-movflags', '+faststart', '-metadata', 'title=CFIT Timetable — Product Film', out,
    ]);
    console.log(`${path.relative(repo, out)}  ${kb(out)}`);
  } else if (v.filmOf === 'cfit-product-film-1080p60') {
    // The same film in native 4K60 (3840×2160, no scaling), 10-bit 4:2:0 straight from the 10-bit ProRes master,
    // with the same event-mix audio copied unchanged, the same keyframe spacing and Rec.709 tags.
    // AV1 (libaom, CRF 28) for Chrome, Edge, Firefox and Apple devices with AV1; HEVC (x265, CRF 24, tagged hvc1)
    // for Safari. Settings chosen by comparing encodes of a text-heavy clip against the master (VMAF, SSIM, PSNR and
    // 100% crops of small interface text); see docs/ASSETS.md.
    const out = path.join(videoDir, `${v.id}.mp4`);
    const codec = v.codec === 'av1'
      ? ['-c:v', 'libaom-av1', '-crf', '28', '-b:v', '0', '-cpu-used', '6', '-row-mt', '1', '-tiles', '2x2', '-usage', 'good', '-g', '120', '-keyint_min', '120']
      : ['-c:v', 'libx265', '-preset', 'slow', '-crf', '24', '-tag:v', 'hvc1', '-x265-params', 'keyint=120:min-keyint=60:scenecut=0:log-level=error'];
    ffmpeg([
      '-i', src, '-i', source(v.root, v.audio), '-map', '0:v:0', '-map', '1:a:0',
      '-vf', 'setsar=1,format=yuv420p10le', ...codec,
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-c:a', 'copy', '-movflags', '+faststart', '-metadata', 'title=CFIT Timetable — Product Film (4K)', out,
    ]);
    console.log(`${path.relative(repo, out)}  ${kb(out)}`);
  } else if (v.id === 'drag-loop' || v.loopOf === 'drag-loop') {
    // A silent loop of a real drag: the clip, a 1 s hold on its last frame, then a 0.5 s cross-fade back to the start.
    // drag-loop-mobile is the same clip cut tighter for phones.
    const out = path.join(videoDir, `${v.id}.mp4`);
    const len = v.end - v.start;
    const base = `crop=${v.crop},scale=${v.width}:-2:flags=lanczos,fps=30,setsar=1`;
    ffmpeg([
      '-ss', String(v.start), '-t', String(len), '-i', src,
      '-filter_complex',
      `[0:v]${base},split[a][b];[b]trim=end_frame=1,loop=loop=45:size=1,setpts=N/30/TB[first];` +
      `[a]tpad=stop_mode=clone:stop_duration=1[clip];` +
      `[clip][first]xfade=transition=fade:duration=0.5:offset=${(len + 1 - 0.5).toFixed(2)},format=yuv420p[v]`,
      '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slower', '-crf', '26', '-profile:v', 'high',
      '-movflags', '+faststart', out,
    ]);
    console.log(`${path.relative(repo, out)}  ${kb(out)}`);
    // Its poster: the first frame.
    const poster = path.join(imgDir, `${v.id}-poster-${v.width}.webp`);
    ffmpeg(['-ss', String(v.start), '-i', src, '-vf', `crop=${v.crop},scale=${v.width}:-2:flags=lanczos,format=rgb24`,
      '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', '-compression_level', '6', poster]);
    console.log(`${path.relative(repo, poster)}  ${kb(poster)}`);
  }
}
