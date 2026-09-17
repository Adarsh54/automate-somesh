import {audioUploadStatus,updateAudioUploadStatus} from './audio-upload-status.js';
import {uploadAudioFile,useMultipartUpload} from './audio-upload.js';
import {audioUploadButton} from "./audio-upload-button.js";
import {upload} from '@vercel/blob/client';
import {mediaType,MAX_MEDIA_BYTES} from './media-policy.js';
import {collectionPage,collectionRow} from './collection-page.js';
export async function libraryRequest(url,options) {
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(response.status===401?'Sign in again to access your saved files.':response.status===409?'This project changed elsewhere. Reopen it before saving again.':'Could not save or load your data. Please try again.');
 return response.json();
}
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('cuestamp-audio-library',2);req.onupgradeneeded=()=>{for(const name of ['files','uploadState'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'localId'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function localOperation(mode,fn,storeName='files'){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,mode),request=fn(tx.objectStore(storeName));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function persistUploadState({localId,reservation,uploaded,assetId}){await localOperation('readwrite',store=>store.put({localId,reservation,uploaded,assetId}),'uploadState');}
export function createAudioLibrary({account,esc,onChange,request=libraryRequest,uploadFile=upload}) {
 const post=(url,data)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const scope=account.user?.id || 'guest',known=new WeakMap(),stored=new WeakSet();
 let local=[],remote=[],loaded=false,loading=false,error='',progress='',uploading=false,loadPromise=null,uploadController=null,uploadDetail=null;
 function showProgress(text,percentage=null,filename=''){progress=text;uploadDetail={text,percentage,filename};if(!updateAudioUploadStatus(uploadDetail))onChange();}
 function progressView(cancelAttribute){return progress?audioUploadStatus(uploadDetail,Boolean(uploadController),cancelAttribute,esc):'';}
 const entries=()=>{const items=new Map(remote.map(a=>[a.id,{id:a.id,filename:a.filename,size:Number(a.size),saved:true}]));for(const a of local)items.set(a.assetId || a.localId,{id:a.assetId || a.localId,filename:a.file.name,size:a.file.size,saved:Boolean(a.assetId)});return [...items.values()];};
 async function load(){if(loadPromise)return loadPromise;loading=true;error='';onChange();loadPromise=(async()=>{try{const [files,states]=await Promise.all([localOperation('readonly',store=>store.getAll()),localOperation('readonly',store=>store.getAll(),'uploadState')]);const stateById=new Map(states.map(state=>[state.localId,state]));local=files.filter(a=>a.scope===scope).map(a=>({...a,...stateById.get(a.localId)}));if(account.user)remote=(await request('/api/media?action=list')).assets;loaded=true;}catch(e){error=e.message || 'Could not load your audio library.';}finally{loading=false;loadPromise=null;onChange();}})();return loadPromise;}

 async function add(file,options){try{return await addFile(file,options);}catch(e){error=e.message;throw e;}finally{progress='';onChange();}}
 async function addFile(file,{onStaged=()=>{}}={}){
  if(!mediaType(file.name)?.startsWith('audio/') || !file.size || file.size>MAX_MEDIA_BYTES)throw new Error('Choose an audio file up to 2 GB (WAV, MP3, M4A, AAC, AIFF, FLAC, OGG or Opus).');
  showProgress('Preparing upload…',null,file.name);
  if(!loaded)await load();
  let item=known.get(file);
  if(!item){item={localId:crypto.randomUUID(),scope,file};local.push(item);known.set(file,item);await onStaged({id:item.localId,filename:file.name});onChange();}
  else await onStaged({id:item.assetId || item.localId,filename:file.name});
  if(!stored.has(file)&&!item.assetId){await localOperation('readwrite',store=>store.put(item));stored.add(file);}
  if(account.user && !item.assetId){
   showProgress('Starting upload…',null,file.name);
   item.reservation ??= (await post('/api/media?action=reserve',{filename:file.name,size:file.size})).asset;
   await persistUploadState(item);
   const asset=item.reservation;
   if(!item.uploaded){await uploadAudioFile(uploadFile,asset.pathname,file,{access:'private',handleUploadUrl:'/api/media',clientPayload:asset.id,contentType:asset.contentType,multipart:useMultipartUpload(file)},{onController:controller=>{uploadController=controller;onChange();},onProgress:({percentage})=>{const value=Math.floor(percentage);if(uploadDetail?.percentage!==value){showProgress('Uploading',value,file.name);}}});item.uploaded=true;await persistUploadState(item);}
   showProgress('Finishing upload…',100,file.name);
   await post('/api/media?action=complete',{id:asset.id});item.assetId=asset.id;
   await persistUploadState(item);
  }
  progress='';onChange();return {id:item.assetId || item.localId,assetId:item.assetId,filename:file.name};
 }
 async function fileFor(id){if(!loaded)await load();const item=local.find(a=>(a.assetId || a.localId)===id);if(item){known.set(item.file,item);return item.file;}const info=await request('/api/media?id='+encodeURIComponent(id));const res=await fetch(info.url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15*60*1000)});if(!res.ok)throw new Error('Could not download this audio file. Try again.');const blob=await res.blob();if(blob.size!==Number(info.size))throw new Error('Audio download was incomplete. Try again.');const file=new File([blob],info.filename,{type:info.contentType});known.set(file,{assetId:id,file,scope,localId:crypto.randomUUID()});return file;}
 async function addMany(files,options){if(uploading)throw new Error('Wait for your audio upload to finish.');uploading=true;error='';onChange();const result=[];try{for(const file of files)result.push(await add(file,options));return result;}catch(e){error=e.message;throw e;}finally{uploading=false;progress='';onChange();}}
 function view(){const rows=entries().map(a=>collectionRow({title:esc(a.filename),detail:`${a.size<1024*1024?`${Math.ceil(a.size/1024)} KB`:`${(a.size/1024/1024).toFixed(1)} MB`} · ${a.saved?'Saved to your account':'On this device'}`,icon:'♫',actions:`<button data-library-preview="${esc(a.id)}">Play</button>${account.user&&!a.saved?`<button data-library-sync="${esc(a.id)}">Retry upload</button>`:''}`})).join('');return collectionPage({title:'Audio Files',description:'One audio library for your cues and reels.',action:audioUploadButton({id:'library-upload',disabled:uploading,attributes:'data-library-upload'}),summary:`${entries().length} audio file${entries().length===1?'':'s'}`,body:`${!account.user?'<p class="muted">Guest audio stays on this device. Sign in to keep an account library.</p>':''}${error?`<div class="project-error" role="alert"><span>${esc(error)}</span><button data-library-retry>Try again</button></div>`:''}${progressView('data-cancel-audio-upload')}${loading?'<p class="empty" role="status">Loading audio…</p>':rows?`<div class="collection-list">${rows}</div>`:'<div class="empty"><span>♫</span><h3>No audio files yet</h3><p>Upload here, in a cue workspace, or in a reel draft.</p></div>'}`});}
 function bind(){document.querySelector('[data-cancel-audio-upload]')?.addEventListener('click',cancelUpload);const input=document.querySelector('[data-library-upload]');if(input)input.onchange=()=>addMany([...input.files]).catch(()=>{});document.querySelector('[data-library-retry]')?.addEventListener('click',load);document.querySelectorAll('[data-library-sync]').forEach(button=>button.onclick=async()=>{try{await addMany([await fileFor(button.dataset.librarySync)]);}catch(e){error=e.message;onChange();}});document.querySelectorAll('[data-library-preview]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const file=await fileFor(button.dataset.libraryPreview),url=URL.createObjectURL(file),dialog=document.createElement('dialog');dialog.className='resume-workspace';dialog.innerHTML='<h2>Audio preview</h2><audio controls></audio><div class="button-row"><button>Close</button></div>';dialog.querySelector('audio').src=url;dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>{URL.revokeObjectURL(url);dialog.remove();};document.body.append(dialog);dialog.showModal();}catch(e){error=e.message;onChange();}finally{button.disabled=false;}});}
 async function pick(){
  await load();
  return new Promise(resolve=>{
   const items=entries(),selection=new Set();let result=[];
   const dialog=document.createElement('dialog');
   dialog.className='resume-workspace audio-picker';
   dialog.setAttribute('aria-labelledby','audio-picker-heading');
   dialog.setAttribute('aria-describedby','audio-picker-description');
   dialog.innerHTML=`<div class="audio-picker-header"><h2 id="audio-picker-heading">Add audio from your library</h2><p id="audio-picker-description" class="muted">Select the tracks you want to use in this project.</p>${items.length?'<input type="search" data-audio-search placeholder="Search audio files…" aria-label="Search audio files">':''}</div>${error?`<p role="alert">${esc(error)}</p>`:''}<div class="audio-picker-list" role="group" aria-label="Audio files"></div><div class="audio-picker-footer"><span class="muted" data-selection-count role="status">No tracks selected</span><div class="button-row"><button data-cancel>Cancel</button><button class="primary" data-choose disabled>Add audio</button></div></div>`;
   const list=dialog.querySelector('.audio-picker-list'),add=dialog.querySelector('[data-choose]');
   const updateSelection=()=>{const count=selection.size;add.disabled=!count;add.textContent=count?`Add audio (${count})`:'Add audio';dialog.querySelector('[data-selection-count]').textContent=count?`${count} track${count===1?'':'s'} selected`:'No tracks selected';};
   const renderRows=()=>{
    const query=dialog.querySelector('[data-audio-search]')?.value.toLowerCase().trim() || '';
    const visible=items.filter(a=>a.filename.toLowerCase().includes(query));
    list.innerHTML=visible.length?visible.map(a=>`<button type="button" class="audio-choice" data-audio-id="${esc(a.id)}" aria-pressed="${selection.has(a.id)}"><span class="audio-choice-icon" aria-hidden="true">♫</span><span class="audio-choice-info"><strong>${esc(a.filename)}</strong><small>${a.size<1024*1024?`${Math.ceil(a.size/1024)} KB`:`${(a.size/1024/1024).toFixed(1)} MB`} · ${a.saved?'Saved to your account':'On this device'}</small></span><span class="audio-choice-check" aria-hidden="true">${selection.has(a.id)?'✓':'+'}</span></button>`).join(''):`<div class="empty"><h3>${items.length?'No matching audio':'Your audio library is empty'}</h3><p>${items.length?'Try a different filename.':'Upload audio in your project or on the Audio Files page, then select it here.'}</p></div>`;
   };
   list.onclick=event=>{const button=event.target.closest('[data-audio-id]');if(!button)return;const id=button.dataset.audioId;selection.has(id)?selection.delete(id):selection.add(id);button.setAttribute('aria-pressed',String(selection.has(id)));button.querySelector('.audio-choice-check').textContent=selection.has(id)?'✓':'+';updateSelection();};
   dialog.querySelector('[data-audio-search]')?.addEventListener('input',renderRows);
   add.onclick=()=>{result=[...selection];dialog.close();};
   dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
   dialog.onclose=()=>{dialog.remove();resolve(result);};
   renderRows();document.body.append(dialog);dialog.showModal();
   dialog.querySelector('[data-audio-search]')?.focus();
  });
 }

 function cancelUpload(){uploadController?.abort(new Error('Upload canceled. Your file is kept on this device so you can retry.'));}
 return {progressView,cancelUpload,uploadStatus:()=>progress,canCancelUpload:()=>Boolean(uploadController),load,add,addMany,fileFor,entries,view,bind,pick,isBusy:()=>uploading};
}
