import {upload} from '@vercel/blob/client';
import {MAX_MEDIA_BYTES,mediaType} from './media-policy.js';
const uploads=new WeakMap();
export async function analysisRequest(action,body,signal) {
  const response=await fetch(`/api/analysis?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const data=await response.json().catch(()=>({error:'Processing did not finish. Retry with a shorter file.'}));
  if(!response.ok)throw new Error(data.error || 'Server processing failed. Please retry.');
  return data;
}
export async function decodeMedia(file,progress,signal) {
  const contentType=mediaType(file.name);
  if(!contentType || file.size>MAX_MEDIA_BYTES)throw new Error('Use a supported audio/video file smaller than 2 GB.');
  let asset=uploads.get(file);
  if(!asset) {
    progress('Preparing upload…');
    asset=(await analysisRequest('reserve',{filename:file.name,size:file.size},signal)).asset;
    await upload(asset.pathname,file,{access:'private',handleUploadUrl:'/api/analysis',clientPayload:asset.id,contentType,multipart:true,abortSignal:signal,onUploadProgress:({percentage})=>progress(`Uploading ${file.name} · ${Math.round(percentage)}%`)});
    uploads.set(file,asset);
  }
  progress(`Processing ${file.name} on the server…`);
  try{return await analysisRequest('decode',{id:asset.id},signal);}
  catch(error){if(/expired|not found/i.test(error.message))uploads.delete(file);throw error;}
}
// Same event interface as the former browser worker, with one server request per track.
export class BackendAnalysis {
  constructor(){this.controller=new AbortController();}
  terminate(){this.controller.abort();}
  async postMessage({mode,movie,tracks,options}) {
    const started=performance.now(),results=[],signal=this.controller.signal;
    try {
      for(const [index,track] of tracks.entries()) {
        this.onmessage?.({data:{type:'progress',text:`${mode==='movie'?'Matching':'Detecting'} ${track.title} · ${index+1}/${tracks.length} on the server…`}});
        const result=await analysisRequest('detect',{id:track.assetId,mode,movie,options},signal);
        if(signal.aborted)return;
        results.push({id:track.id,...result});
      }
      this.onmessage?.({data:{type:'done',results,elapsed:(performance.now()-started)/1000}});
    }catch(error){if(!signal.aborted)this.onmessage?.({data:{type:'error',message:error.message}});}
  }
}
