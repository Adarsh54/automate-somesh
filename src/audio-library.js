import {libraryPreviewMarkup,bindLibraryPreview} from './library-preview-player.js';
import {editAudio} from './audio-editor.js';
import {prepareLosslessUpload} from './lossless-upload.js';
import {audioUploadStatus,updateAudioUploadStatus} from './audio-upload-status.js';
import {uploadAudioFile,useMultipartUpload} from './audio-upload.js';
import {audioUploadButton} from "./audio-upload-button.js";
import {upload} from '@vercel/blob/client';
import {mediaType,MAX_MEDIA_BYTES} from './media-policy.js';
import {collectionPage} from './collection-page.js';
import {confirmDialog} from './confirm-dialog.js';
export async function libraryRequest(url,options) {
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(response.status===401?'Sign in again to access your saved files.':response.status===409?'This project changed elsewhere. Reopen it before saving again.':'Could not save or load your data. Please try again.');
 return response.json();
}
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('cuestamp-audio-library',3);req.onupgradeneeded=()=>{for(const name of ['files','uploadState','uploadFiles'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'localId'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function localOperation(mode,fn,storeName='files'){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,mode),request=fn(tx.objectStore(storeName));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function persistUploadState({localId,reservation,uploaded,assetId}){await localOperation('readwrite',store=>store.put({localId,reservation,uploaded,assetId}),'uploadState');}
export function createAudioLibrary({account,esc,onChange,onUseInCue,request=libraryRequest,uploadFile=upload,prepareUpload=prepareLosslessUpload}) {
 const post=(url,data)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const scope=account.user?.id || 'guest',known=new WeakMap(),stored=new WeakSet();
 let notice='',local=[],remote=[],loaded=false,loading=false,error='',progress='',uploading=false,loadPromise=null,uploadController=null,uploadDetail=null;
 const preferencesKey=`cuestamp-audio-library:${scope}:preferences`;
 let preferences={};try{preferences=JSON.parse(localStorage.getItem(preferencesKey)) || {};}catch{}
 let previewFile=null;
 let selected=null,previewUrl='',previewLoading=false,previewVersion=0,previewError='',libraryQuery='';
 const labelFor=a=>preferences[a.id]?.title || a.filename.replace(/\.[^.]+$/,'');
 function remember(id,patch){
  const next={...preferences,[id]:{...preferences[id],...patch}};
  localStorage.setItem(preferencesKey,JSON.stringify(next));preferences=next;
 }
 const visibleEntries=()=>entries().filter(a=>!preferences[a.id]?.removed);

 function showProgress(text,percentage=null,filename=''){progress=text;uploadDetail={text,percentage,filename};if(!updateAudioUploadStatus(uploadDetail))onChange();}
 function progressView(cancelAttribute){return progress?audioUploadStatus(uploadDetail,Boolean(uploadController),cancelAttribute,esc):'';}
 const entries=()=>{const items=new Map(remote.filter(a=>!a.superseded_by).map(a=>[a.id,{id:a.id,filename:a.filename,size:Number(a.size),saved:true,sourceId:a.source_id}]));for(const a of local.filter(a=>!remote.some(r=>r.id===a.assetId)))items.set(a.assetId || a.localId,{id:a.assetId || a.localId,filename:a.file.name,size:a.file.size,saved:Boolean(a.assetId)});return [...items.values()];};
 async function load(){if(loadPromise)return loadPromise;loading=true;error='';notice='';onChange();loadPromise=(async()=>{try{const [files,states]=await Promise.all([localOperation('readonly',store=>store.getAll()),localOperation('readonly',store=>store.getAll(),'uploadState')]);const stateById=new Map(states.map(state=>[state.localId,state]));local=files.filter(a=>a.scope===scope).map(a=>({...a,...stateById.get(a.localId)}));if(account.user)remote=(await request('/api/media?action=list')).assets;loaded=true;}catch(e){error=e.message || 'Could not load your audio library.';}finally{loading=false;loadPromise=null;onChange();}})();return loadPromise;}

 async function add(file,options){try{return await addFile(file,options);}catch(e){error=e.message;throw e;}finally{progress='';onChange();}}
 async function addFile(file,{onStaged=()=>{}}={}){
  if(!mediaType(file.name)?.startsWith('audio/') || !file.size || file.size>MAX_MEDIA_BYTES)throw new Error('Choose an audio file up to 2 GB (WAV, MP3, M4A, AAC, AIFF, FLAC, OGG or Opus).');
  showProgress('Preparing upload…',null,file.name);
  if(!loaded)await load();
  let item=known.get(file);
  if(!item){item={localId:crypto.randomUUID(),scope,file};local.push(item);known.set(file,item);await onStaged({id:item.localId,filename:file.name});onChange();}
  else await onStaged({id:item.assetId || item.localId,filename:file.name});
  if(!stored.has(file)&&!item.assetId){await localOperation('readwrite',store=>store.put({localId:item.localId,scope:item.scope,file}));stored.add(file);}
  if(account.user && !item.assetId){
   let transfer=file;
   if(!item.uploaded){
    const cached=await localOperation('readonly',store=>store.get(item.localId),'uploadFiles');
    if(cached)transfer=cached.file;
    else if(!item.reservation){
     const controller=new AbortController();uploadController=controller;onChange();
     try{
      transfer=await prepareUpload(file,{signal:controller.signal,onProgress:percentage=>showProgress('Compressing losslessly…',percentage,file.name)});
      controller.signal.throwIfAborted();
      if(transfer!==file){
       try{await localOperation('readwrite',store=>store.put({localId:item.localId,file:transfer}),'uploadFiles');}
       catch{transfer=file;} // No reservation yet: safely use the original if local storage is full.
      }
      controller.signal.throwIfAborted();
     }finally{uploadController=null;onChange();}
    }
    if(item.reservation?.size!=null&&transfer.size!==Number(item.reservation.size))throw Error('Prepared audio is unavailable. Please upload the original file again.');
   }
   showProgress('Starting upload…',null,file.name);
   item.reservation ??= (await post('/api/media?action=reserve',{filename:transfer.name,size:transfer.size})).asset;
   await persistUploadState(item);
   const asset=item.reservation;
   if(!item.uploaded){await uploadAudioFile(uploadFile,asset.pathname,transfer,{access:'private',handleUploadUrl:'/api/media',clientPayload:asset.id,contentType:asset.contentType,multipart:useMultipartUpload(transfer)},{onController:controller=>{uploadController=controller;onChange();},onProgress:({percentage})=>{const value=Math.floor(percentage);if(uploadDetail?.percentage!==value){showProgress('Uploading',value,file.name);}}});item.uploaded=true;await persistUploadState(item);}
   showProgress('Finishing upload…',100,file.name);
   await post('/api/media?action=complete',{id:asset.id});item.assetId=asset.id;
   await persistUploadState(item);
   await localOperation('readwrite',store=>store.delete(item.localId),'uploadFiles').catch(()=>{});
  }
  const id=item.assetId || item.localId;
  if(preferences[id]?.removed)remember(id,{removed:false});
  progress='';onChange();return {id,assetId:item.assetId,filename:file.name};
 }
 async function fileFor(id){if(!loaded)await load();const item=local.find(a=>(a.assetId || a.localId)===id);if(item){known.set(item.file,item);return item.file;}const info=await request('/api/media?id='+encodeURIComponent(id));const res=await fetch(info.url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15*60*1000)});if(!res.ok)throw new Error('Could not download this audio file. Try again.');const blob=await res.blob();if(blob.size!==Number(info.size))throw new Error('Audio download was incomplete. Try again.');const file=new File([blob],info.filename,{type:info.contentType});known.set(file,{assetId:id,file,scope,localId:crypto.randomUUID()});return file;}
 async function addMany(files,options){if(uploading)throw new Error('Wait for your audio upload to finish.');uploading=true;error='';notice='';onChange();const result=[];try{for(const file of files)result.push(await add(file,options));notice=result.length===1?`${result[0].filename} is ready.`:`${result.length} audio files are ready.`;return result;}catch(e){error=e.message;throw e;}finally{uploading=false;progress='';onChange();}}
 async function selectPreview(id){
  if(selected===id && previewUrl)return;
  const version=++previewVersion;
  document.querySelector('#track-preview')?.pause();
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  selected=id;previewFile=null;previewUrl='';previewLoading=true;previewError='';onChange();
  try {
   const file=await fileFor(id);
   if(version===previewVersion){previewFile=file;previewUrl=URL.createObjectURL(file);}
  }catch(e){if(version===previewVersion)previewError=e.message;}
  finally{if(version===previewVersion){previewLoading=false;onChange();}}
 }
 function disposePreview(){
  previewVersion++;document.querySelector('#track-preview')?.pause();
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewFile=null;previewUrl='';selected=null;previewLoading=false;
 }
 async function remove(id){
  const item=entries().find(a=>a.id===id);if(!item)return;
  if(!await confirmDialog({title:'Remove from Audio Library?',message:`Remove “${labelFor(item)}” from this library on this device? Existing cue sheets and reels keep their audio.`,confirmLabel:'Remove'}))return;
  try{remember(id,{removed:true});if(selected===id)disposePreview();error='';notice='';onChange();}
  catch{error='Could not save this change. Please try again.';onChange();}
 }
 async function importLegacy({id,file,assetId,title}){
  if(!loaded)await load();
  let item=entries().find(a=>a.id===id || (assetId && a.id===assetId));
  if(!item && file){
   const record={localId:id || crypto.randomUUID(),scope,file,...(assetId?{assetId}:{})};
   await localOperation('readwrite',store=>store.put(record));local.push(record);known.set(file,record);
   item={id:record.assetId || record.localId};
  }
  if(item && title && !preferences[item.id]?.title)remember(item.id,{title});
  onChange();return item?.id;
 }
 function view(){
  const all=visibleEntries(),q=libraryQuery.trim().toLowerCase();
  const items=q?all.filter(a=>labelFor(a).toLowerCase().includes(q) || a.filename.toLowerCase().includes(q)):all;
  const active=items.find(a=>a.id===selected);
  const librarySearch=all.length?`<label class="project-search-field library-search">Search<input type="search" id="library-search" placeholder="Search audio files" value="${esc(libraryQuery)}"></label>`:'';
  const rows=items.map(a=>`<div class="track-row collection-row ${account.user&&!a.saved?'library-track-unsaved':''}"><div class="library-track-main"><button class="track ${a.id===selected?'selected':''}" data-library-preview="${esc(a.id)}" draggable="true" aria-pressed="${a.id===selected}" title="Select to preview, or drag onto Add Cue Sheet"><span class="track-icon" aria-hidden="true">♪</span><span><strong>${esc(labelFor(a))}</strong><small>${esc(a.filename)} · ${a.size<1024*1024?`${Math.ceil(a.size/1024)} KB`:`${(a.size/1024/1024).toFixed(1)} MB`} · ${a.sourceId?'Reel · Linked to original':a.saved?'Saved to your account':'On this device'}</small></span></button>${account.user&&!a.saved?`<button type="button" class="library-upload-status" data-library-sync="${esc(a.id)}" aria-label="Retry upload for ${esc(labelFor(a))}" ${uploading?'disabled':''}><span aria-hidden="true">⚠</span><span class="upload-status-label">Not uploaded</span><span class="upload-retry-label">Retry upload</span></button>`:''}</div><div class="track-actions">${a.saved?`<button data-library-edit="${esc(a.id)}">Edit</button>`:''}<button type="button" class="danger library-remove" data-library-remove="${esc(a.id)}" aria-label="Remove ${esc(labelFor(a))} from library" title="Remove from library"><span aria-hidden="true">−</span></button></div></div>`).join('');
  const preview=active?`<section class="panel editor"><div class="section-title"><h2>Audio preview</h2><button type="button" class="danger library-remove" data-library-remove="${esc(active.id)}" aria-label="Remove ${esc(labelFor(active))} from library" title="Remove from library"><span aria-hidden="true">−</span></button></div><input id="library-source-label" aria-label="Audio title" maxlength="300" value="${esc(labelFor(active))}">${previewLoading?'<p role="status">Loading audio…</p>':previewUrl?`${libraryPreviewMarkup()}<audio id="track-preview" hidden preload="metadata" aria-label="Preview ${esc(labelFor(active))}" src="${previewUrl}"></audio>`:''}<p id="preview-status" class="muted" role="status">${esc(previewError)}</p>${previewError?'<button data-library-preview-retry>Retry preview</button>':''}<button data-library-use="${esc(active.id)}">Add to cue sheet</button></section>`:'<div class="panel empty"><p>Select audio to preview it. Press Play on the timeline to listen.</p></div>';
  const libraryEmpty=q?'<div class="empty"><h3>No matching audio</h3><p>Try a different filename or label.</p></div>':'<div class="empty"><span>♫</span><h3>No audio files yet</h3><p>Upload multiple audio files to build your library.</p></div>';
  return collectionPage({title:'Audio Library',description:'Keep your audio here for later. Select a file to preview it, or drag it onto Add Cue Sheet.',action:audioUploadButton({id:'library-upload',disabled:uploading,attributes:'data-library-upload'}),summary:`${items.length} of ${all.length} audio file${all.length===1?'':'s'}`,body:`${!account.user?'<p class="muted">Audio is saved in this browser for your next visit. Clearing site data removes it.</p>':''}${error?`<div class="project-error" role="alert"><span>${esc(error)}</span><button data-library-retry>Try again</button></div>`:''}${notice?`<p class="notice" role="status">${esc(notice)}</p>`:''}${progressView('data-cancel-audio-upload')}${loading?'<p class="muted" role="status">Loading audio…</p>':''}${librarySearch}${rows?`<div class="library-grid"><div class="track-list">${rows}</div>${preview}</div>`:libraryEmpty}<details class="disclosure"><summary>File support & storage</summary><p class="muted">WAV, MP3, M4A, AAC, AIFF, FLAC, OGG, and Opus. Files must be under 2 GB. Cue detection supports up to 60 minutes per file. Signed-in uploads are saved privately to your account; guest audio stays in this browser. Removing a library entry keeps audio already used in cue sheets and reels.</p></details>`});
 }
 async function edit(id,{reel=false}={}){
  if(!account.user)throw Error('Sign in to save audio edits while preserving the original.');
  if(!entries().find(a=>a.id===id)?.saved){const uploaded=await add(await fileFor(id));id=uploaded.id;}
  const asset=await editAudio({id,esc,reel,localSource:sourceId=>local.find(a=>(a.assetId||a.localId)===sourceId)?.file});
  if(asset){if(preferences[id]?.title)remember(asset.id,{title:preferences[id].title});disposePreview();await load();}
  return asset;
 }
 function bind(){
  bindLibraryPreview(document.querySelector('#track-preview'),previewFile);
  const librarySearchInput=document.querySelector('#library-search');
  if(librarySearchInput)librarySearchInput.oninput=()=>{
   const pos=librarySearchInput.selectionStart;
   libraryQuery=librarySearchInput.value;onChange();
   const el=document.querySelector('#library-search');
   if(el){el.focus();el.setSelectionRange(pos,pos);}
  };
  document.querySelectorAll('[data-library-edit]').forEach(button=>button.onclick=async()=>{try{await edit(button.dataset.libraryEdit);}catch(e){error=e.message;onChange();}});

  document.querySelector('[data-cancel-audio-upload]')?.addEventListener('click',cancelUpload);
  const input=document.querySelector('[data-library-upload]');if(input)input.onchange=()=>addMany([...input.files]).catch(()=>{});
  document.querySelector('[data-library-retry]')?.addEventListener('click',load);
  document.querySelectorAll('[data-library-sync]').forEach(button=>button.onclick=async()=>{try{await addMany([await fileFor(button.dataset.librarySync)]);}catch(e){error=e.message;onChange();}});
  document.querySelectorAll('[data-library-preview]').forEach(button=>{
   button.onclick=()=>selectPreview(button.dataset.libraryPreview);
   button.ondragstart=event=>{if(uploading){event.preventDefault();return;}event.dataTransfer.setData('application/x-cuestamp-library-track',button.dataset.libraryPreview);event.dataTransfer.effectAllowed='copy';};
  });
  document.querySelector('[data-library-preview-retry]')?.addEventListener('click',()=>selectPreview(selected));
  document.querySelectorAll('[data-library-remove]').forEach(button=>button.onclick=()=>remove(button.dataset.libraryRemove));
  const title=document.querySelector('#library-source-label');if(title)title.oninput=()=>{
   try{remember(selected,{title:title.value});document.querySelectorAll('[data-library-preview]').forEach(button=>{if(button.dataset.libraryPreview===selected)button.querySelector('strong').textContent=title.value || entries().find(a=>a.id===selected).filename;});}
   catch{document.querySelector('#preview-status').textContent='This label could not be saved in your browser.';}
  };
  document.querySelectorAll('[data-library-use]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await onUseInCue?.(button.dataset.libraryUse);}catch(e){error=e.message;onChange();}finally{button.disabled=false;}});
  const player=document.querySelector('#track-preview');if(player)player.onerror=()=>{document.querySelector('#preview-status').textContent='This browser could not play the file. Try a supported audio format.';};
 }
 async function pick({single=false}={}){
  await load();
  return new Promise(resolve=>{
   const items=visibleEntries(),selection=new Set();let result=[];
   const dialog=document.createElement('dialog');
   dialog.className='resume-workspace audio-picker';
   dialog.setAttribute('aria-labelledby','audio-picker-heading');
   dialog.setAttribute('aria-describedby','audio-picker-description');
   dialog.innerHTML=`<div class="audio-picker-header"><h2 id="audio-picker-heading">Add audio from your library</h2><p id="audio-picker-description" class="muted">${single?'Select one full score for this cue sheet.':'Select the tracks you want to use in this project.'}</p>${items.length?'<input type="search" data-audio-search placeholder="Search audio files…" aria-label="Search audio files">':''}</div>${error?`<p role="alert">${esc(error)}</p>`:''}<div class="audio-picker-list" role="group" aria-label="Audio files"></div><div class="audio-picker-footer"><span class="muted" data-selection-count role="status">No tracks selected</span><div class="button-row"><button data-cancel>Cancel</button><button class="primary" data-choose disabled>Add audio</button></div></div>`;
   const list=dialog.querySelector('.audio-picker-list'),add=dialog.querySelector('[data-choose]');
   const updateSelection=()=>{const count=selection.size;add.disabled=!count;add.textContent=count?`Add audio (${count})`:'Add audio';dialog.querySelector('[data-selection-count]').textContent=count?`${count} track${count===1?'':'s'} selected`:'No tracks selected';};
   const renderRows=()=>{
    const query=dialog.querySelector('[data-audio-search]')?.value.toLowerCase().trim() || '';
    const visible=items.filter(a=>a.filename.toLowerCase().includes(query));
    list.innerHTML=visible.length?visible.map(a=>`<button type="button" class="audio-choice" data-audio-id="${esc(a.id)}" aria-pressed="${selection.has(a.id)}"><span class="audio-choice-icon" aria-hidden="true">♫</span><span class="audio-choice-info"><strong>${esc(a.filename)}</strong><small>${a.size<1024*1024?`${Math.ceil(a.size/1024)} KB`:`${(a.size/1024/1024).toFixed(1)} MB`} · ${a.saved?'Saved to your account':'On this device'}</small></span><span class="audio-choice-check" aria-hidden="true">${selection.has(a.id)?'✓':'+'}</span></button>`).join(''):`<div class="empty"><h3>${items.length?'No matching audio':'Your audio library is empty'}</h3><p>${items.length?'Try a different filename.':'Upload audio in your project or on the Audio Library page, then select it here.'}</p></div>`;
   };
   list.onclick=event=>{const button=event.target.closest('[data-audio-id]');if(!button)return;const id=button.dataset.audioId;if(selection.has(id))selection.delete(id);else{if(single)selection.clear();selection.add(id);}button.setAttribute('aria-pressed',String(selection.has(id)));button.querySelector('.audio-choice-check').textContent=selection.has(id)?'✓':'+';if(single)renderRows();updateSelection();};
   dialog.querySelector('[data-audio-search]')?.addEventListener('input',renderRows);
   add.onclick=()=>{result=[...selection];dialog.close();};
   dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
   dialog.onclose=()=>{dialog.remove();resolve(result);};
   renderRows();document.body.append(dialog);dialog.showModal();
   dialog.querySelector('[data-audio-search]')?.focus();
  });
 }

 function cancelUpload(){uploadController?.abort(new Error('Upload canceled. Your file is kept on this device so you can retry.'));}
 return {edit,importLegacy,disposePreview,labelFor,hasLocalFile:id=>local.some(a=>(a.assetId || a.localId)===id),progressView,cancelUpload,uploadStatus:()=>progress,canCancelUpload:()=>Boolean(uploadController),load,add,addMany,fileFor,entries,view,bind,pick,isBusy:()=>uploading};
}
