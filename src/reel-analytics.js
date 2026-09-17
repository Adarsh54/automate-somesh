export function createReelAnalytics(token){
 let listenId=null;
 const ready=(async()=>{
  try{
   const response=await fetch('/api/reels?action=open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,referrer:document.referrer||''})});
   if(response.ok)listenId=(await response.json()).listenId;
  }catch{}
 })();
 function send(track,position,duration,beacon){
  if(!listenId || !track)return;
  const body=JSON.stringify({token,listenId,trackId:track.id,trackTitle:track.title,position,duration});
  if(beacon && navigator.sendBeacon){navigator.sendBeacon('/api/reels?action=progress',new Blob([body],{type:'application/json'}));return;}
  fetch('/api/reels?action=progress',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
 }
 return {
  ready:()=>ready,
  onProgress(track,position,duration,final){
   if(listenId)send(track,position,duration,final);
   else ready.then(()=>send(track,position,duration,final));
  },
 };
}
