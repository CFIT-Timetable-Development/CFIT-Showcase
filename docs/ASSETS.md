# Asset inventory

Every picture and video on the showcase, where it comes from and how it was made. Rebuild them with
`tools/build-media.mjs` (see the README); the cuts are defined in `tools/media-manifest.json`, and
`tools/sync-srcset.mjs` writes each picture's `srcset`, `sizes` and viewer list into the page from that file.

**All data is fictional.** The recordings use the MASTER_CLEAN and LIVE_DEMO demonstration datasets made for the live
demo of 10 November 2026: every Module, person, room and programme in them is invented. They are recordings of the
real application (commit `ae4afbe`, laid out at 1920×1080 and captured at 3840×2160), not mock-ups. Nothing was
retouched, composited or moved; where a cursor shows, it is the recording's own cursor. The opening workbooks and the
film's captions and title cards are the trailer's own graphics over synthetic demonstration workbooks.

The masters are not in this repository. The project owner keeps them in two packages:
- **4K demo footage** (`CFIT_4K_Cinematic_Footage/`): 16 takes of lossless 3840×2160 frames, with stills.
- **Trailer delivery** (`CFIT-Product-Trailer/out/FINAL_4K/`): the approved Cinematic v4.1 film, its ProRes 422 HQ
  master and the 4K event files.

## Pictures

FFmpeg reads the source (a still, or one frame of the ProRes master converted with the Rec.709 matrix) and crops it
to a lossless PNG at the source's own resolution. sharp (libvips 8.18, libwebp 1.6) then resizes it with Lanczos and
encodes WebP:
- **page sizes below the crop's native width: near-lossless** (level 60). Text edges and thin borders stay intact, and
  no colour detail is thrown away (ordinary lossy WebP halves the colour resolution, which blurs coloured text);
- **the native width: lossless** (or near-lossless 80 where lossless would be more than 25% larger);
- **small thumbnails** ("thumb"): lossy q85 with sharp colour conversion, since no extra detail would show;
- **film frames** ("photo": the workbooks shot and the poster, all gradients and glow): lossy q90–92.

**Sizes follow the layout.** Each picture's page widths are the width it is shown at on a desktop at 1×, 1.5× and
2×, plus its native width, and `sizes` describes the layout exactly (measured at 21 window widths). On desktop
screens the browser therefore draws each file at 1.00–1.02 file pixels per screen pixel instead of enlarging or
shrinking it. Nothing is ever made wider than its source. Crop = width×height at x,y in the source frame (3840×2160
for the recordings, 4678×3308 for the PDF page).

- **Phone crops** (ids ending in `-m`): tighter cuts of the same frames at their own resolution, shown instead of the
  full screen on screens up to 639 px wide (`<picture>`), so the interface shows at 60–100% of its real size.
- **Viewer copies** (marked "viewer"): the whole crop at its native resolution. The image viewer opens these; they are
  in the viewer's list only, so they load when someone opens the picture.

| Id | Shows | Source | Crop | Files in `assets/img/` |
|---|---|---|---|---|
| `hero-day` | Day view right after an import: one column per Stage, 0 findings | 4K demo footage: `1280` | whole frame | 3840×2160, 276 KB, lossless (page and viewer)<br>2560×1440, 276 KB, near-lossless<br>1920×1080, 183 KB, near-lossless<br>1280×720, 104 KB, near-lossless<br>960×540, 70 KB, near-lossless |
| `before-workbooks` | The three synthetic demonstration workbooks a term starts from (the film's opening shot, caption left out) | Trailer delivery: `680`, frame 330 | 3440×1560 at 200,150 | 3440×1560, 589 KB, lossy q92 (page and viewer)<br>2040×925, 300 KB, lossy q90<br>1360×617, 163 KB, lossy q90<br>1020×463, 102 KB, lossy q90<br>680×308, 49 KB, lossy q90 |
| `import-check` | Import, Check step: 99 source rows, 0 errors, 0 warnings, nothing saved yet | 4K demo footage: `R02-import/stills/R02-import_04_18.87s_Check-99-source-rows-67-Activities-95-scheduled-sessions-CFI.png` | 2794×1833 at 528,250 | 2794×1833, 112 KB, lossless (viewer)<br>960×630, 39 KB, lossy q85 |
| `import-confirm` | Import, Confirm step: what will happen; nothing is saved until you confirm | 4K demo footage: `R02-import/stills/R02-import_08_36.78s_Confirm-what-will-happen-nothing-is-saved-until-you-confirm.png` | 2794×1680 at 528,480 | 2794×1680, 88 KB, lossless (viewer)<br>960×577, 34 KB, lossy q85 |
| `conflict` | Validation findings: two rooms double-booked; the clashing sessions marked WARNING on the grid | 4K demo footage: `1240` | 3840×1700 at 0,0 | 3840×1700, 223 KB, lossless (page and viewer)<br>2480×1098, 242 KB, near-lossless<br>1860×823, 170 KB, near-lossless<br>1240×549, 94 KB, near-lossless<br>960×425, 61 KB, near-lossless |
| `conflict-m` | Phone crop of `conflict`: the two WARNING sessions in room HB1.02, Wednesday 10:00-12:00 | 4K demo footage: `01-room-conflict/stills/01-room-conflict_03_6.05s_the-clash-DSAI503-and-ISBA601-both-in-HB1-02.png` | 816×610 at 1076,990 | 816×610, 48 KB, lossless<br>560×419, 47 KB, near-lossless |
| `suggest-fixes` | A coordinated fix that moves three sessions together: fixes 1 problem, creates none | 4K demo footage: `680` | 2000×1820 at 1690,0 | 2000×1820, 127 KB, lossless (page and viewer)<br>1360×1238, 170 KB, near-lossless<br>1020×928, 115 KB, near-lossless<br>680×619, 67 KB, near-lossless |
| `suggest-fixes-m` | Phone crop of `suggest-fixes`: the coordinated fix in the Activity Inspector, with Apply | 4K demo footage: `02-coordinated-fix/stills/02-coordinated-fix_05_12.23s_read-three-sessions-move-together-fixes-1-problem-creates-no.png` | 740×780 at 2944,1030 | 740×780, 30 KB, lossless<br>520×548, 38 KB, near-lossless |
| `fix-preview` | The coordinated fix previewed on the grid, the old slot dashed | 4K demo footage: `02-coordinated-fix/stills/02-coordinated-fix_09_29.77s_preview-DSAI704-on-Thursday-13-00-NSEC705-old-slot-dashed.png` | 3700×2112 at 140,0 | 3700×2112, 244 KB, lossless (viewer)<br>960×548, 41 KB, lossy q85 |
| `clean-v3` | After Apply: Version 3, 0 findings, current and clean; the changed session marked EDITED | 4K demo footage: `02-coordinated-fix/stills/02-coordinated-fix_12_41.95s_top-Version-3-0-findings-current-and-clean.png` | whole frame | 3840×2160, 261 KB, lossless (viewer)<br>960×540, 36 KB, lossy q85 |
| `view-week` | Week view: Monday to Friday side by side | 4K demo footage: `R01d-week-view/stills/R01d-week-view_04_31.47s_Week-view-clean-plate.png` | whole frame | 3840×2160, 289 KB, lossless (viewer)<br>960×540, 36 KB, lossy q85 |
| `view-stage` | Stage view: one Stage across the whole week | 4K demo footage: `R01c-stage-view/stills/R01c-stage-view_02_8.00s_Stage-view-S1-Monday-to-Friday.png` | whole frame | 3840×2160, 142 KB, lossless (viewer)<br>960×540, 28 KB, lossy q85 |
| `view-inspector` | The Activity Inspector beside the grid: when and where, who, the Module | 4K demo footage: `R01e-activity-inspector/stills/R01e-activity-inspector_03_10.28s_the-Activity-Inspector-beside-the-grid-When-where-Who-Module.png` | whole frame | 3840×2160, 262 KB, lossless (viewer)<br>960×540, 32 KB, lossy q85 |
| `drag-drop` | A session dropped at 15:00-17:00; the editor shows the new time before Apply | 4K demo footage: `R06a-drag-and-drop/stills/R06a-drag-and-drop_06_27.45s_dropped-at-15-00-17-00-the-editor-shows-the-new-time.png` | whole frame | 3840×2160, 260 KB, lossless (viewer)<br>960×540, 30 KB, lossy q85 |
| `split` | Split 4 h into 2 x 2 h, previewed before Apply split | 4K demo footage: `420` | 1080×1720 at 2620,0 | 1080×1720, 55 KB, lossless (page and viewer)<br>840×1338, 90 KB, near-lossless<br>420×669, 31 KB, near-lossless |
| `split-m` | Phone crop of `split`: the original 4-hour session and the two 2-hour sessions after the split | 4K demo footage: `R06b-split-session/stills/R06b-split-session_05_21.22s_preview-Session-1-08-00-10-00-and-Session-2-10-00-12-00-same.png` | 940×1020 at 2696,300 | 940×1020, 27 KB, lossless<br>640×694, 32 KB, near-lossless |
| `merge` | The Merge dialog: 14 + 12 = 26 students, same Tutor, a room that fits | 4K demo footage: `420` | 1120×2080 at 1360,40 | 1120×2080, 66 KB, lossless (page and viewer)<br>840×1560, 88 KB, near-lossless<br>420×780, 37 KB, near-lossless |
| `merge-m` | Phone crop of `merge`: the merge preview, 14 + 12 = 26 students, the same Tutor, 30 seats | 4K demo footage: `R06c-merge-streams/stills/R06c-merge-streams_10_37.02s_preview-Thursday-15-00-17-00-14-12-26-students-same-Tutor-HB.png` | 1080×850 at 1380,1240 | 1080×850, 29 KB, lossless<br>720×567, 33 KB, near-lossless |
| `history` | History: Version 3 and the three changes it made | 4K demo footage: `430` | 1120×2080 at 1360,40 | 1120×2080, 73 KB, lossless (page and viewer)<br>860×1597, 126 KB, near-lossless<br>430×799, 53 KB, near-lossless |
| `history-m` | Phone crop of `history`: Version 3, its note and the three changes from Version 2 | 4K demo footage: `03-history/stills/03-history_03_9.52s_Version-3-the-three-changes-of-the-coordinated-fix.png` | 1056×1110 at 1392,270 | 1056×1110, 47 KB, lossless<br>720×757, 76 KB, near-lossless |
| `export-dialog` | Export: the exact saved Version as a Change Review workbook, 100 rows, 4 changed | 4K demo footage: `340` | 1160×860 at 1340,650 | 1160×860, 44 KB, lossless (page and viewer)<br>680×504, 32 KB, near-lossless<br>340×252, 13 KB, near-lossless |
| `print-dialog` | Print: an A4 landscape PDF by day, made in the browser, 5 pages | 4K demo footage: `R07b-print-pdf/stills/R07b-print-pdf_03_8.05s_PDF-made-By-day-all-teaching-weeks-A4-landscape-5-pages.png` | 2480×2090 at 680,36 | 2480×2090, 144 KB, lossless (viewer)<br>960×809, 46 KB, lossy q85 |
| `pdf-day` | Page 1 of a PDF by day, as the app makes it | 4K demo footage: `650` | whole frame | 2800×1980, 313 KB, near-lossless (viewer)<br>1950×1379, 199 KB, near-lossless<br>1300×919, 121 KB, near-lossless<br>975×689, 82 KB, near-lossless<br>650×460, 46 KB, near-lossless |
| `pdf-day-m` | Phone crop of `pdf-day`: the page title and the first three Stages, 08:00-12:00 | 4K demo footage: `_assets/pdf/CFIT_PDF_by-day_Version3_page1_400dpi.png` | 1730×1480 at 140,140 | 1200×1027, 86 KB, near-lossless<br>720×616, 46 KB, near-lossless |
| `film-poster` | The film's end card over the fixed timetable | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov`, frame 5970 | whole frame | 1920×1080, 70 KB, lossy q90 |
| `og-card` | Link preview card | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov`, frame 5970 | 3840×2010 at 0,40 | 1200×630, 43 KB, JPEG |

Also in `assets/img/`: `drag-loop-poster-1600.webp` and `drag-loop-mobile-poster-712.webp` (the loops' first
frames, 1600×1014, 86 KB and 712×1060, 45 KB),
`favicon.svg` and `apple-touch-icon.png` (a mark drawn for the showcase; not a Wintec logo), and
`tech-marks.svg` (see below).

## Video

| File | What | Source | Encoding | Size |
|---|---|---|---|---|
| `assets/video/cfit-product-film-1080p60.mp4` | The approved product film, Cinematic v4.1, 100.82 s: the default, and the fallback everywhere | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov` (ProRes 422 HQ, 3840×2160, 60 fps, 10-bit) for the picture; `CFIT_Trailer_FINAL_4K60_EVENT_H264.mp4` for the sound (the event mix) | H.264 High (avc1), 1920×1080, 60 fps, yuv420p, 2.08 Mbit/s; AAC 248 kbit/s, copied | 28.1 MB |
| `assets/video/cfit-product-film-2160p60-av1.mp4` | The same film in native 4K60 (no scaling): Chrome, Edge, Firefox, and Apple devices with AV1 | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov` (ProRes 422 HQ, 3840×2160, 60 fps, 10-bit) for the picture; `CFIT_Trailer_FINAL_4K60_EVENT_H264.mp4` for the sound (the event mix) | AV1 Main (av01), 3840×2160, 60 fps, yuv420p10le, 5.53 Mbit/s; AAC 248 kbit/s, copied | 69.6 MB |
| `assets/video/cfit-product-film-2160p60-hevc.mp4` | The same film in native 4K60 (no scaling): Safari | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov` (ProRes 422 HQ, 3840×2160, 60 fps, 10-bit) for the picture; `CFIT_Trailer_FINAL_4K60_EVENT_H264.mp4` for the sound (the event mix) | HEVC Main 10 (hvc1), 3840×2160, 60 fps, yuv420p10le, 6.94 Mbit/s; AAC 248 kbit/s, copied | 86.5 MB |
| `assets/video/drag-loop.mp4` | A session dragged from 10:00 to 15:00 on Wednesday; the editor's times follow | 4K demo footage: `R06a-drag-and-drop/R06a-drag-and-drop_4K60_H264.mp4`, 19.4–26.0 s, crop 3060×1940 at 640,0 | H.264 High, 1600×1014, 30 fps, CRF 26, no sound; a 1 s hold on the last frame, then a 0.5 s cross-fade back to the first | 215 KB |
| `assets/video/drag-loop-mobile.mp4` | The same drag, cut for phones: the S2 and S3 columns from 10:00 to 17:00 | the same clip, crop 712×1060 at 998,370 | H.264 High, 712×1060, 30 fps, CRF 26, no sound; the same hold and cross-fade | 160 KB |
| `assets/video/chapters.vtt` | The film's eight chapters | the Cinematic v4.1 shot manifest | WebVTT | — |

All three films come from the same ProRes master, with the same edit, the same 100.82 s, the same keyframe every 2 s
(so chapters seek quickly), Rec.709 tags and the same AAC event mix copied unchanged, so chapter times and sound
sync are identical. The 4K files keep the master's 10 bits per channel (4:2:0), which avoids banding in the dark
gradients. Fast start (the index at the front) on all three.

**Which file plays.** The page offers 1080p by default and the quality control (Auto, 1080p, 4K UHD) under the
player. 4K is AV1 where the browser decodes AV1, otherwise HEVC, checked with `canPlayType` and the Media
Capabilities API. Auto picks 4K only for a large or high-density screen (the player at 1,700 device pixels or more, or a
screen at least 2,560 device pixels on its long side), with a mouse or trackpad, a connection not flagged as slow or
metered, and a decoder reported as smooth. Phones stay on 1080p unless the visitor chooses 4K. If a 4K file fails to
decode, the film continues in 1080p at the same moment. Nothing downloads before the visitor presses play.

**How the 4K settings were chosen.** A 10-second, text-heavy clip of the master (36–46 s: the room clash and the
Validation findings) was encoded with each candidate and compared with the master at 3840×2160 (VMAF 4K model, SSIM,
PSNR), then 100% crops of small interface text were inspected by eye:

| Candidate | Bitrate on the clip | Whole film (estimate) | VMAF | SSIM | PSNR |
|---|---|---|---|---|---|
| h264 crf18 slow | 10.79 Mbit/s | about 139 MB | 99.84 | 0.9971 | 50.0 dB |
| h264 crf21 slow | 6.81 Mbit/s | about 89 MB | 99.46 | 0.9969 | 48.2 dB |
| hevc10 crf20 slow | 9.59 Mbit/s | about 124 MB | 99.95 | 0.9987 | 53.3 dB |
| hevc10 crf23 slow | 6.77 Mbit/s | about 88 MB | 99.79 | 0.9981 | 51.2 dB |
| av1 10 crf28 cpu6 | 4.12 Mbit/s | about 55 MB | 99.97 | 0.9987 | 52.5 dB |
| av1 10 crf34 cpu6 | 2.89 Mbit/s | about 40 MB | 99.92 | 0.9982 | 50.5 dB |

The clip is calmer than the whole film, so the estimates are low: the published files are 69.6 MB (AV1) and 86.5 MB (HEVC, encoded at CRF 24). The whole film, as published, against the master (VMAF on every 6th frame):

| File | VMAF | SSIM | PSNR (lowest frame) |
|---|---|---|---|
| 4K AV1 | 99.92 | 0.9987 | 51.1 dB (42.2) |
| 4K HEVC | 99.56 | 0.9978 | 48.8 dB (38.5) |
| 1080p H.264 shown at 4K | 89.88 | 0.9818 | 35.4 dB (25.9) |

AV1 at CRF 28 is indistinguishable from the master at 100% and the smallest; HEVC at CRF 24 keeps Safari in 4K within
GitHub's 100 MiB file limit. A 4K H.264 file would add about 90 MB for no browser that AV1 and HEVC do not already
cover, so the 1080p H.264 film is the compatibility fallback. NVENC hardware encoding was not usable (the GPU driver is
older than this FFmpeg needs).

## Hosting

Everything is served by GitHub Pages from this repository, at the poster's address. Each 4K file is under GitHub's
100 MiB limit (no Git LFS). Pages serves MP4 as `video/mp4` over HTTPS and answers range requests (206), so
the player can seek without downloading the whole file. A full 4K view transfers about 69.6 MB (AV1) or
86.5 MB (HEVC); GitHub Pages has a soft bandwidth limit of 100 GB a month, enough for well over a thousand
full 4K views on top of the 1080p ones.

## Technology marks and the image viewer

- `assets/img/tech-marks.svg` (16 KB): one SVG sprite with the marks of React, TypeScript, OpenJDK (for Java),
  Spring Boot, PostgreSQL, Docker, GitHub Actions and nginx, from Simple Icons 16.36.0 (CC0 1.0). The trademarks belong
  to their owners; the page uses them only to name the technologies the product is built with, in one colour. Simple
  Icons has no Playwright mark, so Playwright has a plain custom glyph (a browser window with a tick), not a logo.
- `assets/vendor/photoswipe/`: PhotoSwipe 5.4.4 by Dmytro Semenov (MIT, `LICENSE.txt`), the image viewer, copied from
  npm by `npm run vendor`. It is loaded only when a picture is first opened.

## Fonts

`assets/fonts/inter-latin-var.woff2` (71 KB): Inter 4, variable weight and optical size, Latin subset, from
`@fontsource-variable/inter` 5.3.0, under the SIL Open Font License 1.1 (`assets/fonts/LICENSE-Inter.txt`).

## Totals

Pictures, video, fonts and the viewer: 192.4 MB, of which the films are 184.3 MB (1080p 28.1 MB, 4K AV1
69.6 MB, 4K HEVC 86.5 MB) and the viewer copies 2.1 MB. A visitor downloads one film at most, and only
by pressing play. A first visit, before scrolling or playing anything, loads the HTML, the stylesheet, the script, the
font, the technology marks, the film's poster and the hero picture in the size the screen needs.

## Left out on purpose

- **The poster** (A2 PDF): its footer has personal e-mail addresses, the Wintec logo and a QR code. The showcase takes
  its colours and type from it instead.
- **The Wintec logo**: using it needs brand permission.
- **The 4K masters** and the ProRes intermediate (10 GB): far too large; they stay outside Git.
- **Screens of the live system** and the real workbooks: never.
