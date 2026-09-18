# Experimental DAW — scope and implementation ledger

The objective is a broad Logic-style workstation with an agent that can operate
all its basic editing features. This ledger preserves that scope across iterations.
It is not a declaration of Logic Pro feature parity.

## Research (2026-09-18)

Apple describes Logic Pro as a DAW, including track arrangement, recording,
region editing, piano-roll/score/event editors, MIDI controllers, software
instruments, effects, automation, mixing, bouncing, and video synchronization.
Its guide also covers comping, take folders, track stacks, tempo/signature maps,
Live Loops, step sequencing, audio warping/pitch editing, surround/spatial audio,
external hardware, and project interchange.

Sources:
- https://support.apple.com/guide/logicpro/welcome/mac
- https://www.apple.com/logic-pro/

We implement original Cuestamp code and controls. Apple instruments, proprietary
plug-ins, bundled sound libraries, and native Logic project formats require
separate compatible implementations or licensed integrations.

## Required capability groups and evidence

| Group | Required outcomes | Status / verification |
| --- | --- | --- |
| Experimental workspace | Separate route/sidebar tab, arrangement, inspectors, right-side agent | Initial implementation; browser check passes |
| Session document | Tracks, regions, assets, tempo, meter, markers, persistence, undo/redo | Local document, portable archives and account save/reopen with revision checks implemented |
| Audio arrangement | Import, waveform, move/trim/split/copy/delete, fades, gain, reverse, crossfades | Basic operations and graphical audio/video trim plus audio/MIDI fade handles implemented; dedicated crossfades pending |
| Transport and video | Synchronized multitrack playback, seek/loop, movie offset/timecode, scoring markers | Web Audio/video transport, source offsets, markers, frame stepping and non-drop timecode implemented; real MP4 regression added; cycle playback implemented; drop-frame timecode pending |
| MIDI | SMF import/export, piano roll, note/velocity/CC editing, quantize/transpose/humanize, device input/output | SMF note import/export, note placement/removal, note inspector, drag/resize, velocity, quantize and transpose implemented; channel-event import/export/editing and core controller playback implemented; strength/swing quantization and seeded humanization implemented; device input/output pending |
| Composition tools | Instruments/sampler, step sequencer, chord/key/meter tools, notation/event editors | Oscillator instruments, synthesized drum kit, bar-based step sequencer and MIDI event editor implemented; sampler, chord/key tools and notation pending |
| Recording | Audio/MIDI capture, monitoring, takes, punch, comping, latency compensation | Standalone microphone WAV takes and input meter implemented; overdub, monitoring, MIDI capture, punch/comping and latency compensation pending |
| Mix and effects | Gain/pan/mute/solo, master, buses/sends, EQ/dynamics/reverb/delay, plug-in chains | Channel strips, ordered EQ/compressor/delay/reverb inserts and bypass implemented; bus outputs, selectable pre/post-fader sends, shared inserts and master inserts implemented |
| Automation | Editable parameter curves with playback/export parity | Track/master volume/pan and send-level points, interpolation and seek initialization implemented in shared playback/export renderer; effect automation and recording pending |
| Advanced arrangement | Time stretching, pitch correction, tempo maps, grouping/stacks, loops/scenes | Pending |
| Deliverables | Stereo and stem bounce, region export, video sound replacement, project interchange | Stereo WAV, aligned per-track WAV ZIP and MIDI export implemented; portable media archives implemented; grouped stems and region/movie export pending |
| Agent | Typed instructions, real model adapter, schema-validated operations, atomic execution, undo, stale-state protection, trace | Adapter and command harness implemented; mocked tests pass; real model run unverified, local key/model absent |
| Account/storage | Durable project/media save, restore, ownership, version conflicts | Existing Projects/Neon and private Blob integration added; ownership/revision and browser checks pass; live development Neon/Blob round trip verified with synthetic authentication |
| Reliability | Unit, audio-render, MIDI-fixture, browser, accessibility and load checks | Pending |

## Architecture

All edits are serializable commands applied to a validated session document.
Manual controls and model actions use the same command executor. A batch is atomic;
an invalid operation must leave the session unchanged. The audio renderer consumes
the same document used by the arrangement. Model requests must never expose server
credentials and must not execute arbitrary JavaScript or shell commands.

Maintain real capability status in the UI. Unimplemented DSP, plug-ins, and AI
connections must not masquerade as functioning controls. The scope remains open
until all capability groups have authoritative implementation and verification.


## Verified checkpoint — 2026-09-18

- `test/experimental-session.test.js`: atomic rollback, undo/redo, stale revisions,
  MIDI splits, SMF note round trip, tempo changes, model-output validation.
- `scripts/browser-experimental-check.cjs`: Experimental route, note placement,
  undo/redo, mock-model edit, playback clock, actual OfflineAudioContext PCM render,
  WAV download and local reload.
- Entire repository: 126 tests passing; Vite production build passing.
- Not verified: actual model inference, microphone/MIDI hardware, production DAW save,
  heavy sessions, mobile editing.

Current limitations are substantive: simple oscillator instruments, no automation recording,
overdub/comping, professional time stretching/pitch editing,
notation, SysEx and full MIDI metadata preservation, Live Loops, or spatial audio. Browser source
decoding currently caps individual audio at 250 MB; offline bounce caps ten minutes.
Movie audio can be extracted to a separate track and mixed when the browser supports its codec. Session JSON references device-local assets. Export project bundles original media
in a portable archive; account save/reopen now uses the existing project and media services. The full goal remains active.

Next implementation priorities: MIDI event/device tools; recording; master metering; crossfades; movie render/export; connected model validation.

## Mixer and rendering checkpoint

`test/experimental-effects.test.js` covers insert validation/reordering/bypass,
automation upserts, interpolation, bounds, undo, and tail duration.
`scripts/browser-experimental-effects-check.cjs` exercises effect controls,
automation parameter persistence and aligned stem ZIP downloads. Actual browser
OfflineAudioContext samples verify low-pass attenuation, compression, echo decay,
reverb tails, volume/pan automation and seeking into a curve.

Track inserts precede gain and pan. Volume automation interpolates in dB; pan
interpolates linearly. Edits currently stop transport. Seeking initializes curves
but does not preroll previous reverb/delay history. Stem exports exclude muted and
video tracks, ignore solo, and include each track's inserts, automation and master
gain. All files share the full arrangement length plus effect tails. They are
WAVs with selectable 16/24-bit PCM or 32-bit float and 44.1/48/96 kHz sample rates; grouped-bus export remains pending. ZIP
creation holds rendered stems in memory, so large sessions need further work.

## Portable project checkpoint

Export project creates a `.cuestamp.zip` with the validated session, original audio
and video, and file metadata. Shared sources are bundled once. Import assigns fresh
asset IDs and stores all files in one IndexedDB transaction before switching the
session. Missing files and invalid edits reject import/export. Archives support
512 MB total media and a 10 MB manifest; extraction enforces decompressed limits.
Archive creation remains memory-based. JSON-only export remains available.

`test/experimental-archive.test.js` checks byte preservation, shared references,
effect/edit persistence, ID isolation, missing sources and malformed manifests.
`scripts/browser-experimental-archive-check.cjs` tests export followed by clearing
local storage and IndexedDB, import, playback and reload.

## Piano-roll editing checkpoint

Notes support selection, pitch/start/length/velocity fields, drag movement in
sixteenth-note increments, right-edge resizing, duplicate and explicit deletion.
The inspector displays beats while shared commands store seconds. The selected
note ID is passed to the agent. Invalid edits leave the prior document unchanged.
The browser piano regression covers drag pitch/time, resize, selection without
deletion, duplicate/delete/undo, edit rejection, region inspector and reload.
Multiple-note selection, variable snap grids and graphical MIDI CC lanes remain pending.

## Region editing checkpoint

Audio/video edge handles trim the timeline and original-source offset together.
Reverse audio trimming adjusts the opposite source boundary. Trim adjusts fades
to fit the resulting duration and never changes original media. Audio/MIDI fade
handles display an envelope and prevent overlapping fades. Movement snaps to
sixteenth-note increments; holding Shift during dragging allows unsnapped edits.
The numeric inspector remains available for exact values. Source extension through
handles is bounded by decoded source duration; without decoded metadata it stays
within the known source range. The shared `region.trim` command is agent-accessible.

Unit tests cover forward/reverse source alignment, undo, fade limits and invalid
boundaries. The browser region check exercises both trim edges and fade handles,
undo/redo, playback and persisted restoration. Dedicated crossfades, MIDI-region
trimming and keyboard-accessible handles remain pending.

## Microphone recording checkpoint

Record audio requests microphone permission only after a click and captures PCM
through AudioWorklet. Stop recording saves a new original WAV and audio track at
the starting playhead position. The format is 16-bit PCM at the browser context
sample rate, up to two channels and ten minutes per take. This is not a float/24-bit
recording path. Input gain processing, noise suppression and echo cancellation
are requested off; device drivers may still apply their own processing.

Recording is standalone: transport stops and editor controls lock during capture.
The input meter and elapsed time update without repainting the editor. Cancel or
leaving Experimental discards the active take and releases the microphone; the UI
states this. Existing saved takes remain intact. Failure to persist a finalized
take downloads its WAV as a recovery copy. Sources remain device-local until exported.

Unit tests verify variable block sizes, stereo order and final-frame flushing.
The browser recording check uses Chromium's synthetic microphone, verifies nonzero
PCM, timeline placement, persistence, cancellation and navigation cleanup. Physical
hardware, device selection, monitoring and latency calibration are not verified.
Implementation reference: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process

## Bus routing checkpoint

+ Bus creates a mixer channel that receives track outputs and selectable pre-fader,
post-fader or post-pan sends. Bus channels support the existing insert effects and volume/pan automation.
Outputs can route through nested buses; the command executor rejects nonexistent
destinations and feedback cycles. Deleting a bus returns its upstream outputs to
Master and removes sends to it, with undo restoring the routing.

Bus solo includes its upstream sources, including their other output paths. This
is source auditioning, not isolated bus-return solo. Explicit grouped-bus export
remains pending. Send-level automation is now implemented. Per-track stem rendering
keeps the bus graph, effects and tails. Shared nonlinear bus effects (such as
compression) process each isolated stem differently from the combined full mix,
so summing those stems need not reproduce the mix exactly.

Unit tests cover cycle rejection, references/deletion/undo, bus solo, tails and
stem routing. The browser routing check exercises output/send controls and actual
PCM bus gain, summed sends, mute and isolated-stem signal paths. The effects browser
regression continues to verify EQ/dynamics/delay/reverb/automation and ZIP export.

## MIDI channel-event checkpoint

SMF import/export preserves note channels and track names, plus control change,
pitch bend, program change, channel pressure and polyphonic pressure events.
Controller-only tracks survive import. The MIDI event editor adds/updates/deletes
events by beat, channel, type, controller/note number and value. These operations
share undo and agent commands. Notes also expose their channel in the inspector.
Tempo edits rescale events with MIDI notes; splits chase earlier controller state
into the right segment, and duplication gives events fresh IDs.

Synth playback supports CC7 volume, CC11 expression, CC10 pan, CC64 sustain and
fixed ±2-semitone pitch bend independently by channel, including seek initialization.
Program/pressure events and other controllers are stored/exported but do not change
the built-in oscillator instrument. RPN bend-range changes, SysEx, full metadata,
tempo-map interchange, MIDI hardware, and per-channel instrument assignment remain
pending. MIDI export omits zero-velocity silent notes rather than making them audible.

Unit tests verify typed event round trips, channel identity, controller-only tracks,
validation, tempo scaling and split state. The browser MIDI-event check exercises
the event form, export and undo, plus actual PCM volume, sustained notes and pitch
bend. Note-edit and effects regressions cover the shared renderer and editor.

## Scoring-to-picture checkpoint

Video monitor controls support 23.976/24/25/29.97/30/50/59.94/60 fps, non-drop
HH:MM:SS:FF, direct timecode seeking and one-frame stepping. Fractional rates use
exact 1000/1001 timing. Non-drop labels intentionally drift from wall-clock time
at fractional rates; drop-frame numbering and embedded source timecode are pending.
Frame stepping seeks the HTML video element, not a frame-indexed native decoder.

Extract movie audio creates a separate audio track referencing the same original
asset and preserving its start, offset and duration. The browser must decode the
movie's audio codec and the existing 250 MB decode limit applies. Subsequent edits
to the extracted track are independent from picture. Agent commands can extract
audio and set the project frame rate. Rendering a movie with replacement audio
and automatic linked edits between picture and extracted sound remain pending.

Unit tests cover integer/fractional timecode, bounds and extraction/undo. The
browser video check generates a real MP4 with AAC audio and checks offset seeking,
frame navigation, shared source identity, audible WAV bounce and picture/transport
synchronization. This does not establish frame-accurate sync across every codec
or long movies.

## Drum composition checkpoint

+ Drum track adds a MIDI track with an original synthesized kit. Add a MIDI region
to edit kick, snare, closed/open hat, crash and ride hits on a bar-based sixteenth
grid. The grid follows project meter and tempo; hits use ordinary channel-10 MIDI
notes and are editable in the piano roll and through agent note commands. Velocity,
bar selection and undo are supported. No recorded sample library or model generation
is involved. Other pitches currently use a generic metallic percussion voice.

The shared playback/offline engine renders deterministic PCM drum voices, honoring
velocity, channel controllers, region fades, routing and effects. Percussion decays
continue past MIDI note-off but stop at the region boundary. Pitch bend and sustain
do not change drum voices. Sample-kit loading, per-drum sound controls, swing,
probability, polymeters and pattern variations remain pending.

Unit tests verify deterministic distinct voices and percussion-channel MIDI export.
The browser drum check covers hit toggles, bar navigation, velocity, undo, exported
notes and actual PCM output at the expected pattern positions.

## Cycle transport checkpoint

Cycle stores an enabled flag and start/end seconds in the session. Use selected
region copies its boundaries; the agent can edit these session fields. Playback
renders the range (up to ten minutes) once and repeats an AudioBufferSourceNode
loop. Transport position and video synchronization follow the wrapped audio clock.
Pause resumes within the range; Stop resets the playhead. Offline rendering begins
at sample zero, avoiding the normal live scheduler's startup padding in every cycle.

This implementation repeats the rendered slice. Effect tails and synth state reset
at the boundary, and a discontinuity at the chosen cut can click. There is no
cross-boundary DSP preroll or automatic loop crossfade yet. Editing stops playback;
full-session exports ignore Cycle. Microphone takes remain standalone recordings.

Unit tests check wrapping and atomic/undoable range updates. The cycle browser
check verifies repeated wraps, pause, persistence, exact PCM range length without
startup padding, and canceling a pending cycle render with Stop.

## Account DAW project checkpoint

DAW projects use `type: daw` in the existing Projects JSON record. Neon stores the
validated arrangement and a local-source-ID to owned Blob-asset-ID map. The existing
private reserve/upload/complete path stores original files. No migration or new
service credential is required. All referenced assets must be ready, owned by the
user, and audio/video; missing/extra mappings and invalid document invariants reject
save. Project revisions prevent stale overwrites and project types cannot change.
Document IDs are restricted to safe alphanumeric/underscore/hyphen identifiers.

Save to account and Save a copy appear for signed-in users. Completed uploads are
reused after finalization/save failures. Projects has an Experimental DAW filter
and opens these records in Experimental. Restoration downloads originals, checks
byte lengths, stores them in an IndexedDB transaction and assigns fresh local IDs.
The current session is replaced only after downloads complete. Unsaved-session
replacement asks through an app dialog and keeps a local JSON backup. New session
starts a separate arrangement. Media remains shared when saving a copy.

The API's existing 1 MB JSON body limit applies; portable export remains available
for larger documents. Uploads currently use original files rather than the audio
library's lossless upload preprocessing. Cloud save is explicit, not automatic.
Version history beyond optimistic revision checks, cloud media cleanup, and a
user-facing local-backup recovery browser remain pending.

PGlite tests cover source ownership/readiness, map validation, stale revisions and
read isolation. The browser account check mocks API/Blob interactions and verifies
save/copy/conflict, Projects opening, and retry without duplicate uploads. The live development Neon/Blob round trip now passes; production and real WorkOS
authentication were not exercised by that check.

## Live account storage verification

`scripts/daw-live-smoke.mjs` passes against the documented development Neon branch
and configured private Blob store. It drives the browser's real multipart upload,
token/completion handler and signed source download, while using a temporary test
identity instead of WorkOS. Project requests exercise the real repository through
a test transport adapter. After clearing localStorage/IndexedDB, reopening from
Projects restores the exact original bytes and plays the audio. A subsequent save
increments the project revision without creating another media asset.

The first run exposed an unapplied existing folder migration on the development
branch. The branch was confirmed through `current_setting('neon.branch_id', true)`
against CODEX.md, and the repository migrations were applied. The smoke script now
checks that exact development branch and folder schema before creating fixtures.
Both test runs cleaned up their synthetic Blob objects and database records.
This verifies development storage integration, not production deployment or a real
WorkOS sign-in.

## WAV export quality checkpoint

Export settings apply to stereo mixes and each per-track stem: 44.1, 48 or 96 kHz,
16/24-bit PCM or 32-bit float. Defaults stay 44.1 kHz / 16-bit for compatibility.
Integer exports clip at full scale; float retains over-range samples for later
mixing. No normalization or dither is applied. Settings are workspace controls,
not edits to the arrangement and are not persisted with the document yet.
Offline bounce starts at time zero without the live transport's 25 ms scheduling
padding. All stems still share the arrangement length including effect tails.

WAV unit tests verify signed 24-bit packing, interleaving, RIFF padding, headers,
float headroom and the default recording format. The browser bounce check verifies
actual mix/stem downloads, sample rates, start timing and browser float decoding.

## MIDI timing and feel checkpoint

The piano roll includes a Timing & feel panel. Quantize offers straight and triplet
grids, 0–100% strength and 0–75% swing delay. Swing delays alternate grid points by
that fraction of the chosen grid interval; it is not a conventional swing-ratio
percentage. Starts move toward the nearest swung point and are clamped to keep
whole notes inside the region. Existing grid-only commands retain full straight
quantization behavior, with safer region boundaries.

Humanize varies note starts and lengths by a configurable number of milliseconds
and velocity by MIDI steps. The variation seed makes the edit deterministic across
server validation and browser application, independent of note order. Zero-valued
parameters leave that property unchanged; silent notes stay silent. Pitch and
channel are preserved. Both tools apply to all notes in the region or one selected
note, through the same atomic, undoable commands used by the agent. Reapplying
humanization compounds changes; undo first to compare different seeds from the
same starting notes. Tool preferences last for the current workspace instance;
resulting note edits persist in projects and MIDI exports.

`notes.quantize` adds optional strength, swing and noteId. `notes.humanize` accepts
seed, timing/duration in seconds, velocity in 0–1 units and optional noteId. Agent
instructions document these units and semantics. Mocked agent tests validate the
same deterministic output; a real connected model remains unverified.

Tests cover region edges, selected-note scope, deterministic/order-independent
variation, input rejection, atomic rollback, undo/redo, browser controls, session
restoration and downloaded MIDI timing/velocity. Multi-note selection, hardware
MIDI recording, groove templates and non-destructive region quantize parameters
remain pending.

## Master effects checkpoint

The mixer exposes Master effects using the same ordered EQ, compressor, delay and
reverb controls as track/bus inserts. The signal path is summed tracks/buses →
master inserts → master volume → output. Effects support add, edit, bypass, move,
delete and undo. `effect.add` targets the session ID for a master insert; existing
set/move/delete commands target its effect ID. Agent instructions document this
path, and globally unique IDs and the 16-effect chain limit apply to master inserts.

Sessions store `masterEffects`, defaulting to an empty chain for older projects.
The shared renderer applies these inserts in transport, cycle and offline WAV
rendering; arrangement duration includes their tails. Per-track stems include the
master chain, processed separately for each exported track, so nonlinear processing
can prevent their sum from reproducing the complete mix. Cycle effects still reset
at each loop boundary. Master metering, limiting, and export
options to omit master processing remain pending.

137 unit tests and the build pass. The master browser check verifies controls,
reorder/bypass/removal/undo, persistence, real PCM filtering/compression and bypass,
cancellation of opposite signals before master processing, post-effect master
gain, and rendered reverb tails. Existing track effects/automation/stem checks pass.

## Master automation checkpoint

Master channel now has the shared volume/pan automation editor and a static master
pan control. `session.set` accepts masterPan (-1..1); automation.point/clear target
the session ID for master curves, while automation.delete still targets a point ID.
Master curves run after master inserts, override masterDb/masterPan and interpolate
in the same way as track curves. Seeking initializes the value at the requested
position. Playback, cycle rendering and offline exports use the same scheduler.
Master processing is also retained in per-track stems.

The document stores masterAutomation and masterPan; older sessions default to no
points and centered pan. Commands enforce global ID uniqueness, parameter bounds,
atomic rollback and undo. Clearing one master curve preserves the other parameter
and all track automation. This edits curves explicitly; live automation recording
and master metering remain pending.

140 unit tests and the build pass. Browser checks exercise master curve controls,
clear/undo, static pan and persistence, and measure actual PCM fade levels, hard-pan
channel isolation, seek equivalence and effects followed by master gain. The
existing track-effects/automation/export regression also passes. Agent fade plans
are tested with a mocked provider; real inference remains unverified.

## Send position checkpoint

Each send now has a Position selector: Before volume (`preFader`), After volume
(`postFader`), or After pan (`postPan`). All three taps are after the channel inserts.
Before volume ignores the source volume and pan curves; After volume follows volume
but ignores pan; After pan follows both. Send gain then scales that tapped signal
before it enters the destination bus. Source and bus mute silence every outgoing
send, including pre-fader sends. Routing cycle validation is unchanged.

`send.set` accepts optional tap and can update an existing send's level or position
independently. New sends require a level. Older projects default to postPan,
preserving their previous mix. Commands are atomic and undoable; positions persist
in projects and share the playback/offline/stem renderer. Agent instructions describe
these positions and mute semantics. Send-level automation is implemented in the
following checkpoint.

141 unit tests and the build pass. The send-position browser check verifies controls,
undo and persistence plus actual PCM fader/pan independence, volume automation,
post-insert filtering and mute for sources and nested buses. The existing bus routing
and stem check also passes.

## Send automation checkpoint

Each send has an expandable automation panel using the same curve editor as tracks
and the master. Its gain points interpolate in dB, override the static send level,
and use absolute session seconds. Curves work with every send position and remain
independent of source volume/pan automation. Clearing the curve restores the static
send gain; deleting the send or destination bus removes its curve, with undo
restoring it. Open send panels remain open while editing during the current view.

`send.automation.point` targets the source track with busId, optional point id, time
and value (-96..12 dB). It upserts points at the same time. `send.automation.clear`
targets the source with busId, and `automation.delete` removes any automation point
by its globally unique ID. Send schemas default old projects to empty curves and
permit up to 2,000 gain points per send. Pan curves are not accepted on sends.
Agent tool instructions expose these commands and units.

143 unit tests and the build pass. Browser checks verify send-editor isolation,
point/clear/undo, persistence and actual rendered send fades, seek restoration,
stem equivalence and mute. Existing track/master curve and effect tests pass after
extracting the common editor. Live automation recording and effect-parameter automation remain pending;
draggable curve handles are now implemented.

## Direct automation editing checkpoint

Track, master and send curve points can be dragged, edited numerically, or adjusted
from a focused graph handle with arrow keys. Left/right moves by 0.1 seconds;
up/down changes gain by 0.5 dB or pan by 0.05. Shift multiplies those steps by ten.
Delete/Backspace removes the focused point. Focus survives repeated keyboard edits.
Dragging previews the curve and time/value, then commits one undoable edit on
release; pointer cancellation restores the original display. Handles stay inside
the graph edges, and gain graphs show the full supported -96..12 dB range.

`automation.set` targets an existing point ID with optional time/value and works
across tracks, master and sends. It preserves ID and parameter, rejects out-of-range
values and same-parameter time collisions, and shares atomic execution and undo
with agent edits. Different parameters can occupy the same time. Numeric editing
allows precise values beyond the current graph's horizontal range.

145 unit tests and the build pass. Browser tests verify dragging without duplicate
points, repeated keyboard edits/focus, deletion/undo, numeric updates, collision
rollback, send isolation and persisted changes. Track/master/send PCM regression
checks also pass. Multi-point selection, curved interpolation and live automation
recording remain pending.
