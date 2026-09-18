export function trackDropIndex(tracks,sourceId,targetId,after){
 const from=tracks.findIndex(t=>t.id===sourceId),to=tracks.findIndex(t=>t.id===targetId);
 if(from<0||to<0)throw Error('Track not found.');
 if(from===to)return from;
 return to+(after?1:0)-(from<to?1:0);
}
export function bindTrackOrder(root,{session,execute,guard}){
 let sourceId=null;
 const clear=()=>root.querySelectorAll('[data-track-row]').forEach(row=>row.classList.remove('daw-drop-before','daw-drop-after'));
 root.querySelectorAll('[data-track]').forEach(button=>{
  button.ondragstart=event=>{if(button.disabled){event.preventDefault();return;}sourceId=button.dataset.track;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',sourceId);};
  button.ondragend=()=>{sourceId=null;clear();};
 });
 root.querySelectorAll('[data-track-row]').forEach(row=>{
  row.ondragover=event=>{if(!sourceId)return;event.preventDefault();event.dataTransfer.dropEffect='move';clear();row.classList.add(event.clientY>row.getBoundingClientRect().top+row.clientHeight/2?'daw-drop-after':'daw-drop-before');};
  row.ondragleave=event=>{if(!row.contains(event.relatedTarget))row.classList.remove('daw-drop-before','daw-drop-after');};
  row.ondrop=guard(event=>{event.preventDefault();if(!sourceId)return;const id=sourceId;sourceId=null;const index=trackDropIndex(session.tracks,id,row.dataset.trackRow,event.clientY>row.getBoundingClientRect().top+row.clientHeight/2);clear();if(session.tracks[index]?.id!==id)execute([{op:'track.move',target:id,values:{index}}],'Reordered track',session.revision);});
 });
}
