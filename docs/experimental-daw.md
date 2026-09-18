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
| Audio arrangement | Import, waveform, move/trim/split/copy/delete, fades, gain, reverse, crossfades | Basic operations implemented; graphical trim/fade handles and dedicated crossfades pending |
| Transport and video | Synchronized multitrack playback, seek/loop, movie offset/timecode, scoring markers | Initial Web Audio transport/video monitor; seek, offsets and markers; loop/timecode and real video regression pending |
| MIDI | SMF import/export, piano roll, note/velocity/CC editing, quantize/transpose/humanize, device input/output | SMF note import/export, note placement/removal, command-level note editing, quantize and transpose implemented; CC/device/graphical note inspector/humanize pending |
| Composition tools | Instruments/sampler, step sequencer, chord/key/meter tools, notation/event editors | Pending |
| Recording | Audio/MIDI capture, monitoring, takes, punch, comping, latency compensation | Pending |
| Mix and effects | Gain/pan/mute/solo, master, buses/sends, EQ/dynamics/reverb/delay, plug-in chains | Pending |
| Automation | Editable parameter curves with playback/export parity | Pending |
| Advanced arrangement | Time stretching, pitch correction, tempo maps, grouping/stacks, loops/scenes | Pending |
| Deliverables | Stereo and stem bounce, region export, video sound replacement, project interchange | Pending |
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
- Entire repository: 101 tests passing; Vite production build passing.
- Not verified: actual model inference, microphone/MIDI hardware, cloud DAW saves,
  real-video synchronization, heavy sessions, mobile editing.

Current limitations are substantive: simple oscillator instruments, no effects
rack/buses/automation, recording/comping, professional time stretching/pitch editing,
notation, full MIDI event preservation, Live Loops, or spatial audio. Browser source
decoding currently caps individual audio at 250 MB; offline bounce caps ten minutes.
Imported movie sound is not mixed yet. Session JSON references device-local assets;
it is not a portable archive. The full goal remains active.

Next implementation priorities: durable project/archive interchange; MIDI note
inspector and event/device tools; recording; mixer/effects/automation; graphical
region trim/fades; movie-audio treatment and timecode; connected model validation.
