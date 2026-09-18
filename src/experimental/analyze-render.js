// Work on copied channel data; transferring AudioBuffer-owned memory is unsafe.
export function analyzeRender(buffer,{signal}={}){
 if(signal?.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./mix-analysis-worker.js',import.meta.url),{type:'module'});
  const finish=(error,value)=>{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(value);};
  const cancel=()=>finish(signal.reason||new Error('Analysis canceled.'));
  const timeout=setTimeout(()=>finish(new Error('Mix analysis timed out.')),60000);signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data.channels);worker.onerror=()=>finish(new Error('Audio analysis worker failed.'));
  try{const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).slice());worker.postMessage({channels},channels.map(c=>c.buffer));}catch(error){finish(error);}
 });
}
