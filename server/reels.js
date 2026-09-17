import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createProjectRepository} from './projects.js';
import {createMediaRepository} from './media.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function waveformPeaks(pcm,count=360){
 const length=Math.floor(pcm.length/4),peaks=[];
 for(let i=0;i<count;i++){
  let peak=0;
  for(let j=Math.floor(i*length/count);j<Math.floor((i+1)*length/count);j++){
   const sample=Math.abs(pcm.readFloatLE(j*4));if(Number.isFinite(sample))peak=Math.max(peak,sample);
  }
  peaks.push(peak);
 }
 const max=Math.max(...peaks,0.001);
 return peaks.map(p=>Math.round(p/max*1000)/1000);
}
export function createReelRepository(query){
 const projects=createProjectRepository(query),media=createMediaRepository(query);
 return {
  async listPublished(userId){return query`SELECT r.project_id FROM reel_publications r JOIN projects p ON p.id=r.project_id WHERE p.user_id=${userId}`;},
  async preview(userId,id){await media.get(userId,id);const rows=await query`SELECT pathname FROM reel_audio WHERE asset_id=${id}`;if(!rows[0]?.pathname)throw fail("Prepare this track first.",404);return rows[0].pathname;},
  async prepare(userId,id,processAudio){
   const asset=await media.get(userId,id);
   if(!asset.ready || !asset.content_type.startsWith('audio/'))throw fail('Choose an uploaded audio file.');
   const cached=await query`SELECT * FROM reel_audio WHERE asset_id=${id}`;
   if(cached[0]?.pathname)return cached[0];
   const lease=randomUUID();
   const claimed=await query`INSERT INTO reel_audio(asset_id,lease,lease_until) VALUES(${id},${lease},now()+interval '5 minutes') ON CONFLICT(asset_id) DO UPDATE SET lease=EXCLUDED.lease,lease_until=EXCLUDED.lease_until WHERE reel_audio.pathname IS NULL AND (reel_audio.lease_until IS NULL OR reel_audio.lease_until<now()) RETURNING asset_id`;
   if(!claimed.length)throw Object.assign(fail('This track is being prepared.',409),{code:'REEL_PREPARING'});
   try{
    const result=await processAudio(asset);
    const rows=await query`UPDATE reel_audio SET pathname=${result.pathname},duration=${result.duration},peaks=${JSON.stringify(result.peaks)}::jsonb,lease=NULL,lease_until=NULL WHERE asset_id=${id} AND lease=${lease} RETURNING *`;
    if(!rows[0])throw fail('Preparation expired. Please retry.',409);
    return rows[0];
   }catch(e){await query`UPDATE reel_audio SET lease=NULL,lease_until=NULL WHERE asset_id=${id} AND lease=${lease}`;throw e;}
  },
  async owner(userId,id){await projects.get(userId,id);const rows=await query`SELECT token,updated_at FROM reel_publications WHERE project_id=${id}`;return rows[0]||null;},
  async publish(userId,input){
   const parsed=z.object({id:z.uuid(),revision:z.number().int().positive()}).safeParse(input);
   if(!parsed.success)throw fail('INVALID_REEL');
   const {id,revision}=parsed.data,project=await projects.get(userId,id);
   if(project.revision!==revision)throw fail('PROJECT_CONFLICT',409);
   if(project.data.type!=='reel' || !project.data.audioIds.length || project.data.audioIds.length>50)throw fail('Add between 1 and 50 tracks before publishing.');
   await media.validate(userId,project.data);
   const tracks=[];
   for(const assetId of project.data.audioIds){
    const asset=await media.get(userId,assetId);
    const rows=await query`SELECT * FROM reel_audio WHERE asset_id=${assetId}`;
    if(!rows[0]?.pathname)throw fail('Prepare every track before publishing.',409);
    const audio=rows[0];
    tracks.push({id:assetId,color:project.data.trackColors?.[assetId],title:project.data.trackTitles?.[assetId]?.trim() || asset.filename.replace(/\.[^.]+$/,''),duration:audio.duration,peaks:audio.peaks,pathname:audio.pathname});
   }
   const resume=project.data.resumeId?await media.get(userId,project.data.resumeId):null;
   const manifest={title:project.title,allowDownloads:true,tracks,profile:project.data.profile,appearance:project.data.appearance,...(resume?{resumePath:resume.pathname,resumeName:resume.filename}:{})};
   // Read the revision again inside the write so an overlapping save cannot publish a stale draft.
   const rows=await query`INSERT INTO reel_publications(project_id,token,manifest) SELECT id,${randomUUID()}::uuid,${JSON.stringify(manifest)}::jsonb FROM projects WHERE id=${id} AND user_id=${userId} AND revision=${revision} ON CONFLICT(project_id) DO UPDATE SET manifest=EXCLUDED.manifest,updated_at=now() RETURNING token`;
   if(!rows[0])throw fail('PROJECT_CONFLICT',409);
   return rows[0];
  },
  async revoke(userId,id){await projects.get(userId,id);await query`DELETE FROM reel_publications WHERE project_id=${id}`;},
  async publicReel(token){
   if(!z.uuid().safeParse(token).success)throw fail('This reel is unavailable.',404);
   const rows=await query`SELECT manifest FROM reel_publications WHERE token=${token}`;
   if(!rows[0])throw fail('This reel is unavailable.',404);
   return {...rows[0].manifest,allowDownloads:true};
  }
 };
}
export const reelRepository=()=>createReelRepository(neon(process.env.DATABASE_URL));
