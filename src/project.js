import { time, seconds } from "./model.js";
import { atOffset, rates, toFrames, fromFrames } from "./timecode.js";
import { inferredMovieTiming } from "./metadata.js";

export function effectiveProduction(state) {
  const p = { ...state.production };
  if (state.mode === "movie" && state.movieMetadata) {
    const m = state.movieMetadata,
      o = state.movieOverrides || {};
    p.title = p.title || m.title;
    const trimStart = Number(o.trimStart || 0),
      trimEnd = Number(o.trimEnd || 0);
    const length = Math.max(0, m.duration - trimStart - trimEnd);
    p.duration = o.duration ?? time(Math.round(length));
    p.startTimecode = atOffset(state.movieOffset, trimStart, p.rate);
  }
  return p;
}

export function convertRate(state, rate) {
  const before = state.production.rate;
  if (before === rate) return;
  const convert = (value) => {
    const f = toFrames(value, before);
    return f === null
      ? ""
      : fromFrames(Math.round((f / rates[before].fps) * rates[rate].fps), rate);
  };
  state.production.startTimecode = convert(state.production.startTimecode);
  state.movieOffset = convert(state.movieOffset);
  state.tracks.forEach((t) => (t.offset = convert(t.offset)));
  state.cues.forEach((c) => {
    c.start = convert(c.start);
    c.end = convert(c.end);
    if (c.fileOffset) c.fileOffset = convert(c.fileOffset);
    c.rate = rate;
    if (c.method !== "manual") c.reviewed = false;
  });
  state.production.rate = rate;
}

export function applyMovieMetadata(state, file, metadata) {
  const key = [file.name, file.size, file.lastModified || 0].join("|");
  state.movieProfiles ??= {};
  if (state.movieMetadata)
    state.movieProfiles[state.movieMetadata.key] = {
      overrides: { ...state.movieOverrides },
      origin: state.movieOffset,
      rate: state.production.rate,
      originEdited: state.movieOriginEdited,
      rateEdited: state.movieRateEdited,
    };
  const saved = state.movieProfiles[key],
    inferred = inferredMovieTiming(
      metadata.frameMetrics,
      metadata.embeddedTimecode,
    );
  state.movieMetadata = {
    key,
    filename: file.name,
    title: file.name.replace(/\.[^.]+$/, ""),
    duration: metadata.duration,
    ...inferred,
  };
  state.movieOverrides = saved?.overrides || {};
  const rate = saved?.rateEdited ? saved.rate : inferred.rate;
  convertRate(state, rate);
  state.movieOffset = saved?.originEdited ? saved.origin : inferred.origin;
  state.movieOriginEdited = Boolean(saved?.originEdited);
  state.movieRateEdited = Boolean(saved?.rateEdited);
}

export function productionIssues(state) {
  const p = effectiveProduction(state),
    issues = [];
  if (!p.title.trim()) issues.push("Add the production title");
  if (
    state.mode === "movie" &&
    state.movieMetadata &&
    toFrames(state.movieOffset, p.rate) === null
  )
    issues.push("Correct the movie file’s starting timecode");
  if (p.duration && (seconds(p.duration) === null || seconds(p.duration) <= 0))
    issues.push(
      "Use HH:MM:SS for a positive show duration, or leave it unknown",
    );
  if (p.startTimecode && toFrames(p.startTimecode, p.rate) === null)
    issues.push("Correct the optional production start timecode");
  if (state.mode === "movie" && state.movieMetadata) {
    const o = state.movieOverrides || {},
      a = Number(o.trimStart || 0),
      b = Number(o.trimEnd || 0);
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      a < 0 ||
      b < 0 ||
      a + b >= state.movieMetadata.duration
    )
      issues.push(
        "Pre-roll and tail must leave a positive production duration",
      );
  }
  return issues;
}

export function productionWarnings(state) {
  const p = effectiveProduction(state),
    warnings = [];
  if (!p.company.trim())
    warnings.push("Production company is unknown. Add it before submission.");
  if (!p.duration)
    warnings.push(
      "Full show duration is unknown. Audio cue lengths cannot establish it; add it before submission.",
    );
  if (!p.preparedBy.trim() || !p.email.trim())
    warnings.push(
      "Preparer/contact details are blank. Add them if required by your production team.",
    );
  return warnings;
}
