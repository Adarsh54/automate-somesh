# Cuebook

A static, device-local cue sheet workspace. Live: https://adarsh54.github.io/automate-somesh/

## Run

Use Node.js 22.12+ (or 24): `npm ci`, then `npm run dev`. Open the printed `/automate-somesh/` URL. `npm test` checks timing and credit validation; `npm run build` creates `dist/`.

## Workflow

1. **Movie matching (experimental):** upload the finished movie and actual cue recordings used in it. The app decodes the movie's primary audio track, searches for supplied recordings and proposes each matching region's film in/out timecodes. Repeated uses and trimmed excerpts are supported within the limits below. No external catalog or server upload is involved.
2. **Audio with offset:** upload music-only audio exports, set each file's starting film timecode and detect regions separated by silence. This detects sound/silence in a known music-only input, not music versus dialogue. Quiet tails/noise depend on the threshold; short internal gaps can be merged.
3. **Manual:** enter film timecodes directly or mark in/out during cue playback. Marks add that audio file's film-start offset.

All workflows share production metadata, cue titles, usage, composer/publisher credits, PRO/IPI/shares, review and BMI XLSX export. Original/sourced is optional provenance, never inferred ownership. Each role's shares must total 100%. Automatic results need review before export; one confirmation action is available after reviewing the list. Cue titles can be edited separately for each detected region.

Metadata, credits and placements persist in localStorage. Media, low-rate samples and previews are session-only and need reattachment after reload. Audio reattachment checks filename/duration, not cryptographic identity. Reattaching/replacing a movie requires rerunning its matching before those results can be exported. No accounts, backend storage or cross-device sync. Google Fonts supplies interface fonts; audio and project data are never sent there.

## Timecodes

Production start and **file start** are distinct. A file starting at `00:59:55:00` with a match at relative position 15 seconds produces `01:00:10:00` at 24 fps. Each offset/manual audio file can have its own start. Container timestamps preserve relative audio gaps but are never treated as editorial film timecode.

The selected path controls the sequence and visible fields:

- Movie: upload first, then review derived title (filename), duration, frame rate and origin summaries. Reference uploads appear after the movie. Supported **single-sample QuickTime `tmcd`** tracks supply genuine embedded timecode and its rate. The parser rejects counter formats, ambiguous/multiple timecode tracks, unsupported rates and shifted/discontinuous edit lists. Other embedded timecode formats are not supported. Constant video rate is detected by scanning frame timestamps; VFR/unsupported rate uses an explicitly labeled 24 fps timecode-grid fallback. When supported embedded timecode is absent, origin is explicitly **assumed file-relative 00:00:00:00**, not a claim about film timecode. One optional timing editor changes the file origin/rate and excludes pre-roll/tail. Full-file duration/start is the initial production assumption, visibly stated and editable.
- Offset: upload music, then set each file's start in a visible list; source durations are automatic. Full show duration and full production start remain unknown. Silence controls are optional disclosures.
- Manual: upload, then enter film in/out (cue duration is calculated) or optionally specify an offset for playback marks. No matching/silence settings.

Movie-derived title/length/origin are not carried into audio-only paths. Explicitly entered project metadata stays shared. Replacing a movie resets per-file timing overrides; returning to the same name/size/modification-time profile restores them. This identity is a convenience, not cryptographic verification. Audio and placements remain shared and are not deleted by switching paths. Frame rate is a shared project grid, so changes convert existing cue positions to preserve elapsed time.

Supported rates: 24, 25, 30, 24000/1001 (23.976 non-drop), 30000/1001 (29.97 non-drop), and 29.97 drop-frame. Use `HH:MM:SS:FF`; drop-frame accepts a semicolon before frames and rejects nonexistent frame labels. Changing rate converts positions to preserve elapsed time and clears automatic timing reviews. Changing a detected file's offset shifts its results and clears reviews. Bounds are checked relative to production start, not midnight. Midnight rollover is outside demo scope.

Detections are rounded to the nearest project frame, but analysis is not frame-accurate: matching traces 100 ms blocks; sound/silence uses 20 ms blocks. Review fades, transitions and boundaries.

## BMI template

Source: https://www.bmi.com/creators/what_is_a_cue_sheet

Original XLSX: https://cdn.bmi.com/forms/rapidcue/Cue_Sheet_Template_2016V3-6-5.xlsx (retrieved September 15, 2026).

`public/bmi-cue-sheet-template.xlsx` is the unmodified reference. Export preserves BMI's template, styling, validations and hidden lookup sheet, filling A–R from row 20 with one contributor per row (maximum 980 rows). Calculated fields are stored as numeric values to avoid dependence on Excel-specific formulas. Shares retain percentage formatting. Because BMI has no frame columns, its clock labels and durations round to whole seconds. Rounded totals may differ from exact totals. An added **Frame timings** worksheet preserves full timecodes, rate, elapsed durations, file offsets, detected relative boundaries, review state and signal similarity.

Export requires a production title, valid cue timings/usages, complete contributor credits and reviewed automatic timings. Company/full show duration and contact details are collected at final review, not upfront. Unknown production fields cause explicit **draft-export warnings** and are left blank in the workbook; a music-only file's duration is never substituted for show duration. Complete applicable BMI production details before submission. Airdate, episode details and other optional metadata are in a disclosure. The result is a review draft, not automatic submission or guaranteed BMI acceptance.

## Analysis implementation and limits

- `src/media.js`: Mediabunny demuxing and browser audio decoding. Audio is streamed in chunks and reduced to mono at 2 kHz using time-bin averaging. Full-rate movie PCM is not retained. Uses the primary audio track; video frames are not analyzed.
- `src/analysis.js`: mean-normalized waveform cross-correlation using FFTs, then local correlation to trace matching regions. Handles gain changes and polarity inversion. At most 16 two-second anchors per reference and 100 candidate alignments bound long-reference work. Excerpts must overlap a usable anchor; references over about 32 seconds are searched more sparsely.
- `src/analysis.worker.js`: cancellable worker for matching and silence detection. Progress describes actual decoding or current reference/anchor work. Cancellation keeps previous results.
- `src/timecode.js`: frame arithmetic, drop/non-drop parsing, offsets and export clock conversion.
- `src/metadata.js` / `src/project.js`: bounded QuickTime timecode reading, rate inference/fallback, path-specific effective production values, per-file overrides and draft validation. QuickTime format source: https://developer.apple.com/documentation/quicktime-file-format/timecode_sample_description . Frame metrics: https://mediabunny.dev/guide/reading-media-files . Creation timestamps and unrelated metadata are never used as film origins.

Use the same recording at original speed/pitch with reasonably audible music. Heavy masking, different mixes, EQ, retiming, short fragments, edits or stereo cancellation may cause missed/fragmented matches. Repetitive tones and similar recordings can produce false candidates. Similarity is a correlation measurement, **not a probability**. This is real signal analysis but does not guarantee every occurrence; review against the movie and correct when needed.

Desktop Chrome is recommended. MP4/AAC and PCM WAV were tested; WebM/Opus and other formats depend on browser codec support. Corrupt/unsupported media or a missing audio track produces an error. Each file is capped at 20 minutes. Memory/work grow with movie length and reference count; use a desktop for larger projects.

## Verification

`npm test` covers silence, repeated/trimmed matches under additive noise, unrelated audio rejection, timecodes, pre-roll, fractional rates, drop-frame transitions and credit/placement validation.

Generate deterministic non-copyrighted integration media using Python and ffmpeg:

```sh
python scripts/generate-fixtures.py /tmp/cuebook-fixtures /path/to/ffmpeg
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/browser-check.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/metadata-browser-check.cjs
```

`CUEBOOK_URL` targets another deployment; `FIXTURES` overrides the fixture folder. Chrome runs in an isolated test profile. The script exercises actual 10-minute MP4/AAC decoding, repeated uses, a trimmed excerpt, a no-match reference, all three workflows, offsets, credits/review/export, persistence, mobile layout and browser errors. Generated media/workbooks stay outside the repository.

Metadata/UX verification additionally covers actual 24/25 fps and drop-frame embedded-timecode MOVs, variable-rate MP4, inferred summaries, no upfront duplicate timing fields, independent offsets, switching paths, file replacement/restored overrides, and draft XLSX with genuinely unknown show duration. Unit tests exercise inference, provenance isolation, pre-roll, invalid timing and unknown bounds.

Local measurement on September 15, 2026: three references (8s, 5s, 6s) against a 10-minute synthetic MP4 found all five expected placements and no match for the unrelated reference. Signal processing took approximately **1.5 seconds**; upload/decode/analyze flow took **2.4 seconds**. This is a synthetic baseline on this machine, not a guarantee for arbitrary movies/hardware. Boundaries passed a 0.2-second tolerance. The downloaded workbook was separately parsed to verify clock times, durations, totals, shares and the Frame timings sheet.

## GitHub Pages

Vite is configured for `/automate-somesh/`. `.github/workflows/pages.yml` builds, tests and deploys the static output on pushes to `master` or manual dispatch.

The repository is public with the owner’s explicit authorization, and Pages uses GitHub Actions as the build source. Site URL: https://adarsh54.github.io/automate-somesh/

GitHub Pages serves the static application publicly. Uploaded audio and entered metadata stay local in this app.

## Dependency notices

Mediabunny is MPL-2.0; unmodified source/license: https://github.com/Vanilagy/mediabunny (version in lockfile). JSZip is used under MIT: https://github.com/Stuk/jszip. Their npm packages contain license files. The matching algorithm uses no external catalog data.
