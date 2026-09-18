import {mediaRepository} from '../server/media.js';
import {saveAudioEdit} from '../server/audio-edits.js';
import {authenticate,requireOrigin,apiError} from '../server/auth.js';
import {readJson,reply} from '../server/http.js';
import {reelRepository} from '../server/reels.js';
import {reelAnalyticsRepository} from '../server/reel-analytics.js';
import {prepareAudio,signedAudio} from '../server/reel-processing.js';
export function createReelHandler({auth=authenticate,repository=reelRepository,analytics=reelAnalyticsRepository,prepare=prepareAudio,sign=signedAudio}={}){
 return async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),action=url.searchParams.get('action');
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(res,405,{error:'METHOD_NOT_ALLOWED'});}
   const repo=repository();let cachedStats;const stats=()=>cachedStats||(cachedStats=analytics());
   if(req.method==='GET' && ['public','stream','download','resume'].includes(action)){
    const manifest=await repo.publicReel(url.searchParams.get('token'));
    if(action==='public'){const {resumePath,...publicManifest}=manifest;return reply(res,200,{reel:{...publicManifest,hasResume:Boolean(resumePath),tracks:manifest.tracks.map(({pathname,...track})=>track)}});}
    if(action==='resume'){if(!manifest.resumePath)return reply(res,404,{error:'Resume not found.'});res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Location',await sign(manifest.resumePath));res.status(302);return res.end();}
    const track=manifest.tracks.find(t=>t.id===url.searchParams.get('track'));
    if(!track)return reply(res,404,{error:'Track not found.'});
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Location',await sign(track.pathname));res.status(302);return res.end();
   }
   if(req.method==='POST' && ['open','event'].includes(action)){
    const body=await readJson(req);
    if(action==='open'){
     const geo=header=>{try{return decodeURIComponent((req.headers[header]||'').toString());}catch{return (req.headers[header]||'').toString();}};
     return reply(res,200,await stats().recordOpen(body.token,{userAgent:(req.headers['user-agent']||'').toString(),referrer:body.referrer,embed:Boolean(body.embed),city:geo('x-vercel-ip-city'),region:geo('x-vercel-ip-country-region'),country:geo('x-vercel-ip-country')}));
    }
    return reply(res,200,await stats().recordEvent(body.token,body));
   }
   const session=await auth(req,res);if(!session)return reply(res,401,{error:'SIGN_IN_REQUIRED'});
   if(req.method==='GET'&&action==='resume-preview'){const asset=await mediaRepository().get(session.user.id,url.searchParams.get('id'));if(!asset.ready||asset.content_type!=='application/pdf')return reply(res,404,{error:'Resume not found.'});res.setHeader('Cache-Control','no-store');res.setHeader('Location',await sign(asset.pathname));res.status(302);return res.end();}
   if(req.method==='GET'&&action==='preview'){res.setHeader('Cache-Control','no-store');res.setHeader('Location',await sign(await repo.preview(session.user.id,url.searchParams.get('id'))));res.status(302);return res.end();}
   if(req.method==='GET'&&action==='analytics'){
    if(!url.searchParams.get('id'))return reply(res,200,{analytics:await stats().accountSummary(session.user.id)});
    return reply(res,200,{analytics:await stats().sessions(session.user.id,url.searchParams.get('id'))});
   }
   if(req.method==='GET'&&action==='links')return reply(res,200,{links:await repo.listLinks(session.user.id,url.searchParams.get('id'))});
   if(req.method==='GET')return reply(res,200,{publication:await repo.owner(session.user.id,url.searchParams.get('id'))});
   requireOrigin(req);const body=await readJson(req);
   if(action==='edit-audio')return reply(res,200,{asset:await saveAudioEdit(mediaRepository(),session.user.id,body)});
   if(action==='prepare'){
    const audio=await repo.prepare(session.user.id,body.id,prepare);
    return reply(res,200,{track:{id:body.id,duration:audio.duration,peaks:audio.peaks}});
   }
   if(action==='publish')return reply(res,200,{publication:await repo.publish(session.user.id,body)});
   if(action==='revoke'){await repo.revoke(session.user.id,body.id);return reply(res,200,{ok:true});}
   if(action==='create-link')return reply(res,200,{link:await repo.createLink(session.user.id,{id:body.id,name:body.name})});
   if(action==='toggle-link'){await repo.setLinkActive(session.user.id,body.id,body.active);return reply(res,200,{ok:true});}
   if(action==='delete-link'){await repo.deleteLink(session.user.id,body.id);return reply(res,200,{ok:true});}
   return reply(res,400,{error:'INVALID_ACTION'});
  }catch(e){if(e.code==='REEL_PREPARING')return reply(res,202,{status:'processing',retryAfter:2});return apiError(res,e);}
 };
}
export default createReelHandler();
