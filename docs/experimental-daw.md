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
| Session document | Tracks, regions, assets, tempo, meter, markers, persistence, undo/redo | Local document + IndexedDB assets and command history implemented; cloud/versioning pending |
| Audio arrangement | Import, waveform, move/trim/split/copy/delete, fades, gain, reverse, crossfades | Basic operations and graphical audio/video trim plus audio/MIDI fade handles implemented; dedicated crossfades pending |
| Transport and video | Synchronized multitrack playback, seek/loop, movie offset/timecode, scoring markers | Initial Web Audio transport/video monitor; seek, offsets and markers; loop/timecode and real video regression pending |
| MIDI | SMF import/export, piano roll, note/velocity/CC editing, quantize/transpose/humanize, device input/output | SMF note import/export, note placement/removal, note inspector, drag/resize, velocity, quantize and transpose implemented; CC/device/humanize pending |
| Composition tools | Instruments/sampler, step sequencer, chord/key/meter tools, notation/event editors | Pending |
| Recording | Audio/MIDI capture, monitoring, takes, punch, comping, latency compensation | Pending |
| Mix and effects | Gain/pan/mute/solo, master, buses/sends, EQ/dynamics/reverb/delay, plug-in chains | Channel strips, ordered EQ/compressor/delay/reverb inserts and bypass implemented; buses/sends/master inserts pending |
| Automation | Editable parameter curves with playback/export parity | Track volume/pan points, interpolation and seek initialization implemented in shared playback/export renderer; effect automation and recording pending |
| Advanced arrangement | Time stretching, pitch correction, tempo maps, grouping/stacks, loops/scenes | Pending |
| Deliverables | Stereo and stem bounce, region export, video sound replacement, project interchange | Stereo WAV, aligned per-track WAV ZIP and MIDI export implemented; portable media archives implemented; grouped stems and region/movie export pending |
| Agent | Typed instructions, real model adapter, schema-validated operations, atomic execution, undo, stale-state protection, trace | Adapter and command harness implemented; mocked tests pass; real model run unverified, local key/model absent |
| Account/storage | Durable project/media save, restore, ownership, version conflicts | Pending |
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
- Entire repository: 110 tests passing; Vite production build passing.
- Not verified: actual model inference, microphone/MIDI hardware, cloud DAW saves,
  real-video synchronization, heavy sessions, mobile editing.

Current limitations are substantive: simple oscillator instruments, no buses/sends, automation recording,
recording/comping, professional time stretching/pitch editing,
notation, full MIDI event preservation, Live Loops, or spatial audio. Browser source
decoding currently caps individual audio at 250 MB; offline bounce caps ten minutes.
Imported movie sound is not mixed yet. Session JSON references device-local assets. Export project bundles original media
in a portable archive; cloud project storage is still pending. The full goal remains active.

Next implementation priorities: cloud project storage; MIDI event/device tools; recording; bus/send routing; crossfades; movie-audio treatment and timecode; connected model validation.

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
16-bit PCM WAVs; grouped buses and higher-resolution export remain pending. ZIP
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
Multiple-note selection, variable snap grids and MIDI CC lanes remain pending.

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
