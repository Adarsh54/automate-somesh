import {Worker} from 'node:worker_threads';
export function analyzeAudio(input,signal) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./analysis-thread.js',import.meta.url),{workerData:input});
    let settled=false;
    const abort=()=>finish(new Error('Processing timed out. Try a shorter file.'));
    const finish=(error,result)=>{
      if(settled)return;settled=true;
      signal?.removeEventListener('abort',abort);
      void worker.terminate();
      if(error)reject(Object.assign(error,{status:400}));else resolve(result);
    };
    worker.once('message',result=>finish(null,result));
    worker.once('error',()=>finish(new Error('Audio processing failed. Try a shorter export.')));
    worker.once('exit',code=>{if(code!==0)finish(new Error('Audio processing stopped. Please retry.'));});
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
