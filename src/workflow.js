import { decodeMedia } from "./media.js";
import { toFrames, atOffset, rates } from "./timecode.js";

export class Workflow {
  constructor({ state, save, render, notify }) {
    Object.assign(this, { state, save, render, notify });
    this.audio = new Map();
    this.urls = new Map();
    this.movie = null;
    this.busy = false;
    this.progress = "";
    this.worker = null;
    this.controller = null;
  }

  cancel() {
    this.controller?.abort();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.busy = false;
    }
    this.progress = "";
    this.notify("Analysis cancelled. Existing cues were kept.");
  }

  async load(file, track = null, movie = false) {
    if (this.busy) return;
    this.busy = true;
    this.controller = new AbortController();
    this.progress = `Decoding ${file.name}…`;
    this.render();
    try {
      const decoded = await decodeMedia(
        file,
        (percent) => {
          this.progress = `Decoding ${file.name} · ${percent}%`;
          const el = document.querySelector("#analysis-progress");
          if (el) el.textContent = this.progress;
        },
        this.controller.signal,
      );
      if (this.controller.signal.aborted) return;
      const url = URL.createObjectURL(file);
      if (movie) {
        if (this.movie) URL.revokeObjectURL(this.movie.url);
        this.movie = { ...decoded, filename: file.name, url };
        this.state.cues
          .filter((c) => c.method === "movie")
          .forEach((c) => {
            c.staleSource = true;
            c.reviewed = false;
          });
      } else {
        if (!track) {
          track = {
            id: crypto.randomUUID(),
            title: file.name.replace(/\.[^.]+$/, ""),
            filename: file.name,
            category: "unknown",
            offset: "",
            duration: decoded.duration,
            credits: ["Composer", "Publisher"].map((role) => ({
              role,
              first: "",
              last: "",
              name: "",
              pro: "",
              ipi: "",
              share: "",
            })),
          };
          this.state.tracks.push(track);
        } else if (
          Math.abs(track.duration - decoded.duration) > 0.1 ||
          track.filename !== file.name
        ) {
          URL.revokeObjectURL(url);
          throw new Error(
            "Reattach the same file (matching filename and duration), or add it as a new track. Existing placements were kept.",
          );
        }
        if (this.urls.has(track.id))
          URL.revokeObjectURL(this.urls.get(track.id));
        this.urls.set(track.id, url);
        this.audio.set(track.id, decoded.samples);
        track.duration = decoded.duration;
      }
      this.save();
      this.notify(
        `${file.name} decoded locally. ${movie ? "Add reference cues, then match the movie." : "Audio ready for analysis and credit review."}`,
        false,
      );
      return track;
    } catch (error) {
      if (error.name !== "AbortError")
        this.notify(`Could not read ${file.name}: ${error.message}`, false);
    } finally {
      this.busy = false;
      this.progress = "";
      this.render();
    }
  }

  analyze() {
    const s = this.state,
      mode = s.mode,
      rate = s.production.rate;
    if (this.busy) return;
    if (!s.tracks.length)
      return this.notify("Add at least one cue audio file.");
    if (s.tracks.some((t) => !this.audio.has(t.id)))
      return this.notify(
        "Reattach the missing audio files before analyzing. Files are not retained after a page reload.",
      );
    if (
      mode === "movie" &&
      (!this.movie || toFrames(s.movieOffset, rate) === null)
    )
      return this.notify(
        "Add the finished movie and enter its file-start film timecode.",
      );
    if (
      mode === "offset" &&
      s.tracks.some((t) => toFrames(t.offset, rate) === null)
    )
      return this.notify(
        "Enter a valid file-start film timecode for every audio file.",
      );
    const key = mode === "movie" ? "movie" : "offset";
    if (
      s.cues.some((c) => c.method === key) &&
      !confirm(
        `Replace the previous ${key} analysis results? Manual cues and results from the other workflow will be kept.`,
      )
    )
      return;
    this.busy = true;
    this.progress = "Starting audio analysis…";
    this.render();
    this.worker = new Worker(new URL("./analysis.worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onerror = (event) => {
      this.worker?.terminate();
      this.worker = null;
      this.busy = false;
      this.progress = "";
      this.notify(
        `Analysis failed: ${event.message}. Existing cues were kept.`,
      );
    };
    this.worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        this.progress = data.text;
        const el = document.querySelector("#analysis-progress");
        if (el) el.textContent = data.text;
        return;
      }
      this.worker?.terminate();
      this.worker = null;
      this.busy = false;
      this.progress = "";
      if (data.type === "error")
        return this.notify(
          `Analysis failed: ${data.message}. Existing cues were kept.`,
        );
      const cues = [];
      for (const result of data.results) {
        const track = s.tracks.find((t) => t.id === result.id),
          offset = mode === "movie" ? s.movieOffset : track.offset;
        result.matches.forEach((match, i) => {
          const start = atOffset(offset, match.start, rate),
            end = atOffset(offset, match.end, rate);
          if (!start || !end) return;
          cues.push({
            id: crypto.randomUUID(),
            trackId: track.id,
            title:
              result.matches.length > 1 && mode === "offset"
                ? `${track.title} · cue ${i + 1}`
                : track.title,
            start,
            end,
            usage: "",
            method: key,
            reviewed: false,
            relativeStart: match.start,
            relativeEnd: match.end,
            fileOffset: offset,
            rate,
            score: match.score ?? null,
            sourceStart: match.sourceStart ?? match.start,
            mediaName: mode === "movie" ? this.movie.filename : track.filename,
          });
        });
      }
      s.cues = [...s.cues.filter((c) => c.method !== key), ...cues].sort(
        (a, b) =>
          (toFrames(a.start, rate) ?? Infinity) -
          (toFrames(b.start, rate) ?? Infinity),
      );
      s.analysisReport = {
        mode,
        seconds: data.elapsed,
        counts: data.results.map((r) => ({
          title: s.tracks.find((t) => t.id === r.id).title,
          count: r.matches.length,
          anchors: r.anchors,
        })),
        count: cues.length,
      };
      this.save();
      this.notify(
        `${cues.length} ${mode === "movie" ? "matching placements" : "sound regions"} detected in ${data.elapsed.toFixed(1)}s of analysis. Review the results and add usage/credits before export.`,
      );
    };
    // Structured cloning leaves low-rate PCM cached for re-analysis and previews.
    this.worker.postMessage({
      mode,
      movie: this.movie?.samples,
      tracks: s.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        samples: this.audio.get(t.id),
      })),
      options:
        mode === "offset"
          ? {
              thresholdDb: Number(s.thresholdDb),
              gap: Number(s.silenceGap),
              minimum: 0.5,
            }
          : { threshold: Number(s.matchThreshold) },
    });
  }
}

export function workflowView(state, workflow, { esc, field, select }) {
  const mode = state.mode;
  const modes = [
    [
      "movie",
      "01",
      "Movie matching",
      "Find supplied recordings in your finished movie.",
      "EXPERIMENTAL",
    ],
    [
      "offset",
      "02",
      "Audio with offset",
      "Find music regions between silences in a score export.",
      "MUSIC-ONLY AUDIO",
    ],
    [
      "manual",
      "03",
      "Manual",
      "Enter film timings or mark them from cue playback.",
      "YOU SET THE TIMINGS",
    ],
  ];
  return `<div class="workflow-modes">${modes.map(([key, n, title, text, tag]) => `<button data-mode="${key}" class="workflow-mode ${mode === key ? "chosen" : ""}" ${workflow.busy ? "disabled" : ""}><span class="eyebrow">${n} / ${tag}</span><h2>${title}</h2><p>${text}</p><span class="mode-choice">${mode === key ? "● Selected" : "○ Choose workflow"}</span></button>`).join("")}</div>
  <section class="panel workflow-settings"><div class="section-title"><h2>${mode === "movie" ? "Match the recordings you used" : mode === "offset" ? "Place a music-only export on the film timeline" : "Set cue timings by hand"}</h2><span class="muted">All processing stays on this device</span></div>
  <div class="form-grid" id="workflow-settings">${select(
    "Project frame rate",
    "rate",
    state.production.rate,
    Object.entries(rates).map(([k, v]) => [k, v.label]),
  )}${field("Production starts at film timecode", "startTimecode", state.production.startTimecode, 'placeholder="01:00:00:00"')}</div>
  <p class="muted">Use HH:MM:SS:FF (${state.production.rate === "29.97df" ? "semicolon before frames for drop-frame" : "frames, not milliseconds"}). File start is separate from production start: a file beginning at 00:59:55:00 can contain five seconds of pre-roll.</p>
  ${
    mode === "movie"
      ? `<div class="movie-input"><label class="upload-button">${workflow.movie ? "Replace movie" : "＋ Add finished movie"}<input id="movie-upload" type="file" accept="video/mp4,video/webm,.mov,.m4v" ${workflow.busy ? "disabled" : ""}></label><span>${workflow.movie ? `${esc(workflow.movie.filename)} · ${(workflow.movie.duration / 60).toFixed(1)} min` : "MP4 with AAC or WebM with Opus recommended"}</span></div><div id="movie-settings" class="form-grid">${field("Movie file starts at film timecode", "movieOffset", state.movieOffset, 'placeholder="00:59:55:00"')}${select(
          "Match sensitivity",
          "matchThreshold",
          String(state.matchThreshold),
          [
            ["0.55", "Strict · fewer false matches"],
            ["0.45", "Balanced"],
            ["0.32", "Sensitive · more review needed"],
          ],
        )}</div>${workflow.movie ? `<video id="movie-preview" controls preload="metadata" src="${workflow.movie.url}"></video>` : ""}<p class="muted">Upload the same cue recordings used in the movie. Finds repeated uses and excerpts containing a matching 1–2 second segment. Best at original speed/pitch; heavy dialogue, effects, retiming and very short cues can be missed. Longer references use up to 16 search segments, so short excerpts may be missed. No external catalog search.</p>`
      : mode === "offset"
        ? `<div class="form-grid" id="offset-settings">${select(
            "Silence threshold",
            "thresholdDb",
            String(state.thresholdDb),
            [
              ["-55", "−55 dBFS · include quiet tails"],
              ["-45", "−45 dBFS · balanced"],
              ["-35", "−35 dBFS · ignore low noise"],
            ],
          )}${select(
            "Minimum gap between cues",
            "silenceGap",
            String(state.silenceGap),
            [
              ["0.35", "0.35 seconds"],
              ["0.75", "0.75 seconds"],
              ["1.5", "1.5 seconds"],
            ],
          )}</div><p class="muted">Use music-only audio, with silence between cues. This detects sound above the threshold, not a music-vs-dialogue classifier. Regions shorter than 0.5 seconds are ignored. Each file has its own starting film timecode below.</p>`
        : '<p class="muted">Each audio file can have its own film-start offset. Add a manual cue, enter film in/out directly, or use “Mark in/out” during cue playback to add its offset automatically.</p>'
  }
  <p class="muted">Desktop Chrome recommended. Codec support depends on your browser; files without a decodable audio track show an error. Limit: 20 minutes per file. Media must be reattached after refresh; timing and credit details are saved locally.</p>
  <div class="button-row"><label class="upload-button">＋ Add ${mode === "offset" ? "music-only audio" : "cue audio files"}<input type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg" data-upload="unknown" ${workflow.busy ? "disabled" : ""}></label>${mode !== "manual" ? `<button class="primary" id="analyze" ${workflow.busy || !state.tracks.length ? "disabled" : ""}>${mode === "movie" ? "Find music in movie" : "Detect music regions"}</button>` : ""}${workflow.busy ? '<button id="cancel-analysis">Cancel</button>' : ""}</div><p id="analysis-progress" role="status">${esc(workflow.progress)}</p>
  </section>${state.analysisReport ? `<section class="panel analysis-report"><div class="section-title"><h2>Last analysis · ${state.analysisReport.count} detections</h2><button class="primary" data-tab="cues">Review timings →</button></div><p class="muted">${state.analysisReport.mode === "movie" ? "Movie matching" : "Audio with offset"} · ${state.analysisReport.seconds.toFixed(1)}s signal processing (excludes file decoding). Detections are candidates to review, not guaranteed identifications.</p><ul>${state.analysisReport.counts.map((r) => `<li>${esc(r.title)} <strong>${r.count ? `${r.count} ${r.count === 1 ? "placement" : "placements"}` : "No match / region found"}</strong></li>`).join("")}</ul></section>` : ""}`;
}
