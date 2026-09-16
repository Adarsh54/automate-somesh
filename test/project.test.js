import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMovieMetadata,
  effectiveProduction,
  productionIssues,
  productionWarnings,
} from "../src/project.js";
import { inferredMovieTiming, readQuickTimeTimecode } from "../src/metadata.js";
import { cueIssues } from "../src/model.js";
const state = () => ({
  mode: "movie",
  production: {
    title: "",
    company: "",
    duration: "",
    startTimecode: "",
    preparedBy: "",
    email: "",
    rate: "24",
  },
  tracks: [],
  cues: [],
  movieOffset: "",
});
const metadata = {
  duration: 600,
  frameMetrics: { frameRateIsConstant: true, underlyingFrameRate: 25 },
  embeddedTimecode: null,
};
test("movie derives filename/duration/rate and explicit file-relative origin", () => {
  const s = state();
  applyMovieMetadata(s, { name: "My film.mp4", size: 100 }, metadata);
  const p = effectiveProduction(s);
  assert.equal(p.title, "My film");
  assert.equal(p.duration, "00:10:00");
  assert.equal(p.startTimecode, "00:00:00:00");
  assert.equal(p.rate, "25");
  assert.match(s.movieMetadata.originSource, /assumed/);
  assert.deepEqual(productionIssues(s), []);
});
test("embedded timecode wins, pre-roll adjusts production without changing file origin", () => {
  const s = state();
  applyMovieMetadata(
    s,
    { name: "movie.mov", size: 100 },
    {
      ...metadata,
      embeddedTimecode: {
        timecode: "00:59:55:00",
        rate: "24",
        source: "Embedded QuickTime timecode",
      },
    },
  );
  s.movieOverrides.trimStart = 5;
  assert.equal(effectiveProduction(s).startTimecode, "01:00:00:00");
  assert.equal(effectiveProduction(s).duration, "00:09:55");
  assert.equal(s.movieOffset, "00:59:55:00");
});
test("switching to audio-only cannot inherit movie-derived title, origin or show length", () => {
  const s = state();
  applyMovieMetadata(s, { name: "movie.mp4", size: 100 }, metadata);
  s.mode = "offset";
  const p = effectiveProduction(s);
  assert.equal(p.duration, "");
  assert.equal(p.startTimecode, "");
  assert.equal(p.title, "");
  assert.match(
    productionWarnings(s).join(" "),
    /Full show duration is unknown/,
  );
  s.production.title = "My project";
  assert.deepEqual(productionIssues(s), []);
  s.mode = "manual";
  assert.equal(effectiveProduction(s).duration, "");
  s.mode = "movie";
  assert.equal(effectiveProduction(s).duration, "00:10:00");
});
test("replacement resets per-file timing overrides, preserves explicit project title, and remembers old profile", () => {
  const s = state(),
    file = { name: "first.mp4", size: 100 };
  applyMovieMetadata(s, file, metadata);
  s.movieOverrides = { trimStart: 5, duration: "00:02:00" };
  s.movieOffset = "01:00:00:00";
  s.movieOriginEdited = true;
  s.production.title = "Entered project";
  applyMovieMetadata(
    s,
    { name: "second.mp4", size: 200 },
    { ...metadata, duration: 120 },
  );
  assert.deepEqual(s.movieOverrides, {});
  assert.equal(s.movieOffset, "00:00:00:00");
  assert.equal(effectiveProduction(s).duration, "00:02:00");
  assert.equal(effectiveProduction(s).title, "Entered project");
  applyMovieMetadata(s, file, metadata);
  assert.equal(s.movieOffset, "01:00:00:00");
  assert.equal(s.movieOverrides.trimStart, 5);
});
test("VFR and missing metadata are honest fallbacks, not inferred constant rates", async () => {
  const v = inferredMovieTiming(
    { frameRateIsConstant: false, underlyingFrameRate: 30 },
    null,
  );
  assert.equal(v.rate, "24");
  assert.equal(v.variable, true);
  assert.match(v.rateSource, /Variable/);
  assert.equal(inferredMovieTiming(null, null).origin, "00:00:00:00");
  assert.equal(await readQuickTimeTimecode(new Blob(["broken media"])), null);
});
test("unknown audio-only production bounds do not invent midnight or block valid cue timings", () => {
  const track = {
    title: "Cue",
    credits: [
      { role: "Composer", last: "Writer", pro: "BMI", share: "100" },
      { role: "Publisher", name: "Publisher", pro: "BMI", share: "100" },
    ],
  };
  assert.deepEqual(
    cueIssues(
      { start: "01:20:00:00", end: "01:20:02:00", usage: "BI" },
      track,
      { rate: "24", duration: "00:10:00", startTimecode: "" },
    ),
    [],
  );
});
