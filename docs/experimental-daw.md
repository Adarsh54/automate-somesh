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
| MIDI | SMF import/export, piano roll, note/velocity/CC editing, quantize/transpose/humanize, device input/output | SMF note import/export, note placement/removal, note inspector, drag/resize, velocity, quantize and transpose implemented; channel-event import/export/editing and core controller playback implemented; strength/swing quantization and seeded humanization implemented; standalone Web MIDI input capture implemented with simulated-device tests; hardware verification and device output pending |
| Composition tools | Instruments/sampler, step sequencer, chord/key/meter tools, notation/event editors | Oscillator instruments, synthesized drum kit, bar-based step sequencer and MIDI event editor implemented; sampler, chord/key tools and notation pending |
| Recording | Audio/MIDI capture, monitoring, takes, punch, comping, latency compensation | Standalone microphone WAV takes, input meter and Web MIDI takes implemented; overdub, monitoring, punch/comping and latency compensation pending |
| Mix and effects | Gain/pan/mute/solo, master, buses/sends, EQ/dynamics/reverb/delay, plug-in chains | Channel strips, ordered EQ/compressor/delay/reverb inserts and bypass implemented; bus outputs, selectable pre/post-fader sends, shared inserts and master inserts implemented |
| Automation | Editable parameter curves with playback/export parity | Track/master volume/pan and send-level points, interpolation and seek initialization implemented in shared playback/export renderer; effect automation and recording pending |
| Advanced arrangement | Time stretching, pitch correction, tempo maps, grouping/stacks, loops/scenes | Pending |
| Deliverables | Stereo and stem bounce, region export, video sound replacement, project interchange | Stereo WAV, aligned per-track WAV ZIP and MIDI export implemented; portable media archives implemented; output-group stems implemented; selected-region WAV implemented; isolated bus taps and movie export pending |
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
configurable musical increments, right-edge resizing, duplicate and explicit deletion.
The inspector displays beats while shared commands store seconds. The selected
note ID is passed to the agent. Invalid edits leave the prior document unchanged.
The browser piano regression covers drag pitch/time, resize, selection without
deletion, duplicate/delete/undo, edit rejection, region inspector and reload.
Variable snap grids are implemented. Multiple-note selection and graphical MIDI CC lanes remain pending.

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

## Atomic MIDI import checkpoint

The previous importer issued batches of note/event edits and then combined history
entries afterward. Large files could evict older undo entries, and failed imports
replaced the history object, losing existing undo/redo. MIDI file import now uses a
single `midi.import` command: decode/parse/validate the entire file, construct its
tracks and regions, then commit once. Failures leave the session and history
unchanged. A successful import increments the revision once, and undo removes the
whole imported file. Existing imports use fresh IDs, so the same file can be
imported more than once. Import stops transport before applying changes.

The command accepts original SMF data as base64 and optional start in session
seconds. Limits are 8 MB per MIDI file, 128 total session tracks, and 20,000 notes
plus 20,000 channel events per imported track. Existing time/duration bounds still
apply. Long track names are capped at the document's 200-character limit. Files
with no supported notes/channel events reject rather than creating empty history.
Times retain the parser's tempo-map conversion to seconds; tempo-map round-trip,
SysEx and unsupported metadata remain pending. Agent instructions prohibit
fabricating MIDI payloads; normal UI uploads invoke the same validated command.

148 unit tests and the build pass. The browser check imports 10,001 notes and 250
controller events, verifies single-step undo/redo, failed-import preservation,
export counts and reload. This run completed the import in 247 ms on the local test
machine; that is one measured fixture, not a general performance guarantee. Unit
tests also verify retention of 99 earlier undo entries and rejection of oversized
note lists. Large-session real-time playback and piano-roll rendering still need
separate performance work.

## Piano-roll snap checkpoint

Piano roll Snap offers Off, quarter/eighth/sixteenth/thirty-second notes, and eighth/
sixteenth triplets. Grid lines and note placement follow the selected interval at
the current tempo. Dragging moves/resizes in grid increments while preserving an
existing timing offset; Quantize aligns starts to exact grid positions. Holding
Shift temporarily bypasses snapping for placement, movement or resize. Off uses
free positioning and a default sixteenth-note insertion length. Region boundaries
and MIDI pitch/length limits still apply.

Snap is a workspace UI preference, retained through edits but reset to 1/16 on
reload. It is independent of the Quantize grid. The resulting note.add/note.set
edits use the existing shared command harness, undo and persistence; agent commands
remain precise seconds and are not constrained by a mouse-editing preference.

150 unit tests and the build pass. Browser checks verify triplet insertion,
relative-grid dragging, free movement/resize, Shift bypass, undo/redo, tempo-aware
grid width and saved notes. Existing inspector, duplicate/delete, drag/resize and
selected-note agent-context regression checks also pass.

## MIDI input recording checkpoint

Experimental has Connect MIDI, device selection, Record MIDI, Stop & save MIDI and
Discard take controls. Permission is requested only from Connect, with sysex:false.
The Web MIDI integration follows the [W3C Web MIDI API](https://www.w3.org/TR/webmidi/)
for input enumeration, event timestamps and device state changes. Unsupported or
denied access produces an in-app message; importing MIDI files remains available.

This records a standalone take from one input at the current playhead. Notes retain
channels and velocities; controller, bend, program and pressure messages are kept.
Repeated same-pitch notes are paired per channel; held notes close at Stop. MIDI
clock/SysEx messages are ignored. Capture is limited to ten minutes, 20,000 notes
and 20,000 channel events. Reaching a limit or disconnecting the device stops and
saves captured material. No live instrument monitoring, overdub, metronome/count-in,
MIDI output or latency calibration is implemented yet.

The take goes through the shared atomic MIDI import command into a new editable
track and can be undone as one action. It is converted through the existing
480-PPQ MIDI writer/parser, so timing has that tick resolution. Storage failures
restore the prior session/history and keep the take for retry; edits stay locked
until saved or discarded. Explicit cancellation or leaving Experimental discards
an unsaved take and closes input listeners. Pending device opens are invalidated
on navigation. Device permission/recording is an explicit UI action; the agent can
edit the resulting document through the existing harness.

153 unit tests and the build pass. A simulated Web MIDI browser test checks access
options, capture/import/undo, cancellation, disconnect recovery, save retry,
permission denial and navigation during a pending input open. Capture unit tests
cover note pairing, channels, controllers, invalid messages and limits. Existing
synthetic microphone recording tests also pass. No physical MIDI keyboard, device
driver latency or browser/OS compatibility matrix was tested.

## Grouped stem export checkpoint

Export settings now selects individual-track stems or output groups. Sources sharing
the same final primary output bus render together through that bus's processing.
Nested groups roll into the outermost output bus; Master-routed sources remain
individual files. This partitions unmuted audio/MIDI sources exactly once. Send-only
relationships never change membership. All buses remain in each render so that
source contributions retain downstream routes, sends, inserts and automation.
Solo is ignored; bus mute is preserved. Session data and undo history are unchanged.

The ZIP uses numbered, sanitized group names and identical full-arrangement lengths
including tails. Existing sample rate/bit depth selections apply. This is grouping
by output routing, not an isolated bus-output tap: shared return/master processing
still runs separately per group. Nonlinear processing shared across groups may
therefore prevent summed stems from matching the complete mix. Arbitrary export
selection, isolated bus taps and master-processing bypass remain pending.

155 unit tests and the build pass. Browser checks download real grouped WAVs and
verify file names, alignment and summed PCM against the full mix, including two
instruments compressed together inside a bus. Unit tests cover nested outputs,
send-only contributors, muted/video exclusion, solo clearing, routing validity and
unchanged source documents. Physical-device and production deployment validation
are outside this export checkpoint.

## MIDI region crop checkpoint

MIDI timeline regions now expose trim handles and a numeric Crop MIDI region form.
The shared `region.trim` command accepts absolute start/end boundaries inside the
current region. Notes are clipped and rebased without changing surviving IDs,
pitches, channels or velocities. Latest pre-cut controller/program/bend/pressure
state is chased to zero, unless an event for that state already exists at the cut.
Notes released before the cut but held by sustain are retained through their pedal
release. Fades are constrained to the remaining region. Undo restores the exact
original notes/events; invalid commands leave the document unchanged.

This is an event crop, not a non-destructive source-window model. Outward trim is
clamped and cannot restore cropped material; use Undo. Synth envelopes restart at
the new note onset, so a left crop does not preserve oscillator phase or the exact
waveform from the original note. Non-destructive hidden MIDI material and continuous
synthesis state across edits remain future work. No claim of full Logic parity.

157 unit tests pass. Browser verification covers edge dragging, numeric boundaries,
controller chase, undo/redo, reload, and actual offline audio before/inside/after
the crop. Audio/video source-based trimming remains on its existing code path.

## Playback metronome checkpoint

The playback metronome follows BPM and quarter-note beats per bar, accents beat one,
and offers an independent -60..0 dB level (default -18 dB, disabled by default).
It is modeled after the playback-click workflow described in Apple's
[metronome guide](https://support.apple.com/guide/logicpro/use-the-metronome-lgcp0534986f/10.7/mac/11.0).
Our synthesized click is original. It bypasses the session mixer/effects and is
opted into playback only; default cycle rendering, mix/stem bounces and MIDI exports
exclude it. Changing settings uses the shared command harness and stops transport.

One generated bar is looped with a playback-rate correction for rounded buffer
length, keeping node/memory usage bounded without accumulating bar-length rounding
drift. Seek resumes at the bar-relative offset. Cycle playback renders click with
the selected range and repeats that range, including mid-bar boundaries. Stop,
pause and navigation release the click source through the transport lifecycle.

159 unit tests and the build pass. Browser checks verify accented beats, spacing,
level ratio, seek and cycle PCM, idempotent stop, UI undo/persistence, playback and
silence in an actual exported WAV with click enabled. Existing cycle regression
checks also pass. Count-in, recording click, denominator/meter changes over time,
subdivisions and configurable metronome output routing remain pending.

## Recording metronome checkpoint

A separate During recording checkbox enables click for audio/MIDI takes via the
shared `session.set` field `metronomeRecordEnabled`, default false. Playback click
remains independently configurable. Both share tempo, quarter-note beats per bar,
level and playhead-relative phase. Audio capture gates incoming samples at the same
scheduled frame used to start click. Output click does not enter the microphone
capture graph. MIDI capture prepares the audio context before opening the take;
late preparation is invalidated after cancellation/navigation. Finish, discard,
disconnect, duration limits and save-failure transitions stop the click.

160 unit tests and build pass. Worklet tests cover exact frame gating inside a
processing block and stereo flushing. Synthetic microphone tests cover audible
input, timeline placement, click cleanup, and a silent input saved with output
click active (saved PCM stays silent). Simulated MIDI tests cover click cleanup
on stop/cancel/disconnect, save retry, late device open and late audio resume.
Physical device latency, acoustic bleed, OS scheduling and browser support still
need hardware verification. Count-in, monitoring and overdub remain pending.

## Recording count-in checkpoint

Audio and MIDI recording now support zero, one or two bars of count-in using the
current BPM and quarter-note beats per bar. Pre-roll click is independent of the
During recording checkbox; that option controls click after recording begins.
Click phase follows the selected playhead, including mid-bar starts. The document
field `countInBars` defaults to zero and uses shared command validation/undo.

Audio capture gates on the scheduled post-count-in frame. MIDI capture ignores
messages timestamped before its calculated capture start, including pre-roll note
ons and controllers. Early input does not enter the saved take; held notes begun
before recording are not retriggered. MIDI performance timestamps are mapped to
the audio clock during preparation, without hardware-latency compensation. Save
is disabled during count-in, while Cancel/navigation release active input and click.
Ten-minute recording limits count the take, not pre-roll.

163 unit tests and build pass. New tests cover duration/frame rounding, MIDI pre-roll
exclusion and setting validation. Browser tests verify audio/MIDI count-in display,
early-save disabling, no pre-roll in saved material, placement, cancel cleanup,
persistence and PCM click stopping/continuation. Existing synthetic microphone and
MIDI lifecycle checks also pass. Physical devices, hardware latency and suspended
background-tab timing still require verification; overdub/monitoring remain open.

## Piano-roll multi-selection checkpoint

Ctrl/Cmd-click toggles notes; Select all notes and Clear selection complement it.
Selected notes move together by drag or relative beat/semitone fields. Dragging
clamps the whole group to time/pitch boundaries, preserving internal spacing and
intervals. Shift remains the temporary snap bypass. Right-edge resizing affects
only that note. Duplicate selection places copies after the selected span; Delete
selection removes the group. Timing & feel can target the selected group. The
existing region-wide transpose button is explicitly labeled as region-wide.

Bulk notes.move/delete/duplicate commands operate atomically on comma-separated
noteIds under a region. Missing, duplicate or out-of-region IDs fail without edits;
invalid resulting pitches/times and note limits fail full session validation. IDs
are preserved on move and regenerated on duplication. Bulk changes use one undo
entry even above the 100-command batch limit. Agent requests include selected note
IDs and reject stale/duplicate selections before contacting the provider. Existing
single-note selection remains in the request for compatibility.

168 unit tests and build pass. Tests include 1,001-note atomic movement/undo, group
transform scoping and mocked provider validation. Browser checks cover selection,
group dragging, relative edits, copy/delete/undo, agent context, timing scope and
saved edits. Existing single-note and timing/feel browser checks pass. Selection
is transient and not persisted; marquee selection, multi-region selection and group
resize remain pending. Real model inference remains unverified.

## Box selection and group length editing checkpoint

The piano-roll tool selector offers Draw notes (default) and Select notes. Dragging
empty grid space in Select mode draws a box; Alt-drag temporarily selects in Draw
mode. Intersecting note rectangles are selected, in either drag direction, using
coordinates that account for grid scrolling. Ctrl/Cmd/Shift adds to the existing
selection. Escape/pointer cancellation restores it. Selection does not change the
document or create undo history, and empty-space selection does not add notes.

Right-edge dragging now resizes the selected group by a shared duration delta,
clamped so every note remains positive and within the region and duration limits.
The relative Length change form offers exact beat entry. Both use one atomic
notes.resize command through the agent/manual harness; starts, pitches and internal
length differences are retained. Single-note resizing and Shift snap bypass remain.

170 unit tests and build pass. Tests cover visual intersection geometry, reverse
dragging, duration bounds and atomic undo. Browser checks exercise box selection,
additive selection, Escape cancellation, Alt override, group drag/numeric resizing,
undo/redo and ordinary Draw insertion. Existing piano inspector and snap regression
checks pass. Box auto-scroll, multi-region selection and proportional scaling remain
pending; this does not complete the broader DAW goal.

## Selected-region bounce checkpoint

Bounce region exports a selected audio or MIDI region through the existing track,
bus and master processing. The file begins at the region boundary; original source
offset/fades/reversal are kept, and automation initializes at the original session
time. Other regions are removed from the render document. Bus/master tails extend
the output; solo is ignored, while track and bus mute remain active. Video reference
regions must first have audio extracted. Sample rate/bit depth settings apply.

A shared bounce planner now clones the complete session before asynchronous work
for mix, stem and region exports. Settings, title, routing and render duration stay
fixed while the user edits. Only audible audio assets in that plan are decoded.
Region export can therefore succeed with an unrelated missing source and can export
a short region late in a long arrangement, subject to the ten-minute output limit.

172 unit tests and build pass. Real browser downloads verify selected-only audio,
source offset, delay onset/tail, master gain automation at region time, MIDI synthesis
and the captured filename while editing during rendering. Existing mix/grouped-stem
format and summed PCM checks pass. DSP state begins at the region boundary; preceding
regions and their effect history are intentionally absent, so this is not a slice
of the fully mixed arrangement. In-place rendering, arbitrary time-range export,
movie muxing and master-processing bypass remain pending.

## Recording with arrangement playback checkpoint

Play arrangement while recording is a persistent, undoable `recordWithPlayback`
setting, off by default. Audio/MIDI takes continue creating new tracks while the
existing arrangement plays through the shared routing/effects/automation renderer.
Only audible audio sources are prepared. A fixed document snapshot is captured
before decoding, and edits are locked during a take. The microphone capture graph
remains separate from accompaniment and click output. Count-in starts backing at
the capture boundary; MIDI maps performance timestamps to the audio clock without
hardware latency compensation. Clock/playhead and movie preview advance with the
recording progress. Stop/cancel/disconnect/navigation release backing playback.

173 unit tests and build pass. Browser checks cover actual audio/MIDI takes, new
track placement, transport advancement, cancel cleanup, saved settings, backing
PCM starting at the requested time with seeked gain automation, and a silent input
remaining silent while backing synthesis runs. Existing count-in and MIDI lifecycle
checks pass. Tests use synthetic devices. Video behavior is wired to the existing
monitor but synchronized recording against a real movie/hardware setup still needs
verification. Recording is linear even when Cycle is enabled. Live input audition,
recording into existing tracks, take lanes, loop recording, punch/comping and
calibrated latency remain pending.

### Live MIDI audition during recording

Hear MIDI while recording adds opt-in triangle synthesis during capture and count-in.
The persisted `midiMonitorEnabled` flag uses the shared validated `session.set`
command, so manual and agent edits support undo. Voices implement note release,
repeated-note FIFO pairing, channel-specific sustain, volume/expression/pan and
fixed ±2-semitone pitch bend. All sound off, all notes off and reset controllers
handle live voices. Audition is bounded to 64 simultaneous voices and bypasses the
mixer; stop, cancel, disconnect and navigation dispose the monitor. Count-in notes
are heard but are excluded from the saved take. Saved controller playback retains
the existing renderer's supported subset; this is not a full General MIDI synth.

174 unit tests and build pass. The new browser MIDI-monitor check exercises actual
Web Audio output, pitch bend, sustain, volume, voice limits and cleanup alongside
simulated Web MIDI capture/count-in/save. Existing MIDI lifecycle and overdub browser
checks pass. Hardware input/latency, idle keyboard audition, instrument selection,
track-routed monitoring and microphone monitoring remain pending.

### Microphone monitoring

Added opt-in microphone audition with independent -60..0 dB output level, default
-18 dB. A dedicated gain branch bypasses capture and the mixer; monitoring starts
during count-in. A live Mute/Unmute monitor control affects the current take without
changing its saved preference. Session fields `audioMonitorEnabled` and
`audioMonitorDb` are validated and undoable for both manual and agent changes.
Stopping, canceling, leaving or failing initialization disconnects the monitor.
Headphones are required to avoid acoustic feedback; no input latency compensation
or hardware direct-monitor integration is claimed.

175 tests and build pass. Browser verification uses a fake microphone and real Web
Audio: capture/placement/save, live mute/unmute, persistence, cancel/navigation
cleanup, and separate raw/monitored PCM channels showing monitor gain does not
alter the capture branch. Physical interfaces, output selection, track-routed input
FX, multiple simultaneous inputs and latency calibration remain pending.

### Marker editing and navigation

Markers now have a chronological editing panel, named add form, rename/time edits,
delete, previous/next navigation and clickable ruler diamonds. Navigation stops
playback, follows its current position and scrolls to the destination. Markers can
extend the visible timeline beyond media without changing bounce duration; ruler
labels are bounded to 1,000. Absolute marker positions survive tempo changes.
The agent shares `marker.add` (optional stable ID), `marker.set` and `marker.delete`
with manual actions through validated atomic batches and undo/redo.

177 tests and build pass. Browser verification covers creation/order, rename/move,
delete, jumps, undo/redo, escaping, reload and distant-marker rendering. Range
markers, arrangement sections and SMF marker import/export are still pending.

### MIDI marker interchange

SMF marker meta-events now round-trip through the conductor track. Import converts
marker ticks with the source tempo map and places them at the same start offset as
notes/controller tracks. Marker-only MIDI files work; IDs are fresh on each import.
The entire import remains atomic and undoable, including marker limits and bounds.
Export uses the current session tempo and 480 PPQ, so timing is tick-quantized;
source tempo maps are not preserved. UTF-8 works within Cuestamp, while non-ASCII
label compatibility with legacy DAWs is not verified. Cue-point events remain
unsupported. Reference: https://midi.org/standard-midi-files-specification

180 tests and build pass. Unit coverage includes a hand-authored tempo-change MIDI
fixture, label/timing round-trip, combined note/marker placement, fresh IDs, rollback
and undo. The browser marker check exports and re-imports an actual downloaded
marker-only MIDI file and verifies all markers are restored without creating empty
instrument tracks. Import into a third-party desktop DAW remains unverified.

### Time-range WAV export

Cycle controls now offer Bounce range WAV using the saved start/end independently
of the Cycle checkbox. It shares mix rendering, mute/solo, routing and WAV format
settings, snapshots state before asynchronous work and loads only intersecting
media. It exports the exact selected duration, including silence, with no appended
tail. Short ranges late in long sessions are allowed; each output is limited to ten
minutes. The existing seek renderer initializes automation/controllers but does not
reconstruct DSP history from earlier material. This is disclosed in the UI; full
context pre-roll, arbitrary-range stem ZIPs and seamless tail/crossfade handling
remain pending.

181 tests and build pass. Browser verification inspects actual float WAV samples
and frame counts for a range 1,001 seconds into a session, source position and
master automation, missing unrelated media, metronome exclusion, Cycle-off exports
and an empty silent range. Unit checks cover bounds, snapshot isolation and routing.

### Track duplication

Track actions now supports full duplication and a new empty track with the same
settings. Copies are inserted after the source, preserve outgoing routing, and
regenerate all editable IDs while sharing media references. Audio, MIDI, movie and
bus tracks are supported. A copied bus does not automatically receive routes from
existing tracks. The validated `track.duplicate` command is shared with the agent,
with optional id/name/includeRegions, full atomic validation and one-step undo.

185 tests and build pass. Unit checks cover every child ID, source independence,
settings-only/bus behavior, shared audio/video assets, invalid flags/IDs and limits.
Browser checks cover both actions, edits, undo/redo, reload and actual synthesized
PCM matching two copies of the original. Multi-track duplication, track templates
and duplication of entire routed groups remain pending.

### Moving regions between tracks

Added cross-track region drag/drop and inspector destination selection. Transfers
retain all source data/IDs and use the destination instrument/effects/routing.
The shared `region.move` command accepts destination trackId and optional timeline
start, rejecting incompatible types, buses and invalid placement atomically. UI
shows compatible/incompatible target lanes and preserves horizontal snap behavior.

187 tests and build pass. Browser checks exercise pure vertical drags, invalid
lane rejection, inspector transfer, undo/redo, reload and actual audio reflecting
destination gain. Unit checks cover all three region kinds, preserved source
references and atomic failure. Multi-region transfers, drag autoscroll and copying
regions between tracks without moving remain pending.
