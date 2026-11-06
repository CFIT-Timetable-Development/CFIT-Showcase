#!/usr/bin/env node
// A small static server that serves this folder at /CFIT-Showcase/, the same base path as GitHub Pages,
// so relative links and asset paths are tested exactly as they will be published.
//   node tools/serve.mjs            → http://localhost:4173/CFIT-Showcase/
//   PORT=5000 node tools/serve.mjs
// Supports HTTP Range requests, which browsers need to seek in the video.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/CFIT-Showcase/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Starts the server and resolves with its URL.
 * @param {number} [port]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serve(port = Number(process.env.PORT ?? 4173)) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/CFIT-Showcase') {
      res.writeHead(301, { Location: BASE });
      res.end();
      return;
    }
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not under the GitHub Pages base path /CFIT-Showcase/');
      return;
    }
    let rel = decodeURIComponent(url.pathname.slice(BASE.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, rel);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile() || rel.startsWith('node_modules')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const size = statSync(file).size;
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actual = typeof address === 'object' && address ? address.port : port;
      resolve({
        url: `http://127.0.0.1:${actual}${BASE}`,
        close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await serve();
  console.log(`Serving ${root} at ${url}`);
}
