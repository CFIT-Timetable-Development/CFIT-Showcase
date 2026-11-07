# CFIT Timetable — Product Showcase

The public showcase of **CFIT Timetable**, a full-stack timetable management platform built as a 2026 Wintec industry
internship project by Zhida Chen and Khylle Mauricio.

**Public website:** https://cfit-timetable-development.github.io/CFIT-Showcase/

**Product source code:** https://github.com/CFIT-Timetable-Development/CFIT-Timetable-System — a **private**
repository (checked on 7 November 2026), so the page names it but does not link to it. See
[If the product repository becomes public](#if-the-product-repository-becomes-public).

The printed poster's QR code points to the public website above. **Keep that address unchanged**: don't rename the
repository, change the Pages source or add a custom domain without reprinting the QR code.

## What is on the page

One scrolling page in six parts:

| # | Section | What it shows |
|---|---|---|
| 01 | Hero | The headline, the technologies it is built with, the Day view of the real app, four facts that link to the evidence |
| 02 | Product film | The approved 100-second film (1080p60), with chapters and its on-screen text |
| 03 | From Excel to timetable | The three workbooks a term used to start from, then the six steps (Import → Validate → Edit → Suggest fixes → Review → Export), each linking to its feature |
| 04 | Features | Conflict detection, coordinated Suggest fixes, drag and drop, split and merge, Version history, the Excel and PDF round trip — each as problem, action and result — and the workspace views |
| 05 | Engineering | A · the full-stack architecture, B · the CI/CD pipeline (with the deploy step shown as paused), C · the test evidence with its dates |
| 06 | Project background | The internship, the team, what the (private) product repository holds |

The header has an Engineering shortcut, and the hero links to it, so the engineering story is one tap away from the
first screen.

Every picture is the real application, recorded with **fictional demonstration data** (the MASTER_CLEAN and
LIVE_DEMO demo datasets). Where each one comes from is in [docs/ASSETS.md](docs/ASSETS.md).

## How it is published

GitHub Pages builds from a branch: **Settings → Pages → Deploy from a branch → `main` → `/ (root)`**. There is no
build step: what is on `main` is what is served, a minute or two after each push. `.nojekyll` tells Pages to serve
the files as they are.

All links and asset paths are **relative** (`assets/…`), so the site works under the `/CFIT-Showcase/` base path. Never
start a path with `/`; `npm run qa` checks this.

## Layout

```text
index.html               the page
assets/css/main.css      all styles (one file, no preprocessor)
assets/js/main.js        progressive enhancements: menu, film player, loop, image viewer
assets/img/              WebP pictures (page sizes, phone crops, full-resolution viewer copies), the technology
                         marks (tech-marks.svg), the favicon and the link-preview card
assets/video/            the product film (H.264 1080p60, 28 MB), the drag-and-drop loop and its phone cut, chapters
assets/vendor/photoswipe the image viewer library (PhotoSwipe 5.4.4, MIT), copied by `npm run vendor`
assets/fonts/            Inter (variable, Latin subset) and its SIL Open Font License
tools/                   local server, browser QA, media pipeline, vendor copy (not used by the page itself)
docs/ASSETS.md           where every picture and video comes from
```

The page works without JavaScript: every step, picture and chapter is in the HTML, and every picture is a link to its
full-resolution file. The script adds the film's poster button, the loop, the menu on small screens and the image
viewer. Motion respects `prefers-reduced-motion`: the loop does not start by itself and nothing animates.

**The image viewer** is [PhotoSwipe](https://photoswipe.com/) (MIT). It was chosen over hand-written gestures because
it handles pinch, double-tap and pan reliably in iPhone Safari. It loads only when a picture is first opened, shows
the picture fitted to the screen, and zooms into the full-resolution copy:
- zoom: pinch, double-tap, the zoom button or `Z`; drag to pan;
- next picture: swipe, the arrow buttons or the arrow keys;
- fit again: the zoom button, a double-tap or a pinch out;
- close: the close button, `Esc`, a tap outside the picture or a downward swipe.

The caption sits under the picture and fades out while zoomed in. To update the library: change the version in
`package.json`, `npm install`, `npm run vendor`, then `npm run check`.

## Working on it

You need Node.js 20 or later and Google Chrome. For the iPhone checks, also install Playwright's WebKit once:

```bash
npm install                        # development tools only: TypeScript, html-validate, Playwright (core), axe-core, PhotoSwipe
npx playwright-core install webkit # optional: the WebKit engine, for iPhone emulation (QA_WEBKIT=0 skips it)
npm run serve                      # http://localhost:4173/CFIT-Showcase/ — the same base path as GitHub Pages
npm run check                      # type check, HTML validation and the full browser QA
```

`npm run qa` checks, in Chrome:
- five widths (375, 390, 768, 1440 and 1920 px): horizontal overflow, missing pictures, console errors, failed requests;
- the film and a chapter;
- the image viewer with the mouse and keyboard;
- the viewer on a phone with real touch input: fit, double-tap zoom, one-finger pan, reset, pinch, swipe and close;
- that phones get the phone crops, with enough pixels for the screen and the interface at a readable size;
- no text under 11 px and controls of at least 44 px;
- the page without JavaScript and with reduced motion;
- axe accessibility, and every link and file.

It then repeats the phone checks in WebKit as an iPhone 13 and an iPhone SE, with the header, the film and reduced
motion. That is automated iPhone emulation on this computer, not a real iPhone. Screenshots go in `qa-output/` (not
committed). To check the live site after a push:

```bash
QA_URL=https://cfit-timetable-development.github.io/CFIT-Showcase/ npm run qa
```

## Pictures and video

The pictures are crops of lossless 4K recordings of the real application; the film is the approved Cinematic v4.1
cut. The masters are several GB and stay **outside** this repository, with the project owner. To rebuild the web
copies from them:

```bash
CFIT_FOOTAGE_DIR=/path/to/CFIT_4K_Cinematic_Footage \
CFIT_TRAILER_DIR=/path/to/CFIT-Product-Trailer/out/FINAL_4K \
npm run media                 # or: node tools/build-media.mjs hero-day conflict   (only those)
```

What is cut from where is listed in `tools/media-manifest.json`. The film is encoded as H.264 High, 1920×1080 at 60 fps,
CRF 25 (about 2.1 Mbit/s of video), with a keyframe every 2 s so the chapter buttons seek quickly, the index at the front
(fast start) and the event mix of the sound copied unchanged. The page loads it only when a visitor presses play.

Each picture has page sizes for the `srcset`, a **viewer copy** at the crop's full resolution (`zoom` in the manifest),
and, where the full screen would be too small to read on a phone, a **phone crop** (`mobileOf`): a tighter cut of the
same frame, shown through `<picture>` on screens up to 639 px wide. A phone crop should be about 700–1100 pixels of the
4K frame wide, so the interface shows at 60–100% of its real size on a phone.

**Rules for new pictures:** only real screens of the application; only fictional demonstration data — never real
staff, student, Module or room names, credentials or anything from the live system; crop, never redraw; keep each page
picture under about 300 KB. Only add figures that the product's own documentation states, with their date.

## Keeping it true

Some sentences describe the product at a point in time. Update them when the product changes:

- the test figures and their dates (section 05, part C, and the four facts under the hero), from the product
  README's "Engineering quality" table;
- "Automatic deploys have been paused since 7 November 2026" and the "Paused" badge on the Deploy stage (section 05,
  part B), when deploys are switched back on;
- "Not checked yet: students' clashes and teaching hours" (section 04), when those checks are built.

## If the product repository becomes public

The page links to nothing in the private repository, so that no visitor meets a 404. If the project owner makes it
public again, add the links back in section 06 (`.resources` in `index.html`):

| Link | URL |
|---|---|
| Source code | https://github.com/CFIT-Timetable-Development/CFIT-Timetable-System |
| User manual | https://github.com/CFIT-Timetable-Development/CFIT-Timetable-System/blob/main/docs/user-manual/README.md |
| Developer handover | https://github.com/CFIT-Timetable-Development/CFIT-Timetable-System/blob/main/docs/developer-handover.md |
| Documentation index | https://github.com/CFIT-Timetable-Development/CFIT-Timetable-System/blob/main/docs/README.md |

and change the sentence that says the repository is private. `npm run qa` checks that every external link answers.

## Credits

Built by Zhida Chen and Khylle Mauricio, Wintec Industry Internship 2026. Typeface: [Inter](https://rsms.me/inter/)
by Rasmus Andersson, under the SIL Open Font License (`assets/fonts/LICENSE-Inter.txt`). Image viewer:
[PhotoSwipe](https://photoswipe.com/) by Dmytro Semenov, MIT (`assets/vendor/photoswipe/LICENSE.txt`). Technology
marks: [Simple Icons](https://simpleicons.org/), CC0 1.0; the trademarks belong to their owners and are used only to
name the technologies the product is built with. The film's music and sound effects were synthesised for the project
from code.
