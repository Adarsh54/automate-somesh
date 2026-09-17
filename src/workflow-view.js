import {scoreOffset} from "./score-offset.js";
import {sidebarIcon} from "./sidebar.js";
import {BROWSER_MAX_MB} from "./processing-policy.js";
import { rates, toFrames } from "./timecode.js";
import { time } from "./model.js";
import { effectiveProduction } from "./project.js";

export function workflowView(state, workflow, { esc, field, select }) {
  const tracks = workflow.analysisTracks();
  const mode = state.mode,
    p = effectiveProduction(state),
    m = state.movieMetadata,
    o = state.movieOverrides || {};
  const removeTrack = t => `<button type="button" class="danger" data-remove-track="${t.id}" aria-label="Remove audio track ${esc(t.filename)}" title="Remove this audio track and its cue placements">Remove</button>`;
  const uploadedTracks = mode === "offset" || !tracks.length ? "" : `<div class="uploaded-tracks" aria-label="Uploaded audio tracks">${tracks.map(t => `<div class="uploaded-track"><strong>${esc(t.filename)} <small>${time(t.duration)}</small></strong><button type="button" data-track-profile="${esc(t.id)}">+ Profile</button>${removeTrack(t)}</div>`).join("")}</div>`;
  const start = scoreOffset(state).replace(";", ":");
  const invalidStart = toFrames(start, state.production.rate) === null;
  const upload = `<div class="audio-drop-zone score-export-box" data-drop="export"><div class="score-export-upload"><div class="button-row"><label class="upload-button score-upload" title="Upload audio from your computer"><span aria-hidden="true">＋</span><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18H6a4 4 0 0 1-.8-7.9A7 7 0 0 1 18.7 8a5 5 0 0 1-.7 10h-1M12 21V12m-3 3 3-3 3 3"/></svg><input type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg" data-upload="unknown" aria-label="Upload audio from your computer"></label><button type="button" id="cue-audio-library" class="upload-button score-upload" title="Add from Audio Library" aria-label="Add from Audio Library"><span aria-hidden="true">＋</span>${sidebarIcon("audio")}</button></div><p class="muted">Add a full score export from your computer or Audio Library.</p></div><div class="score-start"><label for="score-start-timecode">Start timecode</label><input id="score-start-timecode" type="text" value="${esc(start)}" placeholder="00:00:00:00" maxlength="11" inputmode="numeric" autocomplete="off" spellcheck="false" aria-invalid="${invalidStart}" aria-describedby="score-start-error"><p class="score-start-error" id="score-start-error" role="status">${invalidStart ? "Enter a valid start timecode for this frame rate." : ""}</p></div></div>${uploadedTracks}`;
  const rateField = select(
    "Project timecode rate",
    "rate",
    state.production.rate,
    Object.entries(rates).map(([k, v]) => [k, v.label]),
  );
  const detectionActions = () => {
    const reason = workflow.analysisUnavailable();
    const hasResults = state.cues.some(c => c.method === mode) || state.analysisReport?.mode === mode;
    return `<div class="button-row"><button class="primary" id="analyze" ${reason ? "disabled" : ""}>${hasResults || workflow.worker ? "Restart detection" : mode === "movie" ? "Find music in movie" : "Detect music regions"}</button></div>`;
  };
  return `<section class="panel workflow-settings">
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
      : `<h2>1. Add ${mode === "offset" ? "full score export" : "cue audio"}</h2>${upload}
  ${
    tracks.length
      ? `<div class="step-block"><h2>2. ${mode === "offset" ? "Uploaded full score exports" : "Place your cues"}</h2>${
          mode === "offset"
            ? `<div class="uploaded-tracks">${tracks.map(t => `<div class="uploaded-track"><strong>${esc(t.filename)} <small>${time(t.duration)}</small></strong><button type="button" data-track-profile="${esc(t.id)}">+ Profile</button>${removeTrack(t)}</div>`).join("")}</div><h2 class="detection-heading">3. Detect regions between silences</h2>${detectionActions()}<details class="disclosure"><summary>Silence detection options</summary><div id="offset-settings" class="form-grid"><div class="gap-control"><label for="silence-threshold">Silence threshold</label><input id="silence-threshold" data-field="thresholdDb" type="range" min="-100" max="-10" step="1" value="${state.thresholdDb}" aria-valuetext="${state.thresholdDb} dBFS" aria-describedby="threshold-help"><output id="silence-threshold-value" for="silence-threshold">${state.thresholdDb} dBFS</output></div><div class="gap-control"><label for="silence-gap">Minimum gap between cues</label><input id="silence-gap" data-field="silenceGap" type="range" min="0" max="10" step="0.05" value="${state.silenceGap}" aria-valuetext="${state.silenceGap} seconds"><output id="silence-gap-value" for="silence-gap">${state.silenceGap} seconds</output></div></div><p class="muted" id="threshold-help">More negative values retain quieter music and fades; higher values treat more audio as silence. Changes apply on the next detection or restart. Use music-only audio; dialogue is not distinguished from music. Regions shorter than 0.5 seconds are ignored. Cues shorter than 2 seconds are also excluded if their average level is below −30 dBFS.</p></details>`
            : `<div class="button-row"><button class="primary" data-tab="cues">Enter / mark film timings →</button><button data-clear-results="manual" ${state.cues.some(c => c.method === "manual") ? "" : "disabled"}>Clear manual cues</button></div><p class="muted">A file offset is only needed if you use playback marks. Direct film in/out entry does not need one.</p>`
        }</div>`
      : ""
  }`
  }
  ${workflow.busy ? `<button id="cancel-analysis">Cancel ${workflow.worker ? "detection" : "loading"}</button>` : ""}<p id="analysis-progress" role="status">${esc(workflow.progress)}</p>
  </section>
  ${state.analysisReport?.mode === mode ? `<section class="panel analysis-report"><div class="section-title"><h2>${state.analysisReport.count} ${state.analysisReport.count === 1 ? "cue" : "cues"} to review</h2><button class="primary" data-tab="cues">Review timings & usage →</button></div><ul>${state.analysisReport.counts.map((r) => `<li>${esc(r.title)}<strong>${r.count ? `${r.count} placements` : "No match / region found"}</strong></li>`).join("")}</ul></section>` : ""}`;
}
