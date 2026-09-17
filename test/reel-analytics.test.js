import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createReelAnalyticsRepository,summarizeSession} from '../server/reel-analytics.js';
import {createReelRepository} from '../server/reels.js';
import {createProjectRepository} from '../server/projects.js';
import {createMediaRepository} from '../server/media.js';
import {createReelHandler} from '../api/reels.js';
Object.assign(process.env,{WORKOS_API_KEY:'test',WORKOS_CLIENT_ID:'test',SESSION_SECRET:'x'.repeat(40),APP_URL:'https://cuestamp.test',DATABASE_URL:'postgresql://unused'});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}});

test('summarizeSession reconstructs active listening time from play/pause/seek/ended, ignoring rewinds and forward jumps',()=>{
 const track='cccccccc-cccc-4ccc-accc-cccccccccccc',opened='2026-01-01T00:00:00.000Z';
 const at=s=>new Date(new Date(opened).getTime()+s*1000).toISOString();
 const events=[
  {type:'play',trackId:track,trackTitle:'Cue',position:0,duration:20,createdAt:at(1)},
  {type:'seek',trackId:track,trackTitle:'Cue',seekFrom:5,seekTo:15,createdAt:at(6)},
  {type:'pause',trackId:track,trackTitle:'Cue',position:18,duration:20,createdAt:at(9)},
  {type:'play',trackId:track,trackTitle:'Cue',position:10,duration:20,createdAt:at(20)},
  {type:'ended',trackId:track,trackTitle:'Cue',position:20,duration:20,createdAt:at(30)},
 ];
 const summary=summarizeSession(opened,events);
 // 0->5 played (5s) + skip to 15 + 15->18 played (3s) + rewind to 10 + 10->20 played (10s) = 18s active, never double counting the 10-15 region twice.
 assert.equal(summary.activeSeconds,18);
 assert.equal(summary.tracks.length,1);
 assert.equal(summary.tracks[0].maxSeconds,20);
 assert.equal(summary.tracks[0].durationSeconds,20);
 assert.equal(summary.timeline.length,5);
 assert.equal(summary.timeline[0].type,'ended');
 assert.ok(summary.timeline[0].elapsedSeconds>=summary.timeline.at(-1).elapsedSeconds);
});
test('summarizeSession counts a track still playing when the session ends without an explicit pause',()=>{
 const track='cccccccc-cccc-4ccc-accc-cccccccccccc',opened='2026-01-01T00:00:00.000Z';
 const at=s=>new Date(new Date(opened).getTime()+s*1000).toISOString();
 const events=[{type:'play',trackId:track,trackTitle:'Cue',position:0,duration:10,createdAt:at(1)}];
 const summary=summarizeSession(opened,events);
 assert.equal(summary.activeSeconds,0);
 assert.equal(summary.tracks[0].maxSeconds,0);
});

async function setup(){
 const db=new PGlite();
 for(const f of ['001_users_projects.sql','002_media_assets.sql','006_reels.sql','007_reel_analytics.sql','008_reel_listen_events.sql','009_reel_share_links.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
 const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
 const media=createMediaRepository(query),projects=createProjectRepository(query),reels=createReelRepository(query),stats=createReelAnalyticsRepository(query);
 const asset=await media.reserve('alice',{filename:'track.wav',size:100});
 await media.complete('alice',asset.id,{pathname:asset.pathname,size:100,contentType:'audio/wav'});
 const id=crypto.randomUUID(),data={type:'reel',title:'Demo',status:'draft',audioIds:[asset.id],trackTitles:{}};
 await projects.save('alice',{id,revision:0,data});
 await query`INSERT INTO reel_audio(asset_id,pathname,duration,peaks) VALUES(${asset.id},'reels/test/preview.mp3',10,'[0,1]'::jsonb)`;
 await reels.publish('alice',{id,revision:1});
 const link=await reels.createLink('alice',{id,name:'Test link'});
 return {db,query,reels,stats,projectId:id,assetId:asset.id,linkId:link.id,token:link.token};
}
test('recording an open captures geolocation/device, events require an owned session, and sessions() aggregates per-listen with ownership isolation',async()=>{
 const {db,stats,projectId,assetId,token}=await setup();
 try{
  await assert.rejects(stats.recordOpen('not-a-uuid'),{status:404});
  await assert.rejects(stats.recordOpen(crypto.randomUUID()),{status:404});
  const {listenId}=await stats.recordOpen(token,{userAgent:'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537',referrer:'https://example.com/press',city:'Bologna',region:'Emilia-Romagna',country:'Italy'});
  assert.ok(listenId);
  await assert.rejects(stats.recordEvent(token,{listenId:crypto.randomUUID(),type:'play',trackId:assetId,trackTitle:'Cue',position:0,duration:10}),{status:404});
  await assert.rejects(stats.recordEvent(token,{listenId,type:'seek',trackId:assetId,trackTitle:'Cue'}),/INVALID_EVENT/);
  await stats.recordEvent(token,{listenId,type:'play',trackId:assetId,trackTitle:'Cue',position:0,duration:10});
  await stats.recordEvent(token,{listenId,type:'pause',trackId:assetId,trackTitle:'Cue',position:6,duration:10});
  const {listenId:second}=await stats.recordOpen(token,{});
  await assert.rejects(stats.sessions('bob',projectId),{status:404});
  const analytics=await stats.sessions('alice',projectId);
  assert.equal(analytics.title,'Demo');
  assert.equal(analytics.opens,2);
  assert.equal(analytics.totalReelSeconds,10);
  const played=analytics.sessions.find(s=>s.id===listenId);
  assert.equal(played.city,'Bologna');
  assert.equal(played.country,'Italy');
  assert.equal(played.linkName,'Test link');
  assert.equal(played.embed,false);
  assert.equal(played.activeSeconds,6);
  assert.equal(played.completedRatio,0.6);
  assert.equal(played.events.length,2);
  assert.equal(played.tracks[0].maxSeconds,6);
  const empty=analytics.sessions.find(s=>s.id===second);
  assert.equal(empty.events.length,0);
  assert.equal(empty.activeSeconds,0);
  assert.equal(analytics.avgSessionSeconds,6);
  assert.equal(analytics.avgCompletedRatio,0.6);
  assert.equal(analytics.tracks.length,1);
  assert.equal(analytics.tracks[0].plays,1);
  assert.ok(Array.isArray(analytics.daily) && analytics.daily.length>=1);
  assert.equal(analytics.daily.reduce((sum,d)=>sum+d.direct+d.embed,0),2);
 }finally{await db.close();}
});
test('API exposes open/event publicly without auth, decodes Vercel geo headers, and scopes analytics to the owning account',async()=>{
 const {db,stats,projectId,assetId,token}=await setup();
 try{
  const anon=createReelHandler({analytics:()=>stats,repository:()=>({}),auth:async()=>null});
  const openRes=response();
  await anon({method:'POST',url:'/api/reels?action=open',headers:{'content-type':'application/json','x-vercel-ip-city':'S%C3%A3o%20Paulo','x-vercel-ip-country':'BR'},body:{token,referrer:'https://example.com',embed:true}},openRes);
  assert.equal(openRes.code,200);assert.ok(openRes.body.listenId);
  const eventRes=response();
  await anon({method:'POST',url:'/api/reels?action=event',headers:{'content-type':'application/json'},body:{token,listenId:openRes.body.listenId,type:'play',trackId:assetId,trackTitle:'Cue',position:0,duration:10}},eventRes);
  assert.equal(eventRes.code,200);assert.equal(eventRes.body.ok,true);
  const noAuth=response();
  await anon({method:'GET',url:`/api/reels?action=analytics&id=${projectId}`,headers:{}},noAuth);
  assert.equal(noAuth.code,401);
  const owner=createReelHandler({analytics:()=>stats,repository:()=>({}),auth:async()=>({user:{id:'alice'}})});
  const authRes=response();
  await owner({method:'GET',url:`/api/reels?action=analytics&id=${projectId}`,headers:{}},authRes);
  assert.equal(authRes.code,200);
  assert.equal(authRes.body.analytics.opens,1);
  const session=authRes.body.analytics.sessions[0];
  assert.equal(session.city,'São Paulo');
  assert.equal(session.country,'BR');
  assert.equal(session.embed,true);
  assert.equal(session.linkName,'Test link');
 }finally{await db.close();}
});
test('accountSummary ranks a user\'s reels by opens, is scoped to the owner, and excludes unpublished drafts',async()=>{
 const {db,query,reels,stats,projectId,token}=await setup();
 try{
  await stats.recordOpen(token,{});
  await stats.recordOpen(token,{});
  const asset2=await createMediaRepository(query).reserve('alice',{filename:'other.wav',size:100});
  await createMediaRepository(query).complete('alice',asset2.id,{pathname:asset2.pathname,size:100,contentType:'audio/wav'});
  const projects=createProjectRepository(query);
  const secondId=crypto.randomUUID();
  await projects.save('alice',{id:secondId,revision:0,data:{type:'reel',title:'Second reel',status:'draft',audioIds:[asset2.id]}});
  await query`INSERT INTO reel_audio(asset_id,pathname,duration,peaks) VALUES(${asset2.id},'reels/test/second.mp3',10,'[0,1]'::jsonb)`;
  await reels.publish('alice',{id:secondId,revision:1});
  const secondLink=await reels.createLink('alice',{id:secondId,name:'Second link'});
  await stats.recordOpen(secondLink.token,{});
  const unpublishedId=crypto.randomUUID();
  await projects.save('alice',{id:unpublishedId,revision:0,data:{type:'reel',title:'Unpublished',status:'draft',audioIds:[]}});

  const aliceSummary=await stats.accountSummary('alice');
  assert.equal(aliceSummary.totalReels,2);
  assert.equal(aliceSummary.totalOpens,3);
  assert.deepEqual(aliceSummary.reels.map(r=>r.title),['Demo','Second reel']);
  assert.equal(aliceSummary.reels[0].opens,2);
  assert.equal(aliceSummary.reels[1].opens,1);
  assert.ok(aliceSummary.reels[0].lastOpenedAt);
  assert.ok(!aliceSummary.reels.some(r=>r.title==='Unpublished'));
  assert.ok(Array.isArray(aliceSummary.daily) && aliceSummary.daily.reduce((sum,d)=>sum+d.opens,0)===3);

  const bobSummary=await stats.accountSummary('bob');
  assert.equal(bobSummary.totalReels,0);
  assert.equal(bobSummary.totalOpens,0);
  assert.deepEqual(bobSummary.reels,[]);
 }finally{await db.close();}
});
test('API scopes the no-id analytics action to an account-wide summary for the signed-in user',async()=>{
 const {db,stats,token}=await setup();
 try{
  await stats.recordOpen(token,{});
  const owner=createReelHandler({analytics:()=>stats,repository:()=>({}),auth:async()=>({user:{id:'alice'}})});
  const res=response();
  await owner({method:'GET',url:'/api/reels?action=analytics',headers:{}},res);
  assert.equal(res.code,200);
  assert.equal(res.body.analytics.totalReels,1);
  assert.equal(res.body.analytics.totalOpens,1);
  assert.equal(res.body.analytics.reels[0].title,'Demo');
 }finally{await db.close();}
});
