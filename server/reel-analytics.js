import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const UA_MAX=300,REF_MAX=300,TITLE_MAX=300,GEO_MAX=200;
const eventSchema=z.object({
 listenId:z.uuid(),
 type:z.enum(['play','pause','seek','stop','switch','close','ended']),
 trackId:z.uuid(),
 trackTitle:z.string().trim().min(1).max(TITLE_MAX),
 position:z.number().finite().nonnegative().optional(),
 seekFrom:z.number().finite().nonnegative().optional(),
 seekTo:z.number().finite().nonnegative().optional(),
 duration:z.number().finite().nonnegative().optional(),
}).refine(v=>v.type==='seek'?v.seekFrom!=null&&v.seekTo!=null:v.position!=null,{message:'INVALID_EVENT'});
// Reconstructs actual listened seconds and a display timeline from a session's raw play/pause/seek/ended events.
// A seek mid-playback closes the current span at seekFrom and immediately opens a new one at seekTo, so scrubbing
// forward never counts as "listened" time and scrubbing backward doesn't double count already-heard audio.
export function summarizeSession(openedAt,events){
 const opened=new Date(openedAt).getTime();
 const byTrack=new Map();
 let activeSeconds=0,lastAt=opened;
 const spans=new Map();
 for(const e of events){
  const at=new Date(e.createdAt).getTime();if(at>lastAt)lastAt=at;
  const track=byTrack.get(e.trackId)||{trackId:e.trackId,trackTitle:e.trackTitle,maxSeconds:0,durationSeconds:e.duration??null};
  if(e.duration!=null)track.durationSeconds=e.duration;
  const mark=pos=>{if(pos!=null&&pos>track.maxSeconds)track.maxSeconds=pos;};
  if(e.type==='play'){spans.set(e.trackId,e.position??0);mark(e.position);}
  else if(e.type==='pause'||e.type==='ended'||e.type==='stop'||e.type==='switch'||e.type==='close'){
   const start=spans.get(e.trackId);
   if(start!=null){activeSeconds+=Math.max(0,(e.position??start)-start);spans.delete(e.trackId);}
   mark(e.position);
  }else if(e.type==='seek'){
   const start=spans.get(e.trackId);
   if(start!=null){activeSeconds+=Math.max(0,(e.seekFrom??start)-start);spans.set(e.trackId,e.seekTo??start);}
   mark(e.seekFrom);mark(e.seekTo);
  }
  byTrack.set(e.trackId,track);
 }
 // Any track still "open" (playing when the session ended without a pause/ended event, e.g. the tab closed) counts up to its last known position.
 for(const [trackId,start] of spans){const track=byTrack.get(trackId);if(track)activeSeconds+=Math.max(0,track.maxSeconds-start);}
 const timeline=[...events].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(e=>({...e,elapsedSeconds:Math.round((new Date(e.createdAt).getTime()-opened)/1000)}));
 return {activeSeconds,closedAt:new Date(lastAt).toISOString(),tracks:[...byTrack.values()],timeline};
}
export function createReelAnalyticsRepository(query){
 return {
  async recordOpen(token,{userAgent,referrer,embed,city,region,country}={}){
   if(!z.uuid().safeParse(token).success)throw fail('This reel is unavailable.',404);
   const link=(await query`SELECT id,project_id FROM reel_share_links WHERE token=${token} AND active=true`)[0];
   const projectId=link?.project_id ?? (await query`SELECT project_id FROM reel_publications WHERE token=${token}`)[0]?.project_id;
   if(!projectId)throw fail('This reel is unavailable.',404);
   const id=randomUUID();
   await query`INSERT INTO reel_listens(id,project_id,link_id,embed,user_agent,referrer,city,region,country)
    VALUES(${id},${projectId},${link?.id ?? null},${Boolean(embed)},${(userAgent||'').slice(0,UA_MAX)||null},${(referrer||'').slice(0,REF_MAX)||null},${(city||'').slice(0,GEO_MAX)||null},${(region||'').slice(0,GEO_MAX)||null},${(country||'').slice(0,GEO_MAX)||null})`;
   return {listenId:id};
  },
  async recordEvent(token,input){
   if(!z.uuid().safeParse(token).success)throw fail('This reel is unavailable.',404);
   const parsed=eventSchema.safeParse(input);
   if(!parsed.success)throw fail('INVALID_EVENT');
   const {listenId,type,trackId,trackTitle,position,seekFrom,seekTo,duration}=parsed.data;
   const owned=await query`SELECT 1 FROM reel_listens l WHERE l.id=${listenId} AND (
     l.link_id IN (SELECT id FROM reel_share_links WHERE token=${token})
     OR l.project_id IN (SELECT project_id FROM reel_publications WHERE token=${token})
    )`;
   if(!owned.length)throw fail('This reel session has expired. Reload the reel.',404);
   await query`INSERT INTO reel_listen_events(id,listen_id,type,track_id,track_title,position,seek_from,seek_to,duration_seconds)
    VALUES(${randomUUID()},${listenId},${type},${trackId},${trackTitle},${position ?? null},${seekFrom ?? null},${seekTo ?? null},${duration ?? null})`;
   return {ok:true};
  },
  async sessions(userId,projectId){
   if(!z.uuid().safeParse(projectId).success)throw fail('Not found',404);
   const owns=await query`SELECT title FROM projects WHERE id=${projectId} AND user_id=${userId}`;
   if(!owns.length)throw fail('Not found',404);
   const publication=(await query`SELECT manifest FROM reel_publications WHERE project_id=${projectId}`)[0];
   const totalReelSeconds=publication?publication.manifest.tracks.reduce((sum,t)=>sum+(Number(t.duration)||0),0):null;
   const listens=await query`SELECT l.id,l.opened_at AS "openedAt",l.user_agent AS "userAgent",l.referrer,l.city,l.region,l.country,l.embed,k.name AS "linkName"
    FROM reel_listens l LEFT JOIN reel_share_links k ON k.id=l.link_id
    WHERE l.project_id=${projectId} ORDER BY l.opened_at DESC LIMIT 100`;
   const ids=listens.map(l=>l.id);
   const rawEvents=ids.length?await query`SELECT listen_id AS "listenId", type, track_id AS "trackId", track_title AS "trackTitle",
     position, seek_from AS "seekFrom", seek_to AS "seekTo", duration_seconds AS "duration", created_at AS "createdAt"
    FROM reel_listen_events WHERE listen_id=ANY(${ids}::uuid[]) ORDER BY created_at ASC`:[];
   const byListen=new Map();
   for(const e of rawEvents){if(!byListen.has(e.listenId))byListen.set(e.listenId,[]);byListen.get(e.listenId).push(e);}
   const sessions=listens.map(l=>{
    const {activeSeconds,closedAt,tracks,timeline}=summarizeSession(l.openedAt,byListen.get(l.id)||[]);
    return {...l,linkName:l.linkName||'Unlabeled link',activeSeconds,closedAt,tracks,events:timeline,completedRatio:totalReelSeconds?Math.min(1,activeSeconds/totalReelSeconds):null};
   });
   const withActivity=sessions.filter(s=>s.events.length);
   const avgSessionSeconds=withActivity.length?withActivity.reduce((sum,s)=>sum+s.activeSeconds,0)/withActivity.length:null;
   const ratios=withActivity.map(s=>s.completedRatio).filter(r=>r!=null);
   const avgCompletedRatio=ratios.length?ratios.reduce((sum,r)=>sum+r,0)/ratios.length:null;
   const trackStats=new Map();
   for(const s of sessions)for(const t of s.tracks){
    const cur=trackStats.get(t.trackId)||{trackId:t.trackId,trackTitle:t.trackTitle,plays:0,totalRatio:0,completions:0};
    if(t.maxSeconds>0){
     cur.plays++;
     const ratio=t.durationSeconds?Math.min(1,t.maxSeconds/t.durationSeconds):0;
     cur.totalRatio+=ratio;
     if(ratio>=0.9)cur.completions++;
    }
    trackStats.set(t.trackId,cur);
   }
   const tracks=[...trackStats.values()].filter(t=>t.plays).map(t=>({trackId:t.trackId,trackTitle:t.trackTitle,plays:t.plays,avgRatio:t.totalRatio/t.plays,completions:t.completions})).sort((a,b)=>b.plays-a.plays);
   const daily=await query`SELECT date_trunc('day',opened_at) AS day, embed, count(*)::int AS count
    FROM reel_listens WHERE project_id=${projectId} AND opened_at>=now()-interval '90 days' GROUP BY day,embed ORDER BY day ASC`;
   const byDay=new Map();
   for(const row of daily){
    const key=new Date(row.day).toISOString().slice(0,10);
    const entry=byDay.get(key)||{date:key,direct:0,embed:0};
    entry[row.embed?'embed':'direct']+=row.count;
    byDay.set(key,entry);
   }
   return {title:owns[0].title,opens:sessions.length,totalReelSeconds,avgSessionSeconds,avgCompletedRatio,tracks,daily:[...byDay.values()],sessions};
  },
  async accountSummary(userId){
   const reels=await query`SELECT p.id,p.title FROM projects p JOIN reel_publications rp ON rp.project_id=p.id WHERE p.user_id=${userId} ORDER BY p.updated_at DESC`;
   const ids=reels.map(r=>r.id);
   const counts=ids.length?await query`SELECT project_id AS "projectId", count(*)::int AS opens, max(opened_at) AS "lastOpenedAt"
    FROM reel_listens WHERE project_id=ANY(${ids}::uuid[]) GROUP BY project_id`:[];
   const byProject=new Map(counts.map(c=>[c.projectId,c]));
   const list=reels.map(r=>({id:r.id,title:r.title,opens:byProject.get(r.id)?.opens||0,lastOpenedAt:byProject.get(r.id)?.lastOpenedAt||null}))
    .sort((a,b)=>b.opens-a.opens || new Date(b.lastOpenedAt||0)-new Date(a.lastOpenedAt||0));
   const daily=ids.length?await query`SELECT date_trunc('day',opened_at) AS day, count(*)::int AS count
    FROM reel_listens WHERE project_id=ANY(${ids}::uuid[]) AND opened_at>=now()-interval '90 days' GROUP BY day ORDER BY day ASC`:[];
   return {
    totalReels:list.length,
    totalOpens:list.reduce((sum,r)=>sum+r.opens,0),
    reels:list,
    daily:daily.map(row=>({date:new Date(row.day).toISOString().slice(0,10),opens:row.count})),
   };
  },
 };
}
export const reelAnalyticsRepository=()=>createReelAnalyticsRepository(neon(process.env.DATABASE_URL));
