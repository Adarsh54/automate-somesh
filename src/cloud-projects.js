import {openProfile} from "./user-profile.js";
import {reviewProject} from "./domain/review.js";

import {authActions} from "./auth-actions.js";
import {createCloudMedia} from "./cloud-media.js";
import {serverValidationEnabled} from "./api-client.js";
export async function sessionInfo() {
  if (!serverValidationEnabled) return {configured:false,user:null};
  try {
    const response=await fetch("/api/auth?action=me",{signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error();
    return await response.json();
  } catch {return {configured:false,user:null,error:"Sign-in is temporarily unavailable. You can still continue as a guest."};}
}
export function createCloudWorkspace(account,{state,storageKey,esc,workflow,download,onComplete}) {
  let active=null,projects=[],status="",busy=false,changes=0,dirty=false,loadingProjects=false,projectsError="";
  const metaKey=storageKey+":project";
  try {active=JSON.parse(localStorage.getItem(metaKey));dirty=Boolean(localStorage.getItem(storageKey));} catch {}
  const update=()=>{const actions=document.querySelector("#account-actions");if(actions)actions.innerHTML=header();const profileEl=document.querySelector("#sidebar-profile");if(profileEl){const open=profileEl.querySelector("details")?.open;profileEl.innerHTML=profile();if(open)profileEl.querySelector("details").open=true;}const el=document.querySelector("#cloud-workspace");if(el)el.innerHTML=view();const page=document.querySelector("#projects-page");if(page)page.innerHTML=projectsPage();bind();const finish=document.querySelector("#cloud-finish");if(finish)finish.disabled=busy || !reviewProject(state).valid;};
  const stash=()=>{try {localStorage.setItem(storageKey+":backup",JSON.stringify(state));} catch {}};
  const replace=(project)=>{
    stash();localStorage.setItem(storageKey,JSON.stringify(project.data));
    localStorage.setItem(metaKey,JSON.stringify({id:project.id,revision:project.revision}));
    history.replaceState(null,"",location.pathname+location.search+"#/workspace/library");
    location.reload();
  };
  async function request(url, options) {
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
    if(response.status===401) throw new Error("Your session expired. Sign in again; your edits are kept.");
    if(response.status===409) throw new Error("This project changed in another tab or device. Save a copy to keep your edits, or reopen the cloud version.");
    if(!response.ok) throw new Error("Could not reach your projects. Your edits are kept; please retry.");
    return response.json();
  }
  const report=text=>{status=text;update();};
  const media=workflow?createCloudMedia({state,workflow,request,persist:()=>localStorage.setItem(storageKey,JSON.stringify(state))}):null;
  async function run(fn) {if(busy)return;busy=true;update();try{await fn();}catch(e){status=e.message;}finally{busy=false;update();}}
  async function save(copy=false,complete=false) {
    if (!state.production.title.trim()) {
      location.hash="#/workspace/library";
      requestAnimationFrame(()=>document.querySelector("#workspace-project-title")?.focus());
      throw new Error("Enter a project title before saving.");
    }
    const version=changes, snapshot=structuredClone(state);
    snapshot.status=complete?"completed":(state.status || "draft");
    if(complete && !reviewProject(snapshot).valid)throw new Error("Complete all required checks before finishing your cue sheet.");
    await media?.prepare(snapshot,report);
    const target=copy || !active?{id:crypto.randomUUID(),revision:0}:active;
    const {project}=await request("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...target,data:snapshot})});
    active={id:project.id,revision:project.revision};localStorage.setItem(metaKey,JSON.stringify(active));
    if(complete && project.status!=="completed")throw new Error("Your draft was saved, but completion was not confirmed by the server. Please retry Finish making cue sheet.");
    dirty=changes!==version;
    if(!dirty){state.status=snapshot.status;localStorage.setItem(storageKey,JSON.stringify(state));}
    status=dirty?"Earlier edits saved. Save again for your latest changes.":"Saved to your account.";
    if(complete && !dirty){status="Cue sheet completed and saved.";onComplete?.();}
    projects=(await request("/api/projects")).projects;
  }
  function view() {
    if(!account.user) return `<section class="panel account-panel"><div><strong>You’re working as a guest</strong><p>${account.configured ? "Sign up to save your projects and media." : esc(account.error || "Account access is not connected in this environment. You can keep working as a guest.")}</p></div><div class="button-row">${authActions(account)}</div></section>`;
    return `<section class="panel account-panel"><div><strong>${esc(account.user.email)}</strong><p id="cloud-status" role="status">${esc(status || (active ? "Click Save project to keep your latest changes." : "New workspace · save to add it to your account."))}</p></div><div class="button-row">
    <button class="primary" id="cloud-save" ${busy?"disabled":""}>Save project</button>
    <button id="cloud-copy" ${busy?"disabled":""}>Save a copy</button>
    <button id="cloud-restore" ${busy?"disabled":""}>Restore media</button>
    </div>
    </section>`;
  }
  async function loadProjects() {
    if(!account.user || loadingProjects)return;
    loadingProjects=true;projectsError="";update();
    try {projects=(await request("/api/projects")).projects;}
    catch(error){projectsError=error.message;}
    finally {loadingProjects=false;update();}
  }
  function projectsPage() {
    const heading=`<div class="heading"><div><div class="eyebrow">YOUR LIBRARY</div><h1>Projects</h1><p>Your saved cue sheets, ready to pick up where you left off.</p></div></div><button class="new-project-fab" data-new-project ${busy?"disabled":""} aria-label="New project" title="Create a new project"><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg></button>`;
    if(!account.user)return heading+`<div class="empty"><h3>Sign in to see your projects</h3><p>Saved projects are linked to your account.</p><div class="button-row">${authActions(account)}</div></div>`;
    return heading+`<div class="section-title"><span class="muted">${loadingProjects ? "Loading projects…" : `${projects.length} saved project${projects.length===1?"":"s"}`}</span></div>
      ${status?`<p class="notice" role="status">${esc(status)}</p>`:""}
      ${loadingProjects?'<p role="status" class="empty">Loading your projects…</p>':projectsError?`<div class="notice" role="alert">${esc(projectsError)} <button id="projects-retry">Try again</button></div>`:projects.length?`<div class="saved-projects">${projects.map(p=>`<div class="saved-project"><span class="saved-project-icon" aria-hidden="true">♫</span><span><strong>${esc(p.title || "Untitled production")}</strong><small>${p.status==="completed"?"Complete":"Draft"} · Updated ${esc(new Date(p.updated_at).toLocaleString())}</small></span>${p.status==="completed"?`<button data-cloud-download="${esc(p.id)}" ${busy?"disabled":""} title="Download cue sheet" aria-label="Download ${esc(p.title || "Untitled production")}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg></button>`:""}<button data-cloud-open="${esc(p.id)}" ${busy?"disabled":""} aria-label="${p.status==="completed"?"Edit":"Continue"} ${esc(p.title || "Untitled production")}">${p.status==="completed"?"Edit":"Continue"} →</button></div>`).join("")}</div>`:'<div class="empty"><span>♫</span><h3>No saved projects yet</h3><p>Create a project, then choose Save project in the workspace.</p></div>'}`;
  }
  function header() {return account.user ? "" : authActions(account);}
  function profile() {
    const name=account.profile?.name || account.user?.firstName || account.user?.email || "Guest";
    return `<details class="profile-menu"><summary aria-label="Profile menu"><span class="profile-avatar">${esc(name[0].toUpperCase())}</span><span class="profile-name">${esc(name)}</span><svg class="profile-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></summary><div class="profile-options"><strong>${esc(account.user?.email || "Guest workspace")}</strong>${account.user?`<button class="account-menu-item" id="edit-user-profile"><span aria-hidden="true">♙</span>Profile</button>`:""}<button class="account-menu-item" aria-label="Appearance" data-theme-toggle><span aria-hidden="true">◐</span>Appearance</button>${account.user?`<button class="account-menu-item" id="cloud-logout" ${busy?"disabled":""}><span aria-hidden="true">↪</span>Log out</button>`:`<div class="button-row">${authActions(account)}</div>`}</div></details>`;
  }
  const confirmSwitch=()=>!dirty || confirm("Your current cue sheet has unsaved changes. Leave it and continue?");
  function bind() {
    document.querySelectorAll("[data-new-project]").forEach(button=>button.onclick=()=>{
      if(busy || workflow?.busy)return;
      const startNew=()=>{stash();localStorage.removeItem(storageKey);localStorage.removeItem(metaKey);history.replaceState(null,"",location.pathname+location.search+"#/workspace/library");location.reload();};
      if(!dirty && !active && !state.tracks.length && !state.cues.length && !state.production.title){startNew();return;}
      const dialog=document.createElement("dialog");
      dialog.className="resume-workspace";
      dialog.setAttribute("aria-labelledby","resume-workspace-title");
      dialog.innerHTML=`<h2 id="resume-workspace-title">Pick up where you left off?</h2><p>Your workspace has <strong>${esc(state.production.title || "an untitled cue sheet")}</strong>. Resume it at the step you left, or start a new cue sheet.</p><p class="muted">Starting new replaces your workspace draft. Save any changes you want to keep first.</p><div class="button-row"><button class="primary" data-resume autofocus>Resume cue sheet</button><button data-start-new>Start new cue sheet</button><button data-cancel>Cancel</button></div>`;
      document.body.append(dialog);
      dialog.addEventListener("close",()=>dialog.remove());
      dialog.querySelector("[data-resume]").onclick=()=>{dialog.close();location.hash="#/workspace";};
      dialog.querySelector("[data-start-new]").onclick=()=>{dialog.close();startNew();};
      dialog.querySelector("[data-cancel]").onclick=()=>dialog.close();
      dialog.showModal();
    });
    if(!account.user)return;
    const on=(selector,handler)=>{const button=document.querySelector(selector);if(button)button.onclick=handler;};
    document.querySelectorAll("[data-cloud-download]").forEach(button=>button.onclick=()=>run(async()=>{const {project}=await request("/api/projects?id="+encodeURIComponent(button.dataset.cloudDownload));await download(project.data);}));
    on("#edit-user-profile",()=>openProfile(account,update));
    on("#cloud-finish",()=>run(()=>save(false,true)));
    on("#cloud-save",()=>run(()=>save()));
    on("#cloud-copy",()=>run(()=>save(true)));

    on("#cloud-restore",()=>run(()=>media?.restore(report)));
    on("#cloud-logout",()=>run(async()=>{await request("/api/auth?action=logout",{method:"POST"});try{sessionStorage.removeItem("cuestamp-guest");}catch{}location.reload();}));
    on("#projects-retry",loadProjects);
    document.querySelectorAll("[data-cloud-open]").forEach(button=>button.onclick=()=>run(async()=>{if(confirmSwitch())replace((await request("/api/projects?id="+encodeURIComponent(button.dataset.cloudOpen))).project);}));
  }
  return {onboard:()=>{if(account.user && account.profile?.complete===false)openProfile(account,update,{onboarding:true});},view,header,profile,bind,projectsPage,loadProjects,restore:()=>account.user && state.media?run(()=>media?.restore(report)):Promise.resolve(),changed(){changes++;dirty=true;status="Unsaved changes · click Save project to save.";const el=document.querySelector("#cloud-status");if(el)el.textContent=status;}};
}

document.addEventListener('click',event=>{if(!event.target.closest('.profile-menu'))document.querySelector('.profile-menu[open]')?.removeAttribute('open');});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=document.querySelector('.profile-menu[open]');if(menu){menu.removeAttribute('open');menu.querySelector('summary')?.focus();}}});
