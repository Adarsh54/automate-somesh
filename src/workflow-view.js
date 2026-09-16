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
      "Find supplied recordings in a finished movie.",
      "EXPERIMENTAL",
    ],
    [
      "offset",
      "Audio with offset",
      "Find cue regions in a music-only export.",
      "MUSIC-ONLY AUDIO",
    ],
    [
      "manual",
      "Manual",
      "Enter timings or mark them during playback.",
      "YOU SET THE TIMINGS",
    ],
  ];
  const upload = `<label class="upload-button">＋ Add ${mode === "offset" ? "music-only audio" : "cue audio files"}<input type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg" data-upload="unknown"></label>`;
  const rateField = select(
    "Project timecode rate",
    "rate",
    state.production.rate,
    Object.entries(rates).map(([k, v]) => [k, v.label]),
  );
  const ready = state.tracks.length && (mode !== "movie" || workflow.movie);
  return `<div class="workflow-modes">${modes.map(([key, title, text, tag], i) => `<button data-mode="${key}" class="workflow-mode ${mode === key ? "chosen" : ""}"><span class="eyebrow">0${i + 1} / ${tag}</span><h2>${title}</h2><p>${text}</p><span class="mode-choice">${mode === key ? "● Selected" : "○ Choose workflow"}</span></button>`).join("")}</div>
  <section class="panel workflow-settings"><div class="journey" aria-label="Workflow steps">${(mode === "movie" ? ["Upload movie", "Add reference cues", "Match & review"] : mode === "offset" ? ["Upload music", "Set each file’s offset", "Detect & review"] : ["Upload cue audio", "Enter or mark timings", "Review credits"]).map((text, i) => `<span><b>${i + 1}</b>${text}</span>`).join("")}</div>
  ${
    mode === "movie"
      ? `<h2>1. Add the finished movie</h2><div class="movie-input"><label class="upload-button">${workflow.movie ? "Replace movie" : m ? "Reattach / replace movie" : "＋ Add finished movie"}<input id="movie-upload" type="file" accept="video/mp4,video/webm,.mov,.m4v"></label><span>${m ? esc(m.filename) : "MP4/AAC or WebM/Opus recommended"}</span></div>
  ${m ? `<div class="metadata-summary"><div><span>Production title</span><strong>${esc(p.title)}</strong><small>${state.production.title ? "Entered by you" : "From filename · editable at review"}</small></div><div><span>Show duration</span><strong>${esc(p.duration)}</strong><small>${o.duration !== undefined ? "Your override" : Number(o.trimStart || 0) || Number(o.trimEnd || 0) ? "Movie length minus pre-roll/tail" : "From movie · entire uploaded file"}</small></div><div><span>Timecode rate</span><strong>${esc(rates[p.rate].label)}</strong><small>${state.movieRateEdited ? "Your project-rate override" : esc(m.rateSource)}</small></div><div><span>File begins at</span><strong>${esc(state.movieOffset)}</strong><small>${state.movieOriginEdited ? "Entered by you" : esc(m.originSource)}</small></div></div><details class="disclosure"><summary>Edit timing or exclude pre-roll / tail</summary><p class="muted">The file origin maps playback zero to film timecode. It is never inferred from creation date. Production currently starts at ${esc(p.startTimecode)}. Adjust pre-roll only if that part is outside the production.</p><div class="form-grid" id="movie-settings">${field("File begins at film timecode", "movieOffset", state.movieOffset, 'placeholder="00:59:55:00"')}</div><div id="workflow-settings">${rateField}</div><div id="movie-trim" class="form-grid">${field("Pre-roll before production (seconds)", "trimStart", o.trimStart || 0, 'type="number" min="0" step="0.001"')}${field("Tail after production (seconds)", "trimEnd", o.trimEnd || 0, 'type="number" min="0" step="0.001"')}</div></details>` : ""}
  ${
    m
      ? `<div class="step-block"><h2>2. Add the cue recordings used in this movie</h2>${upload}<p class="muted">Use the actual recordings. Titles and credits can be reviewed after matching.</p></div><div class="step-block"><h2>3. Find their positions</h2><button class="primary" id="analyze" ${!ready ? "disabled" : ""}>Find music in movie</button>${!workflow.movie ? '<p class="muted">Reattach the movie to analyze it again. Saved placements remain available.</p>' : ""}<details class="disclosure"><summary>Matching options & preview</summary><div id="movie-options">${select(
          "Match sensitivity",
          "matchThreshold",
          String(state.matchThreshold),
          [
            ["0.55", "Strict · fewer false matches"],
            ["0.45", "Balanced"],
            ["0.32", "Sensitive · more review needed"],
          ],
        )}</div>${workflow.movie ? `<video id="movie-preview" controls preload="metadata" src="${workflow.movie.url}"></video>` : ""}<p class="muted">Experimental: same recording at original speed/pitch works best. Masking, edits and short excerpts may be missed; repetitive recordings can create false matches. Up to 16 matching segments per reference; no external catalog search. Review detections before export.</p></details></div>`
      : '<p class="muted">Next, Cuebook reads the duration and timing metadata, then asks for your reference cues. No production form to fill out first.</p>'
  }`
      : `<h2>1. Add ${mode === "offset" ? "music-only exports" : "cue audio"}</h2>${upload}<p class="muted">${mode === "offset" ? "Each file’s duration is read automatically. Add its film-start timecode below; the full film duration remains unknown." : "Add the recordings you want to report. Enter film in/out in the next step; cue duration is calculated from those timings."}</p>
  <details class="disclosure"><summary>Timing grid: ${esc(rates[p.rate].label)} · ${state.movieMetadata||state.rateEdited?'project setting':'assumed; edit if needed'}</summary><div id="workflow-settings">${rateField}</div><p class="muted">This is the shared project timecode grid${state.movieMetadata ? " (also used by saved movie placements)" : ""}. Audio alone does not establish a film frame rate.</p></details>
  ${
    state.tracks.length
      ? `<div class="step-block"><h2>2. ${mode === "offset" ? "Set each file’s starting film timecode" : "Place your cues"}</h2>${
          mode === "offset"
            ? `<div class="file-offsets">${state.tracks.map((t) => `<div data-track-offset="${t.id}"><strong>${esc(t.filename)} <small>${time(t.duration)}</small></strong>${field("File begins at film timecode", "offset", t.offset, 'placeholder="01:00:00:00"')}</div>`).join("")}</div><p class="muted">For pre-roll, enter the actual file start (for example 00:59:55:00), not the first music onset.</p><h2>3. Detect regions between silences</h2><button class="primary" id="analyze">Detect music regions</button><details class="disclosure"><summary>Silence detection options</summary><div id="offset-settings" class="form-grid"><div class="gap-control"><label for="silence-gap">Minimum gap between cues</label><input id="silence-gap" data-field="silenceGap" type="range" min="0" max="30" step="0.05" value="${state.silenceGap}" aria-valuetext="${state.silenceGap} seconds"><output id="silence-gap-value" for="silence-gap">${state.silenceGap} seconds</output></div></div><p class="muted">Silence is detected automatically to retain very soft music and fade tails. Use music-only audio; dialogue is not distinguished from music. Regions shorter than 0.5 seconds are ignored.</p></details>`
            : `<button class="primary" data-tab="cues">Enter / mark film timings →</button><p class="muted">A file offset is only needed if you use playback marks. Direct film in/out entry does not need one.</p>`
        }</div>`
      : ""
  }`
  }
  ${workflow.busy ? '<button id="cancel-analysis">Cancel</button>' : ""}<p id="analysis-progress" role="status">${esc(workflow.progress)}</p>
  <details class="disclosure"><summary>File support & local storage</summary><p class="muted">Desktop Chrome recommended. Codec support depends on the browser. No decodable audio track means an error, not invented results. Limit: 20 minutes per file. Media stays on this device and must be reattached after refresh; details and placements are saved locally.</p></details></section>
  ${state.analysisReport?.mode === mode ? `<section class="panel analysis-report"><div class="section-title"><h2>${state.analysisReport.count} detections to review</h2><button class="primary" data-tab="cues">Review timings & usage →</button></div><p class="muted">${state.analysisReport.seconds.toFixed(1)}s analysis · review candidates before export.</p><ul>${state.analysisReport.counts.map((r) => `<li>${esc(r.title)}<strong>${r.count ? `${r.count} placements` : "No match / region found"}</strong></li>`).join("")}</ul></section>` : ""}`;
}
