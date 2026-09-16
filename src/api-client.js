export const serverValidationEnabled = import.meta.env.VITE_API_ENABLED === "true";

// Send only fields required for validation, never media, archived cues or profiles.
export function validationPayload(state) {
  const pick = (source, keys) => Object.fromEntries(keys.filter(k => source?.[k] !== undefined).map(k => [k, source[k]]));
  const credits = list => list?.map(p => pick(p, ["role", "last", "name", "pro", "share"]));
  return {
    production: pick(state.production, ["title", "company", "preparedBy", "email", "duration", "startTimecode", "rate"]),
    mode: state.mode,
    movieOffset: state.movieOffset,
    movieMetadata: state.movieMetadata ? pick(state.movieMetadata, ["title", "duration"]) : undefined,
    movieOverrides: state.movieOverrides ? pick(state.movieOverrides, ["duration", "trimStart", "trimEnd"]) : undefined,
    sharedCueDetails: {credits: credits(state.sharedCueDetails.credits)},
    tracks: state.tracks.map(t => pick(t, ["id", "title", "offset"])),
    cues: state.cues.map(c => ({...pick(c, ["trackId", "title", "start", "end", "usage", "method", "reviewed", "staleSource"]), ...(c.credits != null ? {credits: credits(c.credits)} : {})})),
  };
}
export async function validateOnServer(state) {
  let response;
  try {
    response = await fetch("/api/validate", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(validationPayload(state)), signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("The cue-sheet check could not reach the server. Your edits are saved; please retry.");
  }
  if (!response.ok) throw new Error("The server could not check this cue sheet. Your edits are saved; please retry.");
  const result = await response.json();
  if (!result.valid) throw new Error(result.issues.join(" · "));
  return result;
}
