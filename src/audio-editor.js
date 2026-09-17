// Shared, non-destructive editor. Rendering uses the original recording on the server.
export async function editAudio({id,esc,reel=false}){
 const dialog=document.createElement('dialog');dialog.className='resume-workspace audio-edit-dialog';
 dialog.setAttribute('aria-label','Edit audio');
 dialog.innerHTML='<h2>Edit audio</h2><p role="status">Loading original audio…</p><button data-close>Cancel</button>';
 document.body.append(dialog);dialog.showModal();
 let result=null,busy=false;
 const done=new Promise(resolve=>{dialog.onclose=()=>{dialog.querySelector('audio')?.pause();dialog.remove();resolve(result);};});
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.oncancel=event=>{if(busy)event.preventDefault();};
 try{
  const get=async id=>{const response=await fetch('/api/media?id='+encodeURIComponent(id));if(!response.ok)throw Error('Sign in and finish uploading this track before editing.');return response.json();};
  const current=await get(id),source=current.sourceId?await get(current.sourceId):current;
  if(!dialog.open)return done;
  const edit=current.edit||{start:0,end:'',fadeIn:0,fadeOut:0,normalize:false};
  dialog.innerHTML=`<h2>Edit audio</h2><p class="muted">${esc(current.filename)}<br>Your original recording is preserved. Edited audio is saved as a linked reel track.</p><p class="muted">Original: ${esc(source.filename)}</p><audio controls preload="metadata" src="${esc(source.url)}" aria-label="Original recording"></audio><form><div class="audio-edit-fields">${[['start','Snippet start (seconds)',edit.start],['end','Snippet end (seconds)',edit.end],['fadeIn','Fade in (seconds)',edit.fadeIn],['fadeOut','Fade out (seconds)',edit.fadeOut]].map(([name,label,value])=>`<label>${label}<input name="${name}" type="number" min="0" step="0.01" required value="${value}"></label>`).join('')}</div><label class="audio-edit-normalize"><input name="normalize" type="checkbox" ${edit.normalize?'checked':''}> Normalize peak volume to −1 dB</label><p class="muted">Times refer to the original recording. Fades apply at the snippet edges. Normalization adjusts the whole snippet by the same amount.</p><p data-status role="status"></p><div class="button-row"><button type="button" data-reset>Reset edits</button><button type="button" data-cancel>Cancel</button>${!reel?'<button type="submit" value="copy">Save as copy</button>':''}<button type="submit" class="primary" value="${reel?'copy':'replace'}">${reel?'Apply to reel':'Save changes'}</button></div></form>`;
  const form=dialog.querySelector('form'),audio=dialog.querySelector('audio'),status=dialog.querySelector('[data-status]');
  audio.onloadedmetadata=()=>{if(!form.elements.end.value)form.elements.end.value=audio.duration.toFixed(2);};
  audio.onerror=()=>{status.textContent='Audio preview is unavailable. You can still enter times and save your edits.';};
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-reset]').onclick=()=>{for(const name of ['start','fadeIn','fadeOut'])form.elements[name].value=0;form.elements.end.value=Number.isFinite(audio.duration)?audio.duration.toFixed(2):'';form.elements.normalize.checked=false;};
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;
   const edit=Object.fromEntries(['start','end','fadeIn','fadeOut'].map(name=>[name,Number(form.elements[name].value)]));edit.normalize=form.elements.normalize.checked;
   const length=edit.end-edit.start;
   if(length<.05||edit.end>3600||edit.fadeIn+edit.fadeOut>length){status.textContent='Choose a valid snippet up to 60 minutes. Both fades must fit inside it.';return;}
   const mode=event.submitter?.value||'copy';busy=true;audio.pause();form.querySelectorAll('button,input').forEach(e=>e.disabled=true);status.textContent='Applying edits and saving audio…';
   try{
    const response=await fetch('/api/reels?action=edit-audio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,edit,mode}),signal:AbortSignal.timeout(290000)});
    const body=await response.json();if(!response.ok)throw Error(response.status>=500?'Could not apply these edits. Please try again.':body.error||'Could not apply these edits.');
    result=body.asset;dialog.close();
   }catch(error){status.textContent=error.name==='TimeoutError'?'Processing took too long. Refresh your library before retrying.':error.message;}
   finally{busy=false;form.querySelectorAll('button,input').forEach(e=>e.disabled=false);}
  };
 }catch(error){dialog.querySelector('[role="status"]').textContent=error.message;}
 return done;
}
