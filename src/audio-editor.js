import {mountEditWaveform} from './audio-edit-waveform.js';
import {prepareReelTrack} from './reel-preparation.js';
import {localWaveform} from './reel-local-preview.js';
// Shared, non-destructive editor. Rendering uses the original recording on the server.
export async function editAudio({id,esc,reel=false,localSource}){
 const dialog=document.createElement('dialog');dialog.className='resume-workspace audio-edit-dialog';
 dialog.setAttribute('aria-label','Edit audio');
 dialog.innerHTML='<h2>Edit audio</h2><p role="status">Loading original audio…</p><button data-close>Cancel</button>';
 document.body.append(dialog);dialog.showModal();
 let result=null,busy=false,waveform;const controller=new AbortController();
 const done=new Promise(resolve=>{dialog.onclose=()=>{controller.abort();waveform?.destroy();dialog.querySelector('audio')?.pause();dialog.remove();resolve(result);};});
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.oncancel=event=>{if(busy)event.preventDefault();};
 try{
  const get=async id=>{const response=await fetch('/api/media?id='+encodeURIComponent(id),{signal:controller.signal});if(!response.ok)throw Error('Sign in and finish uploading this track before editing.');return response.json();};
  const current=await get(id),source=current.sourceId?await get(current.sourceId):current;
  if(!dialog.open)return done;
  const edit=current.edit||{start:0,end:'',fadeIn:0,fadeOut:0,normalize:false};
  dialog.innerHTML=`<h2>Edit audio</h2><p class="muted">${esc(current.filename)}</p><audio controls preload="metadata" src="${esc(source.url)}" aria-label="Original recording"></audio><form><section class="audio-edit-waveform"></section><div class="audio-edit-fields">${[['start','Snippet start (seconds)',edit.start],['end','Snippet end (seconds)',edit.end],['fadeIn','Fade in (seconds)',edit.fadeIn],['fadeOut','Fade out (seconds)',edit.fadeOut]].map(([name,label,value])=>`<label>${label}<input name="${name}" type="number" min="0" step="0.01" required value="${value}"></label>`).join('')}</div><label class="audio-edit-normalize"><input name="normalize" type="checkbox" ${edit.normalize?'checked':''}> Normalize peak volume</label><div class="audio-edit-target"><label for="audio-target-peak">Target peak (dBFS)</label><input id="audio-target-peak" name="targetPeakDb" type="number" min="-60" max="0" step="0.1" value="${edit.targetPeakDb??-1}" required><input data-peak-slider type="range" min="-60" max="0" step="0.1" value="${edit.targetPeakDb??-1}" aria-label="Target peak level"><span class="muted">0 dBFS is full scale. Lower values leave more headroom.</span></div><p class="muted">Your original stays untouched. Playback auditions the original snippet; fades and normalization are applied when you save.</p><p data-status role="status"></p><div class="button-row"><button type="button" data-reset>Reset edits</button><button type="button" data-cancel>Cancel</button>${!reel?'<button type="submit" value="copy">Save as copy</button>':''}<button type="submit" class="primary" value="${reel?'copy':'replace'}">${reel?'Apply to reel':'Save changes'}</button></div></form>`;
  const form=dialog.querySelector('form'),audio=dialog.querySelector('audio'),status=dialog.querySelector('[data-status]');
  waveform=mountEditWaveform(dialog.querySelector('.audio-edit-waveform'),{form,audio});
  const peakSlider=dialog.querySelector('[data-peak-slider]'),target=form.elements.targetPeakDb;
  const syncPeak=()=>{target.disabled=peakSlider.disabled=!form.elements.normalize.checked;};
  form.elements.normalize.addEventListener('change',syncPeak);target.oninput=()=>{peakSlider.value=target.value;};peakSlider.oninput=()=>{target.value=peakSlider.value;};syncPeak();
  (async()=>{try{
   let data;
   const local=localSource?.(current.sourceId||id);
   if(local&&/\.wav$/i.test(local.name))try{data=await localWaveform(local);}catch{}
   if(!data)data=await prepareReelTrack(async(action,body)=>{
    controller.signal.throwIfAborted();const response=await fetch('/api/reels?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    if(!response.ok)throw Error('Waveform unavailable');return response.json();
   },current.sourceId||id);
   if(dialog.open)waveform.setData(data);
  }catch{if(dialog.open)waveform.error();}})();
  audio.onloadedmetadata=()=>{if(!form.elements.end.value)form.elements.end.value=audio.duration.toFixed(2);waveform.draw();};
  audio.onerror=()=>{status.textContent='Audio preview is unavailable. You can still enter times and save your edits.';};
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-reset]').onclick=()=>{for(const name of ['start','fadeIn','fadeOut'])form.elements[name].value=0;form.elements.end.value=Number.isFinite(audio.duration)?audio.duration.toFixed(2):waveform.duration()?.toFixed(2)||'';form.elements.normalize.checked=false;target.value=peakSlider.value=-1;syncPeak();waveform.draw();};
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;
   const edit=Object.fromEntries(['start','end','fadeIn','fadeOut'].map(name=>[name,Number(form.elements[name].value)]));edit.normalize=form.elements.normalize.checked;edit.targetPeakDb=Number(target.value);
   const length=edit.end-edit.start;
   if(!Number.isFinite(edit.targetPeakDb)||edit.targetPeakDb>0||edit.targetPeakDb< -60||length<.05||edit.end>3600||edit.fadeIn+edit.fadeOut>length){status.textContent='Choose a valid snippet up to 60 minutes. Both fades must fit inside it.';return;}
   const mode=event.submitter?.value||'copy';busy=true;audio.pause();form.querySelectorAll('button,input').forEach(e=>e.disabled=true);status.textContent='Applying edits and saving audio…';
   try{
    const response=await fetch('/api/reels?action=edit-audio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,edit,mode}),signal:AbortSignal.timeout(290000)});
    const body=await response.json();if(!response.ok)throw Error(response.status>=500?'Could not apply these edits. Please try again.':body.error||'Could not apply these edits.');
    result=body.asset;dialog.close();
   }catch(error){status.textContent=error.name==='TimeoutError'?'Processing took too long. Refresh your library before retrying.':error.message;}
   finally{busy=false;form.querySelectorAll('button,input').forEach(e=>e.disabled=false);syncPeak();waveform.draw();}
  };
 }catch(error){dialog.querySelector('[role="status"]').textContent=error.message;}
 return done;
}
