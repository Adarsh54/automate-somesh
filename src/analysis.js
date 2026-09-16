// Browser/Node-compatible signal processing. All samples are mono at ANALYSIS_RATE.
export const ANALYSIS_RATE = 2000;
export const MAX_DURATION = 20 * 60;
// Default music-only segmentation floor: −65 dBFS on normalized PCM.
// Audio below this level, including soft passages and fades, is treated as silence.
export const SILENCE_THRESHOLD_DB = -65;

export function detectRegions(
  samples,
  { thresholdDb = SILENCE_THRESHOLD_DB, gap = 2.5, minimum = 0.5 } = {},
) {
  const hop = 40; // 20 ms boundaries
  const threshold = 10 ** (thresholdDb / 20);
  const regions = [];
  let start = null,
    last = 0;
  for (let i = 0; i < samples.length; i += hop) {
    const end = Math.min(i + hop, samples.length);
    let energy = 0;
    for (let j = i; j < end; j++) energy += samples[j] ** 2;
    if (Math.sqrt(energy / (end - i)) >= threshold) {
      if (start === null) start = i / ANALYSIS_RATE;
      last = end / ANALYSIS_RATE;
    } else if (start !== null && i / ANALYSIS_RATE - last >= gap) {
      if (last - start >= minimum) regions.push({ start, end: last });
      start = null;
    }
  }
  if (start !== null && last - start >= minimum)
    regions.push({ start, end: last });
  return regions;
}

function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    const stepR = Math.cos(angle),
      stepI = Math.sin(angle),
      half = size / 2;
    for (let base = 0; base < n; base += size) {
      let wr = 1,
        wi = 0;
      for (let j = base; j < base + half; j++) {
        const k = j + half,
          tr = wr * re[k] - wi * im[k],
          ti = wr * im[k] + wi * re[k];
        re[k] = re[j] - tr;
        im[k] = im[j] - ti;
        re[j] += tr;
        im[j] += ti;
        const next = wr * stepR - wi * stepI;
        wi = wr * stepI + wi * stepR;
        wr = next;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
}

export function prepareMovie(samples) {
  let n = 1;
  while (n < samples.length + 2 * ANALYSIS_RATE) n *= 2;
  const re = new Float64Array(n),
    im = new Float64Array(n);
  re.set(samples);
  fft(re, im);
  const sum = new Float64Array(samples.length + 1),
    square = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i++) {
    sum[i + 1] = sum[i] + samples[i];
    square[i + 1] = square[i] + samples[i] ** 2;
  }
  return { samples, re, im, sum, square };
}

function anchorCandidates(movie, source, start, length, threshold) {
  const n = movie.re.length,
    re = new Float64Array(n),
    im = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < length; i++) mean += source[start + i];
  mean /= length;
  let energy = 0;
  for (let i = 0; i < length; i++) {
    re[i] = source[start + i] - mean;
    energy += re[i] ** 2;
  }
  if (energy < 1e-6) return [];
  fft(re, im);
  for (let i = 0; i < n; i++) {
    const a = re[i],
      b = im[i];
    re[i] = movie.re[i] * a + movie.im[i] * b;
    im[i] = movie.im[i] * a - movie.re[i] * b;
  }
  fft(re, im, true);
  const candidates = [];
  let best = null;
  // One strongest local peak per 0.5 s neighborhood, not a global top-one match.
  for (let pos = 0; pos <= movie.samples.length - length; pos++) {
    const s = movie.sum[pos + length] - movie.sum[pos];
    const e = movie.square[pos + length] - movie.square[pos] - (s * s) / length;
    const score =
      e > 1e-8 ? Math.min(1, Math.abs(re[pos]) / Math.sqrt(e * energy)) : 0;
    if (score >= threshold) {
      if (best && pos - best.pos > ANALYSIS_RATE / 2) {
        candidates.push(best);
        best = null;
      }
      if (!best || score > best.score)
        best = { pos, offset: pos - start, score };
    }
  }
  if (best) candidates.push(best);
  return candidates.sort((a, b) => b.score - a.score).slice(0, 100);
}

function similarity(a, b, ai, bi, length) {
  let xy = 0,
    xx = 0,
    yy = 0,
    x = 0,
    y = 0;
  for (let j = 0; j < length; j++) {
    const av = a[ai + j],
      bv = b[bi + j];
    xy += av * bv;
    xx += av * av;
    yy += bv * bv;
    x += av;
    y += bv;
  }
  const denom = (xx - (x * x) / length) * (yy - (y * y) / length);
  return denom > 1e-12
    ? Math.min(1, Math.abs(xy - (x * y) / length) / Math.sqrt(denom))
    : 0;
}

function traceMatch(movie, source, candidate, threshold) {
  const hop = 200,
    first = Math.max(0, -candidate.offset),
    last = Math.min(source.length, movie.length - candidate.offset);
  const regions = [];
  let start = null,
    end = 0,
    scores = [],
    lastStrong = 0;
  function finish() {
    if (start !== null && end - start >= ANALYSIS_RATE && scores.length >= 7)
      regions.push({
        start: (candidate.offset + start) / ANALYSIS_RATE,
        end: (candidate.offset + end) / ANALYSIS_RATE,
        sourceStart: start / ANALYSIS_RATE,
        score: scores.reduce((a, b) => a + b, 0) / scores.length,
      });
    start = null;
    scores = [];
  }
  for (let i = first; i < last; i += hop) {
    const size = Math.min(hop, last - i);
    if (size < 40) break;
    let score = 0;
    for (let shift = -1; shift <= 1; shift++) {
      const pos = candidate.offset + i + shift;
      if (pos >= 0 && pos + size <= movie.length)
        score = Math.max(score, similarity(source, movie, i, pos, size));
    }
    let energy = 0;
    for (let j = i; j < i + size; j++) energy += source[j] ** 2;
    if (score >= threshold && energy / size > 1e-7) {
      if (start === null) start = i;
      end = i + size;
      lastStrong = i;
      scores.push(score);
    } else if (start !== null && i - lastStrong >= 0.4 * ANALYSIS_RATE)
      finish();
  }
  finish();
  return regions;
}

export function matchTrack(
  movie,
  source,
  { threshold = 0.45, progress = () => {} } = {},
) {
  const active = detectRegions(source, {
    thresholdDb: -55,
    minimum: 1,
    gap: 0.5,
  });
  if (!active.length || source.length < ANALYSIS_RATE)
    return { matches: [], anchors: 0 };
  const length = Math.min(2 * ANALYSIS_RATE, source.length);
  const all = [];
  for (const region of active) {
    const first = Math.round(region.start * ANALYSIS_RATE),
      last = Math.min(
        source.length - length,
        Math.round(region.end * ANALYSIS_RATE) - length,
      );
    if (last < first) {
      all.push(Math.max(0, Math.min(first, source.length - length)));
      continue;
    }
    for (let pos = first; pos <= last; pos += 2 * ANALYSIS_RATE) all.push(pos);
    if (!all.includes(last)) all.push(last);
  }
  // Bound long-reference cost. UI discloses sparse anchors for tracks >32 seconds.
  const anchors =
    all.length <= 16
      ? all
      : Array.from(
          { length: 16 },
          (_, i) => all[Math.round((i * (all.length - 1)) / 15)],
        );
  const candidates = [];
  anchors.forEach((start, i) => {
    progress(i, anchors.length);
    for (const c of anchorCandidates(movie, source, start, length, threshold)) {
      const existing = candidates.find(
        (x) => Math.abs(x.offset - c.offset) < ANALYSIS_RATE * 0.15,
      );
      if (!existing) candidates.push(c);
      else if (c.score > existing.score) Object.assign(existing, c);
    }
  });
  const matches = [];
  for (const candidate of candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)) {
    for (const match of traceMatch(
      movie.samples,
      source,
      candidate,
      Math.max(0.3, threshold - 0.1),
    )) {
      if (
        !matches.some(
          (m) =>
            Math.min(m.end, match.end) - Math.max(m.start, match.start) >
            0.6 * Math.min(m.end - m.start, match.end - match.start),
        )
      )
        matches.push(match);
    }
  }
  return {
    matches: matches.sort((a, b) => a.start - b.start),
    anchors: anchors.length,
  };
}
