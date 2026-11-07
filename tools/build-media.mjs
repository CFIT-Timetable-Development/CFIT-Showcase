#!/usr/bin/env node
// Rebuilds the site's pictures and videos from the original recordings with FFmpeg.
//
// The originals are not in this repository (they are several GB). Point the script at them:
//   CFIT_FOOTAGE_DIR  the 4K demo footage package (folder CFIT_4K_Cinematic_Footage)
//   CFIT_TRAILER_DIR  the trailer's final delivery folder (CFIT-Product-Trailer/out/FINAL_4K)
//
//   node tools/build-media.mjs            # every picture and both videos
//   node tools/build-media.mjs hero-day   # only the items whose id is listed
//
// The originals are only read, never changed. Output goes to assets/img and assets/video.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(repo, 'tools/media-manifest.json'), 'utf8'));
const roots = { footage: process.env.CFIT_FOOTAGE_DIR, trailer: process.env.CFIT_TRAILER_DIR };
const only = new Set(process.argv.slice(2));
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

for (const item of manifest.images) {
  if (only.size && !only.has(item.id)) continue;
  const src = source(item.root, item.src);
  // A video frame is chosen by its index (60 fps): seek to one second before it, then count frames.
  const input = item.frame === undefined
    ? ['-i', src]
    : ['-ss', String(Math.max(0, (item.frame - 60) / 60)), '-i', src];
  const pick = item.frame === undefined ? [] : [`select=eq(n\\,${Math.min(60, item.frame)})`];
  // The in-page widths, then the viewer's copy at the crop's native resolution (not listed in the page's srcset,
  // so it is downloaded only when someone opens the picture).
  const widths = [...item.widths, ...(item.zoom && !item.widths.includes(item.zoom) ? [item.zoom] : [])];
  for (const w of widths) {
    const fmt = item.format ?? 'webp';
    const out = path.join(imgDir, `${item.id}-${w}.${fmt}`);
    const scale = item.height ? `scale=${w}:${item.height}:flags=lanczos` : `scale=${w}:-2:flags=lanczos`;
    const vf = [...pick, ...(item.crop ? [`crop=${item.crop}`] : []), scale, 'format=rgb24'].join(',');
    const quality = w === item.zoom && !item.widths.includes(w) ? '86' : '88';
    const codec = fmt === 'jpg'
      ? ['-c:v', 'mjpeg', '-q:v', '3']
      : ['-c:v', 'libwebp', '-quality', quality, '-compression_level', '6', '-preset', 'picture'];
    ffmpeg([...input, '-vf', vf, '-frames:v', '1', ...codec, out]);
    console.log(`${path.relative(repo, out)}  ${kb(out)}`);
  }
}

for (const v of manifest.videos) {
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
