import {upload} from '@vercel/blob/client';
import {mediaType,MAX_MEDIA_BYTES} from './media-policy.js';
import {collectionPage,collectionRow} from './collection-page.js';
export async function libraryRequest(url,options) {
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(response.status===401?'Sign in again to access your saved files.':response.status===409?'This project changed elsewhere. Reopen it before saving again.':'Could not save or load your data. Please try again.');
 return response.json();
}
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('cuestamp-audio-library',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'localId'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function localOperation(mode,fn){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode),request=fn(tx.objectStore('files'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export function createAudioLibrary({account,esc,onChange,request=libraryRequest,uploadFile=upload}) {
 const post=(url,data)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const scope=account.user?.id || 'guest',known=new WeakMap();
 let local=[],remote=[],loaded=false,loading=false,error='',progress='',uploading=false,loadPromise=null;
 const entries=()=>{const items=new Map(remote.map(a=>[a.id,{id:a.id,filename:a.filename,size:Number(a.size),saved:true}]));for(const a of local)items.set(a.assetId || a.localId,{id:a.assetId || a.localId,filename:a.file.name,size:a.file.size,saved:Boolean(a.assetId)});return [...items.values()];};
 async function load(){if(loadPromise)return loadPromise;loading=true;error='';onChange();loadPromise=(async()=>{try{local=(await localOperation('readonly',store=>store.getAll())).filter(a=>a.scope===scope);if(account.user)remote=(await request('/api/media?action=list')).assets;loaded=true;}catch(e){error=e.message || 'Could not load your audio library.';}finally{loading=false;loadPromise=null;onChange();}})();return loadPromise;}

 async function add(file){try{return await addFile(file);}catch(e){error=e.message;throw e;}finally{progress='';onChange();}}
 async function addFile(file){
  if(!mediaType(file.name)?.startsWith('audio/') || !file.size || file.size>MAX_MEDIA_BYTES)throw new Error('Choose an audio file up to 2 GB (WAV, MP3, M4A, AAC, AIFF, FLAC, OGG or Opus).');
  if(!loaded)await load();
  let item=known.get(file);
  if(!item){item={localId:crypto.randomUUID(),scope,file};await localOperation('readwrite',store=>store.put(item));local.push(item);known.set(file,item);onChange();}
  if(account.user && !item.assetId){
   progress=`Uploading ${file.name}…`;onChange();
   item.reservation ??= (await post('/api/media?action=reserve',{filename:file.name,size:file.size})).asset;
   await localOperation('readwrite',store=>store.put(item));
   const asset=item.reservation;
   if(!item.uploaded){await uploadFile(asset.pathname,file,{access:'private',handleUploadUrl:'/api/media',clientPayload:asset.id,contentType:asset.contentType,multipart:true});item.uploaded=true;await localOperation('readwrite',store=>store.put(item));}
   await post('/api/media?action=complete',{id:asset.id});item.assetId=asset.id;
   await localOperation('readwrite',store=>store.put(item));
  }
  progress='';onChange();return {id:item.assetId || item.localId,assetId:item.assetId,filename:file.name};
 }
 async function fileFor(id){if(!loaded)await load();const item=local.find(a=>(a.assetId || a.localId)===id);if(item){known.set(item.file,item);return item.file;}const info=await request('/api/media?id='+encodeURIComponent(id));const res=await fetch(info.url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15*60*1000)});if(!res.ok)throw new Error('Could not download this audio file. Try again.');const blob=await res.blob();if(blob.size!==Number(info.size))throw new Error('Audio download was incomplete. Try again.');const file=new File([blob],info.filename,{type:info.contentType});known.set(file,{assetId:id,file,scope,localId:crypto.randomUUID()});return file;}
 async function addMany(files){if(uploading)throw new Error('Wait for your audio upload to finish.');uploading=true;error='';onChange();const result=[];try{for(const file of files)result.push(await add(file));return result;}catch(e){error=e.message;throw e;}finally{uploading=false;progress='';onChange();}}
 function view(){const rows=entries().map(a=>collectionRow({title:esc(a.filename),detail:`${a.size<1024*1024?`${Math.ceil(a.size/1024)} KB`:`${(a.size/1024/1024).toFixed(1)} MB`} · ${a.saved?'Saved to your account':'On this device'}`,icon:'♫',actions:`<button data-library-preview="${esc(a.id)}">Play</button>${account.user&&!a.saved?`<button data-library-sync="${esc(a.id)}">Retry upload</button>`:''}`})).join('');return collectionPage({title:'Audio Files Submitted',description:'One audio library for your cues and reels.',action:`<label class="button primary collection-create audio-upload">Upload audio<input type="file" data-library-upload accept="audio/*,.wav,.mp3,.m4a,.aac,.aif,.aiff,.flac,.ogg,.opus" multiple ${uploading?'disabled':''}></label>`,summary:`${entries().length} audio file${entries().length===1?'':'s'}`,body:`${!account.user?'<p class="muted">Guest audio stays on this device. Sign in to keep an account library.</p>':''}${error?`<div class="project-error" role="alert"><span>${esc(error)}</span><button data-library-retry>Try again</button></div>`:''}${progress?`<p role="status">${esc(progress)}</p>`:''}${loading?'<p class="empty" role="status">Loading audio…</p>':rows?`<div class="collection-list">${rows}</div>`:'<div class="empty"><span>♫</span><h3>No audio files yet</h3><p>Upload here, in a cue workspace, or in a reel draft.</p></div>'}`});}
 function bind(){const input=document.querySelector('[data-library-upload]');if(input)input.onchange=()=>addMany([...input.files]).catch(()=>{});document.querySelector('[data-library-retry]')?.addEventListener('click',load);document.querySelectorAll('[data-library-sync]').forEach(button=>button.onclick=async()=>{try{await addMany([await fileFor(button.dataset.librarySync)]);}catch(e){error=e.message;onChange();}});document.querySelectorAll('[data-library-preview]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const file=await fileFor(button.dataset.libraryPreview),url=URL.createObjectURL(file),dialog=document.createElement('dialog');dialog.className='resume-workspace';dialog.innerHTML='<h2>Audio preview</h2><audio controls></audio><div class="button-row"><button>Close</button></div>';dialog.querySelector('audio').src=url;dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>{URL.revokeObjectURL(url);dialog.remove();};document.body.append(dialog);dialog.showModal();}catch(e){error=e.message;onChange();}finally{button.disabled=false;}});}
 async function pick(){await load();return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='resume-workspace audio-picker';dialog.innerHTML=`<h2>Choose audio</h2>${error?`<p role="alert">${esc(error)}</p>`:''}${entries().length?entries().map(a=>`<label class="audio-choice"><input type="checkbox" value="${esc(a.id)}">${esc(a.filename)}</label>`).join(''):'<p>No audio yet. Upload a file to get started.</p>'}<div class="button-row"><button class="primary" data-choose>Add selected</button><button data-cancel>Cancel</button></div>`;let selected=[];dialog.querySelector('[data-choose]').onclick=()=>{selected=[...dialog.querySelectorAll('input:checked')].map(i=>i.value);dialog.close();};dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();resolve(selected);};document.body.append(dialog);dialog.showModal();});}
 return {load,add,addMany,fileFor,entries,view,bind,pick,isBusy:()=>uploading};
}
