const cache=new WeakMap();
export function localWaveform(file){
 if(cache.has(file))return cache.get(file);
 const pending=new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./reel-waveform.worker.js',import.meta.url),{type:'module'});
  const finish=(error,result)=>{clearTimeout(timer);worker.terminate();if(error)reject(Error(error));else resolve(result);};
  const timer=setTimeout(()=>finish('Local preview took too long. Wait for upload and use server preview.'),60000);
  worker.onmessage=({data})=>finish(data.error,data.result);
  worker.onerror=()=>finish('Could not prepare a local waveform. Wait for upload and use server preview.');
  worker.postMessage(file);
 });
 cache.set(file,pending);pending.catch(()=>cache.delete(file));return pending;
}
