import {upload} from '@vercel/blob/client';
import {MAX_DURATION} from "./analysis.js";
import {localWaveform} from './reel-local-preview.js';
import {collectionRow,collectionCreateButton} from './collection-page.js';
import {projectDates} from './project-list.js';
import {prepareReelTrack} from './reel-preparation.js';
import {audioUploadButton} from './audio-upload-button.js';
import {libraryRequest} from './audio-library.js';
import {ReelPlayer,downloadReelTrack} from './reel-player.js';
import {confirmDialog} from './confirm-dialog.js';
export function createReelWorkspace({account,audioLibrary,esc,onChange,onEdit,onCreate,onSaved,onDeleted,onAnalytics,uploadResume=upload}){
 const key=account.user?`cuestamp-user:${account.user.id}:reel-draft`:'cuestamp-guest:reel-draft';
 const blank=()=>({type:'reel',title:'',status:'draft',audioIds:[],trackTitles:{}});
 let data=blank(),active=null,dirty=false,busy=false,error='',notice='',preview=null,player=null,publication=null,publicationLoaded=null,progress='',uploading=false;
 let localUrls=[],publicationEpoch=0,pendingUploads=[],savedReels=[],reelsLoaded=false,reelsLoading=false,autosaveTimer=null;
 let autoTimer=null,autoKey='',autoLoading=false,autoError='',previewEpoch=0;const trackCache=new Map();
 let links=[],linksLoadedFor=null;const selectedReels=new Set();
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.data?.type==='reel'){data=saved.data;active=saved.active;dirty=Boolean(saved.dirty);}}catch{}
 const persist=()=>localStorage.setItem(key,JSON.stringify({data,active,dirty}));
 const dispose=()=>{player?.destroy();player=null;};
 const clearPreview=()=>{previewEpoch++;dispose();document.querySelector("#reel-preview")?.remove();preview=null;};
 const setAutosaveStatus=text=>{const el=document.querySelector('#reel-autosave-status');if(el)el.textContent=text;};
 const scheduleAutosave=()=>{
  if(autosaveTimer)clearTimeout(autosaveTimer);
  if(!account.user)return;
  autosaveTimer=setTimeout(async()=>{
   autosaveTimer=null;
   if(!dirty || busy || uploading || audioLibrary.isBusy() || !data.title.trim())return;
   try{await save(true);}catch(e){error=e.message;setAutosaveStatus('');}
  },2500);
 };
 const changed=()=>{dirty=true;notice='';if(preview&&preview.tracks.map(t=>t.id).join(',')!==data.audioIds.join(','))clearPreview();persist();scheduleAutosave();schedulePreview();renderPreview();};
 const titleFor=id=>data.trackTitles?.[id] || audioLibrary.entries().find(a=>a.id===id)?.filename?.replace(/\.[^.]+$/,'') || 'Untitled track';
 async function save(silent=false){
  if(busy || uploading || audioLibrary.isBusy())throw new Error('Wait for your audio upload to finish.');
  if(!data.title.trim())throw new Error('Enter a reel title before saving.');
  if(!account.user){dirty=false;persist();notice='Reel draft saved on this device.';if(!silent)onChange();return;}
  busy=true;error='';if(silent)setAutosaveStatus('Saving…');else onChange();
  try{
   const beforeSave=JSON.stringify(data),snapshot=structuredClone(data);snapshot.title=snapshot.title.trim();
   for(let i=0;i<snapshot.audioIds.length;i++){
    if(audioLibrary.entries().some(a=>a.id===snapshot.audioIds[i]&&a.saved))continue;
    const oldId=snapshot.audioIds[i],asset=await audioLibrary.add(await audioLibrary.fileFor(oldId));snapshot.audioIds[i]=asset.id;
    if(snapshot.trackColors?.[oldId]){snapshot.trackColors[asset.id]=snapshot.trackColors[oldId];delete snapshot.trackColors[oldId];}
    if(snapshot.trackTitles?.[oldId]){snapshot.trackTitles[asset.id]=snapshot.trackTitles[oldId];delete snapshot.trackTitles[oldId];}
   }
   const target=active || {id:crypto.randomUUID(),revision:0};
   const {project}=await libraryRequest('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...target,data:snapshot})});
   active={id:project.id,revision:project.revision};if(JSON.stringify(data)===beforeSave){data=snapshot;dirty=false;}else dirty=true;persist();onSaved?.(active.id);notice='Reel draft saved to Projects.';reelsLoaded=false;
  }catch(e){error=e.message;throw e;}
  finally{busy=false;if(dirty&&!error)scheduleAutosave();if(silent)setAutosaveStatus(error?'':'Saved');else onChange();}
 }
 async function post(action,body){
  const response=await fetch(`/api/reels?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(280000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Could not prepare the reel. Please retry.');return result;
 }
 async function localTrack(id){
  const title=titleFor(id);
  const file=await audioLibrary.fileFor(id);
  if(/\.wav$/i.test(file.name)){const result=await localWaveform(file),url=URL.createObjectURL(file);localUrls.push(url);return {id,title,...result,url};}
  if(file.size>100000000)throw Error('Sign in to prepare tracks larger than 100 MB on the server.');
  const context=new AudioContext();
  try{
   const buffer=await context.decodeAudioData(await file.arrayBuffer());
   if(buffer.duration>MAX_DURATION)throw Error('Reel tracks must be up to 60 minutes long.');
   const channel=buffer.getChannelData(0),peaks=Array.from({length:360},(_,i)=>{let p=0;for(let j=Math.floor(i*channel.length/360);j<Math.floor((i+1)*channel.length/360);j++)p=Math.max(p,Math.abs(channel[j]));return p;});
   const max=Math.max(.001,...peaks),url=URL.createObjectURL(file);localUrls.push(url);
   return {id,title,duration:buffer.duration,peaks:peaks.map(p=>p/max),url};
  }finally{await context.close();}
 }
 async function prepare(publish=false){
  if(!data.title.trim())throw Error('Give your reel a title first.');
  if(!data.audioIds.length || data.audioIds.length>50)throw Error('Add between 1 and 50 tracks to your reel.');
  if(publish&&!account.user)throw Error('Sign in to publish a shareable reel.');
  const local=!publish;
  if(!local)await save();busy=true;error='';notice='';clearPreview();onChange();
  try{
   const tracks=[];
   for(const [i,id] of data.audioIds.entries()){
    progress=`Preparing track ${i+1} of ${data.audioIds.length}…`;onChange();
    if(local&&audioLibrary.hasLocalFile(id)){
     try{tracks.push(await localTrack(id));}
     catch(e){
      if(!account.user)throw e;
      if(!audioLibrary.entries().some(a=>a.id===id&&a.saved))throw Error(`${e.message} You can use server preview once the upload finishes.`);
      tracks.push({...await prepareReelTrack(post,id),title:titleFor(id),url:`/api/reels?action=preview&id=${encodeURIComponent(id)}`});
     }
    }else tracks.push(account.user?{...await prepareReelTrack(post,id),title:titleFor(id),url:`/api/reels?action=preview&id=${encodeURIComponent(id)}`}:await localTrack(id));
   }
   preview={title:data.title,tracks,local:local||!account.user};
   if(publish){publicationEpoch++;progress='Publishing reel…';onChange();publication=(await post('publish',{...active,allowDownloads:true})).publication;publicationLoaded=active.id;notice='Your reel is published. Create a share link to send it out.';reelsLoaded=false;linksLoadedFor=null;}
   else notice='Preview ready.';
  }finally{busy=false;progress='';onChange();}
 }
 function renderPreview(){
  const root=document.querySelector('#reel-preview');if(!root||!preview)return;
  dispose();player=new ReelPlayer(root,{...preview,title:data.title||'Untitled reel',profile:data.profile,appearance:data.appearance,tracks:preview.tracks.map(t=>({...t,title:titleFor(t.id),color:data.trackColors?.[t.id]})),source:t=>t.url,resumeUrl:data.resumeId?`/api/reels?action=resume-preview&id=${encodeURIComponent(data.resumeId)}`:null});
 }
 function schedulePreview(){
  clearTimeout(autoTimer);autoTimer=setTimeout(async()=>{
   if(!document.querySelector('#reel-preview')||busy||!data.audioIds.length)return;
   const key=data.audioIds.join(',');if(preview?.tracks.map(t=>t.id).join(',')===key||autoLoading||autoKey===key)return;
   autoKey=key;autoLoading=true;autoError='';const epoch=previewEpoch,ids=[...data.audioIds];
   const status=document.querySelector('#reel-preview-status');if(status)status.textContent='Preparing your preview…';
   try{
    const tracks=[];
    for(const id of ids){
     if(!trackCache.has(id)){const task=(async()=>{
      if(audioLibrary.hasLocalFile(id))try{return await localTrack(id);}catch(e){if(!account.user)throw e;}
      if(!account.user) return localTrack(id);
      if(!audioLibrary.entries().some(a=>a.id===id&&a.saved))throw Error('Your preview will be ready when the upload finishes.');
      return {...await prepareReelTrack(post,id),url:`/api/reels?action=preview&id=${encodeURIComponent(id)}`};
     })();trackCache.set(id,task);task.catch(()=>trackCache.delete(id));}
     tracks.push(await trackCache.get(id));
    }
    if(epoch===previewEpoch&&key===data.audioIds.join(',')){preview={tracks,local:true};renderPreview();}
   }catch(e){if(epoch===previewEpoch)autoError=e.message;}
   finally{autoLoading=false;const status=document.querySelector('#reel-preview-status');if(status)status.textContent=autoError||'';const retry=document.querySelector('#retry-reel-preview');if(retry)retry.hidden=!autoError;if(key!==data.audioIds.join(','))schedulePreview();}
  },500);
 }
 function presentationView(){
  const profile=data.profile||{},appearance=data.appearance||{accent:'#1ed760',theme:'dark',description:''};
  return `<section class="panel reel-profile-editor"><div class="section-title"><h2>Profile & résumé</h2>${account.user?'<button id="reel-use-profile" type="button">Use my profile</button>':''}</div><p class="muted">Add your contact details manually or use your account profile. These details and your résumé will be visible to anyone with your published reel link.</p><div class="reel-profile-fields">${[['name','Name'],['email','Email'],['occupation','Role / occupation']].map(([key,label])=>`<label>${label}<input data-reel-profile="${key}" type="${key==='email'?'email':'text'}" maxlength="${key==='email'?254:120}" value="${esc(profile[key]||'')}" ${busy?'disabled':''}></label>`).join('')}<label>About you<textarea data-reel-profile="bio" maxlength="2000" ${busy?'disabled':''}>${esc(profile.bio||'')}</textarea></label></div><div class="reel-resume-row"><label class="reel-resume-upload">Attach résumé (PDF, up to 10 MB)<input id="reel-resume" type="file" accept=".pdf,application/pdf" ${busy||!account.user?'disabled':''}></label>${data.resumeId?`<span>${esc(data.resumeName||'Résumé attached')}</span><button type="button" id="remove-reel-resume" ${busy?'disabled':''}>Remove résumé</button>`:''}${!account.user?'<span class="muted">Sign in to attach a résumé.</span>':''}</div></section><section class="panel"><h2>Appearance</h2><div class="reel-appearance-fields"><label>Reel color<input id="reel-accent" type="color" value="${esc(appearance.accent)}" ${busy?'disabled':''}></label><label>Player theme<select id="reel-theme" ${busy?'disabled':''}><option value="dark" ${appearance.theme==='dark'?'selected':''}>Dark</option><option value="light" ${appearance.theme==='light'?'selected':''}>Light</option></select></label><label>Introduction<textarea id="reel-description" maxlength="1000" ${busy?'disabled':''}>${esc(appearance.description||'')}</textarea></label></div></section><section class="reel-live-preview"><h2>Live preview</h2><p id="reel-preview-status" class="muted" role="status">${esc(autoError||(!data.audioIds.length?'Add tracks to see your reel here.':autoLoading?'Preparing your preview…':''))}</p><button id="retry-reel-preview" ${autoError?'':'hidden'}>Retry preview</button><div id="reel-preview"></div></section>`;
 }
 async function attachResume(file){
  if(!file)return;if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024||!file.size)throw Error('Choose a PDF résumé up to 10 MB.');
  busy=true;onChange();
  try{const options=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const {asset}=await libraryRequest('/api/media?action=reserve',options({filename:file.name,size:file.size}));
   await uploadResume(asset.pathname,file,{access:'private',handleUploadUrl:'/api/media',clientPayload:asset.id,contentType:'application/pdf'});
   await libraryRequest('/api/media?action=complete',options({id:asset.id}));data.resumeId=asset.id;data.resumeName=file.name;changed();
  }finally{busy=false;onChange();}
 }
 function shareUrl(token){const url=new URL('reel.html',location.href);url.search='';url.hash='';url.searchParams.set('token',token);return url.href;}
 function errorView(){
  if(!error)return '';
  if(error.startsWith('Upload canceled.'))return `<div class="reel-upload-notice" role="status"><div><strong>Upload canceled</strong><span>Your file is still available on this device.</span></div>${pendingUploads.length?'<button id="retry-reel-upload">Retry upload</button>':''}</div>`;
  return `<div class="project-error" role="alert"><span>${esc(error)}</span>${pendingUploads.length?'<button id="retry-reel-upload">Retry upload</button>':''}</div>`;
 }
 function view(){dispose();return `<section class="reel-workspace"><div class="heading"><div><div class="eyebrow">REEL PROJECT</div><h1>${active?'Edit Reel':'New Reel'}</h1><p>Build a playlist, preview your reel, then share it anywhere.</p></div>${account.user&&active?`<button data-delete-reel="${esc(active.id)}" ${busy||uploading?'disabled':''}>Delete reel</button>`:''}<button class="primary" id="save-reel" ${busy||uploading?'disabled':''}>${active?'Save changes':'Save draft'}</button>${account.user?`<span id="reel-autosave-status" class="muted" role="status"></span>`:''}</div><div class="project-title-editor"><label for="reel-title">Project title</label><input id="reel-title" maxlength="300" value="${esc(data.title)}" placeholder="Name your reel…" ${busy?'disabled':''}></div>${errorView()}${audioLibrary.progressView('id="cancel-reel-upload"')}${notice?`<p class="muted" role="status">${esc(notice)}</p>`:''}<section class="panel"><div class="section-title"><h2>Tracks</h2><div class="button-row"><button id="reel-library" ${busy?'disabled':''}>Choose from audio library</button>${audioUploadButton({id:'reel-upload',disabled:busy||uploading})}</div></div><p class="muted">${uploading?'Uploading in the background. You can edit track names and order while you wait. Keep this page open.':'Name your tracks and arrange the order listeners will hear them.'}</p>${data.audioIds.length?`<ol class="reel-audio-list">${data.audioIds.map((id,i)=>`<li><label class="reel-track-edit"><span class="sr-only">Track ${i+1} title</span><input aria-label="Track ${i+1} title" data-reel-title="${esc(id)}" maxlength="300" value="${esc(titleFor(id))}" ${busy?'disabled':''}></label><div class="reel-order"><button data-reel-up="${i}" aria-label="Move track ${i+1} up" ${busy||!i?'disabled':''}>↑</button><button data-reel-down="${i}" aria-label="Move track ${i+1} down" ${busy||i===data.audioIds.length-1?'disabled':''}>↓</button></div><button data-edit-reel-audio="${esc(id)}" ${busy||uploading?'disabled':''}>Edit audio</button><button data-remove-reel-audio="${esc(id)}" ${busy?'disabled':''}>Remove</button></li>`).join('')}</ol>`:'<p class="empty">Add audio to start your reel.</p>'}</section>${presentationView()}${publication?.published&&links[0]?`<section class="reel-direct-share" aria-label="Published reel link"><label for="published-reel-link">Published reel link (${esc(links[0].name)})</label><div class="reel-direct-share-controls"><input id="published-reel-link" readonly value="${esc(shareUrl(links[0].token))}"><button id="copy-published-reel-link">Copy link</button><a href="${esc(shareUrl(links[0].token))}" target="_blank" rel="noopener noreferrer">Open reel ↗</a></div><span id="reel-copy-status" role="status"></span></section>`:''}${progress?`<p role="status" class="muted">${esc(progress)}</p>`:''}${publication?.published?'<p class="muted">Draft changes stay private until you update the published reel.</p>':''}<div class="reel-publish-actions">${publication?.published?'<button id="share-reel">Share links</button>':''}${account.user?`<button class="primary" id="publish-reel" ${busy||uploading||!data.audioIds.length?'disabled':''}>${publication?.published?'Update published reel':'Publish reel'}</button>`:'<p class="muted">Sign in to publish and embed your reel.</p>'}${account.user&&active?`<button id="view-reel-analytics">Analytics</button>`:''}</div>${reelsView()}</section>`;}
 function showLinks({id=active?.id,title=data.title,trackCount=data.audioIds.length}={}){
  const dialog=document.createElement('dialog');dialog.className='resume-workspace reel-share-dialog';
  dialog.innerHTML=`<div class="dialog-heading"><h2>Share links</h2><button data-close aria-label="Close">×</button></div><p class="muted">Create a named link for each person or channel so the Analytics page can tell who's listening. Anyone with an active link can listen.</p><div class="reel-links-list" role="status">Loading…</div><form class="reel-links-create"><label class="sr-only" for="reel-link-name">Link name</label><input id="reel-link-name" placeholder="e.g. For the director" maxlength="200" required><button class="primary" type="submit">Create link</button></form><p role="status" class="reel-links-status"></p>`;
  document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  let rows=[];
  const status=text=>{dialog.querySelector('.reel-links-status').textContent=text;};
  const embedFor=url=>`<iframe src="${url}&embed=1" width="100%" height="${Math.min(900,330+trackCount*58)}" title="${esc(title)}" frameborder="0" loading="lazy" allow="autoplay"></iframe>`;
  const sync=()=>{if(id===active?.id){links=rows;onChange();}};
  function render(){
   const list=dialog.querySelector('.reel-links-list');
   list.innerHTML=rows.length?rows.map(l=>{
    const url=shareUrl(l.token);
    return `<div class="reel-link-row"><div class="reel-link-info"><strong>${esc(l.name)}</strong><span class="muted">Created ${esc(new Date(l.createdAt).toLocaleDateString())}${l.active?'':' · Disabled'}</span></div><div class="button-row"><label class="switch"><input type="checkbox" data-toggle-link="${esc(l.id)}" ${l.active?'checked':''} aria-label="${l.active?'Disable':'Enable'} ${esc(l.name)}"><span></span></label><button data-copy-link="${esc(url)}">Copy link</button><button data-copy-embed="${esc(embedFor(url))}">Copy embed</button><button class="danger" data-delete-link="${esc(l.id)}">Delete</button></div></div>`;
   }).join(''):'<p class="muted">No share links yet. Create one below.</p>';
   dialog.querySelectorAll('[data-toggle-link]').forEach(input=>input.onchange=async()=>{
    const linkId=input.dataset.toggleLink;try{await post('toggle-link',{id:linkId,active:input.checked});const link=rows.find(l=>l.id===linkId);if(link)link.active=input.checked;render();sync();}catch(e){status(e.message);input.checked=!input.checked;}
   });
   dialog.querySelectorAll('[data-copy-link]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyLink);status('Link copied');}catch{status('Select and copy the link manually.');}});
   dialog.querySelectorAll('[data-copy-embed]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyEmbed);status('Embed code copied');}catch{status('Select and copy the embed code manually.');}});
   dialog.querySelectorAll('[data-delete-link]').forEach(b=>b.onclick=()=>{
    const linkId=b.dataset.deleteLink;confirmDialog({title:'Delete this share link?',message:"Anyone using this specific link will lose access. Its listen history stays on the Analytics page.",confirmLabel:'Delete link',onConfirm:async()=>{await post('delete-link',{id:linkId});rows=rows.filter(l=>l.id!==linkId);render();sync();}});
   });
  }
  libraryRequest(`/api/reels?action=links&id=${encodeURIComponent(id)}`).then(r=>{rows=r.links;render();sync();}).catch(e=>{dialog.querySelector('.reel-links-list').innerHTML=`<p class="project-error" role="alert">${esc(e.message)}</p>`;});
  dialog.querySelector('.reel-links-create').onsubmit=async event=>{
   event.preventDefault();
   const input=dialog.querySelector('#reel-link-name'),name=input.value.trim();if(!name)return;
   try{const {link}=await post('create-link',{id,name});rows=[link,...rows];input.value='';status('Link created');render();sync();}
   catch(e){status(e.message);}
  };
 }
 async function uploadFiles(files){
  if(uploading||busy)return;
  pendingUploads=[...files];uploading=true;error='';onChange();
  try{while(pendingUploads.length){
   let localId;
   const [asset]=await audioLibrary.addMany([pendingUploads[0]],{onStaged:async staged=>{localId=staged.id;if(!data.audioIds.includes(localId))await attach([localId]);}});
   // Keep edits and ordering made while uploading; don't reattach a removed track.
   if(data.audioIds.includes(localId)&&localId!==asset.id){
    data.audioIds=data.audioIds.map(id=>id===localId?asset.id:id);
    if(Object.hasOwn(data.trackTitles||{},localId)){data.trackTitles[asset.id]=data.trackTitles[localId];delete data.trackTitles[localId];}
    if(data.trackColors?.[localId]){data.trackColors[asset.id]=data.trackColors[localId];delete data.trackColors[localId];}dirty=true;persist();autoKey='';clearPreview();
   }
   pendingUploads.shift();
  }}catch(e){error=e.message;}finally{uploading=false;onChange();}
 }
 async function attach(ids){data.audioIds=[...new Set([...data.audioIds,...ids])];changed();onChange();}
 const run=fn=>async()=>{try{error='';await fn();}catch(e){error=e.message;onChange();}};

 async function loadReels(){if(reelsLoading||!account.user)return;reelsLoading=true;try{savedReels=(await libraryRequest('/api/projects')).projects.filter(p=>p.type==='reel');for(const id of [...selectedReels])if(!savedReels.some(p=>p.id===id))selectedReels.delete(id);reelsLoaded=true;}catch(e){error=e.message;reelsLoaded=true;}finally{reelsLoading=false;onChange();}}
 async function removeReel(id){
  if(busy||uploading||audioLibrary.isBusy())throw Error('Wait for the current operation to finish.');
  busy=true;clearTimeout(autosaveTimer);onChange();
  try{
   const target=active?.id===id?{...active,title:data.title}:savedReels.find(p=>p.id===id);
   if(!target)throw Error('Reload your reels and try again.');
   await confirmDialog({title:`Delete “${target.title}”?`,message:'This permanently deletes the reel and its analytics. Its share links and embeds will stop working. Audio Library files will remain.',confirmLabel:'Delete reel',onConfirm:async()=>{
    await libraryRequest('/api/projects',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision:target.revision})});
    savedReels=savedReels.filter(p=>p.id!==id);
    if(active?.id===id){reset();data=blank();active=null;dirty=false;persist();onDeleted?.(id);}
    notice='Reel deleted.';
   }});
  }finally{busy=false;if(dirty)scheduleAutosave();onChange();}
 }
 async function removeReels(ids){
  if(busy||uploading||audioLibrary.isBusy())throw Error('Wait for the current operation to finish.');
  const targets=ids.map(id=>savedReels.find(p=>p.id===id)).filter(Boolean);
  if(!targets.length)return;
  busy=true;clearTimeout(autosaveTimer);onChange();
  try{
   const multiple=targets.length>1;
   await confirmDialog({title:multiple?`Delete ${targets.length} reels?`:`Delete “${targets[0].title}”?`,message:`This permanently deletes the selected reel${multiple?'s':''} and their analytics. Their share links and embeds will stop working. Audio Library files will remain.`,confirmLabel:multiple?`Delete ${targets.length} reels`:'Delete reel',onConfirm:async()=>{
    const failed=[];
    for(const target of targets){
     try{
      await libraryRequest('/api/projects',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:target.id,revision:target.revision})});
      savedReels=savedReels.filter(p=>p.id!==target.id);selectedReels.delete(target.id);
      if(active?.id===target.id){reset();data=blank();active=null;dirty=false;persist();onDeleted?.(target.id);}
     }catch(e){failed.push(target.title||'Untitled reel');}
    }
    notice=failed.length?`Deleted ${targets.length-failed.length} of ${targets.length} reels. Couldn't delete: ${failed.join(', ')}. Reload and try again.`:`Deleted ${targets.length} reel${multiple?'s':''}.`;
   }});
  }finally{busy=false;if(dirty)scheduleAutosave();onChange();}
 }
 function reelsView(){
  if(!account.user)return '';
  const selectedCount=[...selectedReels].filter(id=>savedReels.some(p=>p.id===id)).length;
  const allSelected=savedReels.length>0&&selectedCount===savedReels.length;
  const bulkBar=savedReels.length?`<div class="reel-bulk-actions"><label class="checkbox-control"><input type="checkbox" id="select-all-reels" ${allSelected?'checked':''}>Select all</label>${selectedCount?`<button data-delete-selected-reels ${busy||uploading?'disabled':''}>Delete selected (${selectedCount})</button>`:''}</div>`:'';
  return `<section class="saved-reels"><div class="section-title"><h2>Your reels</h2>${collectionCreateButton({label:"Create reel",attributes:"id=\"new-saved-reel\"",disabled:busy})}</div>${bulkBar}<div class="collection-list">${savedReels.map(p=>collectionRow({title:`<label class="reel-select"><input type="checkbox" data-select-reel="${esc(p.id)}" aria-label="Select ${esc(p.title||'Untitled reel')}" ${selectedReels.has(p.id)?'checked':''}></label><button class="project-title-link" data-edit-reel="${esc(p.id)}">${esc(p.title)}</button>`,detail:`${p.published?'Published':'Draft'}`,icon:'▷',metadata:projectDates(p,esc),actions:`<button data-delete-reel="${esc(p.id)}" ${busy||uploading?'disabled':''}>Delete reel</button><button data-edit-reel="${esc(p.id)}" ${busy?'disabled':''}>Edit</button>${p.published?`<button data-share-saved-reel="${esc(p.id)}" ${busy?'disabled':''}>Share</button><button data-view-analytics="${esc(p.id)}" ${busy?'disabled':''}>Analytics</button><button data-stop-reel="${esc(p.id)}" ${busy?'disabled':''}>Stop sharing</button>`:''}`})).join('')||'<p class="muted">Saved reels appear here. Use Create project to start another reel.</p>'}</div></section>`;
 }
 function bind(){
  document.querySelectorAll("[data-delete-reel]").forEach(button=>button.onclick=run(()=>removeReel(button.dataset.deleteReel)));
  document.querySelector('[data-delete-selected-reels]')?.addEventListener('click',run(()=>removeReels([...selectedReels])));
  document.querySelector('#select-all-reels')?.addEventListener('change',event=>{
   if(event.target.checked)savedReels.forEach(p=>selectedReels.add(p.id));else selectedReels.clear();
   onChange();
  });
  document.querySelectorAll('[data-select-reel]').forEach(input=>input.onchange=()=>{
   const id=input.dataset.selectReel;
   if(input.checked)selectedReels.add(id);else selectedReels.delete(id);
   onChange();
  });
  document.querySelector('#published-reel-link')?.addEventListener('click',event=>event.target.select());
  document.querySelector('#copy-published-reel-link')?.addEventListener('click',async()=>{const input=document.querySelector('#published-reel-link'),status=document.querySelector('#reel-copy-status');try{await navigator.clipboard.writeText(input.value);status.textContent='Link copied';}catch{input.focus();input.select();status.textContent='Select the link and copy it.';}});
  document.querySelectorAll('[data-share-saved-reel]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const id=button.dataset.shareSavedReel,{project}=await libraryRequest('/api/projects?id='+encodeURIComponent(id));showLinks({id,title:savedReels.find(p=>p.id===id)?.title||'Reel',trackCount:project?.data?.audioIds?.length||0});}catch(e){error=e.message;onChange();}finally{button.disabled=false;}});
  document.querySelectorAll("[data-view-analytics]").forEach(button=>button.onclick=()=>onAnalytics?.(button.dataset.viewAnalytics));

  const appearance=()=>data.appearance||={accent:'#1ed760',theme:'dark',description:''};
  document.querySelectorAll('[data-reel-profile]').forEach(input=>input.oninput=()=>{data.profile||={name:'',email:'',occupation:'',bio:''};data.profile[input.dataset.reelProfile]=input.value;changed();});
  document.querySelector('#reel-use-profile')?.addEventListener('click',run(async()=>{const result=await libraryRequest('/api/auth?action=me');data.profile={name:result.profile?.name||result.user?.firstName||'',email:result.user?.email||'',occupation:result.profile?.occupation||'',bio:data.profile?.bio||''};changed();onChange();}));
  document.querySelector('#reel-resume')?.addEventListener('change',event=>run(()=>attachResume(event.target.files[0]))());
  document.querySelector('#remove-reel-resume')?.addEventListener('click',()=>{delete data.resumeId;delete data.resumeName;changed();onChange();});
  for(const [selector,key]of [['#reel-accent','accent'],['#reel-theme','theme'],['#reel-description','description']]){const input=document.querySelector(selector);if(input)input.oninput=()=>{appearance()[key]=input.value;changed();};}
  document.querySelector('#retry-reel-preview')?.addEventListener('click',()=>{autoKey='';autoError='';schedulePreview();});

  document.querySelectorAll('[data-edit-reel-audio]').forEach(button=>button.onclick=async()=>{
   const id=button.dataset.editReelAudio,title=titleFor(id);busy=true;onChange();
   try{const asset=await audioLibrary.edit(id,{reel:true});if(asset){data.audioIds=data.audioIds.map(value=>value===id?asset.id:value);data.trackTitles||={};data.trackTitles[asset.id]=title;delete data.trackTitles[id];if(data.trackColors?.[id]){data.trackColors[asset.id]=data.trackColors[id];delete data.trackColors[id];}changed();notice='Edited track saved to Audio Library and applied to this reel. Publish to update your shared reel.';}}
   catch(e){error=e.message;}finally{busy=false;onChange();}
  });

  document.querySelector("#new-saved-reel")?.addEventListener("click",()=>onCreate?.());
  document.querySelectorAll("[data-edit-reel]").forEach(button=>button.onclick=()=>onEdit?.(button.dataset.editReel));
  document.querySelectorAll("[data-stop-reel]").forEach(button=>button.onclick=run(async()=>{const id=button.dataset.stopReel;await confirmDialog({title:"Stop sharing this reel?",message:"All of this reel’s share links and embeds will stop working. Already loaded audio may keep playing briefly.",confirmLabel:"Stop sharing",onConfirm:async()=>{publicationEpoch++;await post("revoke",{id});if(active?.id===id){publication=null;links=[];linksLoadedFor=null;}notice="Sharing stopped. Publish again, then create new share links.";await loadReels();}});}));
  if(account.user&&!reelsLoaded&&!reelsLoading&&!busy)loadReels();
  const title=document.querySelector('#reel-title');if(title)title.oninput=()=>{data.title=title.value;changed();const label=document.querySelector('.page-breadcrumb b');if(label)label.textContent=data.title || 'Untitled reel';};
  document.querySelector('#save-reel')?.addEventListener('click',run(save));

  document.querySelector('#publish-reel')?.addEventListener('click',run(()=>prepare(true)));
  document.querySelector('#share-reel')?.addEventListener('click',()=>showLinks());
  document.querySelector('#view-reel-analytics')?.addEventListener('click',()=>onAnalytics?.(active.id));

  document.querySelector('#reel-upload')?.addEventListener('change',event=>uploadFiles([...event.target.files]));
  document.querySelector('#retry-reel-upload')?.addEventListener('click',()=>uploadFiles(pendingUploads));
  document.querySelector('#cancel-reel-upload')?.addEventListener('click',()=>audioLibrary.cancelUpload());
  document.querySelector('#reel-library')?.addEventListener('click',run(async()=>attach(await audioLibrary.pick())));
  document.querySelectorAll('[data-remove-reel-audio]').forEach(button=>button.onclick=()=>{data.audioIds=data.audioIds.filter(id=>id!==button.dataset.removeReelAudio);delete data.trackTitles?.[button.dataset.removeReelAudio];changed();onChange();});
  document.querySelectorAll('[data-reel-title]').forEach(input=>input.oninput=()=>{data.trackTitles||={};data.trackTitles[input.dataset.reelTitle]=input.value;changed();});
  for(const dir of ['up','down'])document.querySelectorAll(`[data-reel-${dir}]`).forEach(button=>button.onclick=()=>{const i=Number(button.dataset[dir==='up'?'reelUp':'reelDown']),j=i+(dir==='up'?-1:1);[data.audioIds[i],data.audioIds[j]]=[data.audioIds[j],data.audioIds[i]];changed();onChange();});
  renderPreview();schedulePreview();
  if(account.user&&active&&publicationLoaded!==active.id){const id=active.id,epoch=publicationEpoch;publicationLoaded=id;libraryRequest(`/api/reels?id=${id}`).then(async result=>{if(active?.id!==id||epoch!==publicationEpoch)return;publication=result.publication;onChange();}).catch(e=>{if(active?.id===id&&epoch===publicationEpoch){error=e.message;onChange();}});}
  if(account.user&&active&&publication?.published&&linksLoadedFor!==active.id){const id=active.id;linksLoadedFor=id;libraryRequest(`/api/reels?action=links&id=${encodeURIComponent(id)}`).then(r=>{if(active?.id!==id)return;links=r.links;onChange();}).catch(()=>{});}
 }
 function reset(){clearTimeout(autoTimer);autoKey='';autoError='';trackCache.clear();localUrls.forEach(url=>URL.revokeObjectURL(url));localUrls=[];pendingUploads=[];publicationEpoch++;clearPreview();publication=null;publicationLoaded=null;error='';notice='';links=[];linksLoadedFor=null;}
 return {view,bind,save,dispose,activeId:()=>active?.id,showError(e){error=e.message;onChange();},async loadProject(id,isCurrent=()=>true){if(active?.id===id)return;const {project}=await libraryRequest("/api/projects?id="+encodeURIComponent(id));if(!isCurrent())return;if(project.data.type!=="reel")throw Error("This project is not a reel.");this.open(project);},isDirty:()=>dirty,isBusy:()=>busy||uploading,title:()=>data.title,newProject(){if(dirty)localStorage.setItem(key+':backup',JSON.stringify({data,active,dirty}));reset();data=blank();active=null;dirty=false;persist();},open(project){reset();data=project.data;active={id:project.id,revision:project.revision};dirty=false;persist();},async restore(){await audioLibrary.load();onChange();}};
}
