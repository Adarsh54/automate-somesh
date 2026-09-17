import {prepareReelTrack} from './reel-preparation.js';
const filename=title=>(String(title).replace(/[^\p{L}\p{N} ._-]/gu,'').trim().slice(0,100)||'Reel');
function saveFile(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function openReelDownloads(project,esc){
 const ids=project.data.audioIds||[],dialog=document.createElement('dialog');
 dialog.className='resume-workspace reel-download-dialog';dialog.setAttribute('aria-labelledby','reel-download-title');
 dialog.innerHTML=`<h2 id="reel-download-title">Download ${esc(project.title)}</h2><p class="muted">${ids.length===1?'Download your track as an MP3.':'Download individual MP3s or the complete reel as a ZIP.'}</p><div data-tracks></div><p role="status"></p><p role="alert"></p><div class="button-row"><button data-close>Close</button>${ids.length?`<button class="primary" data-all disabled>${ids.length===1?'Download MP3':'Download reel ZIP'}</button>`:''}</div>`;
 document.body.append(dialog);dialog.showModal();let busy=false,controller=null;
 const status=dialog.querySelector('[role=status]'),error=dialog.querySelector('[role=alert]'),close=dialog.querySelector('[data-close]');
 close.onclick=()=>{controller?.abort();dialog.close();};dialog.addEventListener('cancel',()=>controller?.abort());dialog.onclose=()=>dialog.remove();
 if(!ids.length){status.textContent='This reel has no tracks yet. Open Edit to add audio.';return;}
 let names=new Map();
 try{const response=await fetch('/api/media?action=list',{signal:AbortSignal.timeout(30000)});if(response.ok){const {assets}=await response.json();names=new Map(assets.map(a=>[a.id,a.filename.replace(/\.[^.]+$/,'')]));}}catch{}
 if(!dialog.open)return;
 const tracks=ids.map(id=>({id,title:project.data.trackTitles?.[id]||names.get(id)||'Track'}));
 dialog.querySelector('[data-tracks]').innerHTML=tracks.map((t,i)=>`<div class="reel-download-row"><span>${esc(t.title)}</span><button data-track="${i}" aria-label="Download ${esc(t.title)} as MP3">MP3 ↓</button></div>`).join('');
 async function download(selected,zip){
  if(busy)return;busy=true;controller=new AbortController();error.textContent='';close.textContent='Cancel';dialog.querySelectorAll('[data-track],[data-all]').forEach(b=>b.disabled=true);
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15*60*1000)]);
  try{
   const archive=zip?new (await import('jszip')).default():null;let bytes=0;
   for(const [i,track] of selected.entries()){
    status.textContent=`Preparing ${i+1} of ${selected.length}: ${track.title}`;
    await prepareReelTrack(async(action,body)=>{
     const response=await fetch(`/api/reels?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
     const data=await response.json();if(!response.ok)throw Error(data.error||'Could not prepare the download.');return data;
    },track.id);
    status.textContent=`Downloading ${i+1} of ${selected.length}: ${track.title}`;
    const response=await fetch(`/api/reels?action=preview&id=${encodeURIComponent(track.id)}`,{signal});if(!response.ok)throw Error('Could not download this track. Please retry.');
    const blob=await response.blob();bytes+=blob.size;
    if(zip&&bytes>200*1024*1024)throw Error('This reel is too large for one ZIP. Use the individual MP3 buttons instead.');
    if(archive)archive.file(`${String(i+1).padStart(2,'0')} - ${filename(track.title)}.mp3`,blob);else saveFile(blob,filename(track.title)+'.mp3');
   }
   if(archive){status.textContent='Creating ZIP…';const blob=await archive.generateAsync({type:'blob',compression:'STORE'});signal.throwIfAborted();saveFile(blob,filename(project.title)+'.zip');}
   status.textContent='Download ready.';
  }catch(e){if(dialog.open){status.textContent='';error.textContent=e.name==='TimeoutError'?'Download timed out. Please retry.':e.message;}}
  finally{busy=false;close.textContent='Close';dialog.querySelectorAll('[data-track],[data-all]').forEach(b=>b.disabled=false);}
 }
 dialog.querySelectorAll('[data-track]').forEach(button=>button.onclick=()=>download([tracks[Number(button.dataset.track)]],false));
 dialog.querySelector('[data-all]').disabled=false;
 dialog.querySelector('[data-all]').onclick=()=>download(tracks,tracks.length>1);
}
