# Asset inventory

Every picture and video on the showcase, where it comes from and how it was made. Rebuild them with
`tools/build-media.mjs` (see the README); the cuts are defined in `tools/media-manifest.json`.

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

Lanczos scaling, then WebP (quality 88, method 6). Crop = width×height at x,y in the 3840×2160 source frame.

| Id | Shows | Source | Crop | Files in `assets/img/` |
|---|---|---|---|---|
| `hero-day` | Day view right after an import: one column per Stage, 0 findings | 4K demo footage: `R01a-overview-plate/stills/R01a-overview-plate_01_4.00s_Monday-Day-view-clean-timetable.png` | whole frame | 2400×1350, 144 KB<br>1600×900, 84 KB<br>960×540, 37 KB |
| `before-workbooks` | The three synthetic demonstration workbooks a term starts from (the film's opening shot, caption left out) | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov`, frame 330 | 3440×1560 at 200,150 | 2000×906, 268 KB<br>1200×544, 126 KB<br>720×326, 52 KB |
| `import-check` | Import, Check step: 99 source rows, 0 errors, 0 warnings, nothing saved yet | 4K demo footage: `R02-import/stills/R02-import_04_18.87s_Check-99-source-rows-67-Activities-95-scheduled-sessions-CFI.png` | 2794×1833 at 528,250 | 1600×1050, 87 KB<br>960×630, 42 KB |
| `import-confirm` | Import, Confirm step: what will happen; nothing is saved until you confirm | 4K demo footage: `R02-import/stills/R02-import_08_36.78s_Confirm-what-will-happen-nothing-is-saved-until-you-confirm.png` | 2794×1680 at 528,480 | 1600×962, 74 KB<br>960×578, 35 KB |
| `conflict` | Validation findings: two rooms double-booked; the clashing sessions marked WARNING on the grid | 4K demo footage: `01-room-conflict/stills/01-room-conflict_03_6.05s_the-clash-DSAI503-and-ISBA601-both-in-HB1-02.png` | 3840×1700 at 0,0 | 2000×886, 98 KB<br>1200×532, 48 KB<br>720×318, 22 KB |
| `suggest-fixes` | A coordinated fix that moves three sessions together: fixes 1 problem, creates none | 4K demo footage: `02-coordinated-fix/stills/02-coordinated-fix_05_12.23s_read-three-sessions-move-together-fixes-1-problem-creates-no.png` | 2000×1820 at 1690,0 | 1600×1456, 115 KB<br>960×874, 58 KB |
| `fix-preview` | The coordinated fix previewed on the grid, the old slot dashed | 4K demo footage: `02-coordinated-fix/stills/02-coordinated-fix_09_29.77s_preview-DSAI704-on-Thursday-13-00-NSEC705-old-slot-dashed.png` | 3700×2112 at 140,0 | 2000×1142, 128 KB<br>1200×684, 60 KB<br>720×410, 27 KB |
| `clean-v3` | After Apply: Version 3, 0 findings, current and clean; the changed session marked EDITED | 4K demo footage: `02-coordinated-fix/stills/02-coordinated-fix_12_41.95s_top-Version-3-0-findings-current-and-clean.png` | whole frame | 1600×900, 87 KB<br>960×540, 39 KB |
| `view-week` | Week view: Monday to Friday side by side | 4K demo footage: `R01d-week-view/stills/R01d-week-view_04_31.47s_Week-view-clean-plate.png` | whole frame | 1600×900, 86 KB<br>960×540, 39 KB |
| `view-stage` | Stage view: one Stage across the whole week | 4K demo footage: `R01c-stage-view/stills/R01c-stage-view_02_8.00s_Stage-view-S1-Monday-to-Friday.png` | whole frame | 1600×900, 68 KB<br>960×540, 30 KB |
| `view-inspector` | The Activity Inspector beside the grid: when and where, who, the Module | 4K demo footage: `R01e-activity-inspector/stills/R01e-activity-inspector_03_10.28s_the-Activity-Inspector-beside-the-grid-When-where-Who-Module.png` | whole frame | 1600×900, 77 KB<br>960×540, 34 KB |
| `drag-drop` | A session dropped at 15:00-17:00; the editor shows the new time before Apply | 4K demo footage: `R06a-drag-and-drop/stills/R06a-drag-and-drop_06_27.45s_dropped-at-15-00-17-00-the-editor-shows-the-new-time.png` | whole frame | 1600×900, 73 KB<br>960×540, 33 KB |
| `split` | Split 4 h into 2 x 2 h, previewed before Apply split | 4K demo footage: `R06b-split-session/stills/R06b-split-session_05_21.22s_preview-Session-1-08-00-10-00-and-Session-2-10-00-12-00-same.png` | 1080×1720 at 2620,0 | 1080×1720, 68 KB<br>640×1020, 36 KB |
| `merge` | The Merge dialog: 14 + 12 = 26 students, same Tutor, a room that fits | 4K demo footage: `R06c-merge-streams/stills/R06c-merge-streams_10_37.02s_preview-Thursday-15-00-17-00-14-12-26-students-same-Tutor-HB.png` | 1120×2080 at 1360,40 | 1120×2080, 90 KB<br>640×1188, 46 KB |
| `history` | History: Version 3 and the three changes it made | 4K demo footage: `03-history/stills/03-history_03_9.52s_Version-3-the-three-changes-of-the-coordinated-fix.png` | 1120×2080 at 1360,40 | 1120×2080, 111 KB<br>640×1188, 59 KB |
| `export-dialog` | Export: the exact saved Version as a Change Review workbook, 100 rows, 4 changed | 4K demo footage: `R07a-export-excel/stills/R07a-export-excel_03_8.07s_Export-timetable-the-exact-saved-Version-3-100-rows-ready.png` | 1160×860 at 1340,650 | 1160×860, 32 KB<br>640×474, 17 KB |
| `print-dialog` | Print: an A4 landscape PDF by day, made in the browser, 5 pages | 4K demo footage: `R07b-print-pdf/stills/R07b-print-pdf_03_8.05s_PDF-made-By-day-all-teaching-weeks-A4-landscape-5-pages.png` | 2480×2090 at 680,36 | 1600×1348, 100 KB<br>960×810, 48 KB |
| `pdf-day` | Page 1 of a PDF by day, as the app makes it | 4K demo footage: `_assets/pdf/CFIT_PDF_by-day_Version3_page1_400dpi.png` | whole frame | 1600×1132, 126 KB<br>960×678, 61 KB |
| `film-poster` | The film's end card over the fixed timetable | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov`, frame 5970 | whole frame | 1920×1080, 60 KB |
| `og-card` | Link preview card | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov`, frame 5970 | 3840×2010 at 0,40 | 1200×630, 58 KB |

Also in `assets/img/`: `drag-loop-poster-1600.webp` (the loop's first frame, 1600×1014, 86 KB),
`favicon.svg` and `apple-touch-icon.png` (a mark drawn for the showcase; not a Wintec logo).

## Video

| File | What | Source | Encoding | Size |
|---|---|---|---|---|
| `assets/video/cfit-product-film-1080p60.mp4` | The approved product film, Cinematic v4.1, 100.82 s | Trailer delivery: `work/CFIT_Trailer_v4_1_2160p60_master.mov` (ProRes 422 HQ, 3840×2160, 60 fps) for the picture; `CFIT_Trailer_FINAL_4K60_EVENT_H264.mp4` for the sound (the event mix, copied unchanged) | H.264 High, 1920×1080, 60 fps, CRF 25 (2.08 Mbit/s), a keyframe every 2 s, BT.709, fast start; AAC stereo 248 kbit/s | 28.1 MB |
| `assets/video/drag-loop.mp4` | A session dragged from 10:00 to 15:00 on Wednesday; the editor's times follow | 4K demo footage: `R06a-drag-and-drop/R06a-drag-and-drop_4K60_H264.mp4`, 19.4–26.0 s, crop 3060×1940 at 640,0 | H.264 High, 1600×1014, 30 fps, CRF 26, no sound; a 1 s hold on the last frame, then a 0.5 s cross-fade back to the first | 215 KB |
| `assets/video/chapters.vtt` | The film's eight chapters | the Cinematic v4.1 shot manifest | WebVTT | — |

**Why the event mix:** the film has a review mix (−24.3 LUFS) and an event mix (−17 LUFS: the review mix with 7.3 dB of
gain and a peak limiter, the same balance). −17 LUFS is in the usual range for online video, so the film plays at a
level close to other videos. The music and effects were synthesised for the project from code, so they can be
published freely.

**Why 1080p60 in the repository:** the 4K files (250–290 MB) and the 1080p event file (105 MB) are too large for a Git
repository and for phones. The web copy keeps the edit's native 60 fps. Measured against the master, the UI text at
CRF 25 matches CRF 22 (SSIM 0.990 vs 0.991 on a text-heavy frame) at 70% of the size. The page loads it only when a
visitor presses play (`preload="none"`).

## Fonts

`assets/fonts/inter-latin-var.woff2` (71 KB): Inter 4, variable weight and optical size, Latin subset, from
`@fontsource-variable/inter` 5.3.0, under the SIL Open Font License 1.1 (`assets/fonts/LICENSE-Inter.txt`). The poster
uses Inter and Inter Display; the optical-size axis gives the display cut at large sizes.

## Totals

Pictures, video and fonts: 31.4 MB, of which the film is 28.1 MB. A first visit, before scrolling or
playing anything, loads the HTML, the stylesheet, the script, the font and the hero picture.

## Left out on purpose

- **The poster** (A2 PDF): its footer has personal e-mail addresses, the Wintec logo and a QR code. The showcase takes
  its colours and type from it instead.
- **The Wintec logo**: using it needs brand permission.
- **The 4K masters** and the ProRes intermediate: far too large; they stay outside Git.
- **Screens of the live system** and the real workbooks: never.
