# Local development

Cuestamp uses a Vite frontend and a small Node API that runs the same handlers as Vercel Functions. **Start both processes to test login and account features.** A frontend-only preview does not provide working authentication.

## Quick start on an already configured machine

Use Node.js 24 (the version used for local verification) and npm. From the repository root:

```sh
npm ci
```

Start the API in one terminal:

```sh
npm run dev:api
```

Start the frontend in another:

```sh
VITE_API_ENABLED=true npm run dev -- --port 5190 --strictPort
```

Open **http://127.0.0.1:5190/**. Vite proxies `/api` to **http://127.0.0.1:3001**. Keep the host and port exact: `localhost` and `127.0.0.1` are different cookie origins. `--strictPort` prevents Vite from silently moving to a port that WorkOS does not recognize.

## First-time configuration

Create `.env.local` in the repository root. This file is ignored by Git. The values below are placeholders; get credentials from the development services, never from the production environment.

```dotenv
APP_URL=http://127.0.0.1:5190
VITE_API_ENABLED=true
WORKOS_CLIENT_ID=<staging-client-id>
WORKOS_API_KEY=<staging-api-key>
SESSION_SECRET=<random-secret-at-least-32-characters>
DATABASE_URL=<neon-development-connection-string-with-TLS>
```

Generate a session secret with `openssl rand -base64 48` and save it as `SESSION_SECRET`. Keep it stable between restarts; changing it invalidates existing local sessions. Never commit credentials or prefix server secrets with `VITE_`, which exposes values to frontend code. The API startup command reads `.env.local`; Vite also reads it. Restart both processes after changing configuration.

### WorkOS

1. Select **Staging** in the Cuestamp WorkOS project.
2. Copy the staging application client ID and API key into `.env.local`.
3. Under the application's **Redirects**, allow this exact URI:
   `http://127.0.0.1:5190/api/auth?action=callback`
4. Ensure the authentication methods you want to test are enabled. Email/password is enabled in the existing staging environment.

Existing staging environment: `environment_01M2MF0JB2D5ME8DH5MKMRKWSZ`.

Staging users and sessions are separate from production. A production account does not automatically exist locally. Complete signup or a staging social-login flow when testing for the first time. Start each test from the app's Log in or Sign up button rather than reusing an old AuthKit URL; authorization state expires.

### Neon

Use the **local-development** branch of the **cuestamp** Neon project:

- Project: `damp-forest-37558489`
- Branch: `br-withered-violet-a5u6xm3o`

This branch was created from the production schema without production rows. Copy its connection string using the branch's Connect dialog and put it in `DATABASE_URL`. Keep the TLS parameters in the connection string.

For a new branch, or after pulling new migrations:

```sh
npm run db:migrate
```

Check the connection targets the development branch before migrating. Login also requires a working database because the callback creates or updates the user's profile.

### Media storage is a separate setup step

This machine has staging login, the development database, and the private **cuestamp-media-development** Blob store configured. The store is connected only to the Vercel Development environment.

- Small-file browser processing and manual cue editing work without Blob storage.
- Saving uploaded media to an account and processing files over 100 MB require the development store’s server-side `BLOB_READ_WRITE_TOKEN` in `.env.local`. Restart the API after adding or changing it.
- Matching against a large file also uploads its reference files.
- On another machine, pull the Vercel Development environment into a temporary file and copy its `BLOB_READ_WRITE_TOKEN` into `.env.local`, preserving your local WorkOS and Neon settings. Never print or commit that token. Do not reuse the production Blob token.

From a checkout linked to the Cuestamp Vercel project, download the development settings to an ignored file:

```sh
npx vercel env pull .env.blob-development.local --environment development
chmod 600 .env.blob-development.local
```

Copy only `BLOB_READ_WRITE_TOKEN` from that file into `.env.local`, then delete the temporary file. Stop and restart `npm run dev:api` to load the credential. Keep the existing local WorkOS, Neon, and `APP_URL` values intact.

Saving a project uploads its attached audio/video before saving the project record in Neon. Working login and database access alone are therefore not enough to save a project with media. If saving reports **“Blob failed to retrieve token”**, check that the development Blob token is present and that the API was restarted, then retry **Save project**. The failed save keeps the local draft. If it still fails, inspect the `/api/media` token request in the browser’s Network panel; an expired login or another API error can also prevent token retrieval.

See [SETUP.md](SETUP.md) for media storage, cleanup, processing limits, and production configuration.

## Verify the local connection

With both processes running:

```sh
curl -s http://127.0.0.1:5190/api/health
curl -s 'http://127.0.0.1:5190/api/auth?action=me'
```

The auth response should be `{"configured":true,"user":null}` before login. `configured: true` means the required settings are present; it is not proof that a full sign-in succeeded. Click Log in or Sign up, complete WorkOS authentication, and confirm you return to the local app with account controls and Log out.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Account buttons disabled or access unavailable | `VITE_API_ENABLED=true`, all required `.env.local` values, and the API process on port 3001. |
| Auth endpoint returns `configured: false` | WorkOS key/client ID, `APP_URL`, `DATABASE_URL`, and a session secret of at least 32 characters must all be present. |
| `/api` requests fail or Vite reports a proxy error | Start `npm run dev:api`; Vite alone cannot serve the API. |
| WorkOS rejects the redirect | Match the callback allowlist to `http://127.0.0.1:5190/api/auth?action=callback` exactly. |
| Return to the app with `authError=1` | Start a fresh login flow; check matching staging credentials, stable session secret, correct cookie host, and database connectivity/migrations. |
| Port already in use | Reuse or stop the existing development process. Do not change the frontend port without also updating `APP_URL` and WorkOS's callback. |
| Login works but saving reports “Blob failed to retrieve token” | Add the development store’s `BLOB_READ_WRITE_TOKEN` to `.env.local`, restart the API, and retry Save project. See the media-storage setup above. If it persists, inspect the `/api/media` response. |

## Checks before submitting code

```sh
npm test
npm run build
```

For changes to media processing or workflow interactions, the existing `scripts/browser-check.cjs` exercises real Wasm analysis and export. Its setup is documented in the script and [SETUP.md](SETUP.md).

Local credentials remain machine-specific. A fresh checkout or another developer's machine needs its own `.env.local`; pulling this repository does not configure services automatically.

### Deployment dependency integrity errors

Vercel runs `npm ci`, then `node scripts/deploy-migrate.mjs && npm test && VITE_API_ENABLED=true npm run build`. Database migrations must remain idempotent and compatible with the currently deployed version; failed migrations block deployment. Previews without `DATABASE_URL` skip migrations and offer guest mode; production requires the database. An `EINTEGRITY` failure happens before the app builds. Compare the affected lockfile entry with `npm view <package>@<version> dist.integrity` and verify a clean install with a fresh cache; do not disable integrity checks.

The failed deployment of `a6498a8` had an incorrect `picomatch@4.0.7` checksum. The corrected lockfile uses npm’s published `sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==`. Preserve the regenerated lockfile when incorporating the upstream credit-profile changes; do not restore that commit’s incorrect checksum during conflict resolution.

### User profiles

Run `npm run db:migrate` after pulling the profile feature (`004_user_profiles.sql`). WorkOS handles login; Neon stores the editable display name and occupation. Signed-in users with incomplete profiles see a setup form, and Profile in the account dropdown reopens it. Vercel applies migrations to its configured database during the build, before publishing the profile-enabled API. Local migration commands only update the configured development database.

### Account credit profiles

`005_credit_profiles.sql` stores reusable credit presets in Neon, keyed by authenticated user and profile ID. The account API lists, saves and deletes only the signed-in user’s presets, with revision checks against stale edits. Existing account-scoped browser presets import once without overwriting newer server versions; guest presets are not imported. Applying a preset copies credits into the current cue sheet, while editing that sheet never updates the account preset.

### Project types and shared audio

Projects supports `cue` and `reel` records in the existing `projects.data` JSON. Old records without a type remain cue projects. Reel drafts contain a title, owned audio asset IDs, and optional track titles. Migration `006_reels.sql` adds cached playback audio and published snapshots; run `npm run db:migrate` after pulling.

The global plus and Create project open a type chooser. The sidebar has separate cue (`#/workspace/library` and the remaining workflow steps), reel (`#/reels/new`), and shared audio (`#/audio`) pages. Cue and reel drafts use separate account-scoped local storage keys.

Audio submitted from the audio library, a cue import, or a reel upload goes into the shared library. Signed-in uploads use the existing private Blob reserve/upload/complete flow and `media_assets` table. `GET /api/media?action=list` returns only the signed-in user's completed audio uploads; video and unfinished uploads are excluded. The development Blob token is required for these uploads, even before a project is saved. Failed uploads stay locally available for retry. Reusing a saved library item attaches the existing asset rather than uploading a second copy.

Guest audio is stored in IndexedDB on this device. It survives reloads but is not copied into an account at login. Clearing site data removes guest audio and drafts. Audio removal from a reel only removes its project reference; it does not delete the library file.

Regression checks: `test/reel-projects.test.js` covers typed project persistence and ownership; `scripts/browser-project-types-check.cjs` and `scripts/browser-account-project-types-check.cjs` cover guest and account workflows. Set `PLAYWRIGHT_MODULE` and optionally `CUESTAMP_URL` as for the other browser checks.

### Reel player and publishing

Start both the API and Vite. **New Reel** supports track titles, ordering, preview, Publish reel, and Share & embed. Account previews and publishing use Vercel Functions to create 192 kbps MP3 playback files and 360-point waveforms. Guest previews use browser decoding (up to 100 MB per file); guests must sign in to publish. Supported reel limits: 50 tracks per publication, 60 minutes per track, and the existing 2 GiB upload limit. Preparation runs one track at a time with a 260-second deadline; Vercel's function limit is 300 seconds. Completed track preparation is reused after a retry.

- `POST /api/reels?action=prepare`: authenticate ownership of a ready audio asset, claim a five-minute processing lease, then prepare/cache private playback audio.
- `POST /api/reels?action=publish`: check ownership, revision and all prepared tracks; save a snapshot with an unguessable share token and MP3 downloads.
- `POST /api/reels?action=revoke`: revoke a published link. Publishing again creates a different token.
- `GET /api/reels?id=PROJECT_ID`: owner-only publication metadata.
- `GET /api/reels?action=preview&id=ASSET_ID`: owner-only redirect to a short-lived playback URL.
- `GET /api/reels?action=public&token=TOKEN`: published player metadata, never private object paths.
- `GET /api/reels?action=stream|download&token=TOKEN&track=ASSET_ID`: check publication and track membership; MP3 downloads are always enabled. Redirects expire after five minutes. Audio already fetched by listeners cannot be recalled.

`/reel.html?token=TOKEN` is a separate Vite entry with no login gate. Add `&embed=1` for an iframe and optionally `&theme=light`. The public player is a reusable `ReelPlayer` class using native HTML audio and a seekable SVG waveform. No Wasm or browser transcoding is needed for published reels. MP3 downloads are always enabled for published reels, including previously published reels. Draft edits do not update a publication until **Update published reel** is pressed.

Postgres stores waveform/manifest metadata. Original uploads and playback MP3s remain in private Blob. Prepared derivatives are reused and retained on unpublish; deleting unneeded Blob objects remains a manual operation. New files use the existing store token; no additional service credentials are needed. Keep `api/reels.js` native binary packaging and duration settings in `vercel.json`.

Signed Blob URLs must encode literal object path segments for transport (`server/blob-url.js`). Stored upload paths already contain encoded filenames; failing to encode those percent signs in the URL causes 403s for filenames containing spaces or punctuation.

Checks: `npm test`, `npm run build`, `scripts/browser-reel-check.cjs`, and `scripts/browser-reel-publish-check.cjs`. The latter mocks account endpoints to exercise editor failures, publish, share, and revoke. With local development credentials and both servers running, `node --env-file=.env.local scripts/reel-live-smoke.mjs` creates synthetic audio, tests the real Neon/Blob/FFmpeg/public-player round trip, then deletes its temporary account and assets. Set `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE` as needed for your browser installation. The live check refuses non-local APP_URL values.

### Project browsing and reel editing

Projects exposes the existing immutable `projects.created_at` timestamp and `updated_at`, displayed in the viewer's local date/time. Type filters (All types, Cues, Reels) combine with creation/update ordering in either direction. The API returns the owner's collection, without the old 100-item truncation. Selecting a saved reel opens Edit Reel; Your reels lists all account reels with per-reel Edit and Stop sharing actions, plus Create reel. All published reels offer MP3 downloads, including older publications whose stored permission was disabled. There is no download-permission checkbox.

Reel routes are distinct: `#/reels/new` starts a fresh creation form, and `#/reels/PROJECT_ID/edit` opens an existing reel. First account save replaces the creation URL with the saved reel's edit URL. Reloading an edit URL retains the selected reel; navigation between reels or back to New Reel uses the same unsaved-change guard as leaving a workspace. The New Reel sidebar item is selected only on the creation route.

### Local reel waveform previews

Reel previews can use local audio while the original uploads. Standard PCM WAV
(8/16/24/32-bit integer or 32-bit float) is scanned in small chunks in a Web Worker;
`wasm/waveform.wat` accumulates waveform peaks without decoding the whole file into
memory. This also supports WAV files above the cue analysis 100 MB cutoff. Other
local formats retain browser decoding up to 100 MB, with server processing after
upload when local preview isn't supported. Publishing still prepares the server MP3
and waveform from the original; local previews do not replace the uploaded audio.

The compiled `src/waveform.wasm` is committed. After changing its WAT source, run
`npm run build:waveform` (uses pinned WABT via npx), then `npm test` and `npm run build`.

### Lossless audio uploads

Signed-in audio-library uploads automatically compress eligible integer WAVs
to FLAC in a browser WASM worker before uploading. Originals stay local;
unsupported or unhelpful compression falls back to the original. No extra
service configuration is required. See [upload performance](docs/upload-performance.md)
for supported formats, retry storage, benchmarks and browser regression checks.

### Non-destructive audio editing

Run `npm run db:migrate` after pulling `007_audio_edits.sql`. **Edit audio** is
available on saved Audio Library tracks and in reel track rows. Signed-in users
can set a start/end snippet, fade-in/out durations, and peak normalization to
−1 dB. Times always refer to the original recording; Reset edits restores its
full range. The editor's player auditions the original recording. Listen to the
saved result through Audio Library or Preview reel.

The existing `/api/reels?action=edit-audio` POST handles owned audio only and
renders in Vercel Functions with FFmpeg. Rendered samples are stored in a private
FLAC file. MP3 playback/download derivatives are still prepared on publication.
There is no new service or credential. Processing requires an account and a
completed upload, supports up to 60 minutes / eight channels, and caps output at
512 MB within the existing 260-second processing deadline.

`media_assets.source_id` points to the preserved original; `parent_id` records the
version edited; `edit_recipe` stores the snippet/fades/normalization settings.
Subsequent edits render from the original, avoiding accumulated processing loss.
Save changes replaces the visible library version using `superseded_by`, while
Save as copy retains both entries. Old versions remain readable for existing
projects/publications. Apply to reel creates a library copy and replaces that
reel's track reference; publish again to update a shared reel. Neither operation
deletes the original Blob. Retained originals/versions consume storage.

Checks: `test/audio-edits.test.js` exercises actual FFmpeg output and ownership,
lineage, copy/replacement and stale-save behavior. Run
`scripts/browser-audio-edit-check.cjs` with the documented Playwright variables
for the shared editor and reel integration.

The audio editor also shows an interactive waveform: drag a range or use the
start/end handles (arrow keys adjust by 0.1 s; Shift adjusts by 1 s). Numeric
fields and the fade envelope stay synchronized. Play snippet auditions the
selected original audio. Local WAVs reuse the Wasm waveform worker; remote
files reuse server reel preparation. Waveform preparation does not block editing.
Peak normalization accepts `targetPeakDb` from −60 through 0 dBFS, persisted
in the recipe and applied by FFmpeg. Older recipes retain the −1 dBFS default.
The waveform height represents the original recording, not a post-edit meter.

### Reel profiles, résumé and presentation

Reel drafts now include optional `profile` (name, email, occupation, bio),
`appearance` (accent, dark/light player theme, introduction), `trackColors`, and
`resumeId`/`resumeName`. Use my profile copies account details; subsequent manual
changes belong to this reel. A published snapshot includes these details.

Résumé uploads use the existing private media reserve/upload/complete flow, limited
to PDF files of 10 MB. They are excluded from the audio library. Saving/publishing
checks ownership, readiness and PDF type. Public manifests expose only a résumé
availability flag; `/api/reels?action=resume&token=…` verifies the publication before
redirecting to an expiring private Blob URL. Revoking the reel disables fresh résumé
links too. Existing downloaded files/issued URLs cannot be recalled.

The editor automatically prepares a live preview when tracks are available, reusing
local WAV processing and cached server preparations. Profile/appearance changes do
not regenerate audio. Publish sits below the preview, above Listener analytics, and remains explicit. A failed
preview offers Retry preview. No schema migration or new credentials are required.
Regression coverage includes `scripts/browser-reel-presentation-check.cjs` plus
ownership, publication snapshot and PDF limits in the server tests.

Published reels display their share URL directly beneath the preview, with Copy
link and Open reel controls. Each published item under Your reels also exposes
Share without changing the currently edited reel. Drafts do not expose share URLs.

### Experimental DAW (in development)

`#/experimental` is a separate composer workspace. It currently stores its session
in account-scoped localStorage and original imported files in IndexedDB. Signed-in
users can explicitly Save to account using the existing Neon/Blob services.
Audio/video/MIDI import, arrangement, basic note editing, mixer gain/pan/mute/solo,
undo/redo, local playback and WAV/MIDI export are initial implementations. See
[the full scope ledger](docs/experimental-daw.md) for missing features and evidence;
this is not yet Logic Pro parity. Export project creates a portable `.cuestamp.zip` with original media. JSON-only
export keeps device-local references. Portable archives currently support up to
512 MB of media and a 10 MB document.

Manual actions and agent batches use `src/experimental/session.js`. The command
executor validates the complete result before commit, rejects stale revisions and
supports undo. `/api/daw` uses the same validation before returning a model plan.
No arbitrary code or shell execution is exposed to the model.

For the OpenAI adapter, configure server-only `OPENAI_API_KEY` and `DAW_AGENT_MODEL`
in local `.env.local` or the intended Vercel environment. Choose a model available
to that API project that supports Responses function calls. Never use a `VITE_`
variable for these values. Restart the local API after changes. A configured status
means variables are present, not that a real request has succeeded. Requests require
login and same-origin checks; requests send the session document/selection, not
source media. Production usage quotas and provider alternatives remain pending.

Checks: `npm test`, `npm run build`, and `scripts/browser-experimental-check.cjs`
with the standard Playwright variables. The browser agent check mocks inference;
a real provider test is still required after credentials are configured.

The Experimental mixer includes ordered EQ/compressor/delay/reverb inserts and
volume/pan automation. Playback and offline rendering share the same signal chain.
Bounce stems exports aligned per-track WAVs in a ZIP; muted tracks are excluded,
solo is ignored, and master gain is included. Edits stop playback. Run
`scripts/browser-experimental-effects-check.cjs` for controls, stem packaging and
actual browser PCM regression checks. Bus outputs and selectable send positions are available through + Bus and the mixer routing section.

Run `scripts/browser-experimental-archive-check.cjs` to verify portable project
export, import into cleared storage, restored playback and reload.

The Experimental piano roll has a beat-based note inspector, pitch/time dragging,
right-edge resizing, velocity, duplicate and explicit delete controls. Run
`scripts/browser-experimental-piano-check.cjs` for editing and persistence checks.

Timeline audio/video regions have edge trim handles; audio/MIDI regions have fade
handles and envelope overlays. Hold Shift while dragging for unsnapped movement.
The inspector remains available for exact numeric editing. Run
`scripts/browser-experimental-region-check.cjs` to check trim/fades and restoration.

Record audio in Experimental captures standalone microphone takes as 16-bit PCM
WAV at the browser sample rate (up to stereo, ten minutes). Stop recording places
the take at the starting playhead position. Cancel or leaving the page discards
the active take and releases the microphone. Optional arrangement playback is available; microphone monitoring is not implemented.
`scripts/browser-experimental-recording-check.cjs` uses Chromium's fake microphone;
it does not access physical recording hardware. Microphone access requires HTTPS
or a trusted loopback origin.

Experimental buses support nested outputs, pre/post-fader sends, shared effects and
volume/pan automation. Routing validation rejects feedback cycles. Bus deletion
clears references reversibly. Run `scripts/browser-experimental-routing-check.cjs`
for routing controls and real PCM checks. Per-track stem exports retain bus effects;
shared nonlinear effects can make summed stems differ from the full mix.

The MIDI event editor supports controller, pitch-bend, program and pressure events.
Import/export retains note channels and channel events. Synth audition supports
CC7/11/10/64 and fixed ±2-semitone pitch bend; program/pressure events are export-only.
Run `scripts/browser-experimental-midi-events-check.cjs` for editor and PCM checks.

Experimental video scoring has non-drop timecode, frame-rate selection and frame
stepping. Extract movie audio creates an independently editable track using the
same original asset. Codec support and the 250 MB browser decode limit apply.
`scripts/browser-experimental-video-check.cjs` generates an MP4 fixture using the
installed FFmpeg binary and checks picture sync, offsets and audible extraction.

+ Drum track creates a MIDI track using the synthesized drum kit. Add a MIDI region
to open its bar-based step sequencer; hits remain ordinary MIDI notes editable in
the piano roll. Run `scripts/browser-experimental-drums-check.cjs` for pattern,
velocity, undo, MIDI export and actual audio-render checks.

Cycle playback stores a start/end range and repeats its rendered audio (up to ten
minutes). Use selected region sets the range. Effects restart each cycle; edits
stop playback. Full-session export ignores Cycle. Run
`scripts/browser-experimental-cycle-check.cjs` for wrapping, pause, persistence,
PCM boundaries and cancellation of a pending render.

Experimental account saves use the existing `/api/projects` and private `/api/media`
flows. No new migration or credentials are required. Ensure the development Blob
token, WorkOS and Neon are configured as above. Projects lists these as Experimental
DAW. The existing 1 MB JSON limit applies; media uploads are separate.
`scripts/browser-experimental-cloud-check.cjs` mocks services to test account UI and
retry behavior; `test/experimental-cloud-projects.test.js` verifies ownership and
revision rules in PGlite. Neither replaces a live Neon/Blob smoke test.

### Live Experimental account-storage check

With the local frontend running and development credentials loaded:

```sh
node --env-file=.env.local scripts/daw-live-smoke.mjs
```

Set the standard `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE` variables if needed.
The script refuses any APP_URL or Neon branch outside the documented development
setup. It uses a synthetic identity (not a real WorkOS sign-in), real Neon and private
Blob multipart uploads, then clears device data and checks exact source restoration,
playback and revision updates without duplicate uploads. It removes its test data.

If project loading reports `column "folder_id" does not exist`, the existing folder
migration has not been applied. Confirm the development branch and run
`npm run db:migrate` before retrying. This occurred during DAW live verification;
the local-development branch is now migrated through `010_folders.sql`.

Experimental export settings support 44.1/48/96 kHz and 16/24-bit PCM or 32-bit float
WAV for both mixes and per-track stem ZIPs. Run
`scripts/browser-experimental-bounce-check.cjs` to verify downloaded formats and
start timing. The ten-minute limit still applies; stem ZIP generation uses memory.

Experimental piano-roll Timing & feel controls provide strength/swing quantization
and seeded timing/length/velocity humanization. Both use the shared command harness
and support region-wide or selected-note edits. Run
`scripts/browser-experimental-note-tools-check.cjs` for UI, undo/redo, persistence
and MIDI-download checks; `test/experimental-note-transforms.test.js` covers command
bounds, determinism and agent validation. Tool defaults reset on reload; note edits
persist. Humanization is destructive but undoable, so undo before comparing seeds.

Experimental Mixer → Master channel edits the summed mix before master volume.
These effects share track controls and command operations (`effect.add` targets
the session ID). Older projects default to an empty master chain. Run
`scripts/browser-experimental-master-check.cjs` for controls, persistence and PCM
render checks. Stems include master processing individually; nonlinear effects may
make their sum differ from the mix. Master meters are not implemented.

The Master channel also shares the track automation editor for volume and pan.
Master curves override static master volume/pan; clear the corresponding curve to
return to static controls. `automation.point` and `automation.clear` use the session
ID for master edits. The master browser check includes rendered fades, panning and
seek restoration; unit coverage is in `test/experimental-master-automation.test.js`.

Send Position can be Before volume, After volume, or After pan (the existing default).
All positions are after inserts; mute silences all outgoing sends. These positions
also control whether source volume/pan automation affects the send. Run
`scripts/browser-experimental-send-taps-check.cjs` for controls, persistence and
rendered signal-flow checks. The shared `send.set` command accepts tap values
`preFader`, `postFader`, or `postPan`; existing sends allow independent tap/level updates.

Each send now has an expandable gain automation curve, sharing the track/master
editor. Points override static send gain and initialize correctly on seek.
`send.automation.point` uses source track ID plus busId/time/value; clear uses source
track ID and busId. Existing `automation.delete` accepts send point IDs. The send
position browser check also covers send curves, persistence, mute, seek and stems.
Run `test/experimental-send-automation.test.js` for command validation and undo.

Automation points support drag, numeric updates and keyboard editing across track,
master and send curves. Arrow keys adjust time/value (Shift makes larger changes);
Delete removes a focused point. The shared `automation.set` command updates time
and/or value while preserving ID/parameter and rejecting collisions. Run
`scripts/browser-experimental-automation-edit-check.cjs` for interaction/focus,
undo, collision and persistence checks, and
`test/experimental-automation-edit.test.js` for command invariants.

MIDI file imports now use one atomic `midi.import` command (original SMF base64 plus
optional start seconds). Limits: 8 MB/file, 128 session tracks, 20,000 notes and
20,000 channel events per imported track. Invalid files preserve undo/redo; valid
imports undo as one action. Run `scripts/browser-experimental-midi-import-check.cjs`
for a 10,001-note import, failure recovery, export and reload, and
`test/experimental-midi-import.test.js` for history retention and size limits.

Piano roll Snap supports straight/triplet grids and Off. Hold Shift for temporary
free movement; drag increments preserve existing timing offsets. Quantize remains
a separate operation for aligning starts exactly. Run
`scripts/browser-experimental-piano-grid-check.cjs` for interaction/tempo/persistence
checks and `test/experimental-piano-grid.test.js` for timing and boundary rules.

Experimental MIDI input: click Connect MIDI, choose a device, then Record MIDI.
Stop & save MIDI creates one editable track at the captured playhead. Optional live triangle-synth audition and arrangement playback are available
with the recording controls below. Browser Web MIDI
support and permission are required; the app requests no SysEx access. Disconnect
or the ten-minute limit saves recorded data; cancellation/navigation discards an
unsaved take. Failed storage saves can be retried without duplicate tracks.

Run `scripts/browser-experimental-midi-input-check.cjs` for simulated-device access,
recording, undo, disconnect, save retry and lifecycle tests, and
`test/experimental-midi-capture.test.js` for event decoding/limits. Physical keyboard
input, latency and cross-browser support still require hardware verification.

Experimental Export settings → Stem grouping offers Individual tracks (default)
and Output groups. Output groups combine sources sharing their final primary
output bus; nested buses roll into that outer group. Tracks sent directly to Master
stay separate. Sends do not assign group membership; each group's contributions
still pass through their sends, bus effects and master processing. Solo is ignored,
muted sources are excluded, and file lengths match the full arrangement including
effect tails. The mode is a workspace preference and resets on reload.
Run `scripts/browser-experimental-bounce-check.cjs` for grouped ZIP downloads and
PCM reconstruction, plus `test/experimental-stem-groups.test.js` for membership,
nested routing, send preservation and non-mutation.

MIDI regions support inward edge dragging and Region inspector → Crop MIDI region.
Boundaries use absolute timeline seconds. Cropping clips/rebases notes, carries
controller state into the new start and retains pedal-held notes. This edits MIDI
events; Undo restores removed content, while outward dragging does not. Region
movement and Length in Apply edits remain separate operations. The shared
`region.trim` command supports the same behavior for agent/manual actions.
Run `scripts/browser-experimental-midi-trim-check.cjs` for UI, undo, persistence and
rendered audio boundaries; `test/experimental-midi-trim.test.js` covers channel state,
pedal-held notes and atomic rejection of invalid bounds.

Experimental has a playback metronome with quarter-note beats per bar and its own
click level. It follows BPM, accents the bar start and works with Cycle. Settings
persist in the project and use undoable `session.set` fields `metronomeEnabled`,
`metronomeDb` (-60..0) and existing `meter` (1..16). Applying settings stops playback,
like other edits. Click output bypasses mixer gain/effects and is never included in
WAV or stem exports. Recording click and count-in are configured separately below.
Run `scripts/browser-experimental-metronome-check.cjs` for controls, persisted state,
actual click timing/seek/cycle audio and export exclusion; unit coverage is in
`test/experimental-metronome.test.js`.

Metronome → During recording enables the click for standalone audio and MIDI takes,
independently of playback click. Its persisted/undoable command field is
`metronomeRecordEnabled`. The click uses the take's starting playhead, BPM, meter
and click level. It stops on finish, discard, disconnect or navigation, including
when device/audio initialization resolves after leaving. Microphone capture and
click share a scheduled audio frame; the click is routed only to the output, not
the capture worklet. Use headphones to avoid acoustic bleed into the microphone.
Count-in and arrangement playback are available below; microphone monitoring and calibrated hardware latency remain pending.
The existing microphone and MIDI input browser checks now verify click lifecycle;
the microphone check also records silence with click enabled and verifies the
saved file remains silent. Tests use simulated devices, not physical hardware.

Metronome → Count-in supports Off, 1 bar or 2 bars for both audio and MIDI takes.
It plays pre-roll click even when During recording is off; that checkbox controls
whether click continues into the take. The selected playhead stays the take's
start. Input during pre-roll is excluded, Save is disabled until recording begins,
and Cancel discards the preparation. Settings persist through undoable
`session.set` → `countInBars` (integer 0..2; old projects default to 0).
Run `scripts/browser-experimental-count-in-check.cjs` for audio/MIDI pre-roll,
placement, cleanup, persisted settings and click continuation audio checks.

Piano roll multi-selection: Ctrl/Cmd-click toggles notes; Select all notes and Clear
selection are available above the editor. Dragging moves the selected group with
relative timing/pitch preserved and joint boundary limits. With multiple notes,
Move selected notes accepts relative beats and semitones. Duplicate selection
copies the group after its span; Delete selection removes it. Right-edge resizing
still changes one note. Timing & feel → Selected notes now supports the whole group.
Each bulk edit is one undo step. Selection itself is transient and resets on reload.
The agent receives validated selectedNoteIds, and `notes.move`, `notes.duplicate`,
`notes.delete` accept comma-separated `noteIds` in one command targeting a MIDI
region (omission means all notes). Quantize/humanize accept noteIds as an alternative
to noteId. Run `scripts/browser-experimental-note-selection-check.cjs` and
`test/experimental-note-selection.test.js` for these behaviors.

Piano roll Tool → Select notes enables box selection on empty grid space. Alt-drag
provides the same action while Draw notes is active. Ctrl/Cmd/Shift adds the box's
notes to the selection; Escape cancels the gesture. Drag a selected right edge to
resize all selected notes by the same amount, or use Length change in beats.
The shared `notes.resize` command takes region ID, comma-separated noteIds and
relative seconds; omission of noteIds applies to all notes. Starts/pitches stay
fixed and invalid resulting lengths reject the entire change. Selection/tool state
is temporary. Box selection does not auto-scroll yet.
Run `scripts/browser-experimental-marquee-check.cjs` for gestures, group resize,
undo/redo and Draw mode regression, plus `test/experimental-marquee.test.js`.

Select an audio or MIDI region and use Bounce region to export just that region as
stereo WAV. It starts at the region boundary and includes routed bus/master effect
tails. Source offset, fades, reversal and automation use the existing renderer;
automation initializes at the region's original timeline position. Solo is ignored;
track and bus mute still apply. Movie regions require Extract movie audio first.
The existing sample rate/bit depth settings and ten-minute render limit apply.
Mix, stem and region exports now capture the document/settings before asynchronous
work and decode only media used by the render. Editing during a bounce does not
change that export. Run `scripts/browser-experimental-region-bounce-check.cjs` for
actual WAV isolation, source offset, delay tail, automation, MIDI and snapshot checks,
and `test/experimental-bounce-plan.test.js` for plan/asset/limit coverage.

Play arrangement while recording enables audio/MIDI overdubbing into a new track.
The persisted/undoable field is `recordWithPlayback` (default false). Audible audio
is decoded before recording starts; playback uses a fixed session snapshot with
mixer routing, effects and automation, beginning at the take's post-count-in start.
The recording clock, playhead and movie monitor advance during the take. Cycle is
ignored for recording: playback runs linearly from the selected position. Optional live MIDI audition is available below; microphone monitoring/latency calibration remain pending. Headphones prevent accompaniment bleeding acoustically into the input.
Run `scripts/browser-experimental-overdub-check.cjs` for audio/MIDI take placement,
backing cleanup, scheduled/seek PCM and digital isolation of microphone recordings.

Hear MIDI while recording enables triangle-synth audition during MIDI takes and
count-in. It is opt-in, persisted and undoable through `session.set` field
`midiMonitorEnabled`. Audition bypasses the mixer; it is not an audio recording.
Saved takes retain editable notes/controller events and use the triangle instrument.
CC7/11/10/64 and ±2-semitone pitch bend work live. CC120/123 and reset controllers
release voices appropriately; stop, discard, disconnect and navigation silence them.
Polyphony is limited to 64 voices, stealing the oldest voice when needed. Count-in
notes sound but are excluded from the take. Idle monitoring and physical device
latency calibration remain pending. Run
`scripts/browser-experimental-midi-monitor-check.cjs` for synthetic-device UI and
real Web Audio signal/lifecycle checks. No physical keyboard was tested.

Microphone monitoring: enable Hear microphone while recording and choose a monitor
level (-60..0 dB; default -18), then Apply microphone monitoring. This is off by
default and uses validated, undoable `session.set` fields `audioMonitorEnabled` and
`audioMonitorDb`. Monitoring starts with the microphone, including count-in, on a
separate output branch. It bypasses track/master effects and never changes captured
PCM, saved WAV levels or export settings. Use headphones to prevent feedback.
Mute monitor / Unmute monitor remains available during a take and changes only
that take; the saved preference applies again on the next recording. Finish,
cancel, initialization failure and navigation disconnect the monitor. Hardware
direct monitoring should be disabled if using browser monitoring to avoid hearing
two copies. Browser/device latency is not calibrated or compensated.
Run `scripts/browser-experimental-input-monitor-check.cjs` for fake-microphone
capture, live mute controls, gain/isolation PCM, saved preferences and cleanup.

Experimental Markers lists named timeline locations in chronological order. Add a
name/time, edit either field with Save marker, or Delete marker; all edits support
undo/redo and persist with the session. Clicking a marker's time or ruler diamond
jumps to it; Previous/Next marker searches relative to the current transport time.
Navigation stops playback and centers the destination. Marker times are absolute
seconds (0..86400) and do not rescale with tempo. Markers beyond audio extend the
visible arrangement, with at most 1,000 ruler labels. They do not extend audio exports.
`marker.add` accepts optional id plus name/time; `marker.set` targets an existing ID
with name and/or time; `marker.delete` removes it. IDs remain unique across the
whole session. Run `scripts/browser-experimental-markers-check.cjs` for UI,
navigation, persistence and undo, plus `test/experimental-markers.test.js` for
atomic validation and ordering. MIDI-file marker import/export is supported as described below.

MIDI import/export now carries SMF marker meta-events (FF 06). Exports write them
in chronological order in the conductor track; marker-only files are supported.
Import converts ticks through the source tempo map and adds the selected playhead
offset to both markers and tracks. Both are committed as one undoable operation.
Imported markers receive fresh IDs, so repeated imports preserve both copies.
Limits remain 1,000 markers per session, 200 characters per name (long imported
names are truncated), and 0..86400 seconds after placement. UTF-8 labels round-trip
in Cuestamp; legacy MIDI applications may interpret non-ASCII text differently.
Tempo maps themselves are still flattened on export to the session tempo. Cue-point
meta-events (FF 07) are not treated as markers. The marker browser check downloads
and re-imports the actual MIDI file; `test/experimental-midi-markers.test.js` covers
tempo changes, offset, IDs, bounds and atomic undo.

Bounce range WAV exports the saved Cycle start/end positions without requiring
Cycle playback to be enabled. Apply cycle first to commit typed boundaries, or Use
selected region to set them. Output is stereo WAV using Export settings and is
exactly the selected duration (rounded up to a sample), with no trailing effects
outside the range. Maximum export length is ten minutes; a short range late in a
long session is allowed. Only audio regions intersecting the window are decoded.
Silence is exported for an empty window. Mute/solo, routing, effects, source offsets,
fades and automation use the existing mix renderer, and metronome is excluded.
The seek renderer starts effects at the range boundary: prior delay/reverb history
is not reconstructed. For an exact excerpt of a previously running mix, export the
full mix and trim it externally until DSP pre-roll is implemented. Settings/document
are snapshotted before decoding. Run
`scripts/browser-experimental-range-bounce-check.cjs` for actual WAV sample/length,
automation, unrelated-media exclusion and silence checks.

Select a track (or one of its regions), then open Track actions → Duplicate track.
The copy appears immediately after its source and has independent IDs for regions,
notes, controller events, effects and automation. Original media assets are shared,
so this does not upload or duplicate source files. Instrument, gain/pan, mute/solo,
effects, automation, outgoing bus and sends are retained. New track with same
settings omits regions while keeping these settings. Duplicating a bus copies only
its settings/outgoing routes; existing tracks keep feeding the original bus.
`track.duplicate` uses target=source ID and optional values id, name, includeRegions
(boolean, default true). Limits and full routing/ID validation apply atomically;
each copy is one undo step. Run `test/experimental-duplicate-track.test.js` and
`scripts/browser-experimental-duplicate-track-check.cjs` for independent editing,
media references, bus behavior, history, persistence and real rendered audio checks.

Move regions between tracks by dragging vertically in the arrangement or selecting
Region inspector → Move to track. Destinations must have the same type (audio,
MIDI or video); bus tracks cannot contain regions. Compatible drop lanes highlight
with the accent color, incompatible lanes with a red outline. Vertical-only drags
preserve timeline placement; horizontal movement retains the existing snap/Shift
behavior. Region IDs, source offsets, notes, events and fades are preserved, while
the destination instrument, mixer effects and routing determine playback.
`region.move` targets a region ID with required `trackId` and optional absolute
`start`; it is atomic and undoable. The inspector moves at the existing time.
Run `scripts/browser-experimental-region-move-check.cjs` for drag feedback,
incompatible rejection, inspector/history/persistence and destination gain PCM;
`test/experimental-region-move.test.js` covers audio/MIDI/video transfers and invalid
commands. Multiple-region moves and automatic scrolling during drags remain pending.

Region inspector → Repeat region creates 1–100 additional copies with spacing in
beats. Default spacing equals the region length; shorter spacing deliberately
creates overlaps, longer spacing creates gaps. Copies stay on the same track,
share source media and preserve source offset, fades and MIDI content, but receive
new region/note/event IDs. They are independent edits, not linked loop aliases.
One Undo removes the entire repetition; the 1,000-region track limit still applies.
The agent command `region.repeat` targets a region ID with required `count` and
optional `interval` in seconds (default region duration). Repeat starts must remain
within the 86,400-second timeline bound. Run
`test/experimental-repeat-region.test.js` and
`scripts/browser-experimental-repeat-region-check.cjs` for content/bounds, beat
spacing, independent edits, history/persistence and rendered phrase timing.

Drag a track name onto the upper/lower half of another track header to place it
before/after that track. An accent line shows the insertion edge. Track actions →
Move track up/down provides keyboard-accessible alternatives; boundary buttons are
disabled. Arrangement lanes and mixer order follow the document order. All track,
region and routing IDs stay unchanged, and each move is one undo step.
`track.move` targets a track ID with `index`, the zero-based final position in the
track list. Invalid positions reject atomically. Run
`test/experimental-track-order.test.js` and
`scripts/browser-experimental-track-order-check.cjs` for insertion math, validation,
drag/controls, history, persistence, routing and unchanged rendered audio. Track
multi-selection, folders and automatic scrolling while dragging remain pending.
