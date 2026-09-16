export function blankCredits() {
  return ['Composer', 'Publisher'].map(role => ({id:crypto.randomUUID(), role, first:'', last:'', name:'', pro:'', ipi:'', share:''}));
}
export function effectiveCue(cue, shared) {
  return {...cue, category: cue.category ?? shared?.category ?? 'unknown', credits: cue.credits ?? shared?.credits ?? []};
}
export function cueDetails(track, previous = null) {
  const details = {};
  if (previous?.category != null) details.category = previous.category;
  if (previous?.credits != null) details.credits = structuredClone(previous.credits);
  return details;
}
export function migrateCueDetails(state) {
  state.sharedCueDetails ??= {category:'unknown', credits:blankCredits()};
  if (state.cueDetailsVersion !== 2) {
    // Never reinterpret historical cue edits as live inheritance.
    for (const cue of [...state.cues, ...(state.cueDetailsArchive ?? [])]) {
      const track = state.tracks.find(t => t.id === cue.trackId);
      cue.category ??= track?.category ?? track?.legacyCueCategory ?? 'unknown';
      cue.credits ??= structuredClone(track?.credits ?? blankCredits());
    }
    state.cueDetailsVersion = 2;
  }
  for (const cue of [...state.cues, ...(state.cueDetailsArchive ?? [])]) cue.usage ??= "BI";
  for (const owner of [state.sharedCueDetails, ...state.cues, ...(state.cueDetailsArchive ?? [])]) {
    for (const credit of owner.credits ?? []) credit.id ??= crypto.randomUUID();
  }
  for (const track of state.tracks) delete track.category;
}
export function matchingCue(cues, trackId, method, match, mediaName) {
  const candidates = cues.filter(c => c.trackId === trackId && c.method === method &&
    !c.staleSource && c.mediaName === mediaName &&
    Math.abs(c.relativeStart - match.start) < 0.001 &&
    Math.abs(c.relativeEnd - match.end) < 0.001);
  return candidates.length === 1 ? candidates[0] : null;
}
export function archiveCueDetails(state, method) {
  const previous = state.cues.filter(c => c.method === method);
  if (previous.length) state.cueDetailsArchive = [
    ...(state.cueDetailsArchive ?? []).filter(c => c.method !== method),
    ...structuredClone(previous),
  ];
}
