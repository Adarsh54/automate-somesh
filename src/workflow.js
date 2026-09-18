import {detectionKey} from './detection-gate.js';
import {scoreOffset} from "./score-offset.js";
import {cueDetails, matchingCue, archiveCueDetails} from "./cue-details.js";
import { decodeMedia } from "./media.js";
import {decodeMedia as decodeOnServer} from "./backend-analysis.js";
import {useBackend} from "./processing-policy.js";
import {MAX_MEDIA_BYTES} from "./media-policy.js";
import {HybridAnalysis} from "./hybrid-analysis.js";
import { toFrames, atOffset, rates } from "./timecode.js";
import { applyMovieMetadata } from "./project.js";
import AnalysisWorker from "./analysis.worker.js?worker&inline";

export class Workflow {
  constructor({ state, save, render, notify, onAudioAdded, localAudio }) {
    Object.assign(this, { state, save, render, notify, onAudioAdded, localAudio });
    this.files = new Map();
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

  async load(file, track = null, movie = false, restoring = false, purpose = "export") {
    if (this.busy || (this.restoring && !restoring)) return;
    this.busy = true;
    this.controller = new AbortController();
    this.progress = `Decoding ${file.name}…`;
    this.render();
    try {
      if(file.size>MAX_MEDIA_BYTES)throw new Error("Files must be under 2 GB.");
      const report=text=>{
        this.progress=text;
        const el=document.querySelector("#analysis-progress");
        if(el)el.textContent=text;
      };
      const decoded=useBackend(file)
        ? await decodeOnServer(file,report,this.controller.signal)
        : await decodeMedia(file,percent=>report(`Decoding ${file.name} · ${percent}%`),this.controller.signal);
      if (this.controller.signal.aborted) return;
      const url = URL.createObjectURL(file);
      if (movie) {
        if (this.movie) URL.revokeObjectURL(this.movie.url);
        this.movie = { ...decoded, filename: file.name, url };
        if (!restoring) {
          delete this.state.media?.movie;
          applyMovieMetadata(this.state, file, decoded);
          [...this.state.cues, ...(this.state.cueDetailsArchive ?? [])]
            .filter((c) => c.method === "movie")
            .forEach((c) => {
              c.staleSource = true;
              c.reviewed = false;
            });
        }
      } else {
        if (!track) {
          track = {
            id: crypto.randomUUID(),
            purpose,
            title: file.name.replace(/\.[^.]+$/, ""),
            filename: file.name,
            offset: purpose === "export" ? scoreOffset(this.state) : (rates[this.state.production.rate]?.drop ? "01:00:00;00" : "01:00:00:00"),
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
        this.audio.set(track.id, decoded.samples ?? {assetId:decoded.assetId});
        track.duration = decoded.duration;
      }
      if (!movie && !restoring && this.state.media) delete this.state.media.tracks[track.id];
      this.files.set(movie ? "movie" : track.id, file);
      let libraryWarning='';
      if(!movie && !restoring && this.onAudioAdded){
        try{const asset=await this.onAudioAdded(file);if(asset?.id)track.audioLibraryId=asset.id;if(asset?.assetId){this.state.media ??= {tracks:{}};this.state.media.tracks[track.id]=asset.assetId;}}
        catch(error){libraryWarning=` Audio library upload needs attention: ${error.message}`;}
      }
      if (!restoring) this.save();
      if (!restoring) this.notify(
        `${file.name} is ready.${libraryWarning} ${movie ? "Add reference cues, then match the movie." : "Audio ready for analysis and credit review."}`,
        false,
      );
      if (!movie && !restoring && this.localAudio) {
        try { await this.localAudio.put(track.id, file); }
        catch { this.notify(file.name + " is ready, but could not be saved in this browser. Keep the original file to reattach next time.", false); }
      }
      return movie ? this.movie : track;
    } catch (error) {
      if (error.name !== "AbortError")
        this.notify(`Could not read ${file.name}: ${error.message}`, false);
    } finally {
      this.busy = false;
      this.progress = "";
      this.render();
    }
  }

  analysisTracks() {
    return this.state.tracks.filter(track => track.purpose !== "library");
  }

  analysisUnavailable() {
    const s = this.state;
    if (s.mode === "manual") return "Manual workflow uses entered timings, not detection.";
    if (this.busy && !this.worker) return "Wait for audio decoding to finish.";
    if (s.mode === "offset" && toFrames(scoreOffset(s), s.production.rate) === null) return "Enter a valid full score start timecode.";
    const tracks = this.analysisTracks();
    if (!tracks.length) return "Add at least one audio track to detect cues.";
    if (tracks.some(t => !this.audio.has(t.id))) return "Reattach missing audio files to run detection.";
    if (s.mode === "movie" && !this.movie) return "Reattach the movie to run detection.";
    if (s.mode === "movie" && toFrames(s.movieOffset, s.production.rate) === null)
      return "Enter a valid movie file-start timecode.";
    if (s.mode === "offset" && tracks.some(t => toFrames(t.offset, s.production.rate) === null))
      return "Enter a valid file-start timecode for each audio track.";
    return "";
  }

  analyze() {
    const reason = this.analysisUnavailable();
    if (reason) return this.notify(reason);
    const s = this.state, mode = s.mode, rate = s.production.rate, key = mode;
    const completedKey = detectionKey(s);
    if(s.analysisReport)delete s.analysisReport.detectionKey;
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
      this.worker = new HybridAnalysis({LocalWorker:AnalysisWorker});
    } catch {
      return fail("Audio analysis could not start. Try again, or reload and restore your media.");
    }
    const worker = this.worker;
    this.render();
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
          `${data.message || "The audio could not be analyzed. Please retry."} Existing cues were kept.`,
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
        detectionKey: completedKey,
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
        `${cues.length} ${cues.length === 1 ? "cue" : "cues"} detected.`,
      );
    };
    // Structured cloning leaves low-rate PCM cached for re-analysis and previews.
    try { this.worker.postMessage({
      mode,
      movie: this.movie?.samples,
      movieAssetId: this.movie?.assetId,
      movieFile: this.files.get("movie"),
      tracks: this.analysisTracks().map((t) => ({
        id: t.id,
        title: t.title,
        samples: this.audio.get(t.id) instanceof Float32Array ? this.audio.get(t.id) : undefined,
        assetId: this.audio.get(t.id)?.assetId,
        file: this.files.get(t.id),
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
      fail("Audio analysis could not start. Try a shorter audio export or reload and reattach your media.");
    }
  }
}

export { workflowView } from "./workflow-view.js";
