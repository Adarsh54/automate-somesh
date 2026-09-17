import {openReelDownloads} from './reel-downloads.js';
import {filterProjects,projectDates,folderCounts} from './project-list.js';
import {collectionPage,collectionCreateButton,collectionRow} from "./collection-page.js";
import {openProfile} from "./user-profile.js";
import {reviewProject} from "./domain/review.js";
import {confirmDialog} from "./confirm-dialog.js";

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
  let projectType="all",projectSort="created-desc",projectFolder="all",projectQuery="";
  let active=null,projects=[],status="",busy=false,changes=0,dirty=false,loadingProjects=false,projectsError="",projectActionError="",deleteStatus="",autosaveTimer=null;
  let folders=[],creatingFolder=false;
  const selectedProjects=new Set();
  const metaKey=storageKey+":project", dirtyKey=storageKey+":unsaved";
  try {active=JSON.parse(localStorage.getItem(metaKey));dirty=localStorage.getItem(dirtyKey)==="true";} catch {}
  const update=()=>{document.querySelectorAll("[data-new-project]").forEach(button=>button.disabled=busy || isProjectBusy());const actions=document.querySelector("#account-actions");if(actions)actions.innerHTML=header();const profileEl=document.querySelector("#sidebar-profile");if(profileEl){const open=profileEl.querySelector("details")?.open;profileEl.innerHTML=profile();if(open)profileEl.querySelector("details").open=true;}const el=document.querySelector("#cloud-workspace");if(el)el.innerHTML=view();const page=document.querySelector("#projects-page");if(page)page.innerHTML=projectsPage();bind();const completionStatus=document.querySelector("#completion-status");if(completionStatus)completionStatus.textContent=status;const finish=document.querySelector("#cloud-finish");if(finish)finish.disabled=busy || !reviewProject(state).valid;};
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
    try {
      const [projectsResult,foldersResult]=await Promise.all([request("/api/projects"),request("/api/projects?action=folders")]);
      projects=projectsResult.projects || [];folders=foldersResult.folders || [];
      for(const id of [...selectedProjects])if(!projects.some(p=>p.id===id))selectedProjects.delete(id);
      if(projectFolder!=="all" && projectFolder!=="none" && !folders.some(f=>f.id===projectFolder))projectFolder="all";
    }
    catch(error){projectsError=error.message;}
    finally {loadingProjects=false;update();}
  }
  async function createFolder(name) {
    const {folder}=await request('/api/projects?action=folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    folders=[...folders,folder].sort((a,b)=>a.name.localeCompare(b.name));
    creatingFolder=false;
  }
  async function removeFolder(id) {
    const folder=folders.find(f=>f.id===id);
    if(!folder)return;
    await confirmDialog({
      title:`Delete "${folder.name}"?`,
      message:'This removes the folder. Its projects are kept and become unfiled.',
      confirmLabel:'Delete folder',
      onConfirm:async()=>{
        await request('/api/projects?action=folders',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
        folders=folders.filter(f=>f.id!==id);
        projects=projects.map(p=>p.folderId===id?{...p,folderId:null}:p);
        if(projectFolder===id)projectFolder="all";
      },
    });
  }
  async function moveToFolder(ids,folderId) {
    for(const id of ids){
      try{
        const {project}=await request('/api/projects?action=move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,folderId})});
        projects=projects.map(p=>p.id===id?{...p,folderId:project.folderId}:p);
      }catch(e){projectActionError=e.message;}
    }
    selectedProjects.clear();
  }
  async function removeProjects(ids) {
    const targets=ids.map(id=>projects.find(p=>p.id===id)).filter(Boolean);
    if(!targets.length)return;
    const multiple=targets.length>1;
    let deletedActive=false;
    await confirmDialog({
      title:multiple?`Delete ${targets.length} projects?`:`Delete "${targets[0].title || 'Untitled production'}"?`,
      message:`This permanently deletes the selected ${multiple?'projects':targets[0].type==='reel'?'reel':'cue sheet'}. A reel's share links, embeds and analytics stop working immediately. Audio Library files will remain.`,
      confirmLabel:multiple?`Delete ${targets.length} projects`:'Delete project',
      onConfirm:async()=>{
        const failed=[];
        for(const target of targets){
          try{
            await request('/api/projects',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:target.id,revision:target.revision})});
            projects=projects.filter(p=>p.id!==target.id);selectedProjects.delete(target.id);
            if(active?.id===target.id)deletedActive=true;
          }catch(e){failed.push(target.title || 'Untitled production');}
        }
        deleteStatus=failed.length?`Deleted ${targets.length-failed.length} of ${targets.length}. Couldn't delete: ${failed.join(', ')}. Reload and try again.`:`Deleted ${targets.length} project${multiple?'s':''}.`;
      },
    });
    if(deletedActive){stash();localStorage.removeItem(storageKey);localStorage.removeItem(metaKey);localStorage.removeItem(dirtyKey);location.reload();}
  }
  function createButton() {return `<button class="new-project-fab" data-new-project ${busy || isProjectBusy()?"disabled":""} aria-label="New project" title="Create a new project"><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg></button>`;}
  function projectsPage() {
    const options={title:'Projects',description:'Your cue sheets and reels, ready to create, edit, and share.',action:collectionCreateButton({label:'Create project',attributes:'data-new-project',disabled:busy || isProjectBusy()})};
    if(!account.user)return collectionPage({...options,body:`<div class="empty"><h3>Sign in to see your projects</h3><p>Saved projects are linked to your account.</p><div class="button-row">${authActions(account)}</div></div>`});
    const visible=filterProjects(projects,projectType,projectSort,{folderId:projectFolder,query:projectQuery});
    const {counts:folderTotals,unfiled}=folderCounts(projects,folders);
    const folderOptions=folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    const folderChips=`<div class="project-folders">
      <button class="folder-chip ${projectFolder==='all'?'active':''}" data-select-folder="all" ${projectFolder==='all'?'aria-current="true"':''}>All (${projects.length})</button>
      ${folders.map(f=>`<span class="folder-chip-wrap"><button class="folder-chip ${projectFolder===f.id?'active':''}" data-select-folder="${esc(f.id)}" ${projectFolder===f.id?'aria-current="true"':''}>${esc(f.name)} (${folderTotals.get(f.id)||0})</button><button class="folder-chip-delete" data-delete-folder="${esc(f.id)}" aria-label="Delete folder ${esc(f.name)}" title="Delete folder">×</button></span>`).join('')}
      ${unfiled?`<button class="folder-chip ${projectFolder==='none'?'active':''}" data-select-folder="none" ${projectFolder==='none'?'aria-current="true"':''}>Unfiled (${unfiled})</button>`:''}
      ${creatingFolder?`<form class="folder-create"><input id="new-folder-name" placeholder="Folder name" maxlength="120" required autofocus><button class="primary" type="submit">Create</button><button type="button" data-cancel-folder>Cancel</button></form>`:`<button class="folder-chip folder-chip-new" data-new-folder>+ Folder</button>`}
    </div>`;
    const controls=`<div class="project-filters"><label class="project-search-field">Search<input type="search" id="project-search" placeholder="Search by title" value="${esc(projectQuery)}"></label><label>Type<select id="project-type-filter">${[["all","All types"],["cue","Cues"],["reel","Reels"]].map(([value,label])=>`<option value="${value}" ${projectType===value?"selected":""}>${label}</option>`).join("")}</select></label><label>Sort by<select id="project-date-sort">${[["created-desc","Created: newest first"],["created-asc","Created: oldest first"],["updated-desc","Updated: newest first"],["updated-asc","Updated: oldest first"]].map(([value,label])=>`<option value="${value}" ${projectSort===value?"selected":""}>${label}</option>`).join("")}</select></label></div>`;
    const selectedCount=[...selectedProjects].filter(id=>visible.some(p=>p.id===id)).length;
    const allSelected=visible.length>0 && selectedCount===visible.length;
    const bulkBar=visible.length?`<div class="collection-bulk-actions"><label class="checkbox-control"><input type="checkbox" id="select-all-projects" ${allSelected?"checked":""}>Select all</label>${selectedCount?`<label class="bulk-move-folder">Move to <select id="bulk-move-folder"><option value="" selected disabled>Choose folder…</option><option value="none">No folder</option>${folderOptions}</select></label><button data-delete-selected-projects ${busy?"disabled":""}>Delete selected (${selectedCount})</button>`:""}</div>`:"";
    const rows=visible.map(p=>collectionRow({title:`<label class="row-select"><input type="checkbox" data-select-project="${esc(p.id)}" aria-label="Select ${esc(p.title || 'Untitled production')}" ${selectedProjects.has(p.id)?"checked":""}></label><button class="project-title-link" data-cloud-open="${esc(p.id)}">${esc(p.title || 'Untitled production')}</button>`,detail:`${p.type==='reel'?'Reel':'Cue'} · ${p.published?'Published':p.status==='completed'?'Complete':'Draft'}`,icon:p.type==='reel'?'▷':'♫',metadata:projectDates(p,esc),actions:`<select class="row-folder-select" data-move-project="${esc(p.id)}" ${busy?'disabled':''} aria-label="Move ${esc(p.title || 'Untitled production')} to folder"><option value="" ${!p.folderId?'selected':''}>No folder</option>${folders.map(f=>`<option value="${esc(f.id)}" ${p.folderId===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select><button data-delete-project="${esc(p.id)}" ${busy?'disabled':''} aria-label="Delete ${esc(p.title || 'Untitled production')}">Delete</button>${p.type==='reel'||p.status==='completed'?`<button data-cloud-download="${esc(p.id)}" ${busy?'disabled':''} title="${p.type==='reel'?'Download reel':'Download cue sheet'}" aria-label="Download ${esc(p.title || 'Untitled production')}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg></button>`:''}<button data-cloud-open="${esc(p.id)}" ${busy?'disabled':''} aria-label="${p.type==='reel'||p.published||p.status==='completed'?'Edit':'Continue'} ${esc(p.title || 'Untitled production')}">${p.type==='reel'||p.published||p.status==='completed'?'Edit':'Continue'} →</button>`})).join('');
    const empty=projectQuery.trim()?'<div class="empty"><h3>No matching projects</h3><p>Try a different search term, folder or type.</p></div>':projects.length?'<div class="empty"><h3>No projects here</h3><p>Choose another folder or type, or create a project.</p></div>':'<div class="empty"><span>♫</span><h3>No saved projects yet</h3><p>Create a project, then choose Save project in the workspace.</p></div>';
    const body=`${folderChips}${controls}${deleteStatus?`<p class="muted" role="status">${esc(deleteStatus)}</p>`:''}${projectActionError?`<div class="project-error" role="alert"><span>${esc(projectActionError)}</span><button id="dismiss-project-error">Dismiss</button></div>`:''}${loadingProjects?'<p role="status" class="empty">Loading your projects…</p>':projectsError?`<div class="project-error" role="alert"><span><strong>Couldn’t load your projects</strong><span>${esc(projectsError)}</span></span><button id="projects-retry">Try again</button></div>`:visible.length?`${bulkBar}<div class="collection-list saved-projects">${rows}</div>`:empty}`;
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
    const typeFilter=document.querySelector("#project-type-filter"),dateSort=document.querySelector("#project-date-sort"),search=document.querySelector("#project-search");
    if(typeFilter)typeFilter.onchange=()=>{projectType=typeFilter.value;update();};
    if(dateSort)dateSort.onchange=()=>{projectSort=dateSort.value;update();};
    if(search)search.oninput=()=>{
      const pos=search.selectionStart;
      projectQuery=search.value;update();
      const el=document.querySelector("#project-search");
      if(el){el.focus();el.setSelectionRange(pos,pos);}
    };
    const on=(selector,handler)=>{const button=document.querySelector(selector);if(button)button.onclick=handler;};
    on("#select-all-projects",event=>{
      const visible=filterProjects(projects,projectType,projectSort,{folderId:projectFolder,query:projectQuery});
      if(event.target.checked)visible.forEach(p=>selectedProjects.add(p.id));else visible.forEach(p=>selectedProjects.delete(p.id));
      update();
    });
    document.querySelectorAll("[data-select-folder]").forEach(button=>button.onclick=()=>{projectFolder=button.dataset.selectFolder;update();});
    on("[data-new-folder]",()=>{creatingFolder=true;update();});
    on("[data-cancel-folder]",()=>{creatingFolder=false;update();});
    const folderForm=document.querySelector(".folder-create");
    if(folderForm)folderForm.onsubmit=event=>{event.preventDefault();const name=document.querySelector("#new-folder-name").value;run(()=>createFolder(name));};
    document.querySelectorAll("[data-delete-folder]").forEach(button=>button.onclick=event=>{event.stopPropagation();run(()=>removeFolder(button.dataset.deleteFolder));});
    document.querySelectorAll("[data-move-project]").forEach(select=>select.onchange=()=>run(()=>moveToFolder([select.dataset.moveProject],select.value||null)));
    const bulkMove=document.querySelector("#bulk-move-folder");
    if(bulkMove)bulkMove.onchange=()=>run(()=>moveToFolder([...selectedProjects],bulkMove.value==="none"?null:bulkMove.value));
    document.querySelectorAll("[data-select-project]").forEach(input=>input.onchange=()=>{
      const id=input.dataset.selectProject;
      if(input.checked)selectedProjects.add(id);else selectedProjects.delete(id);
      update();
    });
    document.querySelectorAll("[data-delete-project]").forEach(button=>button.onclick=()=>run(()=>removeProjects([button.dataset.deleteProject])));
    on("[data-delete-selected-projects]",()=>run(()=>removeProjects([...selectedProjects])));
    document.querySelectorAll("[data-cloud-download]").forEach(button=>button.onclick=()=>run(async()=>{const {project}=await request("/api/projects?id="+encodeURIComponent(button.dataset.cloudDownload));if(project.data.type==='reel')await openReelDownloads(project,esc);else await download(project.data);}));
    on("#edit-user-profile",()=>openProfile(account,update));
    on("#cloud-finish",()=>run(async()=>{
      if(!reviewProject(state).valid)throw new Error("Complete all required checks before finishing your cue sheet.");
      const snapshot=structuredClone(state);
      snapshot.status="completed";
      try { await save(false,true); }
      catch(error) {
        status=`Your cue sheet is ready to download, but saving to your account failed: ${error.message}`;
        update();
        await download(snapshot, {saved:false});
      }
    }));
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
