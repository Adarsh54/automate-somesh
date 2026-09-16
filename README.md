# Cuestamp

A Vite cue sheet workspace with a small Vercel Functions API. Live: https://cuestamp.com/

## Run

Use Node.js 22.12+ (or 24): `npm ci`, configure the development services in [SETUP.md](SETUP.md), then run `npm run dev:api` and `npm run dev`. Open the printed local URL. `npm test` checks timing and credit validation; `npm run build` creates `dist/`.

## Hosting

Vercel uses the checked-in `vercel.json`: install with `npm ci`, run tests and the Vite build, then serve `dist/`. Connect this GitHub repository with `master` as the production branch for automatic deployments; other branches produce previews.

The default asset base is `/`. The GitHub Pages workflow publishes a redirect to Cuestamp; processing requires the Vercel backend.

Local drafts remain in browser localStorage, scoped to the site's origin. Moving to a new domain does not transfer saved project details from the old domain. Audio processing runs in Vercel Functions for both guests and signed-in users. Originals and temporary PCM use private Vercel Blob.

## Backend API

- `GET /api/health`: service health/version (does not claim database readiness).
- `POST /api/validate`: JSON project validation; returns `{valid, issues, warnings}`. A structurally valid but incomplete cue sheet returns HTTP 200 with `valid: false`; malformed shapes return 400, unsupported media types 415, wrong methods 405, and bodies above 1 MiB 413.
- Request fields: `production`, `mode`, `tracks`, `cues`, `sharedCueDetails`, and optional `movieOffset`, `movieMetadata`, `movieOverrides`. See `src/api-client.js` for the minimal payload and `server/services/validate-project.js` for the schema.
- `api/`: thin Vercel HTTP entry points. `server/`: parsing/schema validation and services. `src/domain/review.js`: platform-independent business rules shared with the frontend.
- Health and validation are public, stateless endpoints. Saved-project routes require WorkOS authentication and enforce ownership on every query. Media routes authorize direct uploads to private Vercel Blob and short-lived downloads.
- Vercel enables server validation before export via `VITE_API_ENABLED=true` in the build command. This flag controls export validation; audio processing always requires the backend. If the server check fails, export shows a retryable error and retains edits.
- Local full-stack development: run `npm run dev:api` and, in another terminal, `VITE_API_ENABLED=true npm run dev`. Vite proxies `/api` to port 3001. Guest processing also requires configured development Neon, Blob and session credentials.
- Analysis has a 300-second function limit (Fluid Compute); other routes remain at 10 seconds. Decoding runs once per file, matching once per reference. Neon enforces daily request quotas and a single active processing lease per browser session.

## Workflow

1. **Movie matching (experimental):** upload the finished movie and actual cue recordings used in it. The app decodes the movie's primary audio track, searches for supplied recordings and proposes each matching region's film in/out timecodes. Repeated uses and trimmed excerpts are supported within the limits below. No external catalog is involved; media is uploaded privately before processing, including for guests.
2. **Audio with offset:** upload music-only audio exports, set each file's starting film timecode and detect regions separated by silence. This detects sound/silence in a known music-only input, not music versus dialogue. Quiet tails/noise depend on the threshold; short internal gaps can be merged.
3. **Manual:** enter film timecodes directly or mark in/out during cue playback. Marks add that audio file's film-start offset.

All workflows share production metadata, cue titles, usage, composer/publisher credits, PRO/IPI/shares, review and BMI XLSX export. The main Find your cues page starts with the full composer/publisher form. The four sidebar steps are Find your cues, Timings & usage, Production details, and Review & export. It provides common provenance and writer/publisher credits before or after detection. New cues inherit these values live. Each cue can override provenance or the entire credit list independently and reset either group to shared. Titles, timings and usage remain cue-specific. Existing saved cue values migrate conservatively as overrides; no legacy edits are overwritten. Provenance is optional and never inferred ownership. Unchanged, uniquely matched source segments keep overrides and IDs on rerun (including after clearing results); changed or ambiguous segments require review. Validation and BMI credit rows use effective shared/overridden values; Frame timings also records effective provenance. Text edits save on input without rebuilding the focused form. Each role's shares must total 100%. Automatic results need review before export; one confirmation action is available after reviewing the list. Cue titles can be edited separately for each detected region.

Metadata, credits and placements persist in localStorage. Anonymous media needs reattachment after reload. Saved account media is restored from private Blob storage and processed on the server. Audio reattachment checks filename/duration, not cryptographic identity. Reattaching/replacing a movie requires rerunning its matching before those results can be exported. When configured, WorkOS accounts can explicitly save private projects in Neon. Guest cue-sheet drafts remain local; their media is temporarily uploaded for analysis. See [account setup](SETUP.md). On Vercel, export sends selected cue-sheet details to a stateless validation API; media, IPI values, archives and media profiles are excluded. Google Fonts supplies interface fonts; audio and project data are never sent there.

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

- `server/audio-processing.js`: native FFmpeg/ffprobe decode from a short-lived Blob URL to mono 2 kHz PCM. Full-rate PCM is not retained; timestamps and channel averaging preserve relative placement.
- `src/analysis.js`: mean-normalized waveform cross-correlation using FFTs, then local correlation to trace matching regions. Handles gain changes and polarity inversion. At most 16 two-second anchors per reference and 100 candidate alignments bound long-reference work. Excerpts must overlap a usable anchor; references over about 32 seconds are searched more sparsely.
- `src/backend-analysis.js`: private uploads and sequential server requests. `server/analysis-thread.js` runs the matching algorithm in a terminable Node worker. Cancellation stops the browser run and keeps prior cues; a server request already running may finish within its time limit.
- `src/timecode.js`: frame arithmetic, drop/non-drop parsing, offsets and export clock conversion.
- `src/metadata.js` / `src/project.js`: bounded QuickTime timecode reading, rate inference/fallback, path-specific effective production values, per-file overrides and draft validation. QuickTime format source: https://developer.apple.com/documentation/quicktime-file-format/timecode_sample_description . Creation timestamps and unrelated metadata are never used as film origins.

Use the same recording at original speed/pitch with reasonably audible music. Heavy masking, different mixes, EQ, retiming, short fragments, edits or stereo cancellation may cause missed/fragmented matches. Repetitive tones and similar recordings can produce false candidates. Similarity is a correlation measurement, **not a probability**. This is real signal analysis but does not guarantee every occurrence; review against the movie and correct when needed.

Desktop Chrome is recommended. MP4/AAC and PCM WAV were tested; The server decoder supports WebM/Opus and other allowed media formats; browser codec support still affects playback. Corrupt/unsupported media or a missing audio track produces an error. Each file is capped at 20 minutes. Uploads depend on network speed. Very complex files can hit the processing timeout; use a shorter export if requested.

## Verification

`npm test` covers silence, repeated/trimmed matches under additive noise, unrelated audio rejection, timecodes, pre-roll, fractional rates, drop-frame transitions and credit/placement validation.

Generate deterministic non-copyrighted integration media and test native processing:

```sh
python scripts/generate-fixtures.py /tmp/cuestamp-fixtures /path/to/ffmpeg
node scripts/backend-audio-check.mjs
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/browser-backend-check.cjs
```

`FIXTURES` overrides the fixture folder. The native check uses a local range-capable HTTP server and real FFmpeg binaries; it checks a ten-minute movie, five repeated/trimmed placements, unrelated audio rejection, silence boundaries, variable frame rate and embedded timecode. The browser check uses mocked upload/API transport to verify integration, retry and cancellation without cloud credentials. Older browser scripts predate the server migration and need a configured backend or adapted fixtures.

Temporary processing assets expire after 24 hours. A daily authenticated Vercel cron deletes expired originals and PCM. Saved account originals have separate ownership records and are retained. Saving currently uploads a separate permanent copy; restoring it downloads for playback and uploads a temporary analysis copy.

## GitHub Pages

The legacy Pages address redirects to https://cuestamp.com/. A static Pages build cannot run the processing API.

## Dependency notices

Server FFmpeg binaries come from `ffmpeg-static` (GPL-3.0-or-later); ffprobe binaries come from `ffprobe-static`. Packages include their license notices. JSZip is used under MIT: https://github.com/Stuk/jszip. Their npm packages contain license files. The matching algorithm uses no external catalog data.
