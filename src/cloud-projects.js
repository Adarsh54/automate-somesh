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
export function createCloudWorkspace(account,{state,storageKey,esc,workflow}) {
  let active=null,projects=[],status="",busy=false,changes=0,dirty=false,loadingProjects=false,projectsError="";
  const metaKey=storageKey+":project";
  try {active=JSON.parse(localStorage.getItem(metaKey));dirty=Boolean(localStorage.getItem(storageKey));} catch {}
  const update=()=>{const actions=document.querySelector("#account-actions");if(actions)actions.innerHTML=header();const el=document.querySelector("#cloud-workspace");if(el)el.innerHTML=view();const page=document.querySelector("#projects-page");if(page)page.innerHTML=projectsPage();bind();};
  const stash=()=>{try {localStorage.setItem(storageKey+":backup",JSON.stringify(state));} catch {}};
  const replace=(project)=>{
    stash();localStorage.setItem(storageKey,JSON.stringify(project.data));
    localStorage.setItem(metaKey,JSON.stringify({id:project.id,revision:project.revision}));
    history.replaceState(null,"",location.pathname+location.search);
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
  async function run(fn) {busy=true;update();try{await fn();}catch(e){status=e.message;}finally{busy=false;update();}}
  async function save(copy=false) {
    const version=changes, snapshot=structuredClone(state);
    await media?.prepare(snapshot,report);
    const target=copy || !active?{id:crypto.randomUUID(),revision:0}:active;
    const {project}=await request("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...target,data:snapshot})});
    active={id:project.id,revision:project.revision};localStorage.setItem(metaKey,JSON.stringify(active));
    dirty=changes!==version;status=dirty?"Earlier edits saved. Save again for your latest changes.":"Saved to your account.";
    projects=(await request("/api/projects")).projects;
  }
  function view() {
    if(!account.user) return `<section class="panel account-panel"><div><strong>You’re working as a guest</strong><p>${account.configured ? "Sign up to save your projects and media." : esc(account.error || "Account access is not connected in this environment. You can keep working as a guest.")}</p></div><div class="button-row">${authActions(account)}</div></section>`;
    return `<section class="panel account-panel"><div><strong>${esc(account.user.email)}</strong><p id="cloud-status" role="status">${esc(status || (active ? "Click Save project to keep your latest changes." : "New workspace · save to add it to your account."))}</p></div><div class="button-row">
    <button class="primary" id="cloud-save" ${busy?"disabled":""}>Save project</button>
    <button id="cloud-copy" ${busy?"disabled":""}>Save a copy</button>
    <a class="account-login" href="#/projects">My projects</a>
    <button id="cloud-restore" ${busy?"disabled":""}>Restore media</button>
    <button id="cloud-new" ${busy?"disabled":""}>New project</button>
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
    const heading=`<div class="heading"><div><div class="eyebrow">YOUR LIBRARY</div><h1>My projects</h1><p>Your saved cue sheets, ready to pick up where you left off.</p></div><a class="account-login" href="#/workspace">Back to workspace</a></div>`;
    if(!account.user)return heading+`<div class="empty"><h3>Sign in to see your projects</h3><p>Saved projects are linked to your account.</p><div class="button-row">${authActions(account)}</div></div>`;
    return heading+`<div class="section-title"><span class="muted">${loadingProjects ? "Loading projects…" : `${projects.length} saved projects`}</span><button id="cloud-new" ${busy?"disabled":""}>＋ New project</button></div>
      ${status?`<p class="notice" role="status">${esc(status)}</p>`:""}
      ${loadingProjects?'<p role="status" class="empty">Loading your projects…</p>':projectsError?`<div class="notice" role="alert">${esc(projectsError)} <button id="projects-retry">Try again</button></div>`:projects.length?`<div class="saved-projects">${projects.map(p=>`<button class="saved-project" data-cloud-open="${esc(p.id)}" ${busy?"disabled":""}><span class="saved-project-icon" aria-hidden="true">♫</span><span><strong>${esc(p.title || "Untitled production")}</strong><small>Updated ${esc(new Date(p.updated_at).toLocaleString())}</small></span><span aria-hidden="true">↗</span></button>`).join("")}</div>`:'<div class="empty"><span>♫</span><h3>No saved projects yet</h3><p>Create a project, then choose Save project in the workspace.</p></div>'}`;
  }
  function header() {
    return account.user ? `<button id="cloud-logout" ${busy?"disabled":""}>Log out</button>`
      : authActions(account);
  }
  const confirmSwitch=()=>!dirty || confirm("Save your latest changes to your account before switching projects. Switch anyway?");
  function bind() {
    if(!account.user)return;
    const on=(selector,handler)=>{const button=document.querySelector(selector);if(button)button.onclick=handler;};
    on("#cloud-save",()=>run(()=>save()));
    on("#cloud-copy",()=>run(()=>save(true)));

    on("#cloud-restore",()=>run(()=>media?.restore(report)));
    on("#cloud-new",()=>{if(confirmSwitch()){stash();localStorage.removeItem(storageKey);localStorage.removeItem(metaKey);history.replaceState(null,"",location.pathname+location.search);location.reload();}});
    on("#cloud-logout",()=>run(async()=>{await request("/api/auth?action=logout",{method:"POST"});try{sessionStorage.removeItem("cuestamp-guest");}catch{}location.reload();}));
    on("#projects-retry",loadProjects);
    document.querySelectorAll("[data-cloud-open]").forEach(button=>button.onclick=()=>run(async()=>{if(confirmSwitch())replace((await request("/api/projects?id="+encodeURIComponent(button.dataset.cloudOpen))).project);}));
  }
  return {view,header,bind,projectsPage,loadProjects,restore:()=>account.user && state.media?run(()=>media?.restore(report)):Promise.resolve(),changed(){changes++;dirty=true;status="Unsaved changes · click Save project to save.";const el=document.querySelector("#cloud-status");if(el)el.textContent=status;}};
}
