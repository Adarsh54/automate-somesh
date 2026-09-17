import {toFrames, fromFrames} from './timecode.js';

export function scoreOffset(state) {
  return state.scoreOffset ?? state.tracks.find(track => track.purpose !== 'library')?.offset ?? '01:00:00:00';
}

// A shared full-score start shifts film positions, never source playback positions.
export function applyScoreOffset(state, value) {
  state.scoreOffset = value;
  const rate = state.production.rate, next = toFrames(value, rate);
  if (next === null) return false;
  const tracks = new Map(state.tracks.filter(track => track.purpose !== 'library').map(track => [track.id, track]));
  for (const cue of [...state.cues, ...(state.cueDetailsArchive ?? [])]) {
    if (cue.method !== 'offset' || !tracks.has(cue.trackId)) continue;
    const before = toFrames(cue.fileOffset ?? tracks.get(cue.trackId).offset, rate);
    if (before === null || before === next) continue;
    for (const field of ['start', 'end']) {
      const current = toFrames(cue[field], rate);
      if (current !== null) cue[field] = fromFrames(current + next - before, rate);
    }
    cue.fileOffset = value;
    cue.reviewed = false;
  }
  for (const track of tracks.values()) track.offset = value;
  return true;
}
