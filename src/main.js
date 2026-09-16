import "./style.css";
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
    thresholdDb: -45,
    silenceGap: 0.35,
    matchThreshold: 0.45,
  },
  selected = null,
  tab = "library",
  message = "",
  creditsOpen = false;
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
        ).length,
    ).length;
  $("#app").innerHTML =
    `<aside aria-label="Workspace sidebar"><div class="sidebar-header"><a class="brand" href="#" aria-label="Cuebook"><span class="mark" aria-hidden="true">▥</span><span class="brand-word">cuebook</span></a>${sidebarToggle}</div><div class="project-label">MUSIC WORKSPACE</div><nav id="sidebar-nav" aria-label="Workspace navigation">${[
      ["library", "01", "Find your cues"],
      ["cues", "02", "Timings & usage"],
      ["production", "03", "Production details"],
      ["review", "04", "Review & export"],
    ]
      .map(
        ([key, n, label]) =>
          `<button class="nav ${tab === key ? "active" : ""}" data-tab="${key}" aria-label="${label}" title="${label}" ${tab===key?'aria-current="page"':''}>${sidebarIcon(key)}<span class="nav-label"><span class="nav-step">${n}</span>${label}</span></button>`,
      )
      .join(
        "",
      )}</nav><div class="aside-note"><span class="small-icon">↗</span><strong>Your music stays here.</strong><p>Audio is processed in your browser. Details are saved on this device; audio previews last until you close or refresh the page.</p></div><a class="source-link" href="https://www.bmi.com/creators/what_is_a_cue_sheet" target="_blank" rel="noreferrer">BMI cue sheet guide ↗</a></aside><main><header><span>WORKSPACE / <b>${esc(effectiveProduction(state).title || "Untitled production")}</b></span><span class="local">Device-local workspace</span></header><div class="content"><div class="heading"><div><div class="eyebrow">FROM TRACK TO CUE SHEET</div><h1>${{ library: "From soundtrack to cue sheet.", production: "Set the scene.", cues: "Place the music.", review: "The final check." }[tab]}</h1><p>${{ library: "Choose how to find your timings. Keep every creator in the credits.", production: "Add the production information that travels with your cue sheet.", cues: "Review detected placements or enter timings on the film timeline.", review: "Review credits and placements before downloading your spreadsheet." }[tab]}</p></div>${state.cues.length ? `<button class="primary" data-tab="${tab === "library" ? "cues" : tab === "review" ? "library" : "review"}">${tab === "library" ? "Review timings →" : tab === "review" ? "Back to workflow" : "Review & export →"}</button>` : ""}</div><div class="stats"><div><strong>${String(state.tracks.length).padStart(2, "0")}</strong><span>Tracks in library</span></div><div><strong>${String(state.cues.length).padStart(2, "0")}</strong><span>Cue placements</span></div><div><strong>${String(ready).padStart(2, "0")}</strong><span>Cues with complete details</span></div></div>${message ? `<div class="notice" role="status">${esc(message)}</div>` : ""}${tab === "library" ? library() : tab === "production" ? production() : tab === "cues" ? cues() : reviewPage(issues)}<footer><span>CUEBOOK / MUSIC WORKSPACE</span><span>Made for the people behind the music.</span></footer></div></main>`;
  bind();
  bindSidebar();
  document.querySelectorAll("details").forEach((el) => {
    if (openDetails.has(el.querySelector("summary")?.textContent))
      el.open = true;
  });
  if (workflow.busy)
    document.querySelectorAll("button,input,select").forEach((el) => {
      if (el.id !== "cancel-analysis" && el.id !== "sidebar-toggle") el.disabled = true;
    });
}
function library() {
  return (
    workflowView(state, workflow, { esc, field, select }) +
    `<div class="section-title"><h2>Cue audio library <span>${state.tracks.length}</span></h2><span class="muted">Audio is shared across paths · select a file to edit credits</span></div>${state.tracks.length ? `<div class="library-grid"><div class="track-list">${state.tracks.map((t) => `<button class="track ${selected === t.id ? "selected" : ""}" data-track="${t.id}"><span class="track-icon">♪</span><span><strong>${esc(t.title)}</strong><small>${time(t.duration)} · ${workflow.audio.has(t.id) ? "Audio ready" : "Reattach audio to analyze"}</small></span><span class="badge ${creditIssues(t).length ? "pending" : ""}">${creditIssues(t).length ? "Needs credits" : "Credits entered"}</span></button>`).join("")}</div>${editor()}</div>` : '<div class="empty"><span>♫</span><h3>Add the music behind the picture</h3><p>Upload cue recordings or a music-only export using the selected workflow above.</p></div>'}`
  );
}
function editor() {
  const t = state.tracks.find((t) => t.id === selected);
  if (!t)
    return '<div class="panel empty"><p>Select a track to review its details.</p></div>';
  return `<section class="panel editor" data-editor="${t.id}"><div class="section-title"><h2>Track details</h2><button class="text danger" data-remove-track="${t.id}">Remove</button></div>${field("Cue / song title", "title", t.title)}${select(
    "Credit provenance (does not establish ownership)",
    "category",
    t.category,
    [
      ["unknown", "Unspecified"],
      ["original", "Original work"],
      ["sourced", "Sourced music"],
    ],
  )}${state.mode === "manual" ? `<details class="disclosure"><summary>Use playback marks (optional)</summary>${field("This audio file starts at film timecode", "offset", t.offset, 'placeholder="01:00:00:00"')}<p class="muted">Only needed for playback marking. Direct film in/out entry needs no file offset.</p></details>` : ""}<p class="file-name">${esc(t.filename)} · ${t.duration === null ? "Duration unavailable" : time(t.duration)}</p>${urls.has(t.id) ? `<audio id="track-preview" controls src="${urls.get(t.id)}"></audio>` : `<label class="upload-button">Reattach ${esc(t.filename)}<input data-reattach="${t.id}" type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"></label>`}${t.error ? `<p class="notice">${esc(t.error)}</p>` : ""}<details class="credit-details disclosure" ${creditsOpen ? "open" : ""}><summary>Writer & publisher credits</summary><p class="muted">Confirm every contributor, PRO and share. File provenance does not establish ownership. Enter each role’s shares out of 100%.</p>${t.credits.map((c, i) => `<div class="credit" data-credit="${i}"><div class="credit-top"><strong>${c.role}</strong><button class="text danger" data-remove-credit="${i}" aria-label="Remove ${c.role} ${i + 1}">Remove</button></div><div class="form-grid">${c.role === "Composer" ? field("First / middle name", "first", c.first) + field("Last name", "last", c.last) : field("Publisher name", "name", c.name)}${field("PRO affiliation", "pro", c.pro, 'placeholder="BMI, ASCAP, PRS…"')}${field("Share (%)", "share", c.share, 'type="number" min="0" max="100" step="0.01"')}${field("IPI (optional)", "ipi", c.ipi)}</div></div>`).join("")}<div class="button-row"><button data-add-credit="Composer">＋ Writer</button><button data-add-credit="Publisher">＋ Publisher</button></div></details>${state.mode === "manual" ? `<button class="primary" data-add-cue="${t.id}">Add manual placement</button>` : ""}</section>`;
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
 )}</div></details><button class="primary" data-tab="review">Review & export →</button></section>`;
}
function cues() {
  return `<div class="notice neutral">Film timeline · ${effectiveProduction(state).startTimecode ? esc(effectiveProduction(state).startTimecode) + " production start" : "Production start unknown; no assumed bounds"} · ${esc(rates[state.production.rate].label)}. Detected timings are rounded to the nearest project frame; signal boundaries have about 0.1s resolution for matching and 0.02s for silence detection. Review before export.</div><div class="section-title"><h2>Cue placements</h2><div class="button-row"><button id="confirm-detections" ${!state.cues.some((c) => c.method !== "manual" && !c.reviewed) ? "disabled" : ""}>Confirm detected timings</button><select id="cue-track" aria-label="Track for new cue">${state.tracks.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}</select><button class="primary" id="new-cue" ${!state.tracks.length ? "disabled" : ""}>＋ Manual cue</button></div></div>${
    state.cues.length
      ? state.cues
          .map((c, i) => {
            const t = state.tracks.find((t) => t.id === c.trackId),
              d = duration(c, state.production.rate);
            return `<section class="panel cue" data-cue="${c.id}"><div class="section-title"><h3><span class="cue-number">${String(i + 1).padStart(2, "0")}</span>${esc(c.title || t.title)}</h3><button class="text danger" data-remove-cue="${c.id}">Remove</button></div><p class="muted">${c.method === "movie" ? `Movie match · waveform similarity ${Math.round(c.score * 100)}% (not a probability)` : c.method === "offset" ? "Detected music-only region" : "Manual placement"}${c.fileOffset ? ` · file starts ${esc(c.fileOffset)}` : ""}</p><div class="form-grid cue-fields">${field("Cue title", "title", c.title || t.title)}${field("Film in (HH:MM:SS:FF)", "start", c.start, 'placeholder="01:00:00:00"')}${field("Film out (HH:MM:SS:FF)", "end", c.end, 'placeholder="01:00:00:00"')}${select("Usage", "usage", c.usage, [["", "Choose usage"], ...Object.entries(usages).map(([k, v]) => [k, `${k} · ${v}`])])}<div class="duration"><span>Cue duration</span><strong>${d === null ? "Missing placement" : d.toFixed(3) + " s"}</strong></div></div><div class="button-row timing-actions">${c.method === "movie" && workflow.movie ? `<button data-listen="${c.id}">Preview in movie</button>` : urls.has(t.id) ? `<audio data-cue-audio="${c.id}" controls preload="metadata" src="${urls.get(t.id)}"></audio>` : ""}${c.method === "manual" && urls.has(t.id) ? `<button data-mark-in="${c.id}">Mark in at playback</button><button data-mark-out="${c.id}">Mark out at playback</button><span class="muted">Playback + file offset ${esc(t.offset || "(not set)")}</span>` : ""}${c.method && c.method !== "manual" ? `<label class="check"><input type="checkbox" data-reviewed="${c.id}" ${c.reviewed ? "checked" : ""}> Timing reviewed</label>` : ""}<button data-edit-credits="${t.id}">Edit file credits</button></div><p class="cue-status muted">${esc(cueIssues(c, t, effectiveProduction(state)).join(" · ") || "Placement and credits complete")}</p></section>`;
          })
          .join("")
      : '<div class="empty"><h3>No placements yet</h3><p>Run an automatic workflow or add a manual cue above.</p></div>'
  }`;
}
function reviewPage(issues) {
  const warnings = productionWarnings(state);
  return `<div class="review-grid"><section class="panel"><h2>${issues.length ? "A few details to finish" : "Ready for your review"}</h2><button class="text" data-tab="production">Edit production details →</button><p class="muted">${issues.length ? "Complete these items to enable the export." : "All required fields are filled. Verify the information with your production team before submission."}</p>${issues.length ? `<ul class="issues">${issues.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : '<div class="complete">✓ Production, placements and credits entered</div>'}${warnings.length ? `<div class="notice neutral"><strong>Unknown production information</strong><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul><p>Draft export leaves these fields blank. Complete applicable BMI information before submission.</p></div>` : ""}<p class="muted">${state.tracks.filter((t) => !state.cues.some((c) => c.trackId === t.id)).length} library tracks have no placements and will not appear in the cue sheet.</p></section><section class="panel export"><div class="sheet-icon">XLSX</div><h2>Your music cue sheet</h2><p>Populates BMI’s official Excel template with production details, cue timings, usage and contributor rows.</p><button class="primary" id="export" ${issues.length ? "disabled" : ""}>↓ ${warnings.length ? "Download draft XLSX" : "Download cue sheet"}</button><p class="muted">Review draft · no automatic submission<br>BMI fields round to whole seconds.<br>The Frame timings worksheet preserves exact timecodes and rate.</p><a href="${import.meta.env.BASE_URL}bmi-cue-sheet-template.xlsx" download>View original BMI template ↗</a></section></div>`;
}
function credit(role) {
  return { role, first: "", last: "", name: "", pro: "", ipi: "", share: "" };
}
function addCue(trackId) {
  const track = state.tracks.find((t) => t.id === trackId);
  state.cues.push({
    id: id(),
    trackId,
    title: track.title,
    start: track.offset || "",
    end: "",
    usage: "",
    method: "manual",
    reviewed: true,
  });
  tab = "cues";
  save();
  render();
}
function bind() {
  bindWorkflows();
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        ((message = ""), (creditsOpen = false));
        render();
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
      (e.onchange = () => {
        const k = e.dataset.field;
        let refresh = false;
        if (e.closest("#workflow-settings")) {
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
        } else if (e.closest("#movie-options") || e.closest("#offset-settings"))
          state[k] = e.value;
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
        } else if (e.closest("[data-credit]"))
          state.tracks.find((t) => t.id === selected).credits[
            Number(e.closest("[data-credit]").dataset.credit)
          ][k] = e.value;
        else if (e.closest("[data-editor]"))
          state.tracks.find((t) => t.id === selected)[k] = e.value;
        else if (e.closest("[data-cue]")) {
          const c = state.cues.find(
            (c) => c.id === e.closest("[data-cue]").dataset.cue,
          );
          c[k] = e.value;
          if (k === "start" || k === "end") c.reviewed = false;
        }
        if (refresh) {
          save();
          render();
          return;
        }
        save();
        updateIndicators();
      }),
  );
  document.querySelectorAll("[data-add-credit]").forEach(
    (b) =>
      (b.onclick = () => {
        state.tracks
          .find((t) => t.id === selected)
          .credits.push(credit(b.dataset.addCredit));
        save();
        render();
      }),
  );
  document.querySelectorAll("[data-remove-credit]").forEach(
    (b) =>
      (b.onclick = () => {
        state.tracks
          .find((t) => t.id === selected)
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
        state.cues = state.cues.filter((c) => c.trackId !== key);
        selected = null;
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
      ).length,
  ).length;
  document.querySelectorAll(".stats strong")[2].textContent = String(
    ready,
  ).padStart(2, "0");
  document.querySelectorAll("[data-track]").forEach((el) => {
    const t = state.tracks.find((t) => t.id === el.dataset.track),
      pending = creditIssues(t).length;
    el.querySelector("strong").textContent = t.title;
    const badge = el.querySelector(".badge");
    badge.textContent = pending ? "Needs credits" : "Credits entered";
    badge.classList.toggle("pending", Boolean(pending));
  });
  document.querySelectorAll("[data-cue]").forEach((el) => {
    const c = state.cues.find((c) => c.id === el.dataset.cue),
      t = state.tracks.find((t) => t.id === c.trackId),
      d = duration(c, state.production.rate);
    el.querySelector(".duration strong").textContent =
      d === null ? "Missing placement" : d.toFixed(3) + " s";
    el.querySelector(".cue-status").textContent =
      cueIssues(c, t, effectiveProduction(state)).join(" · ") ||
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
function rebaseDetections(predicate, offset) {
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
  const creditDetails = document.querySelector(".credit-details");
  if (creditDetails)
    creditDetails.ontoggle = () => {
      creditsOpen = creditDetails.open;
    };
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
      if (e.target.files[0]) workflow.load(e.target.files[0], null, true);
    };
  if ($("#analyze")) $("#analyze").onclick = () => workflow.analyze();
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
  document.querySelectorAll("[data-edit-credits]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.editCredits;
        creditsOpen = true;
        tab = "library";
        render();
        document
          .querySelector(".editor")
          ?.scrollIntoView({ behavior: "smooth" });
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
