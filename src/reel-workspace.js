import {audioUploadButton} from './audio-upload-button.js';
import {libraryRequest} from './audio-library.js';
import {ReelPlayer} from './reel-player.js';
import {confirmDialog} from './confirm-dialog.js';
export function createReelWorkspace({account,audioLibrary,esc,onChange}){
 const key=account.user?`cuestamp-user:${account.user.id}:reel-draft`:'cuestamp-guest:reel-draft';
 const blank=()=>({type:'reel',title:'',status:'draft',audioIds:[],trackTitles:{}});
 let data=blank(),active=null,dirty=false,busy=false,error='',notice='',preview=null,player=null,publication=null,publicationLoaded=null,downloads=false,progress='';
 let localUrls=[],publicationEpoch=0;
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
   active={id:project.id,revision:project.revision};data=snapshot;dirty=false;persist();notice='Reel draft saved to Projects.';
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
    tracks.push(account.user?{...(await post('prepare',{id})).track,title:titleFor(id)}:await guestTrack(id));
   }
   preview={title:data.title,tracks};
   if(publish){publicationEpoch++;progress='Publishing reel…';onChange();publication=(await post('publish',{...active,allowDownloads:downloads})).publication;publicationLoaded=active.id;notice='Your reel is published. Anyone with the link can listen.';}
   else notice='Preview ready.';
  }finally{busy=false;progress='';onChange();}
 }
 function shareUrl(){const url=new URL('reel.html',location.href);url.search='';url.hash='';url.searchParams.set('token',publication.token);return url.href;}
 function view(){dispose();return `<section class="reel-workspace"><div class="heading"><div><div class="eyebrow">REEL PROJECT</div><h1>${publication?'Edit Reel':'New Reel'}</h1><p>Build a playlist, preview your reel, then share it anywhere.</p></div><button class="primary" id="save-reel" ${busy?'disabled':''}>Save draft</button></div><div class="project-title-editor"><label for="reel-title">Project title</label><input id="reel-title" maxlength="300" value="${esc(data.title)}" placeholder="Name your reel…" ${busy?'disabled':''}></div>${error?`<div class="project-error" role="alert">${esc(error)}</div>`:''}${notice?`<p class="muted" role="status">${esc(notice)}</p>`:''}<section class="panel"><div class="section-title"><h2>Tracks</h2><div class="button-row"><button id="reel-library" ${busy?'disabled':''}>Choose from audio library</button>${audioUploadButton({id:'reel-upload',disabled:busy})}</div></div><p class="muted">Name your tracks and arrange the order listeners will hear them.</p>${data.audioIds.length?`<ol class="reel-audio-list">${data.audioIds.map((id,i)=>`<li><label class="reel-track-edit"><span class="sr-only">Track ${i+1} title</span><input aria-label="Track ${i+1} title" data-reel-title="${esc(id)}" maxlength="300" value="${esc(titleFor(id))}" ${busy?'disabled':''}></label><div class="reel-order"><button data-reel-up="${i}" aria-label="Move track ${i+1} up" ${busy||!i?'disabled':''}>↑</button><button data-reel-down="${i}" aria-label="Move track ${i+1} down" ${busy||i===data.audioIds.length-1?'disabled':''}>↓</button></div><button data-remove-reel-audio="${esc(id)}" ${busy?'disabled':''}>Remove</button></li>`).join('')}</ol>`:'<p class="empty">Add audio to start your reel.</p>'}</section><div class="reel-publish-actions"><button id="preview-reel" ${busy||!data.audioIds.length?'disabled':''}>Preview reel</button>${account.user?`<button class="primary" id="publish-reel" ${busy||!data.audioIds.length?'disabled':''}>${publication?'Update published reel':'Publish reel'}</button><label><input type="checkbox" id="reel-downloads" ${downloads?'checked':''} ${busy?'disabled':''}> Allow MP3 downloads</label>`:'<span class="muted">Sign in to publish and embed your reel.</span>'}${publication?`<button id="share-reel" ${busy?'disabled':''}>Share & embed</button><button id="revoke-reel" ${busy?'disabled':''}>Stop sharing</button>`:''}</div>${progress?`<p role="status" class="muted">${esc(progress)}</p>`:''}${preview?'<div id="reel-preview"></div>':''}${publication?'<p class="muted">Draft changes stay private until you update the published reel.</p>':''}</section>`;}
 function showShare(){
  const url=shareUrl(),embed=`<iframe src="${url}&embed=1" width="100%" height="${Math.min(900,330+data.audioIds.length*58)}" title="${esc(data.title)}" frameborder="0" loading="lazy" allow="autoplay"></iframe>`;
  const dialog=document.createElement('dialog');dialog.className='resume-workspace reel-share-dialog';dialog.innerHTML=`<div class="dialog-heading"><h2>Share your reel</h2><button data-close aria-label="Close">×</button></div><p class="muted">Anyone with this link can listen. Use Stop sharing to revoke access.</p><div class="reel-share-fields"><label>Share link<input readonly value="${esc(url)}"></label><button data-copy-link>Copy link</button><label>Embed on your website<textarea rows="4" readonly>${esc(embed)}</textarea></label><button data-copy-embed>Copy embed code</button></div><p role="status"></p>`;
  document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  for(const [selector,text] of [['[data-copy-link]',url],['[data-copy-embed]',embed]])dialog.querySelector(selector).onclick=async()=>{try{await navigator.clipboard.writeText(text);dialog.querySelector('[role=status]').textContent='Copied';}catch{dialog.querySelector('[role=status]').textContent='Select the text above and copy it.';}};
 }
 async function attach(ids){data.audioIds=[...new Set([...data.audioIds,...ids])];changed();onChange();}
 const run=fn=>async()=>{try{error='';await fn();}catch(e){error=e.message;onChange();}};
 function bind(){
  const title=document.querySelector('#reel-title');if(title)title.oninput=()=>{data.title=title.value;changed();const label=document.querySelector('.page-breadcrumb b');if(label)label.textContent=data.title || 'Untitled reel';};
  document.querySelector('#save-reel')?.addEventListener('click',run(save));
  document.querySelector('#preview-reel')?.addEventListener('click',run(()=>prepare()));
  document.querySelector('#publish-reel')?.addEventListener('click',run(()=>prepare(true)));
  document.querySelector('#reel-downloads')?.addEventListener('change',e=>{downloads=e.target.checked;});
  document.querySelector('#share-reel')?.addEventListener('click',showShare);
  document.querySelector('#revoke-reel')?.addEventListener('click',run(async()=>{await confirmDialog({title:'Stop sharing this reel?',message:'The current link and embeds will stop working. Audio already loaded by a listener may keep playing for a few minutes.',confirmLabel:'Stop sharing',onConfirm:async()=>{publicationEpoch++;await post('revoke',{id:active.id});publication=null;notice='Sharing stopped. Publishing again creates a new link.';onChange();}});}));
  document.querySelector('#reel-upload')?.addEventListener('change',async event=>{const files=[...event.target.files];busy=true;error='';onChange();try{for(const file of files){const [asset]=await audioLibrary.addMany([file]);await attach([asset.id]);}}catch(e){error=e.message;}finally{busy=false;onChange();}});
  document.querySelector('#reel-library')?.addEventListener('click',run(async()=>attach(await audioLibrary.pick())));
  document.querySelectorAll('[data-remove-reel-audio]').forEach(button=>button.onclick=()=>{data.audioIds=data.audioIds.filter(id=>id!==button.dataset.removeReelAudio);delete data.trackTitles?.[button.dataset.removeReelAudio];changed();onChange();});
  document.querySelectorAll('[data-reel-title]').forEach(input=>input.oninput=()=>{data.trackTitles||={};data.trackTitles[input.dataset.reelTitle]=input.value;changed();});
  for(const dir of ['up','down'])document.querySelectorAll(`[data-reel-${dir}]`).forEach(button=>button.onclick=()=>{const i=Number(button.dataset[dir==='up'?'reelUp':'reelDown']),j=i+(dir==='up'?-1:1);[data.audioIds[i],data.audioIds[j]]=[data.audioIds[j],data.audioIds[i]];changed();onChange();});
  if(preview&&document.querySelector('#reel-preview'))player=new ReelPlayer(document.querySelector('#reel-preview'),{...preview,source:t=>account.user?`/api/reels?action=preview&id=${encodeURIComponent(t.id)}`:t.url});
  if(account.user&&active&&publicationLoaded!==active.id){const id=active.id,epoch=publicationEpoch;publicationLoaded=id;libraryRequest(`/api/reels?id=${id}`).then(async result=>{if(active?.id!==id||epoch!==publicationEpoch)return;publication=result.publication;if(publication){const {reel}=await libraryRequest(`/api/reels?action=public&token=${publication.token}`);if(active?.id!==id||epoch!==publicationEpoch)return;downloads=reel.allowDownloads;}onChange();}).catch(e=>{if(active?.id===id&&epoch===publicationEpoch){error=e.message;onChange();}});}
 }
 function reset(){publicationEpoch++;clearPreview();publication=null;publicationLoaded=null;downloads=false;error='';notice='';}
 return {view,bind,save,dispose,isDirty:()=>dirty,isBusy:()=>busy,title:()=>data.title,newProject(){if(dirty)localStorage.setItem(key+':backup',JSON.stringify({data,active,dirty}));reset();data=blank();active=null;dirty=false;persist();},open(project){reset();data=project.data;active={id:project.id,revision:project.revision};dirty=false;persist();},async restore(){await audioLibrary.load();onChange();}};
}
