import {openReelDownloads} from './reel-downloads.js';
import {filterProjects,projectDates} from './project-list.js';
import {collectionPage,collectionCreateButton,collectionRow} from "./collection-page.js";
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
export function createCloudWorkspace(account,{state,storageKey,esc,workflow,download,onComplete,beforeNewProject,chooseType,onNewReel,onOpenReel,isProjectBusy=()=>false,saveAudio}) {
  let projectType="all",projectSort="created-desc";
  let active=null,projects=[],status="",busy=false,changes=0,dirty=false,loadingProjects=false,projectsError="",projectActionError="",autosaveTimer=null;
  const metaKey=storageKey+":project", dirtyKey=storageKey+":unsaved";
  try {active=JSON.parse(localStorage.getItem(metaKey));dirty=localStorage.getItem(dirtyKey)==="true";} catch {}
  const update=()=>{document.querySelectorAll("[data-new-project]").forEach(button=>button.disabled=busy || isProjectBusy());const actions=document.querySelector("#account-actions");if(actions)actions.innerHTML=header();const profileEl=document.querySelector("#sidebar-profile");if(profileEl){const open=profileEl.querySelector("details")?.open;profileEl.innerHTML=profile();if(open)profileEl.querySelector("details").open=true;}const el=document.querySelector("#cloud-workspace");if(el)el.innerHTML=view();const page=document.querySelector("#projects-page");if(page)page.innerHTML=projectsPage();bind();const finish=document.querySelector("#cloud-finish");if(finish)finish.disabled=busy || !reviewProject(state).valid;};
  const stash=()=>{try {localStorage.setItem(storageKey+":backup",JSON.stringify(state));} catch {}};
  const replace=(project)=>{
    if(project.data.type==="reel"){onOpenReel(project);return;}
    stash();localStorage.setItem(storageKey,JSON.stringify(project.data));
    localStorage.removeItem(dirtyKey);
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
  const media=workflow?createCloudMedia({state,workflow,request,saveAudio,persist:()=>localStorage.setItem(storageKey,JSON.stringify(state))}):null;
  async function run(fn) {if(busy)return;const fromProjects=Boolean(document.querySelector("#projects-page"));if(fromProjects)projectActionError="";busy=true;update();try{await fn();}catch(e){if(fromProjects)projectActionError=e.message;else status=e.message;}finally{busy=false;update();}}
  const scheduleAutosave=()=>{
    if(autosaveTimer)clearTimeout(autosaveTimer);
    if(!account.user)return;
    autosaveTimer=setTimeout(()=>{autosaveTimer=null;if(dirty && !busy && state.production.title.trim())run(()=>save());},2500);
  };
  async function save(copy=false,complete=false) {
    if (!state.production.title.trim()) {
      location.hash="#/workspace/library";
      requestAnimationFrame(()=>document.querySelector("#workspace-project-title")?.focus());
      throw new Error("Enter a project title before saving.");
    }
    const version=changes, snapshot=structuredClone(state);
    snapshot.type="cue";
    snapshot.status=complete?"completed":(state.status || "draft");
    if(complete && !reviewProject(snapshot).valid)throw new Error("Complete all required checks before finishing your cue sheet.");
    await media?.prepare(snapshot,report);
    const target=copy || !active?{id:crypto.randomUUID(),revision:0}:active;
    const {project}=await request("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...target,data:snapshot})});
    active={id:project.id,revision:project.revision};localStorage.setItem(metaKey,JSON.stringify(active));
    if(complete && project.status!=="completed")throw new Error("Your draft was saved, but completion was not confirmed by the server. Please retry Finish making cue sheet.");
    dirty=changes!==version;
    localStorage.setItem(dirtyKey,String(dirty));
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
  function createButton() {return `<button class="new-project-fab" data-new-project ${busy || isProjectBusy()?"disabled":""} aria-label="New project" title="Create a new project"><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg></button>`;}
  function projectsPage() {
    const options={title:'Projects',description:'Your cue sheets and reels, ready to create, edit, and share.',action:collectionCreateButton({label:'Create project',attributes:'data-new-project',disabled:busy || isProjectBusy()})};
    if(!account.user)return collectionPage({...options,body:`<div class="empty"><h3>Sign in to see your projects</h3><p>Saved projects are linked to your account.</p><div class="button-row">${authActions(account)}</div></div>`});
    const visible=filterProjects(projects,projectType,projectSort);
    const controls=`<div class="project-filters"><label>Type<select id="project-type-filter">${[["all","All types"],["cue","Cues"],["reel","Reels"]].map(([value,label])=>`<option value="${value}" ${projectType===value?"selected":""}>${label}</option>`).join("")}</select></label><label>Sort by<select id="project-date-sort">${[["created-desc","Created: newest first"],["created-asc","Created: oldest first"],["updated-desc","Updated: newest first"],["updated-asc","Updated: oldest first"]].map(([value,label])=>`<option value="${value}" ${projectSort===value?"selected":""}>${label}</option>`).join("")}</select></label></div>`;
    const rows=visible.map(p=>collectionRow({title:`<button class="project-title-link" data-cloud-open="${esc(p.id)}">${esc(p.title || 'Untitled production')}</button>`,detail:`${p.type==='reel'?'Reel':'Cue'} · ${p.published?'Published':p.status==='completed'?'Complete':'Draft'}`,icon:p.type==='reel'?'▷':'♫',metadata:projectDates(p,esc),actions:`${p.type==='reel'||p.status==='completed'?`<button data-cloud-download="${esc(p.id)}" ${busy?'disabled':''} title="${p.type==='reel'?'Download reel':'Download cue sheet'}" aria-label="Download ${esc(p.title || 'Untitled production')}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg></button>`:''}<button data-cloud-open="${esc(p.id)}" ${busy?'disabled':''} aria-label="${p.type==='reel'||p.published||p.status==='completed'?'Edit':'Continue'} ${esc(p.title || 'Untitled production')}">${p.type==='reel'||p.published||p.status==='completed'?'Edit':'Continue'} →</button>`})).join('');
    const body=`${controls}${projectActionError?`<div class="project-error" role="alert"><span>${esc(projectActionError)}</span><button id="dismiss-project-error">Dismiss</button></div>`:''}${loadingProjects?'<p role="status" class="empty">Loading your projects…</p>':projectsError?`<div class="project-error" role="alert"><span><strong>Couldn’t load your projects</strong><span>${esc(projectsError)}</span></span><button id="projects-retry">Try again</button></div>`:visible.length?`<div class="collection-list saved-projects">${rows}</div>`:projects.length?'<div class="empty"><h3>No projects of this type</h3><p>Choose another type or create a project.</p></div>':'<div class="empty"><span>♫</span><h3>No saved projects yet</h3><p>Create a project, then choose Save project in the workspace.</p></div>'}`;
    return collectionPage({...options,summary:loadingProjects?'Loading projects…':`${visible.length} of ${projects.length} projects`,body});
  }

  function header() {return account.user ? "" : authActions(account);}
  function profile() {
    const name=account.profile?.name || account.user?.firstName || (account.user ? "My account" : "Guest");
    return `<details class="profile-menu"><summary aria-label="Profile menu"><span class="profile-avatar">${esc(name[0].toUpperCase())}</span><span class="profile-name">${esc(name)}</span><svg class="profile-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></summary><div class="profile-options">${account.user?`<button class="account-menu-item" id="edit-user-profile"><span aria-hidden="true">♙</span>Profile</button>`:""}<button class="account-menu-item" aria-label="Appearance" data-theme-toggle><span aria-hidden="true">◐</span>Appearance</button>${account.user?`<button class="account-menu-item" id="cloud-logout" ${busy?"disabled":""}><span aria-hidden="true">↪</span>Log out</button>`:`<div class="button-row">${authActions(account)}</div>`}</div></details>`;
  }
  function bind() {
    document.querySelectorAll("[data-new-project]").forEach(button=>button.onclick=async()=>{
      if(busy || workflow?.busy || isProjectBusy())return;
      const type=await chooseType();if(!type)return;
      if(beforeNewProject && !await beforeNewProject())return;
      if(type==="reel"){onNewReel();return;}
      if(busy || workflow?.busy || isProjectBusy())return;
      stash();localStorage.removeItem(storageKey);localStorage.removeItem(metaKey);localStorage.removeItem(dirtyKey);
      history.replaceState(null,"",location.pathname+location.search+"#/workspace/library");location.reload();
    });
    if(!account.user)return;
    const typeFilter=document.querySelector("#project-type-filter"),dateSort=document.querySelector("#project-date-sort");
    if(typeFilter)typeFilter.onchange=()=>{projectType=typeFilter.value;update();};
    if(dateSort)dateSort.onchange=()=>{projectSort=dateSort.value;update();};
    const on=(selector,handler)=>{const button=document.querySelector(selector);if(button)button.onclick=handler;};
    document.querySelectorAll("[data-cloud-download]").forEach(button=>button.onclick=()=>run(async()=>{const {project}=await request("/api/projects?id="+encodeURIComponent(button.dataset.cloudDownload));if(project.data.type==='reel')await openReelDownloads(project,esc);else await download(project.data);}));
    on("#edit-user-profile",()=>openProfile(account,update));
    on("#cloud-finish",()=>run(()=>save(false,true)));
    on("#cloud-save",()=>run(()=>save()));
    on("#cloud-copy",()=>run(()=>save(true)));

    on("#cloud-logout",()=>run(async()=>{await request("/api/auth?action=logout",{method:"POST"});try{sessionStorage.removeItem("cuestamp-guest");}catch{}location.reload();}));
    on("#projects-retry",loadProjects);
    on("#dismiss-project-error",()=>{projectActionError="";update();});
    document.querySelectorAll("[data-cloud-open]").forEach(button=>button.onclick=()=>run(async()=>{replace((await request("/api/projects?id="+encodeURIComponent(button.dataset.cloudOpen))).project);}));
  }
  return {saveBeforeLeaving:async()=>{if(busy || workflow?.busy)throw new Error("Wait for the current operation to finish, then try again.");busy=true;update();try{await save();if(dirty)throw new Error("There are newer edits. Save again before leaving.");}finally{busy=false;update();}},hasUnsavedChanges:()=>dirty,onboard:()=>{if(account.user && account.profile?.complete===false)openProfile(account,update,{onboarding:true});},view,header,profile,bind,createButton,projectsPage,loadProjects,restore:()=>account.user && state.media?run(()=>media?.restore(report)):Promise.resolve(),changed(){changes++;dirty=true;localStorage.setItem(dirtyKey,"true");status=account.user?"Unsaved changes · saving automatically…":"Unsaved changes · click Save project to save.";const el=document.querySelector("#cloud-status");if(el)el.textContent=status;scheduleAutosave();}};
}

document.addEventListener('click',event=>{if(!event.target.closest('.profile-menu'))document.querySelector('.profile-menu[open]')?.removeAttribute('open');});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=document.querySelector('.profile-menu[open]');if(menu){menu.removeAttribute('open');menu.querySelector('summary')?.focus();}}});
