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
   if(req.method==='GET' && ['public','stream','download'].includes(action)){
    const manifest=await repo.publicReel(url.searchParams.get('token'));
    if(action==='public')return reply(res,200,{reel:{...manifest,tracks:manifest.tracks.map(({pathname,...track})=>track)}});
    const track=manifest.tracks.find(t=>t.id===url.searchParams.get('track'));
    if(!track)return reply(res,404,{error:'Track not found.'});
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Location',await sign(track.pathname));res.status(302);return res.end();
   }
   if(req.method==='POST' && ['open','progress'].includes(action)){
    const body=await readJson(req);
    if(action==='open')return reply(res,200,await stats().recordOpen(body.token,{userAgent:(req.headers['user-agent']||'').toString(),referrer:body.referrer}));
    return reply(res,200,await stats().recordProgress(body.token,body));
   }
   const session=await auth(req,res);if(!session)return reply(res,401,{error:'SIGN_IN_REQUIRED'});
   if(req.method==='GET'&&action==='preview'){res.setHeader('Cache-Control','no-store');res.setHeader('Location',await sign(await repo.preview(session.user.id,url.searchParams.get('id'))));res.status(302);return res.end();}
   if(req.method==='GET'&&action==='analytics')return reply(res,200,{analytics:await stats().summary(session.user.id,url.searchParams.get('id'))});
   if(req.method==='GET')return reply(res,200,{publication:await repo.owner(session.user.id,url.searchParams.get('id'))});
   requireOrigin(req);const body=await readJson(req);
   if(action==='prepare'){
    const audio=await repo.prepare(session.user.id,body.id,prepare);
    return reply(res,200,{track:{id:body.id,duration:audio.duration,peaks:audio.peaks}});
   }
   if(action==='publish')return reply(res,200,{publication:await repo.publish(session.user.id,body)});
   if(action==='revoke'){await repo.revoke(session.user.id,body.id);return reply(res,200,{ok:true});}
   return reply(res,400,{error:'INVALID_ACTION'});
  }catch(e){if(e.code==='REEL_PREPARING')return reply(res,202,{status:'processing',retryAfter:2});return apiError(res,e);}
 };
}
export default createReelHandler();
