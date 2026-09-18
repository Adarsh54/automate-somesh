// Timeline boundaries are absolute seconds. Source offsets always describe the
// unreversed recording, even when a region is auditioned backwards.
export function trimmedRegion(region,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Trim boundaries must define a positive region.');
 const duration=end-start,offset=region.reverse?region.offset+region.start+region.duration-end:region.offset+start-region.start;
 if(offset<-.000001)throw Error('Trim would extend before the source recording.');
 const fadeIn=Math.min(region.fadeIn,duration),fadeOut=Math.min(region.fadeOut,duration-fadeIn);
 return {start,duration,offset:Math.max(0,offset),fadeIn,fadeOut};
}
export function regionHandles(region,kind){return `${kind!=='midi'?'<span class="daw-trim start" data-region-handle="trim-start" title="Trim start"></span><span class="daw-trim end" data-region-handle="trim-end" title="Trim end"></span>':''}${kind!=='video'?`<svg class="daw-fade-envelope" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M 0 ${region.fadeIn?100:0} L ${region.fadeIn/region.duration*100} 0 L ${100-region.fadeOut/region.duration*100} 0 L 100 ${region.fadeOut?100:0}"/></svg><span class="daw-fade-handle" data-region-handle="fadeIn" style="left:${region.fadeIn/region.duration*100}%" title="Fade in"></span><span class="daw-fade-handle end" data-region-handle="fadeOut" style="right:${region.fadeOut/region.duration*100}%" title="Fade out"></span>`:''}`;}
export function bindRegions(root,{session,zoom,select,seek,execute,guard,sourceDuration}){
 root.querySelectorAll('[data-region]').forEach(el=>{
  const region=session.tracks.flatMap(t=>t.regions).find(r=>r.id===el.dataset.region);
  el.onclick=()=>select(region.id);el.ondblclick=()=>seek(region.id,region.start);
  el.onpointerdown=e=>{if(e.button!==0)return;const handle=e.target.closest('[data-region-handle]')?.dataset.regionHandle||'move',x=e.clientX,step=60/session.tempo/4,revision=session.revision;let moved=false,command=null;el.setPointerCapture(e.pointerId);
   el.onpointermove=event=>{const dx=event.clientX-x;if(!moved&&Math.abs(dx)<4)return;moved=true;const delta=event.shiftKey?dx/zoom:Math.round(dx/zoom/step)*step,end=region.start+region.duration,minLength=.01;let values;
    if(handle==='move'){values={start:Math.max(0,region.start+delta)};el.style.left=values.start*zoom+'px';}
    else if(handle==='fadeIn'||handle==='fadeOut'){const other=handle==='fadeIn'?region.fadeOut:region.fadeIn;values={[handle]:Math.max(0,Math.min(region.duration-other,region[handle]+delta*(handle==='fadeOut'?-1:1)))};const h=el.querySelector(`[data-region-handle="${handle}"]`);h.style[handle==='fadeIn'?'left':'right']=values[handle]/region.duration*100+'%';}
    else{const sourceEnd=sourceDuration(region.assetId)??region.offset+region.duration;let start=region.start,finish=end;
     if(handle==='trim-start'){const available=region.reverse?sourceEnd-region.offset-region.duration:region.offset;start=Math.max(0,region.start-available,Math.min(end-minLength,region.start+delta));}
     else{const available=region.reverse?region.offset:sourceEnd-region.offset-region.duration;finish=Math.max(region.start+minLength,Math.min(end+available,end+delta));}
     values={start,end:finish};el.style.left=start*zoom+'px';el.style.width=Math.max(18,(finish-start)*zoom)+'px';
    }
    command={op:handle.startsWith('trim')?'region.trim':'region.set',target:region.id,values};
   };
   const cleanup=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null;};
   el.onpointercancel=()=>{cleanup();select(region.id);};el.onpointerup=guard(event=>{cleanup();el.releasePointerCapture(event.pointerId);if(moved&&command){select(region.id,false);execute([command],handle==='move'?'Moved region':handle.startsWith('trim')?'Trimmed region':'Changed region fade',revision);}else select(region.id);});
  };
 });
}
