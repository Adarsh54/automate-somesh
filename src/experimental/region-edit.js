import {chasedEvents,sustainedEnd} from './midi-events.js';
// Timeline boundaries are absolute seconds. Source offsets always describe the
// unreversed recording, even when a region is auditioned backwards.
export function trimmedRegion(region,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Trim boundaries must define a positive region.');
 const duration=end-start,offset=region.reverse?region.offset+region.start+region.duration-end:region.offset+start-region.start;
 if(offset<-.000001)throw Error('Trim would extend before the source recording.');
 const fadeIn=Math.min(region.fadeIn,duration),fadeOut=Math.min(region.fadeOut,duration-fadeIn);
 return {start,duration,offset:Math.max(0,offset),fadeIn,fadeOut};
}
// MIDI regions contain editable events, rather than a pointer into source audio.
// Cropping is undoable; extending a cropped edge does not resurrect removed notes.
export function trimmedMidiRegion(region,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Trim boundaries must define a positive region.');
 if(start<region.start||end>region.start+region.duration)throw Error('MIDI trim must stay inside the current region. Undo to restore cropped notes.');
 const from=start-region.start,to=end-region.start,duration=end-start;
 const notes=region.notes.flatMap(note=>{
  const soundingEnd=sustainedEnd(note,(region.events||[]).filter(e=>e.channel===note.channel),region.duration);
  if(note.start>=to||soundingEnd<=from)return [];
  // A note already released but held by the pedal must remain audible at the cut.
  const noteEnd=note.start+note.duration<=from?soundingEnd:note.start+note.duration;
  const localStart=Math.max(from,note.start);
  return [{...note,start:localStart-from,duration:Math.min(to,noteEnd)-localStart}];
 });
 const events=[...chasedEvents(region.events||[],from),...(region.events||[]).filter(e=>e.start>=from&&e.start<=to).map(e=>({...e,start:e.start-from}))].sort((a,b)=>a.start-b.start);
 const fadeIn=Math.min(region.fadeIn,duration),fadeOut=Math.min(region.fadeOut,duration-fadeIn);
 return {start,duration,offset:0,notes,events,fadeIn,fadeOut};
}
export function regionHandles(region,kind){return `<span class="daw-trim start" data-region-handle="trim-start" title="Trim start"></span><span class="daw-trim end" data-region-handle="trim-end" title="Trim end"></span>${kind!=='video'?`<svg class="daw-fade-envelope" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M 0 ${region.fadeIn?100:0} L ${region.fadeIn/region.duration*100} 0 L ${100-region.fadeOut/region.duration*100} 0 L 100 ${region.fadeOut?100:0}"/></svg><span class="daw-fade-handle" data-region-handle="fadeIn" style="left:${region.fadeIn/region.duration*100}%" title="Fade in"></span><span class="daw-fade-handle end" data-region-handle="fadeOut" style="right:${region.fadeOut/region.duration*100}%" title="Fade out"></span>`:''}`;}
export function bindRegions(root,{session,zoom,select,seek,execute,guard,sourceDuration}){
 root.querySelectorAll('[data-region]').forEach(el=>{
  const owner=session.tracks.find(t=>t.regions.some(r=>r.id===el.dataset.region)),region=owner.regions.find(r=>r.id===el.dataset.region);
  el.onclick=()=>select(region.id);el.ondblclick=()=>seek(region.id,region.start);
  el.onpointerdown=e=>{if(e.button!==0)return;const handle=e.target.closest('[data-region-handle]')?.dataset.regionHandle||'move',x=e.clientX,y=e.clientY,step=60/session.tempo/4,revision=session.revision;let moved=false,command=null;el.setPointerCapture(e.pointerId);
   el.onpointermove=event=>{const dx=event.clientX-x;if(!moved&&Math.abs(dx)<4&&(handle!=='move'||Math.abs(event.clientY-y)<4))return;moved=true;const delta=event.shiftKey?dx/zoom:Math.round(dx/zoom/step)*step,end=region.start+region.duration,minLength=.01;let values;
    if(handle==='move'){
     const lanes=[...root.querySelectorAll('[data-lane]')],lane=lanes.find(l=>{const box=l.getBoundingClientRect();return event.clientY>=box.top&&event.clientY<box.bottom&&event.clientX>=box.left&&event.clientX<box.right;});
     const trackId=lane?.dataset.lane||owner.id,destination=session.tracks.find(t=>t.id===trackId);
     for(const l of lanes){l.classList.toggle('daw-region-drop',l===lane&&destination.kind===owner.kind);l.classList.toggle('daw-region-drop-invalid',l===lane&&destination.kind!==owner.kind);}
     values={trackId,start:Math.max(0,region.start+delta)};el.style.left=values.start*zoom+'px';
    }
    else if(handle==='fadeIn'||handle==='fadeOut'){const other=handle==='fadeIn'?region.fadeOut:region.fadeIn;values={[handle]:Math.max(0,Math.min(region.duration-other,region[handle]+delta*(handle==='fadeOut'?-1:1)))};const h=el.querySelector(`[data-region-handle="${handle}"]`);h.style[handle==='fadeIn'?'left':'right']=values[handle]/region.duration*100+'%';}
    else{const sourceEnd=sourceDuration(region.assetId)??region.offset+region.duration;let start=region.start,finish=end;
     if(handle==='trim-start'){const available=owner.kind==='midi'?0:region.reverse?sourceEnd-region.offset-region.duration:region.offset;start=Math.max(0,region.start-available,Math.min(end-minLength,region.start+delta));}
     else{const available=owner.kind==='midi'?0:region.reverse?region.offset:sourceEnd-region.offset-region.duration;finish=Math.max(region.start+minLength,Math.min(end+available,end+delta));}
     values={start,end:finish};el.style.left=start*zoom+'px';el.style.width=Math.max(18,(finish-start)*zoom)+'px';
    }
    command={op:handle==='move'?'region.move':handle.startsWith('trim')?'region.trim':'region.set',target:region.id,values};
   };
   const cleanup=()=>{root.querySelectorAll('.daw-region-drop,.daw-region-drop-invalid').forEach(l=>l.classList.remove('daw-region-drop','daw-region-drop-invalid'));el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null;};
   el.onpointercancel=()=>{cleanup();select(region.id);};el.onpointerup=guard(event=>{cleanup();el.releasePointerCapture(event.pointerId);if(moved&&command){select(region.id,false);execute([command],handle==='move'?'Moved region':handle.startsWith('trim')?'Trimmed region':'Changed region fade',revision);}else select(region.id);});
  };
 });
}
