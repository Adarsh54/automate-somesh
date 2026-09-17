import {confirmDialog} from "./confirm-dialog.js";
import {creditProfilesRequest} from "./account-credit-profiles.js";
import {editCreditProfile} from "./credit-profile-editor.js";
import {showDownloadDialog} from "./download-dialog.js";
import {cueSheetCsv} from "./export-csv.js";
import "./storage-migration.js";
import "./style.css";
import {BROWSER_MAX_MB} from "./processing-policy.js";
import {enterWorkspace} from "./welcome.js";
import {sessionInfo, createCloudWorkspace} from "./cloud-projects.js";
import {reviewProject} from "./domain/review.js";
import {serverValidationEnabled, validateOnServer} from "./api-client.js";
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
  productionWarnings,
  convertRate,
} from "./project.js";
import { rates, toFrames, atOffset, elapsed, fromFrames } from "./timecode.js";
const account = await sessionInfo();
await enterWorkspace(account);
const storageKey = account.user ? `cuestamp-user:${account.user.id}:draft` : "cuestamp-v1";
let cloudWorkspace;
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
    silenceGap: 3,
    thresholdDb: -100,
    matchThreshold: 0.45,
  },
  selected = null,
  tab = "library",
  message = new URLSearchParams(location.search).has("authError") ? "Sign-in could not finish. Please try again." : "",
  clearedResults = null;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
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
  ? Math.round(Math.min(-10, Math.max(-100, savedThreshold)))
  : -100;
const savedGap = Number(state.silenceGap);
state.silenceGap = state.silenceGap != null && state.silenceGap !== "" && Number.isFinite(savedGap)
  ? Math.round(Math.min(10, Math.max(0, savedGap)) * 20) / 20
  : 3;
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
const creditProfilesKey=account.user?`cuestamp-user:${account.user.id}:credit-profiles`:null;
let creditProfiles=[],creditProfilesError='',creditProfilesLoading=false;
let activeCreditProfileId=state.activeCreditProfileId || '';
async function loadAccountCreditProfiles(){
 if(!account.user || creditProfilesLoading)return;
 creditProfilesLoading=true;creditProfilesError='';
 try{
  // Move only this signed-in account's old device presets. Never import guest data.
  let legacy=[];try{legacy=JSON.parse(localStorage.getItem(creditProfilesKey)) || [];}catch{}
  if(Array.isArray(legacy) && legacy.length){
   for(const profile of legacy)await creditProfilesRequest('POST',profile,{importOnly:true});
   localStorage.removeItem(creditProfilesKey);
  }
  creditProfiles=(await creditProfilesRequest()).profiles;
 }catch(error){creditProfilesError=error.message;}
 finally{creditProfilesLoading=false;if(tab==='settings')render();else {const select=document.querySelector('#select-credit-profile');if(select)select.innerHTML='<option value="">Choose a profile…</option>'+creditProfiles.map(p=>`<option value="${esc(p.id)}" ${p.id===activeCreditProfileId?'selected':''}>${esc(p.name)}</option>`).join('');}}
}
async function storeCreditProfile(profile){
 const {profile:saved}=await creditProfilesRequest('POST',profile);
 creditProfiles=creditProfiles.filter(p=>p.id!==saved.id).concat(saved);render();return saved;
}
function applyCreditProfile(profileId){
  const profile=creditProfiles.find(p=>p.id===profileId);if(!profile)return;
  activeCreditProfileId=profile.id;state.activeCreditProfileId=profile.id;
  state.sharedCueDetails={category:profile.category,credits:structuredClone(profile.credits)};
  save();navigate('library');
}
function save() {
  state.status="draft";
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    cloudWorkspace?.changed();
  } catch {
    message =
      "Your draft could not be saved. Keep this page open and export before leaving.";
  }
}
function field(label, key, value, attrs = "") {
  return `<label>${label}<input data-field="${key}" value="${esc(value)}" ${attrs}></label>`;
}
const select = (label, key, value, options) =>
  `<label>${label}<select data-field="${key}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
function review() {
  return reviewProject(state).issues;
}
let faqOpen = false;
let faqAnswer = "";
function faq() {
  const questions = ["Which workflow should I choose?", "Why can't I export yet?", "What files can I use?", "What does review mean?", "Is my media uploaded?", "What if a cue is not found?", "How do I add credits?", "Can I enter timings myself?"];
  return `<div class="faq"><button class="faq-launcher" id="faq-launcher" title="${faqOpen ? "Close" : "Open"} FAQ" aria-label="${faqOpen ? "Close" : "Open"} FAQ" aria-expanded="${faqOpen}" aria-controls="faq-panel"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2 1-6a8 8 0 1 1 17-4Z"/><path d="M7 11h10M7 14h6"/></svg></button><section class="faq-panel${faqOpen ? " open" : ""}" id="faq-panel" aria-label="Frequently Asked Questions"><div class="faq-header"><div><span class="eyebrow">CUESTAMP GUIDE</span><h2>FAQ</h2></div><button class="text" id="faq-close" aria-label="Close FAQ">Close</button></div><p class="muted">Frequently asked questions. Select a question to see its answer.</p><div class="faq-questions">${questions.map((question) => `<button data-faq-question="${esc(question)}">${esc(question)}</button>`).join("")}</div>${faqAnswer ? `<div class="faq-answer" role="status">${esc(faqAnswer)}</div>` : ""}</section></div>`;
}
function answerFAQ(question) {
  const text = question.toLowerCase();
  if (text.includes("workflow") || text.includes("choose")) return "Use Movie matching for a finished movie, Audio with offset for music-only exports, or Manual to enter timings yourself.";
  if (text.includes("export") || text.includes("ready")) { const issues = review(); return issues.length ? `Export is waiting on ${issues.length} item${issues.length === 1 ? "" : "s"}. Open Review & export to see what needs attention.` : "Your cue sheet is ready. Open Review & export, finish your cue sheet, then choose Excel, CSV, or PDF to download."; }
  if (text.includes("file") || text.includes("format")) return `For video, MP4/AAC or WebM/Opus works best. For audio, use WAV, MP3, M4A, FLAC, or OGG. Files up to ${BROWSER_MAX_MB} MB are analyzed in your browser; larger files are processed on the server.`;
  if (text.includes("uploaded") || text.includes("private") || text.includes("media")) return `Files over ${BROWSER_MAX_MB} MB are uploaded privately for server processing. Comparisons against a large file also upload its reference files. Temporary processing files expire after 24 hours. Saving to an account keeps a separate copy of your media.`;
  if (text.includes("not found") || text.includes("no match") || text.includes("missing")) return "Check that the reference recording is the same speed and pitch as the movie audio. You can also add the placement manually in Timings & usage.";
  if (text.includes("review") || text.includes("confirm")) return "Review means checking detected cue boundaries, usage, timings, and credits. Automatic timings must be confirmed before export.";
  if (text.includes("credit") || text.includes("composer") || text.includes("publisher")) return "Add shared composer and publisher details on Find your cues. A cue can override them later in Timings & usage.";
  if (text.includes("manual") || text.includes("myself") || text.includes("enter timing")) return "Choose Manual, add a cue recording, then enter Film in and Film out directly or mark them during playback.";
  if (text.includes("offset") || text.includes("timecode")) return "An offset is the film timecode where an audio file begins. It lets Cuestamp convert playback or detected positions into film timings.";
  if (text.includes("save") || text.includes("account")) return "Guest drafts stay in this browser. Sign in and click Save project to keep a project and its media in your account.";
  return "Select one of the questions above to see its answer.";
}
function teamPage() {
  const members = [["Somesh Yatham", "team/somesh.png"], ["Rishil Uppaluru", "team/rishi.JPG"], ["Adarsh Ashok", "team/adarsh.png"]];
  return `<section class="team-page"><div class="eyebrow">THE PEOPLE BEHIND CUESTAMP</div><h1>Meet the team.</h1><p class="team-intro">Three people building a simpler way to turn music into a finished cue sheet.</p><div class="team-grid">${members.map(([name, photo]) => `<article class="team-member team-member-${name.split(" ")[0].toLowerCase()}"><div class="team-avatar"><img src="${import.meta.env.BASE_URL}${photo}" alt="${esc(name)}"></div><h2>${name}</h2><p>Team member</p></article>`).join("")}</div><button class="primary" data-tab="library">Back to workspace</button></section>`;
}
function bindFAQ() {
  $("#faq-launcher")?.addEventListener("click", () => { faqOpen = !faqOpen; render(); });
  $("#faq-close")?.addEventListener("click", () => { faqOpen = false; render(); });
  document.querySelectorAll("[data-faq-question]").forEach((button) => { button.onclick = () => { faqAnswer = answerFAQ(button.dataset.faqQuestion); faqOpen = true; render(); }; });
}
function pageBreadcrumb(){
 if(tab==='projects')return '<div class="page-breadcrumb" aria-label="Breadcrumb"><span aria-current="page">Projects</span></div>';
 if(steps.some(([key])=>key===tab))return `<div class="page-breadcrumb" aria-label="Breadcrumb"><a href="#/projects">Projects</a><span aria-hidden="true">›</span><span>Workspace</span><span aria-hidden="true">›</span><b>${esc(effectiveProduction(state).title || 'Untitled project')}</b></div>`;
 return `<div class="page-breadcrumb" aria-label="Breadcrumb"><span aria-current="page">${tab==='settings'?'Credit profiles':'Meet the team'}</span></div>`;
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
    `<aside aria-label="Workspace sidebar"><div class="sidebar-header"><a class="brand" href="#/projects" aria-label="Cuestamp"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="brand-word">cuestamp</span></a>${sidebarToggle}</div><nav id="sidebar-nav" class="app-navigation" aria-label="Workspace navigation"><a class="nav ${tab === "projects" ? "active" : ""}" href="#/projects" aria-label="Projects" title="Projects" ${tab === "projects" ? 'aria-current="page"' : ""}>${sidebarIcon("projects")}<span class="nav-label">Projects</span></a></nav><div id="sidebar-profile">${cloudWorkspace?.profile() || ""}</div></aside><main><header>${pageBreadcrumb()}<div class="header-account"><div id="account-actions">${cloudWorkspace?.header() || ""}</div></div></header><div class="content"><div id="cloud-workspace">${cloudWorkspace?.view() || ""}</div>${tab === "library" ? `<div class="project-title-editor"><label for="workspace-project-title">Project title</label><input id="workspace-project-title" maxlength="300" value="${esc(effectiveProduction(state).title || "")}" placeholder="Name your project…" autocomplete="off"><span>Required to save your project. Use your film or production name.</span></div>` : ""}<div class="heading"><div><div class="eyebrow">YOUR MUSIC WORKSPACE</div><h1>${{ library: "Find your cues", production: "Production details", cues: "Timings & usage", review: "Review & export" }[tab]}</h1><p>${{ library: "A place for every cue. Credit for every creator.", production: "Add the production information that travels with your cue sheet.", cues: "Review detected placements or enter timings on the film timeline.", review: "Review credits and placements before downloading your spreadsheet." }[tab]}</p></div></div><nav class="workflow-tabs" aria-label="Cue sheet steps">${steps.map(([key,label],index)=>`<button data-tab="${key}" class="${tab===key?"active":""}" ${tab===key?'aria-current="step"':""}><span>${index+1}</span>${label}</button>`).join("")}</nav><div class="stats"><div><strong>${state.tracks.length}</strong><span>Tracks in library</span></div><div><strong>${state.cues.length}</strong><span>Cue placements</span></div><div><strong>${ready}</strong><span>Complete cues</span></div></div>${clearedResults ? `<div class="notice" role="status">Placements cleared. Audio and credits are kept. <button id="undo-clear">Undo clear</button></div>` : ""}${message ? `<div class="notice" role="status">${esc(message)}</div>` : ""}${tab === "library" ? library() : tab === "production" ? production() : tab === "cues" ? cues() : reviewPage(issues)}${stepNavigation()}<footer><span>CUESTAMP / MUSIC WORKSPACE</span><span>Made for the people behind the music.</span></footer></div></main>`;
  document.querySelector("#sidebar-nav")?.insertAdjacentHTML("beforeend", `<a class="nav ${tab === "settings" ? "active" : ""}" href="#/credit-profiles" ${tab === "settings" ? 'aria-current="page"' : ""} aria-label="Credit profiles" title="Credit profiles">${sidebarIcon("settings")}<span class="nav-label">Credit profiles</span></a><a class="nav" href="https://www.bmi.com/creators/what_is_a_cue_sheet" target="_blank" rel="noreferrer" aria-label="BMI cue sheet guide" title="BMI cue sheet guide">${sidebarIcon("production")}<span class="nav-label">BMI cue sheet guide</span></a>`);
  if (tab === "projects") document.querySelector(".content").innerHTML = `<section id="projects-page">${cloudWorkspace?.projectsPage() || ""}</section>`;
  if (tab === "team") document.querySelector(".content").innerHTML = teamPage();
  if (tab === "settings") document.querySelector(".content").innerHTML = settingsPage();
  if (tab === "team" || tab === "settings") {
    $("#cloud-workspace")?.remove();
    document.querySelector(".stats")?.remove();
  }
  $("#app").insertAdjacentHTML("beforeend", faq() + (cloudWorkspace?.createButton() || ""));
  bind();
  bindFAQ();
  bindSidebar();
  cloudWorkspace?.bind();
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
  ["library", "Find your cues"],
  ["cues", "Timings & usage"], ["production", "Production details"], ["review", "Review & export"],
];
function stepNavigation() {
  const index = steps.findIndex(([key]) => key === tab);
  if (index < 0) return "";
  const button = (direction, target) => `<button class="${direction === "next" ? "primary" : ""}" data-step="${direction}" data-tab="${steps[target][0]}">${direction === "next" ? "Next" : "Back"}: ${steps[target][1]} ${direction === "next" ? "→" : "←"}</button>`;
  return `<div class="button-row step-navigation" aria-label="Step navigation">${index > 0 ? button("back", index - 1) : ""}${index < steps.length - 1 ? button("next", index + 1) : ""}</div>`;
}
function library() {
  return (
    creditProfilePicker() + workflowView(state, workflow, { esc, field, select }) +
    `<div class="section-title"><h2>Cue audio library <span>${state.tracks.length}</span></h2><span class="muted">Audio is shared across paths · select a file to preview or reattach audio</span></div>${state.tracks.length ? `<div class="library-grid"><div class="track-list">${state.tracks.map((t) => `<div class="track-row"><button class="track ${selected === t.id ? "selected" : ""}" data-track="${t.id}"><span class="track-icon">♪</span><span><strong>${esc(t.title)}</strong><small>${time(t.duration)} · ${workflow.audio.has(t.id) ? "Audio ready" : "Reattach audio to analyze"}</small></span><span class="badge ">Source audio</span></button>${state.mode === "movie" && !state.movieMetadata ? `<button class="text danger" data-remove-track="${t.id}" aria-label="Remove audio track ${esc(t.title)}" title="Remove track and its placements">Remove track</button>` : ""}</div>`).join("")}</div>${editor()}</div>` : '<div class="empty"><span>♫</span><h3>Add the music behind the picture</h3><p>Upload cue recordings or a music-only export using the selected workflow above.</p></div>'}`
  );
}
function editor() {
  const t = state.tracks.find((t) => t.id === selected);
  if (!t)
    return '<div class="panel empty"><p>Select a track to review its details.</p></div>';
  return `<section class="panel editor" data-editor="${t.id}"><div class="section-title"><h2>Audio source</h2></div>${field("Source label", "title", t.title)}${state.mode === "manual" ? `<details class="disclosure"><summary>Use playback marks (optional)</summary>${field("This audio file starts at film timecode", "offset", t.offset, 'placeholder="01:00:00:00"')}<p class="muted">Only needed for playback marking. Direct film in/out entry needs no file offset.</p></details>` : ""}<p class="file-name">${esc(t.filename)} · ${t.duration === null ? "Duration unavailable" : time(t.duration)}</p>${urls.has(t.id) ? `<audio id="track-preview" controls src="${urls.get(t.id)}"></audio>` : `<label class="upload-button">Reattach ${esc(t.filename)}<input data-reattach="${t.id}" type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"></label>`}${t.error ? `<p class="notice">${esc(t.error)}</p>` : ""}<p class="muted">Enter common composer and publisher details in the Shared credits section on this page. Customize exceptions per cue in Timings &amp; usage.</p>${state.mode === "manual" ? `<button class="primary" data-add-cue="${t.id}">Add manual placement</button>` : ""}</section>`;
}
function editWorkspaceCredits(){
 const profile=creditProfiles.find(p=>p.id===activeCreditProfileId);
 if(profile){editCreditProfile(profile,{esc,applyOnSave:true,onSave:async draft=>{const saved=await storeCreditProfile(draft);applyCreditProfile(saved.id);}});return;}
 editSheetCredits();
}
function editSheetCredits(){
 editCreditProfile({name:'Cue sheet credits',...structuredClone(state.sharedCueDetails)},{esc,sheetOnly:true,onSave:async draft=>{state.sharedCueDetails={category:draft.category,credits:draft.credits};save();render();}});
}
function creditProfilePicker(){
 return `<section class="panel workspace-credit-profile"><div><h2>Credit profile</h2><p class="muted">Choose the composer and publisher credits for this cue sheet.</p></div>${account.user?`<div class="credit-profile-controls"><label for="select-credit-profile">Saved profiles</label><div class="button-row"><select id="select-credit-profile"><option value="">Choose a profile…</option>${creditProfiles.map(p=>`<option value="${esc(p.id)}" ${p.id===activeCreditProfileId?'selected':''}>${esc(p.name)}</option>`).join('')}</select><button id="edit-workspace-credits">Edit credits</button><button id="create-workspace-profile">＋ Create profile</button></div><p class="muted">Profiles are saved to your account. Choosing one applies it to this cue sheet.</p></div>`:`<p>Edit credits for this cue sheet, or sign in to use saved profiles.</p><div class="button-row"><button id="edit-workspace-credits">Edit credits</button>${cloudWorkspace.header()}</div>`}</section>`;
}

function settingsPage() {
 if(!account.user)return `<section class="settings-page"><h1>Credit profiles</h1><p>Sign in to create and reuse credit profiles across your projects and devices.</p><div class="button-row">${cloudWorkspace.header()}</div></section>`;
 return `<section class="settings-page"><div class="heading"><div><div class="eyebrow">REUSABLE CREDITS</div><h1>Credit profiles</h1><p>Create and save contributor details, then choose a profile for your cue sheet.</p></div><button class="primary" id="new-credit-profile" ${creditProfilesLoading?"disabled":""}>＋ New profile</button></div><p class="muted">Saved to your account and available across devices. Choose a saved profile from the dropdown in Workspace.</p><div role="status">${creditProfilesLoading?"Loading your profiles…":""}${creditProfilesError?`${esc(creditProfilesError)} <button id="retry-credit-profiles">Retry</button>`:""}</div><div class="credit-profile-list">${creditProfiles.length?creditProfiles.map(p=>`<article class="panel"><h2>${esc(p.name)}</h2><p class="muted">${p.credits.map(c=>esc(c.role==='Composer'?[c.first,c.last].filter(Boolean).join(' '):c.name)).join(' · ')}</p><div class="button-row"><button data-edit-credit-profile="${esc(p.id)}">Edit</button><button data-delete-credit-profile="${esc(p.id)}">Delete</button></div></article>`).join(''):'<div class="empty"><h2>No credit profiles yet</h2><p>Create your first profile to reuse composer and publisher details.</p></div>'}</div></section>`;
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
  return `<div class="review-grid"><section class="panel"><p class="muted">Cue provenance: ${state.cues.map(c => effectiveCue(c, state.sharedCueDetails)).filter(c => c.category === "original").length} original · ${state.cues.map(c => effectiveCue(c, state.sharedCueDetails)).filter(c => c.category === "sourced").length} sourced · ${state.cues.map(c => effectiveCue(c, state.sharedCueDetails)).filter(c => !["original", "sourced"].includes(c.category)).length} unspecified</p><h2>${issues.length ? "A few details to finish" : "Ready for your review"}</h2><button class="text" data-tab="production">Edit production details →</button><p class="muted">${issues.length ? "Complete these items to finish your cue sheet." : "All required fields are filled. Verify the information with your production team before submission."}</p>${issues.length ? `<ul class="issues">${issues.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : '<div class="complete">✓ Production, placements and credits entered</div>'}${warnings.length ? `<div class="notice neutral"><strong>Unknown production information</strong><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul><p>Draft export leaves these fields blank. Complete applicable BMI information before submission.</p></div>` : ""}<p class="muted">${state.tracks.filter((t) => !state.cues.some((c) => c.trackId === t.id)).length} library tracks have no placements and will not appear in the cue sheet.</p></section><section class="panel export"><div class="sheet-icon">✓</div><h2>Your music cue sheet</h2><p>Finish your cue sheet, then download it as Excel, CSV or a printable PDF.</p>${state.status === "completed" ? `<button class="primary" id="export" ${issues.length ? "disabled" : ""}>↓ Download cue sheet</button>` : `<button class="primary" id="cloud-finish" ${issues.length ? "disabled" : ""}>Finish making cue sheet</button>`}${!account.user?'<p class="muted">Sign in to save a completed project to Projects.</p>':""}<p class="muted">Review draft · no automatic submission<br>BMI fields round to whole seconds.<br>The Frame timings worksheet preserves exact timecodes and rate.</p><a href="${import.meta.env.BASE_URL}bmi-cue-sheet-template.xlsx" download>View original BMI template ↗</a></section></div>`;
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
  save();
  navigate("cues");
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
  const titleInput=document.querySelector("#workspace-project-title");
  if(titleInput){
    titleInput.oninput=()=>{
      state.production.title=titleInput.value;
      const productionTitle=document.querySelector('#production [data-field="title"]');
      if(productionTitle)productionTitle.value=titleInput.value;
      save();updateIndicators();
    };
    titleInput.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();titleInput.blur();}};
  }
  if($('#retry-credit-profiles'))$('#retry-credit-profiles').onclick=()=>loadAccountCreditProfiles();
  const profileSelect=document.querySelector('#select-credit-profile');
  if(profileSelect)profileSelect.onchange=()=>applyCreditProfile(profileSelect.value);
  if($('#edit-workspace-credits'))$('#edit-workspace-credits').onclick=editWorkspaceCredits;
  if($('#create-workspace-profile'))$('#create-workspace-profile').onclick=()=>editCreditProfile(null,{esc,applyOnSave:true,onSave:async draft=>{const saved=await storeCreditProfile(draft);applyCreditProfile(saved.id);}});
  if($('#new-credit-profile'))$('#new-credit-profile').onclick=()=>editCreditProfile(null,{esc,onSave:storeCreditProfile});
  document.querySelectorAll('[data-edit-credit-profile]').forEach(button=>button.onclick=()=>editCreditProfile(creditProfiles.find(p=>p.id===button.dataset.editCreditProfile),{esc,onSave:storeCreditProfile}));
  document.querySelectorAll('[data-delete-credit-profile]').forEach(button=>button.onclick=async()=>{if(!await confirmDialog({title:'Delete credit profile?',message:'Credits already applied to cue sheets are kept.',confirmLabel:'Delete profile'}))return;const profile=creditProfiles.find(p=>p.id===button.dataset.deleteCreditProfile);button.disabled=true;try{await creditProfilesRequest('DELETE',{id:profile.id,revision:profile.revision});creditProfiles=creditProfiles.filter(p=>p.id!==profile.id);render();}catch(error){creditProfilesError=error.message;render();}});
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        const sharedShortcut = b.dataset.tab === "shared";
        message = "";
        navigate(sharedShortcut ? "library" : b.dataset.tab);
        if (sharedShortcut) {
          editSheetCredits();
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
          delete state.activeCreditProfileId;activeCreditProfileId="";
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
      (b.onclick = async () => {
        if (!await confirmDialog({title:"Remove track?",message:"This removes the track and all its cue placements.",confirmLabel:"Remove track"})) return;
        const key = b.dataset.removeTrack;
        URL.revokeObjectURL(urls.get(key));
        urls.delete(key);
        workflow.audio.delete(key);
        workflow.files.delete(key);
        if(state.media) delete state.media.tracks[key];
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
  if ($("#cloud-finish") && !account.user) $("#cloud-finish").onclick=()=>{if(review().length)return;state.status="completed";localStorage.setItem(storageKey,JSON.stringify(state));render();openDownloads(state);};
  if ($("#export")) $("#export").onclick=()=>openDownloads(state);
}
function openDownloads(snapshot) {
  const completed=structuredClone(snapshot);
  showDownloadDialog({title:effectiveProduction(completed).title,saved:Boolean(account.user),download:format=>downloadCompletedProject(completed,format)});
}
async function downloadCompletedProject(snapshot,format='xlsx') {
  if(snapshot.status!=="completed" || !reviewProject(snapshot).valid)throw new Error("Finish the cue sheet before downloading.");
  if(serverValidationEnabled)await validateOnServer(snapshot);
  const production=effectiveProduction(snapshot);
  if(!['xlsx','csv','pdf'].includes(format))throw new Error('Unsupported download format');
  const blob=format==='pdf'?await (await import('./export-pdf.js')).exportPdf(production,snapshot.tracks,snapshot.cues,snapshot.sharedCueDetails):format==='csv'?new Blob([cueSheetCsv(production,snapshot.tracks,snapshot.cues,snapshot.sharedCueDetails)],{type:'text/csv;charset=utf-8'}):await exportWorkbook(production,snapshot.tracks,snapshot.cues,snapshot.sharedCueDetails);
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`${production.title.replace(/[^a-z0-9_-]/gi,'_')}-cue-sheet.${format}`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
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
  const titleInput=document.querySelector("#workspace-project-title");
  if(titleInput && document.activeElement!==titleInput)titleInput.value=effectiveProduction(state).title || "";
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
  document.querySelectorAll(".stats strong")[2] && (document.querySelectorAll(".stats strong")[2].textContent = String(
    ready,
  ).padStart(2, "0"));
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
async function changeRate(rate) {
  forgetClearUndo();
  if (
    state.cues.length &&
    !await confirmDialog({title:"Change frame rate?",message:"Existing placements will retain elapsed positions and detected timings will need review.",confirmLabel:"Change frame rate"})
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
        save();
        navigate("library");
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
cloudWorkspace = createCloudWorkspace(account, {state, storageKey, esc, workflow, download:openDownloads,beforeNewProject:()=>steps.some(([key])=>key===tab) && cloudWorkspace.hasUnsavedChanges()?askToLeave():Promise.resolve(true),onComplete:()=>{render();openDownloads(state);}});
const pageRoutes={projects:'#/projects',settings:'#/credit-profiles',team:'#/team',library:'#/workspace/library',cues:'#/workspace/cues',production:'#/workspace/production',review:'#/workspace/review'};
let workspaceTab='library';
try {const saved=sessionStorage.getItem(storageKey+':step');if(steps.some(([key])=>key===saved))workspaceTab=saved;}catch{}
function navigate(page){
 const target=pageRoutes[page] || pageRoutes.library;
 if(location.hash!==target)history.pushState(null,'',target);
 routePage();
}
let routeInitialized=false,leavePromptOpen=false;
async function askToLeave(){
 if(leavePromptOpen)return false;
 leavePromptOpen=true;
 try{return await confirmDialog({title:'Save before leaving?',message:account.user?'Your cue sheet has unsaved changes. Save them before returning to the rest of the app.':'Your draft is saved in this browser. Sign in from the workspace to save it to your account.',cancelLabel:'Keep editing',confirmLabel:account.user?'Save and leave':'Leave workspace',secondaryLabel:account.user?'Leave without saving':undefined,onConfirm:account.user?()=>cloudWorkspace.saveBeforeLeaving():undefined});}finally{leavePromptOpen=false;}
}
function routePage(){
 let hash=location.hash;
 if(hash==='#/workspace')hash=pageRoutes[workspaceTab];
 let page=Object.keys(pageRoutes).find(key=>pageRoutes[key]===hash);
 if(!page)page=account.user?'projects':'library';
 if(routeInitialized && steps.some(([key])=>key===tab) && !steps.some(([key])=>key===page) && cloudWorkspace.hasUnsavedChanges()){
   history.replaceState(null,'',pageRoutes[tab]);
   if(leavePromptOpen)return;
   askToLeave().then(leave=>{
     if(leave){history.pushState(null,'',pageRoutes[page]);showPage(page);}
   });
   return;
 }
 showPage(page);
}
function showPage(page){
 routeInitialized=true;
 if(location.hash!==pageRoutes[page])history.replaceState(null,'',pageRoutes[page]);
 tab=page;
 if(steps.some(([key])=>key===page)){workspaceTab=page;try{sessionStorage.setItem(storageKey+':step',page);}catch{}}
 render();
 if(page==='projects')cloudWorkspace.loadProjects();
 if(page==='settings')loadAccountCreditProfiles();
 window.scrollTo({top:0});
}
window.addEventListener('hashchange',routePage);
window.addEventListener('popstate',routePage);
routePage();
cloudWorkspace.restore();
cloudWorkspace.onboard();

if(tab!=="settings")loadAccountCreditProfiles();
