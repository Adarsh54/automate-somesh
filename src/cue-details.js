export function cueDetails(track, previous = null) {
  return {
    category: previous?.category ?? track?.legacyCueCategory ?? 'unknown',
    credits: structuredClone(previous?.credits ?? track?.credits ?? []),
  };
}
export function migrateCueDetails(state) {
  for (const cue of state.cues) {
    const track = state.tracks.find(t => t.id === cue.trackId);
    cue.category ??= track?.category ?? 'unknown';
    cue.credits ??= structuredClone(track?.credits ?? []);
  }
  // Legacy source credits remain a starting template, never an editable owner.
  for (const track of state.tracks) {
    if (track.category != null) track.legacyCueCategory ??= track.category;
    delete track.category;
  }
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
