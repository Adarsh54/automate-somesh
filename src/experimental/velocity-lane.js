export function velocityView(region,tempo,selected,width,esc){
 const ids=new Set(selected),counts=new Map();
 return `<div class="daw-velocity-heading">Velocity <small>Drag a bar or use arrow keys. Selected notes change together; simultaneous notes are placed side by side.</small></div><div class="daw-velocity-lane" style="width:${width}px" role="group" aria-label="Note velocities">${region.notes.map(n=>{const index=counts.get(n.start)||0;counts.set(n.start,index+1);const value=Math.round(n.velocity*127);return `<label style="left:${28+n.start*80+index*14}px" class="${ids.has(n.id)?'selected':''}"><output data-velocity-value="${n.id}">${value}</output><input type="range" min="0" max="127" step="1" value="${value}" data-velocity="${n.id}" aria-label="${esc(`Velocity for MIDI note ${n.pitch} at beat ${(n.start*tempo/60).toFixed(2)}`)}" title="MIDI ${n.pitch} · velocity ${value}"></label>`;}).join('')}</div>`;
}
export function bindVelocity(root,{region,ids,settings,select,execute,guard}){
 const selected=new Set(ids);
 root.querySelectorAll('[data-velocity]').forEach(input=>{
  const note=region.notes.find(n=>n.id===input.dataset.velocity),notes=selected.has(note.id)?region.notes.filter(n=>selected.has(n.id)):[note];
  const preview=()=>{const delta=Number(input.value)/127-note.velocity;for(const n of notes){const value=Math.round(Math.max(0,Math.min(1,n.velocity+delta))*127),slider=root.querySelector(`[data-velocity="${n.id}"]`),out=root.querySelector(`[data-velocity-value="${n.id}"]`);if(slider!==input)slider.value=value;out.textContent=value;}return delta;};
  input.oninput=preview;
  input.onpointercancel=()=>{for(const n of notes){root.querySelector(`[data-velocity="${n.id}"]`).value=Math.round(n.velocity*127);root.querySelector(`[data-velocity-value="${n.id}"]`).textContent=Math.round(n.velocity*127);}};
  input.onchange=guard(()=>{const delta=preview(),scroll=root.querySelector('.daw-note-scroll'),left=scroll.scrollLeft;settings.selectedIds=notes.map(n=>n.id);select(note.id,false);execute([{op:'notes.velocity',target:region.id,values:{noteIds:notes.map(n=>n.id).join(','),delta}}],'Changed MIDI velocities');root.querySelector('.daw-note-scroll').scrollLeft=left;root.querySelector(`[data-velocity="${note.id}"]`)?.focus({preventScroll:true});});
 });
}
