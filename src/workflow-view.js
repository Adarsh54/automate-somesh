import {BROWSER_MAX_MB} from "./processing-policy.js";
import { rates } from "./timecode.js";
import { time } from "./model.js";
import { effectiveProduction } from "./project.js";

export function workflowView(state, workflow, { esc, field, select }) {
  const mode = state.mode,
    p = effectiveProduction(state),
    m = state.movieMetadata,
    o = state.movieOverrides || {};
  const modes = [
    [
      "movie",
      "Movie matching",
      "Match reference recordings · Experimental.",
    ],
    [
      "offset",
      "Audio with offset",
      "Find cue regions in a music-only export.",
    ],
    [
      "manual",
      "Manual",
      "Enter timings or mark them during playback.",
    ],
  ];
  const removeTrack = t => `<button type="button" class="danger" data-remove-track="${t.id}" aria-label="Remove audio track ${esc(t.filename)}" title="Remove this audio track and its cue placements">Remove</button>`;
  const uploadedTracks = mode === "offset" || !state.tracks.length ? "" : `<div class="uploaded-tracks" aria-label="Uploaded audio tracks">${state.tracks.map(t => `<div class="uploaded-track"><strong>${esc(t.filename)} <small>${time(t.duration)}</small></strong>${removeTrack(t)}</div>`).join("")}</div>`;
  const upload = `<label class="upload-button">＋ Add ${mode === "offset" ? "music-only audio" : "cue audio files"}<input type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg" data-upload="unknown"></label>${uploadedTracks}`;
  const rateField = select(
    "Project timecode rate",
    "rate",
    state.production.rate,
    Object.entries(rates).map(([k, v]) => [k, v.label]),
  );
  const detectionActions = () => {
    const reason = workflow.analysisUnavailable();
    const hasResults = state.cues.some(c => c.method === mode) || state.analysisReport?.mode === mode;
    return `<div class="button-row"><button class="primary" id="analyze" aria-describedby="detection-help" ${reason ? "disabled" : ""}>${hasResults || workflow.worker ? "Restart detection" : mode === "movie" ? "Find music in movie" : "Detect music regions"}</button><button data-clear-results="${mode}" ${hasResults ? "" : "disabled"}>Clear detection results</button></div><p class="muted" id="detection-help">${esc(reason || "Ready to detect with current settings.")}</p><p class="muted">Restart replaces this workflow’s detected placements when complete. Clear removes only these results; uploaded audio, credits and file offsets stay ready to reuse.</p>`;
  };
  return `<div class="workflow-modes" role="group" aria-label="Choose workflow">${modes.map(([key, title, text]) => `<button data-mode="${key}" class="workflow-mode ${mode === key ? "chosen" : ""}" aria-pressed="${mode === key}"><span class="mode-heading"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${key === "movie" ? '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>' : key === "offset" ? '<path d="M4 10v4m4-8v12m4-15v18m4-14v10m4-7v4"/>' : '<path d="m5 16 11-11 3 3L8 19H5Zm9-9 3 3"/>'}</svg><h2>${title}</h2><span class="mode-dot" aria-hidden="true"></span></span><p>${text}</p></button>`).join("")}</div>
  <section class="panel workflow-settings"><div class="journey" aria-label="Workflow steps">${(mode === "movie" ? ["Upload movie", "Add reference cues", "Match & review"] : mode === "offset" ? ["Upload music", "Set each file’s offset", "Detect & review"] : ["Upload cue audio", "Enter or mark timings", "Review credits"]).map((text, i) => `<span><b>${i + 1}</b>${text}</span>`).join("")}</div>
  ${
    mode === "movie"
      ? `<div class="workspace-section-heading"><span class="eyebrow">SOURCE MEDIA</span><h2>Add your finished movie</h2><p class="muted">Start with the picture. We’ll find where the music belongs.</p></div><div class="movie-input"><label class="upload-button">${workflow.movie ? "Replace movie" : m ? "Reattach / replace movie" : "＋ Add finished movie"}<input id="movie-upload" type="file" accept="video/mp4,video/webm,.mov,.m4v"></label><span>${m ? esc(m.filename) : "MP4/AAC or WebM/Opus recommended"}</span></div>
  ${m ? `<div class="metadata-summary"><div><span>Production title</span><strong>${esc(p.title)}</strong><small>${state.production.title ? "Entered by you" : "From filename · editable at review"}</small></div><div><span>Show duration</span><strong>${esc(p.duration)}</strong><small>${o.duration !== undefined ? "Your override" : Number(o.trimStart || 0) || Number(o.trimEnd || 0) ? "Movie length minus pre-roll/tail" : "From movie · entire uploaded file"}</small></div><div><span>Timecode rate</span><strong>${esc(rates[p.rate].label)}</strong><small>${state.movieRateEdited ? "Your project-rate override" : esc(m.rateSource)}</small></div><div><span>File begins at</span><strong>${esc(state.movieOffset)}</strong><small>${state.movieOriginEdited ? "Entered by you" : esc(m.originSource)}</small></div></div><details class="disclosure"><summary>Edit timing or exclude pre-roll / tail</summary><p class="muted">The file origin maps playback zero to film timecode. It is never inferred from creation date. Production currently starts at ${esc(p.startTimecode)}. Adjust pre-roll only if that part is outside the production.</p><div class="form-grid" id="movie-settings">${field("File begins at film timecode", "movieOffset", state.movieOffset, 'placeholder="00:59:55:00"')}</div><div id="workflow-settings">${rateField}</div><div id="movie-trim" class="form-grid">${field("Pre-roll before production (seconds)", "trimStart", o.trimStart || 0, 'type="number" min="0" step="0.001"')}${field("Tail after production (seconds)", "trimEnd", o.trimEnd || 0, 'type="number" min="0" step="0.001"')}</div></details>` : ""}
  ${
    m
      ? `<div class="step-block"><h2>Add the cue recordings used in this movie</h2>${upload}<p class="muted">Use the actual recordings. Titles and credits can be reviewed after matching.</p></div><div class="step-block"><h2>Find their positions</h2>${detectionActions()}<details class="disclosure"><summary>Matching options & preview</summary><div id="movie-options">${select(
          "Match sensitivity",
          "matchThreshold",
          String(state.matchThreshold),
          [
            ["0.55", "Strict · fewer false matches"],
            ["0.45", "Balanced"],
            ["0.32", "Sensitive · more review needed"],
          ],
        )}</div>${workflow.movie ? `<video id="movie-preview" controls preload="metadata" src="${workflow.movie.url}"></video>` : ""}<p class="muted">Experimental: same recording at original speed/pitch works best. Masking, edits and short excerpts may be missed; repetitive recordings can create false matches. Up to 16 matching segments per reference; no external catalog search. Review detections before export.</p></details></div>`
      : '<p class="muted">Duration and timecode are read automatically. Add your reference recordings next.</p>'
  }`
      : `<h2>Add ${mode === "offset" ? "music-only exports" : "cue audio"}</h2>${upload}<p class="muted">${mode === "offset" ? "Each file’s duration is read automatically. Add its film-start timecode below; the full film duration remains unknown." : "Add the recordings you want to report. Enter film in/out in the next step; cue duration is calculated from those timings."}</p>
  <details class="disclosure"><summary>Timing grid: ${esc(rates[p.rate].label)} · ${state.movieMetadata||state.rateEdited?'project setting':'assumed; edit if needed'}</summary><div id="workflow-settings">${rateField}</div><p class="muted">This is the shared project timecode grid${state.movieMetadata ? " (also used by saved movie placements)" : ""}. Audio alone does not establish a film frame rate.</p></details>
  ${
    state.tracks.length
      ? `<div class="step-block"><h2>${mode === "offset" ? "Set each file’s starting film timecode" : "Place your cues"}</h2>${
          mode === "offset"
            ? `<div class="file-offsets">${state.tracks.map((t) => `<div data-track-offset="${t.id}"><div class="uploaded-track"><strong>${esc(t.filename)} <small>${time(t.duration)}</small></strong>${removeTrack(t)}</div>${field("File begins at film timecode", "offset", t.offset, 'placeholder="01:00:00:00"')}</div>`).join("")}</div><p class="muted">For pre-roll, enter the actual file start (for example 00:59:55:00), not the first music onset.</p><h2>Detect regions between silences</h2>${detectionActions()}<details class="disclosure"><summary>Silence detection options</summary><div id="offset-settings" class="form-grid"><div class="gap-control"><label for="silence-threshold">Silence threshold</label><input id="silence-threshold" data-field="thresholdDb" type="range" min="-100" max="-10" step="1" value="${state.thresholdDb}" aria-valuetext="${state.thresholdDb} dBFS" aria-describedby="threshold-help"><output id="silence-threshold-value" for="silence-threshold">${state.thresholdDb} dBFS</output></div><div class="gap-control"><label for="silence-gap">Minimum gap between cues</label><input id="silence-gap" data-field="silenceGap" type="range" min="0" max="10" step="0.05" value="${state.silenceGap}" aria-valuetext="${state.silenceGap} seconds"><output id="silence-gap-value" for="silence-gap">${state.silenceGap} seconds</output></div></div><p class="muted" id="threshold-help">More negative values retain quieter music and fades; higher values treat more audio as silence. Changes apply on the next detection or restart. Use music-only audio; dialogue is not distinguished from music. Regions shorter than 0.5 seconds are ignored.</p></details>`
            : `<div class="button-row"><button class="primary" data-tab="cues">Enter / mark film timings →</button><button data-clear-results="manual" ${state.cues.some(c => c.method === "manual") ? "" : "disabled"}>Clear manual cues</button></div><p class="muted">A file offset is only needed if you use playback marks. Direct film in/out entry does not need one.</p>`
        }</div>`
      : ""
  }`
  }
  ${workflow.busy ? `<button id="cancel-analysis">Cancel ${workflow.worker ? "detection" : "loading"}</button>` : ""}<p id="analysis-progress" role="status">${esc(workflow.progress)}</p>
  <p class="muted">Files over ${BROWSER_MAX_MB} MB are uploaded privately for server processing. Matching against one also uploads its reference files. Smaller comparisons stay on your device.</p><details class="disclosure"><summary>File support & storage</summary><p class="muted">MP4/AAC or WebM/Opus recommended for video; WAV, MP3, M4A, FLAC, or OGG for audio. Limit: 20 minutes per file. Temporary processing files expire after 24 hours and are deleted during daily cleanup. Sign in and save your project to keep its media. Files must be under 2 GB and fit within available storage.</p></details></section>
  ${state.analysisReport?.mode === mode ? `<section class="panel analysis-report"><div class="section-title"><h2>${state.analysisReport.count} detections to review</h2><button class="primary" data-tab="cues">Review timings & usage →</button></div><p class="muted">${state.analysisReport.seconds.toFixed(1)}s analysis · review candidates before export.</p><ul>${state.analysisReport.counts.map((r) => `<li>${esc(r.title)}<strong>${r.count ? `${r.count} placements` : "No match / region found"}</strong></li>`).join("")}</ul></section>` : ""}`;
}
