import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_RATE as sr,
  detectRegions,
  prepareMovie,
  matchTrack,
} from "../src/analysis.js";
import { toFrames, fromFrames, atOffset, elapsed } from "../src/timecode.js";

export function music(length = 8, seed = 1) {
  const data = new Float32Array(length * sr);
  let phase = 0,
    noise = seed;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr,
      note = Math.floor(t * 4);
    const frequency =
      110 +
      (((Math.imul(note + seed * 7919, 1103515245) >>> 8) ^
        (note * seed * 3571)) %
        380);
    phase += (2 * Math.PI * frequency) / sr;
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    data[i] =
      (Math.sin(phase) * 0.3 +
        Math.sin(phase * 1.503) * 0.12 +
        (noise / 2 ** 32 - 0.5) * 0.03) *
      Math.min(1, t * 10, (length - t) * 10);
  }
  return data;
}
test("silence segmentation retains separated regions and rejects silence", () => {
  const x = new Float32Array(sr * 20);
  x.set(music(4), sr * 2);
  x.set(music(3, 2), sr * 12);
  const r = detectRegions(x);
  assert.equal(r.length, 2);
  // The fixture has 100 ms fades; portions below the default floor are excluded.
  assert.ok(r[0].start >= 2 && r[0].start <= 2.1);
  assert.ok(r[1].end >= 14.9 && r[1].end <= 15);
  assert.equal(detectRegions(new Float32Array(sr * 5)).length, 0);
});
test("custom silence detection retains above-threshold audio and splits silent and below-threshold gaps", () => {
  const x = new Float32Array(sr * 12);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const db = t >= 1 && t < 3 ? -32
      : t >= 3 && t < 5 ? -32 - 3 * (t - 3)
      : (t >= 6 && t < 8) || (t >= 9 && t < 11) ? -34
      : t >= 8 && t < 9 ? -45 : null;
    if (db !== null)
      x[i] = Math.SQRT2 * 10 ** (db / 20) * Math.sin(2 * Math.PI * 200 * t);
  }
  const regions = detectRegions(x, {thresholdDb: -40, gap: 0.35});
  assert.equal(regions.length, 3);
  for (const [i, start, end] of [[0, 1, 5], [1, 6, 8], [2, 9, 11]]) {
    assert.ok(Math.abs(regions[i].start - start) <= 0.02);
    assert.ok(Math.abs(regions[i].end - end) <= 0.02);
  }
});
test("matching finds repeated and trimmed placements in a mix, not unrelated audio", () => {
  const source = music(),
    movie = new Float32Array(sr * 40);
  let seed = 9;
  for (let i = 0; i < movie.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    movie[i] = (seed / 2 ** 32 - 0.5) * 0.06;
  }
  for (let i = 0; i < source.length; i++) {
    movie[sr * 3 + i] += source[i] * 0.6;
    movie[sr * 18 + i] += source[i] * 0.4;
  }
  movie.set(source.slice(sr * 2, sr * 6), sr * 31);
  const prepared = prepareMovie(movie),
    found = matchTrack(prepared, source).matches;
  assert.equal(found.length, 3, JSON.stringify(found));
  for (const [i, start, end] of [
    [0, 3, 11],
    [1, 18, 26],
    [2, 31, 35],
  ]) {
    assert.ok(Math.abs(found[i].start - start) < 0.15, JSON.stringify(found));
    assert.ok(Math.abs(found[i].end - end) < 0.15, JSON.stringify(found));
  }
  assert.equal(matchTrack(prepared, music(8, 99)).matches.length, 0);
});
test("frame offsets include preroll, fractional rates, and drop-frame transitions", () => {
  assert.equal(atOffset("00:59:55:00", 8.5, "24"), "01:00:03:12");
  assert.equal(atOffset("00:59:55:00", 5, "25"), "01:00:00:00");
  assert.equal(toFrames("00:01:00;00", "29.97df"), null);
  assert.equal(fromFrames(1800, "29.97df"), "00:01:00;02");
  assert.equal(fromFrames(17982, "29.97df"), "00:10:00;00");
  assert.ok(
    Math.abs(elapsed("00:00:00:00", "00:01:00:00", "23.976") - 60.06) < 1e-8,
  );
  for (const rate of ["24", "25", "30", "23.976", "29.97", "29.97df"])
    for (const n of [0, 1799, 1800, 17982, 107892])
      assert.equal(toFrames(fromFrames(n, rate), rate), n);
});
