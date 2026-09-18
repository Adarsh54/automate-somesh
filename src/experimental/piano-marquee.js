export function marqueeNotes(notes,from,to){
 const left=Math.min(from.x,to.x),right=Math.max(from.x,to.x),top=Math.min(from.y,to.y),bottom=Math.max(from.y,to.y);
 return notes.filter(note=>{const x=28+note.start*80,y=(127-note.pitch)*16+1;return x<right&&x+Math.max(8,note.duration*80)>left&&y<bottom&&y+13>top;}).map(note=>note.id);
}
export function bindMarquee(root,{region,settings,select}){
 const grid=root.querySelector('.daw-note-grid');
 grid.onpointerdown=e=>{
  if(e.button!==0||e.target.closest('[data-note]')||(settings.tool!=='select'&&!e.altKey))return;
  e.preventDefault();e.stopPropagation();grid.setPointerCapture(e.pointerId);
  const point=event=>{const rect=grid.getBoundingClientRect();return {x:event.clientX-rect.left+grid.scrollLeft,y:event.clientY-rect.top+grid.scrollTop};};
  const from=point(e),previous=[...(settings.selectedIds||[])],add=e.ctrlKey||e.metaKey||e.shiftKey,box=document.createElement('span');let hit=[],moved=false;
  box.className='daw-note-marquee';box.setAttribute('aria-hidden','true');grid.append(box);
  const buttons=[...grid.querySelectorAll('[data-note]')];
  const finish=cancel=>{box.remove();grid.onpointermove=null;grid.onpointerup=null;grid.onpointercancel=null;grid.removeEventListener('keydown',key);if(grid.hasPointerCapture(e.pointerId))grid.releasePointerCapture(e.pointerId);settings.selectedIds=cancel?previous:add?[...new Set([...previous,...hit])]:hit;select(settings.selectedIds[0]||null);};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();finish(true);}};
  grid.tabIndex=0;grid.focus({preventScroll:true});grid.addEventListener('keydown',key);
  grid.onpointermove=event=>{const to=point(event);if(!moved&&Math.abs(from.x-to.x)+Math.abs(from.y-to.y)<4)return;moved=true;
   box.style.left=Math.min(from.x,to.x)+'px';box.style.top=Math.min(from.y,to.y)+'px';box.style.width=Math.abs(to.x-from.x)+'px';box.style.height=Math.abs(to.y-from.y)+'px';
   hit=marqueeNotes(region.notes,from,to);const preview=new Set(add?[...previous,...hit]:hit);for(const button of buttons)button.setAttribute('aria-pressed',String(preview.has(button.dataset.note)));
  };
  grid.onpointerup=()=>finish(false);grid.onpointercancel=()=>finish(true);
 };
}
