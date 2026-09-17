import {collectionRow,collectionCreateButton} from './collection-page.js';
import {projectDates} from './project-list.js';
import {prepareReelTrack} from './reel-preparation.js';
import {audioUploadButton} from './audio-upload-button.js';
import {libraryRequest} from './audio-library.js';
import {ReelPlayer,downloadReelTrack} from './reel-player.js';
import {confirmDialog} from './confirm-dialog.js';
export function createReelWorkspace({account,audioLibrary,esc,onChange,onEdit,onCreate,onSaved}){
 const key=account.user?`cuestamp-user:${account.user.id}:reel-draft`:'cuestamp-guest:reel-draft';
 const blank=()=>({type:'reel',title:'',status:'draft',audioIds:[],trackTitles:{}});
 let data=blank(),active=null,dirty=false,busy=false,error='',notice='',preview=null,player=null,publication=null,publicationLoaded=null,progress='';
 let localUrls=[],publicationEpoch=0,pendingUploads=[],savedReels=[],reelsLoaded=false,reelsLoading=false;
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.data?.type==='reel'){data=saved.data;active=saved.active;dirty=Boolean(saved.dirty);}}catch{}
 const persist=()=>localStorage.setItem(key,JSON.stringify({data,active,dirty}));
 const dispose=()=>{player?.destroy();player=null;};
 const clearPreview=()=>{dispose();document.querySelector("#reel-preview")?.remove();preview=null;localUrls.forEach(url=>URL.revokeObjectURL(url));localUrls=[];};
 const changed=()=>{dirty=true;notice='';clearPreview();persist();};
 const titleFor=id=>data.trackTitles?.[id] || audioLibrary.entries().find(a=>a.id===id)?.filename?.replace(/\.[^.]+$/,'') || 'Untitled track';
 async function save(){
  if(busy || audioLibrary.isBusy())throw new Error('Wait for your audio upload to finish.');
  if(!data.title.trim())throw new Error('Enter a reel title before saving.');
  if(!account.user){dirty=false;persist();notice='Reel draft saved on this device.';onChange();return;}
  busy=true;error='';onChange();
  try{
   const snapshot=structuredClone(data);snapshot.title=snapshot.title.trim();
   for(let i=0;i<snapshot.audioIds.length;i++){
    if(audioLibrary.entries().some(a=>a.id===snapshot.audioIds[i]&&a.saved))continue;
    const oldId=snapshot.audioIds[i],asset=await audioLibrary.add(await audioLibrary.fileFor(oldId));snapshot.audioIds[i]=asset.id;
    if(snapshot.trackTitles?.[oldId]){snapshot.trackTitles[asset.id]=snapshot.trackTitles[oldId];delete snapshot.trackTitles[oldId];}
   }
   const target=active || {id:crypto.randomUUID(),revision:0};
   const {project}=await libraryRequest('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...target,data:snapshot})});
   active={id:project.id,revision:project.revision};data=snapshot;dirty=false;persist();onSaved?.(active.id);notice='Reel draft saved to Projects.';reelsLoaded=false;
  }catch(e){error=e.message;throw e;}finally{busy=false;onChange();}
 }
 async function post(action,body){
  const response=await fetch(`/api/reels?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(280000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Could not prepare the reel. Please retry.');return result;
 }
 async function guestTrack(id){
  const file=await audioLibrary.fileFor(id);
  if(file.size>100000000)throw Error('Sign in to prepare tracks larger than 100 MB on the server.');
  const context=new AudioContext();
  try{
   const buffer=await context.decodeAudioData(await file.arrayBuffer());
   if(buffer.duration>1200)throw Error('Reel tracks must be up to 20 minutes long.');
   const channel=buffer.getChannelData(0),peaks=Array.from({length:360},(_,i)=>{let p=0;for(let j=Math.floor(i*channel.length/360);j<Math.floor((i+1)*channel.length/360);j++)p=Math.max(p,Math.abs(channel[j]));return p;});
   const max=Math.max(.001,...peaks),url=URL.createObjectURL(file);localUrls.push(url);
   return {id,title:titleFor(id),duration:buffer.duration,peaks:peaks.map(p=>p/max),url};
  }finally{await context.close();}
 }
 async function prepare(publish=false){
  if(!data.title.trim())throw Error('Give your reel a title first.');
  if(!data.audioIds.length || data.audioIds.length>50)throw Error('Add between 1 and 50 tracks to your reel.');
  if(publish&&!account.user)throw Error('Sign in to publish a shareable reel.');
  await save();busy=true;error='';notice='';clearPreview();onChange();
  try{
   const tracks=[];
   for(const [i,id] of data.audioIds.entries()){
    progress=`Preparing track ${i+1} of ${data.audioIds.length}…`;onChange();
    tracks.push(account.user?{...await prepareReelTrack(post,id),title:titleFor(id)}:await guestTrack(id));
   }
   preview={title:data.title,tracks};
   if(publish){publicationEpoch++;progress='Publishing reel…';onChange();publication=(await post('publish',{...active,allowDownloads:true})).publication;publicationLoaded=active.id;notice='Your reel is published. Anyone with the link can listen.';reelsLoaded=false;}
   else notice='Preview ready.';
  }finally{busy=false;progress='';onChange();}
 }
 function shareUrl(){const url=new URL('reel.html',location.href);url.search='';url.hash='';url.searchParams.set('token',publication.token);return url.href;}
 function view(){dispose();return `<section class="reel-workspace"><div class="heading"><div><div class="eyebrow">REEL PROJECT</div><h1>${active?'Edit Reel':'New Reel'}</h1><p>Build a playlist, preview your reel, then share it anywhere.</p></div><button class="primary" id="save-reel" ${busy?'disabled':''}>${active?'Save changes':'Save draft'}</button></div><div class="project-title-editor"><label for="reel-title">Project title</label><input id="reel-title" maxlength="300" value="${esc(data.title)}" placeholder="Name your reel…" ${busy?'disabled':''}></div>${error?`<div class="project-error" role="alert">${esc(error)}${pendingUploads.length?'<button id="retry-reel-upload">Retry upload</button>':''}</div>`:''}${audioLibrary.uploadStatus()?`<p role="status">${esc(audioLibrary.uploadStatus())}</p>${audioLibrary.canCancelUpload()?'<button id="cancel-reel-upload">Cancel upload</button>':''}`:''}${notice?`<p class="muted" role="status">${esc(notice)}</p>`:''}<section class="panel"><div class="section-title"><h2>Tracks</h2><div class="button-row"><button id="reel-library" ${busy?'disabled':''}>Choose from audio library</button>${audioUploadButton({id:'reel-upload',disabled:busy})}</div></div><p class="muted">Name your tracks and arrange the order listeners will hear them.</p>${data.audioIds.length?`<ol class="reel-audio-list">${data.audioIds.map((id,i)=>`<li><label class="reel-track-edit"><span class="sr-only">Track ${i+1} title</span><input aria-label="Track ${i+1} title" data-reel-title="${esc(id)}" maxlength="300" value="${esc(titleFor(id))}" ${busy?'disabled':''}></label><div class="reel-order"><button data-reel-up="${i}" aria-label="Move track ${i+1} up" ${busy||!i?'disabled':''}>↑</button><button data-reel-down="${i}" aria-label="Move track ${i+1} down" ${busy||i===data.audioIds.length-1?'disabled':''}>↓</button></div><button data-remove-reel-audio="${esc(id)}" ${busy?'disabled':''}>Remove</button></li>`).join('')}</ol>`:'<p class="empty">Add audio to start your reel.</p>'}</section><div class="reel-publish-actions"><button id="preview-reel" ${busy||!data.audioIds.length?'disabled':''}>Preview reel</button>${account.user?`<button class="primary" id="publish-reel" ${busy||!data.audioIds.length?'disabled':''}>${publication?'Update published reel':'Publish reel'}</button>`:'<span class="muted">Sign in to publish and embed your reel.</span>'}${publication?`<button id="share-reel" ${busy?'disabled':''}>Share & embed</button>`:''}</div>${progress?`<p role="status" class="muted">${esc(progress)}</p>`:''}${preview?'<div id="reel-preview"></div>':''}${publication?'<p class="muted">Draft changes stay private until you update the published reel.</p>':''}${reelsView()}</section>`;}
 function showShare(){
  const url=shareUrl(),embed=`<iframe src="${url}&embed=1" width="100%" height="${Math.min(900,330+data.audioIds.length*58)}" title="${esc(data.title)}" frameborder="0" loading="lazy" allow="autoplay"></iframe>`;
  const dialog=document.createElement('dialog');dialog.className='resume-workspace reel-share-dialog';dialog.innerHTML=`<div class="dialog-heading"><h2>Share your reel</h2><button data-close aria-label="Close">×</button></div><p class="muted">Anyone with this link can listen. Use Stop sharing to revoke access.</p><div class="reel-share-fields"><label>Share link<input readonly value="${esc(url)}"></label><button data-copy-link>Copy link</button><label>Embed on your website<textarea rows="4" readonly>${esc(embed)}</textarea></label><button data-copy-embed>Copy embed code</button></div><p role="status"></p>`;
  document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  for(const [selector,text] of [['[data-copy-link]',url],['[data-copy-embed]',embed]])dialog.querySelector(selector).onclick=async()=>{try{await navigator.clipboard.writeText(text);dialog.querySelector('[role=status]').textContent='Copied';}catch{dialog.querySelector('[role=status]').textContent='Select the text above and copy it.';}};
 }
 async function uploadFiles(files){pendingUploads=[...files];busy=true;error='';onChange();try{while(pendingUploads.length){const [asset]=await audioLibrary.addMany([pendingUploads[0]]);await attach([asset.id]);pendingUploads.shift();}}catch(e){error=e.message;}finally{busy=false;onChange();}}
 async function attach(ids){data.audioIds=[...new Set([...data.audioIds,...ids])];changed();onChange();}
 const run=fn=>async()=>{try{error='';await fn();}catch(e){error=e.message;onChange();}};

 async function loadReels(){if(reelsLoading||!account.user)return;reelsLoading=true;try{savedReels=(await libraryRequest('/api/projects')).projects.filter(p=>p.type==='reel');reelsLoaded=true;}catch(e){error=e.message;reelsLoaded=true;}finally{reelsLoading=false;onChange();}}
 function reelsView(){return account.user?`<section class="saved-reels"><div class="section-title"><h2>Your reels</h2>${collectionCreateButton({label:"Create reel",attributes:"id=\"new-saved-reel\"",disabled:busy})}</div><div class="collection-list">${savedReels.map(p=>collectionRow({title:`<button class="project-title-link" data-edit-reel="${esc(p.id)}">${esc(p.title)}</button>`,detail:`${p.published?'Published':'Draft'}`,icon:'▷',metadata:projectDates(p,esc),actions:`<button data-edit-reel="${esc(p.id)}" ${busy?'disabled':''}>Edit</button>${p.published?`<button data-stop-reel="${esc(p.id)}" ${busy?'disabled':''}>Stop sharing</button>`:''}`})).join('')||'<p class="muted">Saved reels appear here. Use Create project to start another reel.</p>'}</div></section>`:'';}
 function bind(){
  document.querySelector("#new-saved-reel")?.addEventListener("click",()=>onCreate?.());
  document.querySelectorAll("[data-edit-reel]").forEach(button=>button.onclick=()=>onEdit?.(button.dataset.editReel));
  document.querySelectorAll("[data-stop-reel]").forEach(button=>button.onclick=run(async()=>{const id=button.dataset.stopReel;await confirmDialog({title:"Stop sharing this reel?",message:"This reel’s link and embeds will stop working. Already loaded audio may keep playing briefly.",confirmLabel:"Stop sharing",onConfirm:async()=>{publicationEpoch++;await post("revoke",{id});if(active?.id===id)publication=null;notice="Sharing stopped. Publishing again creates a new link.";await loadReels();}});}));
  if(account.user&&!reelsLoaded&&!reelsLoading&&!busy)loadReels();
  const title=document.querySelector('#reel-title');if(title)title.oninput=()=>{data.title=title.value;changed();const label=document.querySelector('.page-breadcrumb b');if(label)label.textContent=data.title || 'Untitled reel';};
  document.querySelector('#save-reel')?.addEventListener('click',run(save));
  document.querySelector('#preview-reel')?.addEventListener('click',run(()=>prepare()));
  document.querySelector('#publish-reel')?.addEventListener('click',run(()=>prepare(true)));
  document.querySelector('#share-reel')?.addEventListener('click',showShare);

  document.querySelector('#reel-upload')?.addEventListener('change',event=>uploadFiles([...event.target.files]));
  document.querySelector('#retry-reel-upload')?.addEventListener('click',()=>uploadFiles(pendingUploads));
  document.querySelector('#cancel-reel-upload')?.addEventListener('click',()=>audioLibrary.cancelUpload());
  document.querySelector('#reel-library')?.addEventListener('click',run(async()=>attach(await audioLibrary.pick())));
  document.querySelectorAll('[data-remove-reel-audio]').forEach(button=>button.onclick=()=>{data.audioIds=data.audioIds.filter(id=>id!==button.dataset.removeReelAudio);delete data.trackTitles?.[button.dataset.removeReelAudio];changed();onChange();});
  document.querySelectorAll('[data-reel-title]').forEach(input=>input.oninput=()=>{data.trackTitles||={};data.trackTitles[input.dataset.reelTitle]=input.value;changed();});
  for(const dir of ['up','down'])document.querySelectorAll(`[data-reel-${dir}]`).forEach(button=>button.onclick=()=>{const i=Number(button.dataset[dir==='up'?'reelUp':'reelDown']),j=i+(dir==='up'?-1:1);[data.audioIds[i],data.audioIds[j]]=[data.audioIds[j],data.audioIds[i]];changed();onChange();});
  if(preview&&document.querySelector('#reel-preview'))player=new ReelPlayer(document.querySelector('#reel-preview'),{...preview,allowDownloads:Boolean(account.user),download:t=>downloadReelTrack(`/api/reels?action=preview&id=${encodeURIComponent(t.id)}`,t.title),source:t=>account.user?`/api/reels?action=preview&id=${encodeURIComponent(t.id)}`:t.url});
  if(account.user&&active&&publicationLoaded!==active.id){const id=active.id,epoch=publicationEpoch;publicationLoaded=id;libraryRequest(`/api/reels?id=${id}`).then(async result=>{if(active?.id!==id||epoch!==publicationEpoch)return;publication=result.publication;onChange();}).catch(e=>{if(active?.id===id&&epoch===publicationEpoch){error=e.message;onChange();}});}
 }
 function reset(){pendingUploads=[];publicationEpoch++;clearPreview();publication=null;publicationLoaded=null;error='';notice='';}
 return {view,bind,save,dispose,activeId:()=>active?.id,showError(e){error=e.message;onChange();},async loadProject(id,isCurrent=()=>true){if(active?.id===id)return;const {project}=await libraryRequest("/api/projects?id="+encodeURIComponent(id));if(!isCurrent())return;if(project.data.type!=="reel")throw Error("This project is not a reel.");this.open(project);},isDirty:()=>dirty,isBusy:()=>busy,title:()=>data.title,newProject(){if(dirty)localStorage.setItem(key+':backup',JSON.stringify({data,active,dirty}));reset();data=blank();active=null;dirty=false;persist();},open(project){reset();data=project.data;active={id:project.id,revision:project.revision};dirty=false;persist();},async restore(){await audioLibrary.load();onChange();}};
}
