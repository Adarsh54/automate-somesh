import {decodeMedia,analysisRequest} from './backend-analysis.js';
// Runs local tracks together (one shared movie FFT), and remote pairs sequentially.
// Results are returned atomically so an error/cancellation cannot replace prior cues.
export class HybridAnalysis {
  constructor({LocalWorker,decode=decodeMedia,request=analysisRequest}) {
    Object.assign(this,{LocalWorker,decode,request});
    this.controller=new AbortController();this.local=null;
  }
  terminate() {
    this.controller.abort();this.local?.terminate();this.rejectLocal?.(new DOMException('Cancelled','AbortError'));
  }
  progress(text){if(!this.controller.signal.aborted)this.onmessage?.({data:{type:'progress',text}});}
  runLocal(payload) {
    return new Promise((resolve,reject)=>{
      this.rejectLocal=reject;
      const worker=this.local=new this.LocalWorker();
      worker.onerror=event=>{event.preventDefault?.();reject(new Error('Local analysis failed. Try a shorter audio export.'));};
      worker.onmessageerror=()=>reject(new Error('The analysis result could not be read. Please retry.'));
      worker.onmessage=({data})=>{
        if(data.type==='progress')this.progress(data.text);
        else if(data.type==='error')reject(new Error('Local analysis failed. Try a shorter audio export.'));
        else resolve(data.results);
      };
      worker.postMessage(payload);
    }).finally(()=>{this.local?.terminate();this.local=null;this.rejectLocal=null;});
  }
  async postMessage({mode,movie,movieAssetId,movieFile,tracks,options}) {
    const signal=this.controller.signal,started=performance.now();
    try {
      const remote=tracks.filter(t=>t.assetId || (mode==='movie' && movieAssetId));
      const local=tracks.filter(t=>!remote.includes(t));
      const results=local.length?await this.runLocal({mode,movie,tracks:local.map(({id,title,samples})=>({id,title,samples})),options}):[];
      if(signal.aborted)return;
      let remoteMovie=movieAssetId;
      const ensure=async(file,id)=>{
        if(id)return id;
        if(!file)throw new Error('Reattach missing media to run server processing.');
        return (await this.decode(file,text=>this.progress(text),signal)).assetId;
      };
      if(remote.length && mode==='movie')remoteMovie=await ensure(movieFile,remoteMovie);
      for(const [index,track] of remote.entries()) {
        const id=await ensure(track.file,track.assetId);
        if(signal.aborted)return;
        this.progress(`Processing ${track.title} on the server · ${index+1}/${remote.length}…`);
        const result=await this.request('detect',{id,mode,movie:remoteMovie,options},signal);
        results.push({id:track.id,...result});
      }
      if(!signal.aborted)this.onmessage?.({data:{type:'done',results:tracks.map(t=>results.find(r=>r.id===t.id)),elapsed:(performance.now()-started)/1000}});
    }catch(error){if(!signal.aborted)this.onmessage?.({data:{type:'error',message:error.message}});}
  }
}
