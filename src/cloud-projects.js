import {migrateCueDetails} from "./cue-details.js";
import {serverValidationEnabled} from "./api-client.js";
export async function sessionInfo() {
  if (!serverValidationEnabled) return {configured:false,user:null};
  try {
    const response=await fetch("/api/auth?action=me",{signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error();
    return await response.json();
  } catch {return {configured:false,user:null,error:"Sign-in is temporarily unavailable. Your local workspace is still available."};}
}
export function createCloudWorkspace(account,{state,storageKey,esc}) {
  let active=null,projects=[],status="",busy=false,changes=0,dirty=false;
  const metaKey=storageKey+":project";
  try {active=JSON.parse(localStorage.getItem(metaKey));dirty=Boolean(localStorage.getItem(storageKey));} catch {}
  const update=()=>{const el=document.querySelector("#cloud-workspace");if(el){el.innerHTML=view();bind();}};
  const stash=()=>{try {localStorage.setItem(storageKey+":backup",JSON.stringify(state));} catch {}};
  const replace=(project)=>{
    stash();localStorage.setItem(storageKey,JSON.stringify(project.data));
    localStorage.setItem(metaKey,JSON.stringify({id:project.id,revision:project.revision}));
    location.reload();
  };
  async function request(url, options) {
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
    if(response.status===401) throw new Error("Your session expired. Sign in again; your draft is kept on this device.");
    if(response.status===409) throw new Error("This project changed in another tab or device. Save a copy to keep your edits, or reopen the cloud version.");
    if(!response.ok) throw new Error("Could not reach your projects. Your draft is kept on this device; please retry.");
    return response.json();
  }
  async function run(fn) {busy=true;update();try{await fn();}catch(e){status=e.message;}finally{busy=false;update();}}
  async function save(copy=false) {
    const version=changes, snapshot=structuredClone(state);
    const target=copy || !active?{id:crypto.randomUUID(),revision:0}:active;
    const {project}=await request("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...target,data:snapshot})});
    active={id:project.id,revision:project.revision};localStorage.setItem(metaKey,JSON.stringify(active));
    dirty=changes!==version;status=dirty?"Earlier edits saved. Save again for your latest changes.":"Saved to your account.";
    projects=(await request("/api/projects")).projects;
  }
  function view() {
    if(!account.user) return account.configured
      ? '<section class="panel account-panel"><div><strong>Keep your projects across devices</strong><p>Sign in to save private cue sheets. Audio stays on this device.</p></div><a class="primary" href="/api/auth?action=login">Sign in / Create account</a></section>'
      : account.error?`<p class="notice">${esc(account.error)}</p>`:"";
    return `<section class="panel account-panel"><div><strong>${esc(account.user.email)}</strong><p id="cloud-status" role="status">${esc(status || (active ? "Cloud project · edits are saved locally until you click Save." : "New workspace · save to add it to your account."))}</p></div><div class="button-row">
    <button class="primary" id="cloud-save" ${busy?"disabled":""}>Save project</button>
    <button id="cloud-copy" ${busy?"disabled":""}>Save a copy</button>
    <button id="cloud-list" ${busy?"disabled":""}>My projects</button>
    <button id="cloud-new" ${busy?"disabled":""}>New project</button>
    <button id="cloud-import" ${busy?"disabled":""}>Import browser project</button>
    <button id="cloud-logout" ${busy?"disabled":""}>Sign out</button></div>
    ${projects.length?`<div class="cloud-project-list">${projects.map(p=>`<button data-cloud-open="${esc(p.id)}" ${busy?"disabled":""}>${esc(p.title)} <small>${esc(new Date(p.updated_at).toLocaleString())}</small></button>`).join("")}</div>`:""}</section>`;
  }
  const confirmSwitch=()=>!dirty || confirm("Your current draft is kept on this device. Save it to your account first if you want to keep working on it later. Switch projects?");
  function bind() {
    const el=document.querySelector("#cloud-workspace");if(!el || !account.user)return;
    el.querySelector("#cloud-save").onclick=()=>run(()=>save());
    el.querySelector("#cloud-copy").onclick=()=>run(()=>save(true));
    el.querySelector("#cloud-list").onclick=()=>run(async()=>{projects=(await request("/api/projects")).projects;status=projects.length?"Choose a saved project. Reattach media after opening.":"No saved projects yet. Click Save project to create one.";});
    el.querySelector("#cloud-new").onclick=()=>{if(confirmSwitch()){stash();localStorage.removeItem(storageKey);localStorage.removeItem(metaKey);location.reload();}};
    el.querySelector("#cloud-import").onclick=()=>run(async()=>{
      const legacy=localStorage.getItem("cuebook-v1");
      if(!legacy) {status="No browser-saved project exists on this site's address.";return;}
      if(!confirmSwitch())return;
      // Import only on explicit action; never assign an anonymous project to an account automatically.
      const data=JSON.parse(legacy);migrateCueDetails(data);
      const {project}=await request("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:crypto.randomUUID(),revision:0,data})});
      replace({...project,data});
    });
    el.querySelector("#cloud-logout").onclick=()=>run(async()=>{await request("/api/auth?action=logout",{method:"POST"});location.reload();});
    el.querySelectorAll("[data-cloud-open]").forEach(button=>button.onclick=()=>run(async()=>{if(confirmSwitch())replace((await request("/api/projects?id="+encodeURIComponent(button.dataset.cloudOpen))).project);}));
  }
  return {view,bind,changed(){changes++;dirty=true;status="Unsaved cloud changes · draft kept on this device.";const el=document.querySelector("#cloud-status");if(el)el.textContent=status;}};
}
