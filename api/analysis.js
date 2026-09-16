import {handleUpload} from '@vercel/blob/client';
import {head,put,del,issueSignedToken,presignUrl} from '@vercel/blob';
import {z} from 'zod';
import {requireOrigin,apiError,equalState} from '../server/auth.js';
import {readJson,reply} from '../server/http.js';
import {analysisOwner,analysisRepository,clientQuotaKey,fail} from '../server/analysis-store.js';
import {decodeAudio} from '../server/audio-processing.js';
import {analyzeAudio} from '../server/analyze.js';
import {ANALYSIS_RATE,MAX_DURATION} from '../src/analysis.js';
const optionsSchema=z.object({thresholdDb:z.number().min(-100).max(-10).optional(),gap:z.number().min(0).max(10).optional(),minimum:z.literal(.5).optional(),threshold:z.number().min(0).max(1).optional()});
const pcmPath=asset=>`analysis/${asset.id}/audio.f32`;
async function signedUrl(pathname) {
  const validUntil=Date.now()+5*60*1000;
  const token=await issueSignedToken({pathname,operations:['get'],validUntil});
  return (await presignUrl(token,{operation:'get',pathname,access:'private',validUntil})).presignedUrl;
}
async function readPcm(asset,signal) {
  const response=await fetch(await signedUrl(pcmPath(asset)),{signal});
  if(!response.ok)throw fail('Analysis audio is unavailable. Reattach the file.',409);
  const maximum=(MAX_DURATION+1)*ANALYSIS_RATE*4,chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>maximum)throw fail('Invalid analysis audio');chunks.push(chunk);}
  const buffer=Buffer.concat(chunks);
  if(!size || size%4)throw fail('Invalid analysis audio');
  const samples=new Float32Array(size/4);
  for(let i=0;i<samples.length;i++)samples[i]=buffer.readFloatLE(i*4);
  return samples;
}
export function createAnalysisHandler({owner=analysisOwner,repository=analysisRepository,quotaKey=clientQuotaKey,uploadHandler=handleUpload,stat=head,write=put,remove=del,sign=signedUrl,decode=decodeAudio,read=readPcm,analyze=analyzeAudio}={}) {
  async function cleanup(repo) {
    const deadline=Date.now()+240000;
    while(Date.now()<deadline) {
      const assets=await repo.expired();
      if(!assets.length)break;
      for(const asset of assets) {
        await remove([asset.pathname,pcmPath(asset)]);
        await repo.remove(asset.id);
        if(Date.now()>=deadline)break;
      }
    }
    await repo.prune();
  }
  return async(req,res)=>{
    let repo,actor,lease;
    try {
      if(req.method==='GET') {
        if(!process.env.CRON_SECRET || !equalState(req.headers.authorization,`Bearer ${process.env.CRON_SECRET}`))return reply(res,401,{error:'UNAUTHORIZED'});
        await cleanup(repository());return reply(res,200,{ok:true});
      }
      if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405,{error:'METHOD_NOT_ALLOWED'});}
      requireOrigin(req);
      const body=await readJson(req),action=new URL(req.url,'http://localhost').searchParams.get('action');
      actor=await owner(req,res);repo=repository();
      if(action==='reserve') {
        await repo.quota('upload:'+quotaKey(req),100);
        await repo.quota('upload:'+actor,40);
        return reply(res,200,{asset:await repo.reserve(actor,body)});
      }
      if(body.type==='blob.generate-client-token') {
        const result=await uploadHandler({request:req,body,onBeforeGenerateToken:async(pathname,id)=>{
          const asset=await repo.get(actor,id);
          if(asset.metadata || pathname!==asset.pathname)throw fail('INVALID_UPLOAD_TARGET');
          return {allowedContentTypes:[asset.content_type],maximumSizeInBytes:Number(asset.size),validUntil:Date.now()+3600000,addRandomSuffix:false,allowOverwrite:false};
        }});
        return reply(res,200,result);
      }
      if(!['decode','detect'].includes(action))throw fail('INVALID_ACTION');
      const asset=await repo.get(actor,body.id);
      if(action==='decode' && asset.metadata)return reply(res,200,{...asset.metadata,assetId:asset.id});
      let movie,options;
      if(action==='detect') {
        if(!['offset','movie'].includes(body.mode))throw fail('INVALID_MODE');
        const parsed=optionsSchema.safeParse(body.options || {});
        if(!parsed.success)throw fail('INVALID_OPTIONS');options=parsed.data;
        if(body.mode==='movie')movie=await repo.get(actor,body.movie);
        if(!asset.metadata || (movie && !movie.metadata))throw fail('Finish loading media first.',409);
      }
      await repo.quota('compute:'+quotaKey(req),300);
      await repo.quota('compute:'+actor,150);
      lease=await repo.lease(actor);
      // Leaves time for Blob persistence and releasing the lease before Vercel's 300s limit.
      const signal=AbortSignal.timeout(260000);
      if(action==='decode') {
        const blob=await stat(asset.pathname);
        if(blob.size!==Number(asset.size) || blob.pathname!==asset.pathname || blob.contentType.split(';')[0]!==asset.content_type)throw fail('MEDIA_UPLOAD_MISMATCH');
        const {pcm,metadata}=await decode(await sign(asset.pathname),Number(asset.size),signal);
        await write(pcmPath(asset),pcm,{access:'private',contentType:'application/octet-stream',addRandomSuffix:false,allowOverwrite:true,abortSignal:signal});
        await repo.complete(actor,asset.id,metadata);
        await repo.release(actor,lease);lease=null;
        return reply(res,200,{...metadata,assetId:asset.id});
      }
      const track=await read(asset,signal),movieSamples=movie?await read(movie,signal):undefined;
      const result=await analyze({mode:body.mode,track,movie:movieSamples,options},signal);
      await repo.release(actor,lease);lease=null;
      return reply(res,200,result);
    }catch(error){return apiError(res,error);}
    finally{if(lease)await repo.release(actor,lease).catch(()=>{});}
  };
}
export default createAnalysisHandler();
