import { decodeMedia } from "./media.js";
import { toFrames, atOffset } from "./timecode.js";
import { applyMovieMetadata } from "./project.js";

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
        applyMovieMetadata(this.state, file, decoded);
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

export { workflowView } from "./workflow-view.js";
