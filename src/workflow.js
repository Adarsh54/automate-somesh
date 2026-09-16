import {cueDetails, matchingCue, archiveCueDetails} from "./cue-details.js";
import { decodeMedia } from "./media.js";
import { toFrames, atOffset, rates } from "./timecode.js";
import { applyMovieMetadata } from "./project.js";
import AnalysisWorker from "./analysis.worker.js?worker&inline";

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
        [...this.state.cues, ...(this.state.cueDetailsArchive ?? [])]
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
            offset: rates[this.state.production.rate]?.drop ? "01:00:00;00" : "01:00:00:00",
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

  analysisUnavailable() {
    const s = this.state;
    if (s.mode === "manual") return "Manual workflow uses entered timings, not detection.";
    if (this.busy && !this.worker) return "Wait for audio decoding to finish.";
    if (!s.tracks.length) return "Add at least one audio track to detect cues.";
    if (s.tracks.some(t => !this.audio.has(t.id))) return "Reattach missing audio files to run detection.";
    if (s.mode === "movie" && !this.movie) return "Reattach the movie to run detection.";
    if (s.mode === "movie" && toFrames(s.movieOffset, s.production.rate) === null)
      return "Enter a valid movie file-start timecode.";
    if (s.mode === "offset" && s.tracks.some(t => toFrames(t.offset, s.production.rate) === null))
      return "Enter a valid file-start timecode for each audio track.";
    return "";
  }

  analyze() {
    const reason = this.analysisUnavailable();
    if (reason) return this.notify(reason);
    const s = this.state, mode = s.mode, rate = s.production.rate, key = mode;
    // Replace an active worker before starting; late events cannot restore old results.
    this.worker?.terminate();
    this.busy = true;
    this.progress = "Starting audio analysis…";
    const fail = (detail) => {
      this.worker?.terminate();
      this.worker = null;
      this.busy = false;
      this.progress = "";
      this.notify(`${detail} Existing cues were kept.`);
    };
    try {
      // Keep the worker with this app version: Pages removes old hashed assets
      // on deploy, but an already-open tab must still be able to start analysis.
      this.worker = new AnalysisWorker();
    } catch {
      return fail("The browser could not start audio analysis. Try again in a current Chrome window; if it persists, reload and reattach your media.");
    }
    const worker = this.worker;
    this.render();
    this.worker.onerror = (event) => {
      if (this.worker !== worker) return;
      event.preventDefault();
      fail("Audio analysis stopped unexpectedly. Retry; if it happens again, try a shorter audio export or reload and reattach your media.");
    };
    this.worker.addEventListener("messageerror", () => {
      if (this.worker !== worker) return;
      fail("The browser could not read the analysis result. Retry or use a shorter audio export.");
    });
    this.worker.onmessage = ({ data }) => {
      if (this.worker !== worker) return;
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
          "The audio could not be analyzed. Try a shorter audio export or reattach the source files and retry. Existing cues were kept.",
        );
      const cues = [];
      for (const result of data.results) {
        const track = s.tracks.find((t) => t.id === result.id),
          offset = mode === "movie" ? s.movieOffset : track.offset;
        result.matches.forEach((match, i) => {
          const start = atOffset(offset, match.start, rate),
            end = atOffset(offset, match.end, rate);
          if (!start || !end) return;
          const mediaName = mode === "movie" ? this.movie.filename : track.filename;
          const prior = matchingCue(s.cues, track.id, key, match, mediaName) ?? matchingCue(s.cueDetailsArchive ?? [], track.id, key, match, mediaName);
          cues.push({
            ...cueDetails(track, prior),
            id: prior?.id ?? crypto.randomUUID(),
            trackId: track.id,
            title: prior?.title ?? (
              result.matches.length > 1 && mode === "offset"
                ? `${track.title} · cue ${i + 1}`
                : track.title),
            start,
            end,
            usage: prior?.usage ?? "BI",
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
      archiveCueDetails(s, key);
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
      if (!cues.length) {
        return this.notify(mode === "offset"
          ? "Analysis completed: no music regions met the detection level and minimum duration. Soft audio or clips shorter than 0.5 seconds may produce no cues. Previous detections for this workflow were replaced; use manual timings if needed."
          : "Analysis completed: no matching recordings were found. Check that the supplied cues use the same recording and speed as the movie, or use manual timings. Previous detections for this workflow were replaced.");
      }
      this.notify(
        `${cues.length} ${mode === "movie" ? "matching placements" : "sound regions"} detected in ${data.elapsed.toFixed(1)}s of analysis. Review the results and add usage/credits before export.`,
      );
    };
    // Structured cloning leaves low-rate PCM cached for re-analysis and previews.
    try { this.worker.postMessage({
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
    }); } catch {
      fail("The browser could not send the audio for analysis. Try a shorter audio export or reload and reattach your media.");
    }
  }
}

export { workflowView } from "./workflow-view.js";
