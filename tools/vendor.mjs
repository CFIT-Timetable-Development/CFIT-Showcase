#!/usr/bin/env node
// Copies the image viewer library, PhotoSwipe (MIT), from node_modules into assets/vendor/photoswipe.
// The site has no build step, so the browser loads these copies directly. After changing the version in
// package.json: npm install, then npm run vendor, then npm run check.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(repo, 'node_modules/photoswipe');
const to = path.join(repo, 'assets/vendor/photoswipe');
mkdirSync(to, { recursive: true });
for (const [src, dest] of [
  ['dist/photoswipe.esm.min.js', 'photoswipe.esm.min.js'],
  ['dist/photoswipe.css', 'photoswipe.css'],
  ['LICENSE', 'LICENSE.txt'],
]) copyFileSync(path.join(from, src), path.join(to, dest));
const { version } = JSON.parse(readFileSync(path.join(from, 'package.json'), 'utf8'));
console.log(`PhotoSwipe ${version} copied to assets/vendor/photoswipe`);
