import "./style.css";
import {cueDetails, migrateCueDetails, archiveCueDetails, effectiveCue} from "./cue-details.js";
import {bindSidebar,sidebarIcon,sidebarToggle} from "./sidebar.js";
import {
  usages,
  time,
  duration,
  cueIssues,
  creditIssues,
} from "./model.js";
import { exportWorkbook } from "./export.js";
import { Workflow, workflowView } from "./workflow.js";
import {
  effectiveProduction,
  productionIssues,
  productionWarnings,
  convertRate,
} from "./project.js";
import { rates, toFrames, atOffset, elapsed, fromFrames } from "./timecode.js";
const blankProduction = {
  title: "",
  aka: "",
  episode: "",
  episodeAka: "",
  episodeNumber: "",
  productionNumber: "",
  company: "",
  address: "",
  preparedBy: "",
  email: "",
  airdate: "",
  duration: "",
  category: "",
  version: "",
  network: "",
  classification: "Original",
  rate: "24",
  startTimecode: "",
};
let state = {
    production: { ...blankProduction },
    tracks: [],
    cues: [],
    mode: "movie",
    movieOffset: "",
    silenceGap: 0.35,
    thresholdDb: -40,
    matchThreshold: 0.45,
  },
  selected = null,
  tab = "library",
  message = "",
  clearedResults = null;
try {
  const saved = JSON.parse(localStorage.getItem("cuebook-v1"));
  if (
    saved?.production &&
    Array.isArray(saved.tracks) &&
    Array.isArray(saved.cues)
  ) {
    state = {
      ...state,
      ...saved,
      production: { ...blankProduction, ...saved.production },
    };
    if (!saved.production.rate) {
      state.production.startTimecode = "00:00:00:00";
      state.cues.forEach((c) => {
        if (c.start?.length === 8) c.start += ":00";
        if (c.end?.length === 8) c.end += ":00";
      });
    }
    state.tracks.forEach((t) => (t.offset ??= ""));
  }
} catch {}
migrateCueDetails(state);
const savedThreshold = Number(state.thresholdDb);
state.thresholdDb = state.thresholdDb != null && state.thresholdDb !== "" && Number.isFinite(savedThreshold)
  ? Math.round(Math.min(-10, Math.max(-90, savedThreshold)))
  : -40;
const savedGap = Number(state.silenceGap);
state.silenceGap = state.silenceGap != null && state.silenceGap !== "" && Number.isFinite(savedGap)
  ? Math.round(Math.min(10, Math.max(0, savedGap)) * 20) / 20
  : 0.35;
const workflow = new Workflow({
  state,
  save,
  render,
  notify: (text, refresh = true) => {
    message = text;
    if (refresh) render();
  },
});
const urls = workflow.urls;
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const id = () => crypto.randomUUID();
function save() {
  try {
    localStorage.setItem("cuebook-v1", JSON.stringify(state));
  } catch {
    message =
      "Browser storage is full or unavailable. Keep this page open and export before leaving.";
  }
}
function field(label, key, value, attrs = "") {
  return `<label>${label}<input data-field="${key}" value="${esc(value)}" ${attrs}></label>`;
}
const select = (label, key, value, options) =>
  `<label>${label}<select data-field="${key}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
function review() {
  const issues = productionIssues(state),
    p = effectiveProduction(state);
  if (!state.cues.length) issues.push("Add at least one cue placement");
  state.cues.forEach((c, i) =>
    cueIssues(
      c,
      state.tracks.find((t) => t.id === c.trackId),
      p,
      state.sharedCueDetails,
    ).forEach((x) => issues.push(`Cue ${i + 1}: ${x}`)),
  );
  return issues;
}
function render() {
  const openDetails = new Set(
    [...document.querySelectorAll("details[open]")].map(
      (el) => el.querySelector("summary")?.textContent,
    ),
  );
  const issues = review(),
    ready = state.cues.filter(
      (c) =>
        !cueIssues(
          c,
          state.tracks.find((t) => t.id === c.trackId),
          effectiveProduction(state),
        state.sharedCueDetails,
        ).length,
    ).length;
  $("#app").innerHTML =
    `<aside aria-label="Workspace sidebar"><div class="sidebar-header"><a class="brand" href="#" aria-label="Cuebook"><span class="mark" aria-hidden="true">▥</span><span class="brand-word">cuebook</span></a>${sidebarToggle}</div><div class="project-label">MUSIC WORKSPACE</div><nav id="sidebar-nav" aria-label="Workspace navigation">${steps
      .map(
        ([key, label], index) =>
          `<button class="nav ${tab === key ? "active" : ""}" data-tab="${key}" aria-label="${label}" title="${label}" ${tab===key?'aria-current="page"':''}>${sidebarIcon(key)}<span class="nav-label"><span class="nav-step">${String(index + 1).padStart(2, "0")}</span>${label}</span></button>`,
      )
      .join(
        "",
      )}</nav><div class="aside-note"><span class="small-icon">↗</span><strong>Your music stays here.</strong><p>Audio is processed in your browser. Details are saved on this device; audio previews last until you close or refresh the page.</p></div><a class="source-link" href="https://www.bmi.com/creators/what_is_a_cue_sheet" target="_blank" rel="noreferrer">BMI cue sheet guide ↗</a></aside><main><header><span>WORKSPACE / <b>${esc(effectiveProduction(state).title || "Untitled production")}</b></span><span class="local">Device-local workspace</span></header><div class="content"><div class="heading"><div><div class="eyebrow">FROM TRACK TO CUE SHEET</div><h1>${{ library: "From soundtrack to cue sheet.", shared: "Shared cue details.", production: "Set the scene.", cues: "Place the music.", review: "The final check." }[tab]}</h1><p>${{ library: "Choose how to find your timings. Keep every creator in the credits.", shared: "Enter common credits once. Customize only the cues that differ.", production: "Add the production information that travels with your cue sheet.", cues: "Review detected placements or enter timings on the film timeline.", review: "Review credits and placements before downloading your spreadsheet." }[tab]}</p></div>${stepNavigation()}</div><div class="stats"><div><strong>${String(state.tracks.length).padStart(2, "0")}</strong><span>Tracks in library</span></div><div><strong>${String(state.cues.length).padStart(2, "0")}</strong><span>Cue placements</span></div><div><strong>${String(ready).padStart(2, "0")}</strong><span>Cues with complete details</span></div></div>${clearedResults ? `<div class="notice" role="status">Placements cleared. Audio and credits are kept. <button id="undo-clear">Undo clear</button></div>` : ""}${message ? `<div class="notice" role="status">${esc(message)}</div>` : ""}${["library", "shared"].includes(tab) ? library() : tab === "production" ? production() : tab === "cues" ? cues() : reviewPage(issues)}${stepNavigation()}<footer><span>CUEBOOK / MUSIC WORKSPACE</span><span>Made for the people behind the music.</span></footer></div></main>`;
  bind();
  bindSidebar();
  document.querySelectorAll("details").forEach((el) => {
    if (openDetails.has(el.querySelector("summary")?.textContent))
      el.open = true;
  });
  if (workflow.busy)
    document.querySelectorAll("button,input,select").forEach((el) => {
      if (el.id !== "cancel-analysis" && el.id !== "sidebar-toggle" && !(workflow.worker && (el.id === "analyze" || el.hasAttribute("data-clear-results")))) el.disabled = true;
    });
}
const steps = [
  ["library", "Find your cues"], ["shared", "Shared cue details"],
  ["cues", "Timings & usage"], ["production", "Production details"], ["review", "Review & export"],
];
function stepNavigation() {
  const index = steps.findIndex(([key]) => key === tab);
  const button = (direction, target) => `<button class="${direction === "next" ? "primary" : ""}" data-step="${direction}" data-tab="${steps[target][0]}">${direction === "next" ? "Next" : "Back"}: ${String(target + 1).padStart(2, "0")} · ${steps[target][1]} ${direction === "next" ? "→" : "←"}</button>`;
  return `<div class="button-row step-navigation" aria-label="Step navigation">${index > 0 ? button("back", index - 1) : ""}${index < steps.length - 1 ? button("next", index + 1) : ""}</div>`;
}
function library() {
  return (
    sharedDetails() + workflowView(state, workflow, { esc, field, select }) +
    `<div class="section-title"><h2>Cue audio library <span>${state.tracks.length}</span></h2><span class="muted">Audio is shared across paths · select a file to preview or reattach audio</span></div>${state.tracks.length ? `<div class="library-grid"><div class="track-list">${state.tracks.map((t) => `<div class="track-row"><button class="track ${selected === t.id ? "selected" : ""}" data-track="${t.id}"><span class="track-icon">♪</span><span><strong>${esc(t.title)}</strong><small>${time(t.duration)} · ${workflow.audio.has(t.id) ? "Audio ready" : "Reattach audio to analyze"}</small></span><span class="badge ">Source audio</span></button>${state.mode === "movie" && !state.movieMetadata ? `<button class="text danger" data-remove-track="${t.id}" aria-label="Remove audio track ${esc(t.title)}" title="Remove track and its placements">Remove track</button>` : ""}</div>`).join("")}</div>${editor()}</div>` : '<div class="empty"><span>♫</span><h3>Add the music behind the picture</h3><p>Upload cue recordings or a music-only export using the selected workflow above.</p></div>'}`
  );
}
function editor() {
  const t = state.tracks.find((t) => t.id === selected);
  if (!t)
    return '<div class="panel empty"><p>Select a track to review its details.</p></div>';
  return `<section class="panel editor" data-editor="${t.id}"><div class="section-title"><h2>Audio source</h2></div>${field("Source label", "title", t.title)}${state.mode === "manual" ? `<details class="disclosure"><summary>Use playback marks (optional)</summary>${field("This audio file starts at film timecode", "offset", t.offset, 'placeholder="01:00:00:00"')}<p class="muted">Only needed for playback marking. Direct film in/out entry needs no file offset.</p></details>` : ""}<p class="file-name">${esc(t.filename)} · ${t.duration === null ? "Duration unavailable" : time(t.duration)}</p>${urls.has(t.id) ? `<audio id="track-preview" controls src="${urls.get(t.id)}"></audio>` : `<label class="upload-button">Reattach ${esc(t.filename)}<input data-reattach="${t.id}" type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"></label>`}${t.error ? `<p class="notice">${esc(t.error)}</p>` : ""}<p class="muted">Enter common composer and publisher details in the form at the top of this page. Customize exceptions per cue in Timings &amp; usage.</p>${state.mode === "manual" ? `<button class="primary" data-add-cue="${t.id}">Add manual placement</button>` : ""}</section>`;
}
function sharedDetails() {
  return `<section class="panel" id="shared-details" tabindex="-1" aria-labelledby="shared-details-heading"><h2 id="shared-details-heading">Composer &amp; publisher details — applies to all cues</h2><p class="muted">Fill this in once here. New cues use these details automatically. You can customize individual cues in Timings &amp; usage; existing cue overrides stay separate.</p>${provenanceField(state.sharedCueDetails.category)}${cueCreditEditor(state.sharedCueDetails, true)}<p id="shared-credit-status" class="muted" role="status">${esc(creditIssues(state.sharedCueDetails).join(" · ") || "Shared credits complete.")}</p></section>`;
}
function provenanceField(value) {
  return select("Cue provenance", "category", value, [["unknown", "Unspecified"], ["original", "Original work"], ["sourced", "Sourced music"]]);
}
function cueCreditEditor(cue, shared = false) {
  return `<div class="cue-credit-form"><p class="muted">${shared ? "Shared credits update all inheriting cues." : "Credits overridden for this cue only."} Confirm every contributor and enter each role’s shares out of 100%.</p>${["Composer", "Publisher"].map(role => `<section class="contributor-section" aria-label="${role}s"><div class="section-title"><h3>${role === "Composer" ? "Composers / writers" : "Publishers"}</h3><button data-add-credit="${role}">＋ Add ${role === "Composer" ? "writer" : "publisher"}</button></div>${cue.credits.map((c, i) => c.role !== role ? "" : `<div class="credit" data-credit="${i}" data-credit-id="${c.id}"><div class="credit-top"><strong>${role === "Composer" ? "Writer" : "Publisher"} ${cue.credits.slice(0, i + 1).filter(p => p.role === role).length}</strong><button class="text danger" data-remove-credit="${i}" aria-label="Remove ${role} ${i + 1}">Remove</button></div><div class="form-grid contributor-fields">${role === "Composer" ? field("First / middle name", "first", c.first) + field("Last name", "last", c.last) : field("Publisher name", "name", c.name)}${field("PRO affiliation", "pro", c.pro, 'placeholder="BMI, ASCAP, PRS…"')}${field("Share (%)", "share", c.share, 'type="number" min="0" max="100" step="0.01"')}${field("IPI (optional)", "ipi", c.ipi)}</div></div>`).join("") || '<p class="muted">Add a contributor for this cue.</p>'}</section>`).join("")}</div>`;
}
function production() {
  const p = effectiveProduction(state),
    movie = state.mode === "movie" && state.movieMetadata;
  return `<section class="panel" id="production"><h2>Production details for the cue sheet</h2><p class="muted">${movie ? "Title and duration are already filled from the movie. Edit them if needed." : "Audio cues do not establish the full film title or length. Enter what you know; unknown details stay blank in a draft."}</p><div class="form-grid wide">${field("Series / film title", "title", p.title)}${field("Production company", "company", p.company)}</div>
 ${movie ? `<div class="metadata-summary"><div><span>Show duration</span><strong>${esc(p.duration)}</strong><small>${state.movieOverrides?.duration !== undefined ? "Your override" : "From movie, adjusted for any pre-roll/tail"}</small></div><div><span>Production starts at</span><strong>${esc(p.startTimecode)}</strong><small>File origin + pre-roll</small></div></div><details class="disclosure"><summary>Override show duration</summary>${field("Show duration (HH:MM:SS)", "duration", p.duration, 'placeholder="00:24:00"')}<button class="text" id="reset-movie-duration">Use movie-derived duration</button></details>` : `<details class="disclosure"><summary>Full show duration & optional timeline bounds</summary>${field("Full show duration (unknown is okay for a draft)", "duration", p.duration, 'placeholder="HH:MM:SS"')}${field("Production start (only if you want bounds checked)", "startTimecode", p.startTimecode, 'placeholder="HH:MM:SS:FF"')}<p class="muted">Never substitute a cue audio file’s length for full show duration.</p></details>`}
 <details class="disclosure"><summary>Episode, broadcast & contact details</summary><div class="form-grid wide">${[
   ["Title AKA", "aka"],
   ["Episode title", "episode"],
   ["Episode AKA", "episodeAka"],
   ["Episode number", "episodeNumber"],
   ["Production number", "productionNumber"],
   ["Mailing address", "address"],
   ["Prepared by", "preparedBy"],
   ["Email address", "email"],
   ["Initial airdate", "airdate"],
   ["Category", "category"],
   ["Version", "version"],
   ["Network / source", "network"],
 ]
   .map(([label, k]) =>
     field(
       label,
       k,
       p[k],
       k === "airdate" ? 'type="date"' : k === "email" ? 'type="email"' : "",
     ),
   )
   .join("")}${select(
   "Cue sheet classification",
   "classification",
   p.classification,
   [
     ["Original", "Original"],
     ["Revision", "Revision"],
   ],
 )}</div></details></section>`;
}
function cues() {
  const cueNav = state.cues.length ? `<nav class="cue-navigation" aria-label="Jump to cue">${state.cues.map((c, i) => `<a href="#cue-${c.id}"><span>Cue ${i + 1}</span><strong>${esc(c.title || state.tracks.find(t => t.id === c.trackId)?.title || "Untitled cue")}</strong></a>`).join("")}</nav>` : "";
  return `${cueNav}<div class="notice neutral">Film timeline · ${effectiveProduction(state).startTimecode ? esc(effectiveProduction(state).startTimecode) + " production start" : "Production start unknown; no assumed bounds"} · ${esc(rates[state.production.rate].label)}. Detected timings are rounded to the nearest project frame; signal boundaries have about 0.1s resolution for matching and 0.02s for silence detection. Review before export.</div><div class="section-title"><h2>Cue placements</h2><div class="button-row"><button id="confirm-detections" ${!state.cues.some((c) => c.method !== "manual" && !c.reviewed) ? "disabled" : ""}>Confirm detected timings</button><select id="cue-track" aria-label="Track for new cue">${state.tracks.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}</select><button class="primary" id="new-cue" ${!state.tracks.length ? "disabled" : ""}>＋ Manual cue</button></div></div>${
    state.cues.length
      ? state.cues
          .map((c, i) => {
            const t = state.tracks.find((t) => t.id === c.trackId),
              d = duration(c, state.production.rate);
            return `<section class="panel cue" id="cue-${c.id}" tabindex="-1" data-cue="${c.id}" aria-label="Cue ${i + 1}: ${esc(c.title || t.title)}"><div class="section-title"><h3><span class="cue-number">${String(i + 1).padStart(2, "0")}</span><span data-cue-title>${esc(c.title || t.title)}</span></h3><button class="text danger" data-remove-cue="${c.id}">Remove</button></div><p class="muted">Source: ${esc(t.filename)} · ${c.method === "movie" ? `Movie match · waveform similarity ${Math.round(c.score * 100)}% (not a probability)` : c.method === "offset" ? "Detected music-only region" : "Manual placement"}${c.fileOffset ? ` · file starts ${esc(c.fileOffset)}` : ""}</p><div class="form-grid cue-fields">${field("Cue title", "title", c.title || t.title)}${provenanceField(effectiveCue(c, state.sharedCueDetails).category)}<div class="inheritance"><span>${c.category == null ? "Provenance: follows shared details" : "Provenance: cue override"}</span>${c.category != null ? `<button data-reset-shared="category">Use shared provenance</button>` : ""}</div>${field("Film in (HH:MM:SS:FF)", "start", c.start, 'placeholder="01:00:00:00"')}${field("Film out (HH:MM:SS:FF)", "end", c.end, 'placeholder="01:00:00:00"')}${select("Usage", "usage", c.usage, [["", "Choose usage"], ...Object.entries(usages).map(([k, v]) => [k, `${k} · ${v}`])])}<div class="duration"><span>Cue duration</span><strong>${d === null ? "Missing placement" : d.toFixed(3) + " s"}</strong></div></div><div class="button-row timing-actions">${c.method === "movie" && workflow.movie ? `<button data-listen="${c.id}">Preview in movie</button>` : urls.has(t.id) ? `<audio data-cue-audio="${c.id}" controls preload="metadata" src="${urls.get(t.id)}"></audio>` : ""}${c.method === "manual" && urls.has(t.id) ? `<button data-mark-in="${c.id}">Mark in at playback</button><button data-mark-out="${c.id}">Mark out at playback</button><span class="muted">Playback + file offset ${esc(t.offset || "(not set)")}</span>` : ""}${c.method && c.method !== "manual" ? `<label class="check"><input type="checkbox" data-reviewed="${c.id}" ${c.reviewed ? "checked" : ""}> Timing reviewed</label>` : ""}</div>${c.credits != null ? `<div class="button-row"><strong>Credits: cue override</strong><button data-reset-shared="credits">Use shared credits</button></div>${cueCreditEditor(c)}` : `<div class="panel inherited-credits"><h3>Credits: follows shared details</h3><p>${esc(effectiveCue(c, state.sharedCueDetails).credits.map(p => p.role === "Composer" ? [p.first,p.last].filter(Boolean).join(" ") : p.name).filter(Boolean).join(" · ") || "No shared names entered yet")}</p><div class="button-row"><button data-tab="shared">Edit shared details</button><button data-override-credits>Customize credits for this cue</button></div></div>`}<p class="cue-status muted">${esc(cueIssues(c, t, effectiveProduction(state), state.sharedCueDetails).join(" · ") || "Placement and credits complete")}</p></section>`;
          })
          .join("")
      : '<div class="empty"><h3>No placements yet</h3><p>Run an automatic workflow or add a manual cue above.</p></div>'
  }`;
}
function reviewPage(issues) {
  const warnings = productionWarnings(state);
  return `<div class="review-grid"><section class="panel"><p class="muted">Cue provenance: ${state.cues.map(c => effectiveCue(c, state.sharedCueDetails)).filter(c => c.category === "original").length} original · ${state.cues.map(c => effectiveCue(c, state.sharedCueDetails)).filter(c => c.category === "sourced").length} sourced · ${state.cues.map(c => effectiveCue(c, state.sharedCueDetails)).filter(c => !["original", "sourced"].includes(c.category)).length} unspecified</p><h2>${issues.length ? "A few details to finish" : "Ready for your review"}</h2><button class="text" data-tab="production">Edit production details →</button><p class="muted">${issues.length ? "Complete these items to enable the export." : "All required fields are filled. Verify the information with your production team before submission."}</p>${issues.length ? `<ul class="issues">${issues.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : '<div class="complete">✓ Production, placements and credits entered</div>'}${warnings.length ? `<div class="notice neutral"><strong>Unknown production information</strong><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul><p>Draft export leaves these fields blank. Complete applicable BMI information before submission.</p></div>` : ""}<p class="muted">${state.tracks.filter((t) => !state.cues.some((c) => c.trackId === t.id)).length} library tracks have no placements and will not appear in the cue sheet.</p></section><section class="panel export"><div class="sheet-icon">XLSX</div><h2>Your music cue sheet</h2><p>Populates BMI’s official Excel template with production details, cue timings, usage and contributor rows.</p><button class="primary" id="export" ${issues.length ? "disabled" : ""}>↓ ${warnings.length ? "Download draft XLSX" : "Download cue sheet"}</button><p class="muted">Review draft · no automatic submission<br>BMI fields round to whole seconds.<br>The Frame timings worksheet preserves exact timecodes and rate.</p><a href="${import.meta.env.BASE_URL}bmi-cue-sheet-template.xlsx" download>View original BMI template ↗</a></section></div>`;
}
function credit(role) {
  return { id: id(), role, first: "", last: "", name: "", pro: "", ipi: "", share: "" };
}
function addCue(trackId) {
  const track = state.tracks.find((t) => t.id === trackId);
  state.cues.push({
    id: id(),
    trackId,
    ...cueDetails(track),
    title: track.title,
    start: track.offset || "",
    end: "",
    usage: "BI",
    method: "manual",
    reviewed: true,
  });
  tab = "cues";
  save();
  render();
}
function writeCreditField(element, key) {
  const owner = element.closest("#shared-details") ? state.sharedCueDetails
    : state.cues.find(c => c.id === element.closest("[data-cue]")?.dataset.cue);
  const person = owner?.credits?.find(p => p.id === element.closest("[data-credit]").dataset.creditId);
  if (!person) return false; // A pending blur from a removed/reset contributor is obsolete.
  person[key] = element.value;
  return true;
}
function bind() {
  bindWorkflows();
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        const sharedShortcut = b.dataset.tab === "shared";
        tab = b.dataset.tab;
        (message = "");
        render();
        if (sharedShortcut) {
          $("#shared-details").scrollIntoView({block:"start"});
          $("#shared-details").focus({preventScroll:true});
        } else window.scrollTo({top:0});
      }),
  );
  document.querySelectorAll("[data-track]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.track;
        render();
      }),
  );
  document
    .querySelectorAll("[data-upload]")
    .forEach((e) => (e.onchange = () => upload(e.files, e.dataset.upload)));
  document.querySelectorAll("[data-drop]").forEach((e) => {
    e.ondragover = (ev) => {
      ev.preventDefault();
      e.classList.add("drag");
    };
    e.ondragleave = () => e.classList.remove("drag");
    e.ondrop = (ev) => {
      ev.preventDefault();
      e.classList.remove("drag");
      upload(ev.dataTransfer.files, e.dataset.drop);
    };
  });
  document.querySelectorAll("[data-field]").forEach(
    (e) =>
      (e.onchange = (event) => {
        const k = e.dataset.field;
        if (e.closest("[data-cue]") && !state.cues.some(c => c.id === e.closest("[data-cue]").dataset.cue)) return;
        if (e.closest("[data-editor]") && !state.tracks.some(t => t.id === e.closest("[data-editor]").dataset.editor)) return;
        let refresh = false;
        if (e.closest("#shared-details")) {
          if (e.closest("[data-credit]")) { if (!writeCreditField(e, k)) return; }
          else state.sharedCueDetails[k] = e.value;
        } else if (e.closest("#workflow-settings")) {
          if (k === "rate") {
            changeRate(e.value);
            return;
          }
        } else if (e.closest("#movie-settings")) {
          if (k === "movieOffset") {
            rebaseDetections((c) => c.method === "movie", e.value);
            state.movieOriginEdited = true;
            refresh = true;
          }
          state[k] = e.value;
        } else if (e.closest("#movie-options") || e.closest("#offset-settings")) {
          state[k] = e.type === "range" ? e.valueAsNumber : e.value;
          if (e.type === "range") {
            const valueText = `${e.value} ${k === "thresholdDb" ? "dBFS" : "seconds"}`;
            $(`#${e.id}-value`).value = valueText;
            e.setAttribute("aria-valuetext", valueText);
          }
        }
        else if (e.closest("#movie-trim")) {
          state.movieOverrides ??= {};
          state.movieOverrides[k] = e.value;
          refresh = true;
        } else if (e.closest("[data-track-offset]")) {
          const trackId = e.closest("[data-track-offset]").dataset.trackOffset;
          rebaseDetections(
            (c) => c.method === "offset" && c.trackId === trackId,
            e.value,
          );
          state.tracks.find((t) => t.id === trackId)[k] = e.value;
        } else if (e.closest("#production")) {
          if (
            k === "duration" &&
            state.mode === "movie" &&
            state.movieMetadata
          ) {
            state.movieOverrides ??= {};
            state.movieOverrides.duration = e.value;
          } else state.production[k] = e.value;
        } else if (e.closest("[data-credit]")) {
          if (!writeCreditField(e, k)) return;
        }
        else if (e.closest("[data-editor]"))
          state.tracks.find((t) => t.id === e.closest("[data-editor]").dataset.editor)[k] = e.value;
        else if (e.closest("[data-cue]")) {
          const c = state.cues.find(
            (c) => c.id === e.closest("[data-cue]").dataset.cue,
          );
          c[k] = e.value;
          if (k === "category") refresh = true;
          if (k === "start" || k === "end") c.reviewed = false;
        }
        if (refresh && event?.type !== "input") {
          save();
          render();
          return;
        }
        save();
        updateIndicators();
      }),
  );
  document.querySelectorAll('input[data-field]').forEach(input => {
    input.oninput = input.onchange;
  });
  document.querySelectorAll('[data-override-credits]').forEach(button => button.onclick = () => {
    const cue = state.cues.find(c => c.id === button.closest('[data-cue]').dataset.cue);
    cue.credits = structuredClone(state.sharedCueDetails.credits);
    save(); render();
  });
  document.querySelectorAll('[data-reset-shared]').forEach(button => button.onclick = () => {
    const cue = state.cues.find(c => c.id === button.closest('[data-cue]').dataset.cue);
    delete cue[button.dataset.resetShared];
    save(); render();
  });
  document.querySelectorAll("[data-add-credit]").forEach(
    (b) =>
      (b.onclick = () => {
        (b.closest("#shared-details") ? state.sharedCueDetails : state.cues.find(c => c.id === b.closest("[data-cue]").dataset.cue))
          .credits.push(credit(b.dataset.addCredit));
        save();
        render();
      }),
  );
  document.querySelectorAll("[data-remove-credit]").forEach(
    (b) =>
      (b.onclick = () => {
        (b.closest("#shared-details") ? state.sharedCueDetails : state.cues.find(c => c.id === b.closest("[data-cue]").dataset.cue))
          .credits.splice(Number(b.dataset.removeCredit), 1);
        save();
        render();
      }),
  );
  document
    .querySelectorAll("[data-add-cue]")
    .forEach((b) => (b.onclick = () => addCue(b.dataset.addCue)));
  if ($("#new-cue"))
    $("#new-cue").onclick = () => addCue($("#cue-track").value);
  document.querySelectorAll("[data-remove-cue]").forEach(
    (b) =>
      (b.onclick = () => {
        state.cues = state.cues.filter((c) => c.id !== b.dataset.removeCue);
        delete state.analysisReport;
        save();
        render();
      }),
  );
  document.querySelectorAll("[data-remove-track]").forEach(
    (b) =>
      (b.onclick = () => {
        if (!confirm("Remove this track and all its cue placements?")) return;
        const key = b.dataset.removeTrack;
        URL.revokeObjectURL(urls.get(key));
        urls.delete(key);
        workflow.audio.delete(key);
        state.tracks = state.tracks.filter((t) => t.id !== key);
        state.cueDetailsArchive = (state.cueDetailsArchive ?? []).filter(c => c.trackId !== key);
        state.cues = state.cues.filter((c) => c.trackId !== key);
        selected = null;
        clearedResults = null;
        delete state.analysisReport;
        save();
        render();
      }),
  );
  if ($("#export"))
    $("#export").onclick = async () => {
      if (review().length) return;
      const button = $("#export");
      button.disabled = true;
      button.textContent = "Preparing spreadsheet…";
      try {
        const blob = await exportWorkbook(
          effectiveProduction(state),
          state.tracks,
          state.cues,
          state.sharedCueDetails,
        );
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = `${effectiveProduction(state).title.replace(/[^a-z0-9_-]/gi, "_")}-cue-sheet.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        message =
          "Cue sheet downloaded. Review the workbook before submission.";
      } catch (e) {
        message = `Export failed: ${e.message}`;
      }
      render();
    };
}
function updateIndicators() {
  const sharedStatus = $("#shared-credit-status");
  if (sharedStatus) sharedStatus.textContent = creditIssues(state.sharedCueDetails).join(" · ") || "Shared credits complete.";
  const analyze = $("#analyze"), help = $("#detection-help");
  if (analyze) {
    const reason = workflow.analysisUnavailable();
    analyze.disabled = Boolean(reason);
    if (help) help.textContent = reason || "Ready to detect with current settings.";
  }
  const header = document.querySelector("header b");
  if (header)
    header.textContent =
      effectiveProduction(state).title || "Untitled production";
  const ready = state.cues.filter(
    (c) =>
      !cueIssues(
        c,
        state.tracks.find((t) => t.id === c.trackId),
        effectiveProduction(state),
        state.sharedCueDetails,
      ).length,
  ).length;
  document.querySelectorAll(".stats strong")[2].textContent = String(
    ready,
  ).padStart(2, "0");
  document.querySelectorAll("[data-track]").forEach((el) => {
    const t = state.tracks.find((t) => t.id === el.dataset.track),
      pending = false;
    el.querySelector("strong").textContent = t.title;
    const badge = el.querySelector(".badge");
    badge.textContent = "Source audio";
    badge.classList.toggle("pending", Boolean(pending));
  });
  document.querySelectorAll("[data-cue]").forEach((el) => {
    const c = state.cues.find((c) => c.id === el.dataset.cue),
      t = state.tracks.find((t) => t.id === c.trackId),
      d = duration(c, state.production.rate);
    el.querySelector("[data-cue-title]").textContent = c.title || t.title;
    const link = document.querySelector(`.cue-navigation a[href="#cue-${c.id}"] strong`);
    if (link) link.textContent = c.title || t.title;
    el.querySelector(".duration strong").textContent =
      d === null ? "Missing placement" : d.toFixed(3) + " s";
    el.querySelector(".cue-status").textContent =
      cueIssues(c, t, effectiveProduction(state), state.sharedCueDetails).join(" · ") ||
      "Placement and credits complete";
    const checkbox = el.querySelector("[data-reviewed]");
    if (checkbox) checkbox.checked = Boolean(c.reviewed);
  });
  if ($("#confirm-detections"))
    $("#confirm-detections").disabled = !state.cues.some(
      (c) => c.method !== "manual" && !c.reviewed,
    );
}
async function upload(files) {
  for (const file of Array.from(files)) {
    const track = await workflow.load(file);
    if (track) selected = track.id;
    if (workflow.controller?.signal.aborted) break;
  }
  render();
}
function forgetClearUndo() {
  clearedResults = null;
  $("#undo-clear")?.parentElement.remove();
}
function rebaseDetections(predicate, offset) {
  forgetClearUndo();
  const rate = state.production.rate,
    next = toFrames(offset, rate);
  if (next === null) return;
  state.cues.filter(predicate).forEach((c) => {
    const before = toFrames(c.fileOffset, rate);
    if (before === null) return;
    const delta = next - before;
    const a = toFrames(c.start, rate),
      b = toFrames(c.end, rate);
    c.start = a === null ? "" : fromFrames(a + delta, rate);
    c.end = b === null ? "" : fromFrames(b + delta, rate);
    c.fileOffset = offset;
    c.reviewed = false;
  });
}
function changeRate(rate) {
  forgetClearUndo();
  if (
    state.cues.length &&
    !confirm(
      "Change the shared frame rate? Existing placements will retain elapsed positions and detected timings will need review.",
    )
  ) {
    render();
    return;
  }
  convertRate(state, rate);
  state.rateEdited = true;
  if (state.mode === "movie") state.movieRateEdited = true;
  save();
  render();
}
function bindWorkflows() {
  if ($("#reset-movie-duration"))
    $("#reset-movie-duration").onclick = () => {
      delete state.movieOverrides.duration;
      save();
      render();
    };
  document.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        state.mode = b.dataset.mode;
        save();
        render();
      }),
  );
  if ($("#movie-upload"))
    $("#movie-upload").onchange = (e) => {
      if (e.target.files[0]) {
        forgetClearUndo();
        workflow.load(e.target.files[0], null, true);
      }
    };
  document.querySelectorAll("[data-clear-results]").forEach(button => {
    button.onclick = () => {
      if (workflow.worker) workflow.cancel();
      const method = button.dataset.clearResults;
      clearedResults = { cues: state.cues.filter(c => c.method === method), report: state.analysisReport?.mode === method ? state.analysisReport : null };
      archiveCueDetails(state, method);
      state.cues = state.cues.filter(c => c.method !== method);
      if (state.analysisReport?.mode === method) delete state.analysisReport;
      message = "";
      save();
      render();
    };
  });
  if ($("#undo-clear")) $("#undo-clear").onclick = () => {
    state.cues.push(...clearedResults.cues);
    if (clearedResults.report) state.analysisReport = clearedResults.report;
    clearedResults = null;
    save();
    render();
  };
  if ($("#analyze")) $("#analyze").onclick = () => {
    clearedResults = null;
    workflow.analyze();
  };
  if ($("#cancel-analysis"))
    $("#cancel-analysis").onclick = () => workflow.cancel();
  document.querySelectorAll("[data-reattach]").forEach(
    (e) =>
      (e.onchange = () => {
        if (e.files[0])
          workflow.load(
            e.files[0],
            state.tracks.find((t) => t.id === e.dataset.reattach),
          );
      }),
  );
  if ($("#confirm-detections"))
    $("#confirm-detections").onclick = () => {
      state.cues
        .filter((c) => c.method !== "manual")
        .forEach((c) => (c.reviewed = true));
      save();
      render();
    };
  document.querySelectorAll("[data-reviewed]").forEach(
    (e) =>
      (e.onchange = () => {
        state.cues.find((c) => c.id === e.dataset.reviewed).reviewed =
          e.checked;
        save();
        updateIndicators();
      }),
  );
  document.querySelectorAll("[data-listen]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = state.cues.find((c) => c.id === b.dataset.listen);
        state.mode = "movie";
        tab = "library";
        save();
        render();
        const video = $("#movie-preview");
        if (video?.closest("details")) video.closest("details").open = true;
        if (video) {
          video.currentTime = Math.max(
            0,
            elapsed(c.fileOffset, c.start, state.production.rate) ??
              c.relativeStart,
          );
          video.scrollIntoView({ behavior: "smooth" });
          video.play().catch(() => {});
        }
      }),
  );
  for (const kind of ["in", "out"])
    document.querySelectorAll(`[data-mark-${kind}]`).forEach(
      (b) =>
        (b.onclick = () => {
          const c = state.cues.find(
              (c) => c.id === b.dataset[kind === "in" ? "markIn" : "markOut"],
            ),
            t = state.tracks.find((t) => t.id === c.trackId),
            audio = document.querySelector(`[data-cue-audio="${c.id}"]`);
          if (toFrames(t.offset, state.production.rate) === null) {
            message =
              "Set this audio file’s starting film timecode in the library first.";
            render();
            return;
          }
          c[kind === "in" ? "start" : "end"] = atOffset(
            t.offset,
            audio.currentTime,
            state.production.rate,
          );
          c.fileOffset = t.offset;
          save();
          const input = document.querySelector(
            `[data-cue="${c.id}"] [data-field="${kind === "in" ? "start" : "end"}"]`,
          );
          input.value = c[kind === "in" ? "start" : "end"];
          updateIndicators();
        }),
    );
  document.querySelectorAll("[data-cue-audio]").forEach((audio) => {
    const c = state.cues.find((c) => c.id === audio.dataset.cueAudio);
    if (c.method === "offset")
      audio.onloadedmetadata = () => {
        audio.currentTime = c.relativeStart;
      };
  });
}
render();
