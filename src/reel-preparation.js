// A second tab/request may already own preparation. Wait for its cached result.
export async function prepareReelTrack(request,id,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,maxWaitMs=600000}={}){
 const deadline=now()+maxWaitMs;
 for(;;){
  const result=await request('prepare',{id});
  if(result.track)return result.track;
  if(result.status!=='processing')throw new Error('The audio preview could not be prepared. Please retry.');
  if(now()>=deadline)throw new Error('This track is taking longer than expected. Your audio is saved; try Preview reel again shortly.');
  await wait(Math.min(5000,Math.max(1000,(result.retryAfter||2)*1000)));
 }
}
