import {upload} from '@vercel/blob/client';
import {MAX_MEDIA_BYTES,mediaType} from './media-policy.js';
const uploads=new WeakMap();
export async function analysisRequest(action,body,signal) {
  const response=await fetch(`/api/analysis?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const data=await response.json().catch(()=>({error:'Processing did not finish. Retry with a shorter file.'}));
  if(!response.ok)throw new Error(data.error==='AUTH_NOT_CONFIGURED' ? 'Server processing is not configured for this deployment yet.' : data.error || 'Server processing failed. Please retry.');
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
