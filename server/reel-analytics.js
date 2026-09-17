import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const UA_MAX=300,REF_MAX=300,TITLE_MAX=300;
export function createReelAnalyticsRepository(query){
 return {
  async recordOpen(token,{userAgent,referrer}={}){
   if(!z.uuid().safeParse(token).success)throw fail('This reel is unavailable.',404);
   const rows=await query`SELECT project_id FROM reel_publications WHERE token=${token}`;
   if(!rows[0])throw fail('This reel is unavailable.',404);
   const id=randomUUID();
   await query`INSERT INTO reel_listens(id,project_id,user_agent,referrer) VALUES(${id},${rows[0].project_id},${(userAgent||'').slice(0,UA_MAX)||null},${(referrer||'').slice(0,REF_MAX)||null})`;
   return {listenId:id};
  },
  async recordProgress(token,input){
   if(!z.uuid().safeParse(token).success)throw fail('This reel is unavailable.',404);
   const parsed=z.object({
    listenId:z.uuid(),
    trackId:z.uuid(),
    trackTitle:z.string().trim().min(1).max(TITLE_MAX),
    position:z.number().finite().nonnegative(),
    duration:z.number().finite().nonnegative().optional(),
   }).safeParse(input);
   if(!parsed.success)throw fail('INVALID_PROGRESS');
   const {listenId,trackId,trackTitle,position,duration}=parsed.data;
   const owned=await query`SELECT 1 FROM reel_listens l JOIN reel_publications p ON p.project_id=l.project_id WHERE l.id=${listenId} AND p.token=${token}`;
   if(!owned.length)throw fail('This reel session has expired. Reload the reel.',404);
   const completed=Boolean(duration && duration>0 && position/duration>=0.9);
   await query`INSERT INTO reel_listen_tracks(listen_id,track_id,track_title,duration_seconds,max_seconds,completed)
    VALUES(${listenId},${trackId},${trackTitle},${duration ?? null},${position},${completed})
    ON CONFLICT (listen_id,track_id) DO UPDATE SET
     max_seconds=GREATEST(reel_listen_tracks.max_seconds,EXCLUDED.max_seconds),
     duration_seconds=COALESCE(EXCLUDED.duration_seconds,reel_listen_tracks.duration_seconds),
     completed=reel_listen_tracks.completed OR EXCLUDED.completed,
     updated_at=now()`;
   return {ok:true};
  },
  async summary(userId,projectId){
   if(!z.uuid().safeParse(projectId).success)throw fail('Not found',404);
   const owns=await query`SELECT 1 FROM projects WHERE id=${projectId} AND user_id=${userId}`;
   if(!owns.length)throw fail('Not found',404);
   const totals=await query`SELECT count(*)::int AS opens FROM reel_listens WHERE project_id=${projectId}`;
   const perTrack=await query`SELECT t.track_id AS "trackId", t.track_title AS "trackTitle", count(*)::int AS plays,
     avg(CASE WHEN t.duration_seconds>0 THEN t.max_seconds/t.duration_seconds ELSE NULL END) AS "avgRatio",
     count(*) FILTER (WHERE t.completed)::int AS completions
    FROM reel_listen_tracks t JOIN reel_listens l ON l.id=t.listen_id
    WHERE l.project_id=${projectId} GROUP BY t.track_id,t.track_title ORDER BY plays DESC`;
   const listens=await query`SELECT id,opened_at AS "openedAt",user_agent AS "userAgent",referrer
    FROM reel_listens WHERE project_id=${projectId} ORDER BY opened_at DESC LIMIT 50`;
   const ids=listens.map(l=>l.id);
   const tracks=ids.length?await query`SELECT listen_id AS "listenId", track_id AS "trackId", track_title AS "trackTitle",
     max_seconds AS "maxSeconds", duration_seconds AS "durationSeconds", completed
    FROM reel_listen_tracks WHERE listen_id=ANY(${ids}::uuid[])`:[];
   const byListen=new Map();
   for(const t of tracks){if(!byListen.has(t.listenId))byListen.set(t.listenId,[]);byListen.get(t.listenId).push(t);}
   return {
    opens:totals[0].opens,
    tracks:perTrack.map(t=>({...t,avgRatio:t.avgRatio==null?null:Number(t.avgRatio)})),
    recent:listens.map(l=>({...l,tracks:byListen.get(l.id)||[]})),
   };
  },
 };
}
export const reelAnalyticsRepository=()=>createReelAnalyticsRepository(neon(process.env.DATABASE_URL));
