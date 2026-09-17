export function createReelAnalytics(token,{embed=false}={}){
 let listenId=null;
 const ready=(async()=>{
  try{
   const response=await fetch('/api/reels?action=open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,referrer:document.referrer||'',embed})});
   if(response.ok)listenId=(await response.json()).listenId;
  }catch{}
 })();
 function send(type,track,extra,beacon){
  if(!listenId || !track)return;
  const body=JSON.stringify({token,listenId,type,trackId:track.id,trackTitle:track.title,...extra});
  if(beacon && navigator.sendBeacon){navigator.sendBeacon('/api/reels?action=event',new Blob([body],{type:'application/json'}));return;}
  fetch('/api/reels?action=event',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
 }
 return {
  ready:()=>ready,
  onEvent(type,track,extra){
   const beacon=type==='close';
   if(listenId)send(type,track,extra,beacon);
   else ready.then(()=>send(type,track,extra,beacon));
  },
 };
}
