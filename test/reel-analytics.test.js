import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createReelAnalyticsRepository} from '../server/reel-analytics.js';
import {createReelRepository} from '../server/reels.js';
import {createProjectRepository} from '../server/projects.js';
import {createMediaRepository} from '../server/media.js';
import {createReelHandler} from '../api/reels.js';
Object.assign(process.env,{WORKOS_API_KEY:'test',WORKOS_CLIENT_ID:'test',SESSION_SECRET:'x'.repeat(40),APP_URL:'https://cuestamp.test',DATABASE_URL:'postgresql://unused'});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}});
async function setup(){
 const db=new PGlite();
 for(const f of ['001_users_projects.sql','002_media_assets.sql','006_reels.sql','007_reel_analytics.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
 const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
 const media=createMediaRepository(query),projects=createProjectRepository(query),reels=createReelRepository(query),stats=createReelAnalyticsRepository(query);
 const asset=await media.reserve('alice',{filename:'track.wav',size:100});
 await media.complete('alice',asset.id,{pathname:asset.pathname,size:100,contentType:'audio/wav'});
 const id=crypto.randomUUID(),data={type:'reel',title:'Demo',status:'draft',audioIds:[asset.id],trackTitles:{}};
 await projects.save('alice',{id,revision:0,data});
 await query`INSERT INTO reel_audio(asset_id,pathname,duration,peaks) VALUES(${asset.id},'reels/test/preview.mp3',10,'[0,1]'::jsonb)`;
 const publication=await reels.publish('alice',{id,revision:1});
 return {db,query,stats,projectId:id,assetId:asset.id,token:publication.token};
}
test('recording listens and progress aggregates per-track engagement for the owner and stays isolated by token',async()=>{
 const {db,stats,projectId,assetId,token}=await setup();
 try{
  await assert.rejects(stats.recordOpen('not-a-uuid'),{status:404});
  await assert.rejects(stats.recordOpen(crypto.randomUUID()),{status:404});
  const {listenId}=await stats.recordOpen(token,{userAgent:'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537',referrer:'https://example.com/press'});
  assert.ok(listenId);
  await assert.rejects(stats.recordProgress(token,{listenId:crypto.randomUUID(),trackId:assetId,trackTitle:'Cue',position:1,duration:10}),{status:404});
  await assert.rejects(stats.recordProgress(token,{listenId,trackId:'not-a-uuid',trackTitle:'Cue',position:1,duration:10}),/INVALID_PROGRESS/);
  await stats.recordProgress(token,{listenId,trackId:assetId,trackTitle:'Cue',position:3,duration:10});
  await stats.recordProgress(token,{listenId,trackId:assetId,trackTitle:'Cue',position:2,duration:10});
  await stats.recordProgress(token,{listenId,trackId:assetId,trackTitle:'Cue',position:9.5,duration:10});
  const {listenId:second}=await stats.recordOpen(token,{});
  await assert.rejects(stats.summary('bob',projectId),{status:404});
  const summary=await stats.summary('alice',projectId);
  assert.equal(summary.opens,2);
  assert.equal(summary.tracks.length,1);
  assert.equal(summary.tracks[0].plays,1);
  assert.equal(summary.tracks[0].completions,1);
  assert.ok(Math.abs(summary.tracks[0].avgRatio-0.95)<0.01);
  assert.equal(summary.recent.length,2);
  const played=summary.recent.find(l=>l.id===listenId);
  assert.equal(played.tracks[0].maxSeconds,9.5);
  assert.equal(played.userAgent.includes('Chrome'),true);
  const unplayed=summary.recent.find(l=>l.id===second);
  assert.equal(unplayed.tracks.length,0);
 }finally{await db.close();}
});
test('API exposes open/progress publicly without auth and analytics only to the owning account',async()=>{
 const {db,stats,projectId,assetId,token}=await setup();
 try{
  const anon=createReelHandler({analytics:()=>stats,repository:()=>({}),auth:async()=>null});
  const openRes=response();
  await anon({method:'POST',url:'/api/reels?action=open',headers:{'content-type':'application/json'},body:{token,referrer:'https://example.com'}},openRes);
  assert.equal(openRes.code,200);assert.ok(openRes.body.listenId);
  const progressRes=response();
  await anon({method:'POST',url:'/api/reels?action=progress',headers:{'content-type':'application/json'},body:{token,listenId:openRes.body.listenId,trackId:assetId,trackTitle:'Cue',position:4,duration:10}},progressRes);
  assert.equal(progressRes.code,200);assert.equal(progressRes.body.ok,true);
  const noAuth=response();
  await anon({method:'GET',url:`/api/reels?action=analytics&id=${projectId}`,headers:{}},noAuth);
  assert.equal(noAuth.code,401);
  const owner=createReelHandler({analytics:()=>stats,repository:()=>({}),auth:async()=>({user:{id:'alice'}})});
  const authRes=response();
  await owner({method:'GET',url:`/api/reels?action=analytics&id=${projectId}`,headers:{}},authRes);
  assert.equal(authRes.code,200);
  assert.equal(authRes.body.analytics.opens,1);
  assert.equal(authRes.body.analytics.tracks[0].plays,1);
 }finally{await db.close();}
});
