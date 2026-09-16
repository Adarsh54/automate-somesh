import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createAnalysisRepository,analysisOwner} from '../server/analysis-store.js';
import {createAnalysisHandler} from '../api/analysis.js';
import {frameMetrics} from '../server/audio-processing.js';
import {analyzeAudio} from '../server/analyze.js';
Object.assign(process.env,{WORKOS_API_KEY:'test',WORKOS_CLIENT_ID:'test',SESSION_SECRET:'x'.repeat(40),APP_URL:'https://cuestamp.test',DATABASE_URL:'postgresql://unused'});
const response=()=>({headers:{},getHeader(k){return this.headers[k];},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
const request=(action,body={})=>({method:'POST',url:'/api/analysis?action='+action,headers:{origin:'https://cuestamp.test','content-type':'application/json'},body});
test('guest identity is sealed, reused and not chosen by request data',async()=>{
 const res=response(),id=await analysisOwner({headers:{}},res);
 const header=res.headers['Set-Cookie'][0].split(';')[0];
 assert.equal(await analysisOwner({headers:{cookie:header}},response()),id);
 assert.notEqual(await analysisOwner({headers:{cookie:'cuestamp-analysis=forged'}},response()),id);
 assert.match(res.headers['Set-Cookie'][0],/HttpOnly; SameSite=Lax/);
});
test('analysis assets enforce ownership, expiration, atomic limits and leases',async()=>{
 const db=new PGlite();
 try {
  await db.exec(await readFile(new URL('../migrations/003_analysis.sql',import.meta.url),'utf8'));
  const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const repo=createAnalysisRepository(query),asset=await repo.reserve('alice',{filename:'score.wav',size:100});
  await assert.rejects(repo.get('bob',asset.id),{status:404});
  await assert.rejects(repo.get('alice','bad'),{status:404});
  const token=await repo.lease('alice');
  await assert.rejects(repo.lease('alice'),{status:409});
  await repo.release('alice',crypto.randomUUID());
  await assert.rejects(repo.lease('alice'),{status:409});
  await repo.release('alice',token);await repo.lease('alice');
  const quotas=await Promise.allSettled(Array.from({length:4},()=>repo.quota('test',2)));
  assert.equal(quotas.filter(q=>q.status==='fulfilled').length,2);
  assert.equal(quotas.filter(q=>q.reason?.status===429).length,2);
  await repo.complete('alice',asset.id,{duration:10});assert.equal((await repo.get('alice',asset.id)).metadata.duration,10);
  await db.exec("UPDATE analysis_assets SET expires_at=now()-interval '1 second'");
  await assert.rejects(repo.get('alice',asset.id),{status:404});
  assert.equal((await repo.expired()).length,1);
  await repo.remove(asset.id);assert.equal((await repo.expired()).length,0);
 }finally{await db.close();}
});
test('handler authorizes before Blob access, validates options and caches decode',async()=>{
 const asset={id:crypto.randomUUID(),pathname:'analysis/test/source',size:100,content_type:'audio/wav',metadata:null};
 let owner='bob',blobReads=0,released=0;
 const repo={async get(who,id){if(who!=='alice'||id!==asset.id)throw Object.assign(Error('NOT_FOUND'),{status:404});return asset;},async quota(){},async lease(){return 'token';},async release(){released++;},async complete(_,__,data){asset.metadata=data;}};
 const handler=createAnalysisHandler({owner:async()=>owner,repository:()=>repo,quotaKey:()=>'',stat:async()=>{blobReads++;return {pathname:asset.pathname,size:100,contentType:'audio/wav'};},sign:async()=> 'https://private.test/source',decode:async()=>({pcm:Buffer.alloc(8),metadata:{duration:1}}),write:async()=>{},read:async()=>new Float32Array(2),analyze:async()=>({matches:[]})});
 const denied=response();await handler(request('decode',{id:asset.id}),denied);assert.equal(denied.code,404);assert.equal(blobReads,0);
 owner='alice';const csrf=response();await handler({...request('decode',{id:asset.id}),headers:{origin:'https://evil.test'}},csrf);assert.equal(csrf.code,403);
 const ok=response();await handler(request('decode',{id:asset.id}),ok);assert.equal(ok.body.assetId,asset.id);assert.equal(released,1);
 await handler(request('decode',{id:asset.id}),response());assert.equal(blobReads,1);
 const bad=response();await handler(request('detect',{id:asset.id,mode:'offset',options:{gap:-1}}),bad);assert.equal(bad.code,400);
 const wrongMovie=response();await handler(request('detect',{id:asset.id,mode:'movie',movie:crypto.randomUUID()}),wrongMovie);assert.equal(wrongMovie.code,404);
 const done=response();await handler(request('detect',{id:asset.id,mode:'offset',options:{gap:3,thresholdDb:-100,minimum:.5}}),done);assert.deepEqual(done.body,{matches:[]});assert.equal(released,2);
});
test('video timestamp metrics distinguish constant and variable frame rates',()=>{
 assert.equal(frameMetrics('0\n0.040\n0.080\n').underlyingFrameRate,25);
 assert.equal(frameMetrics('0\n0.040\n0.120\n').frameRateIsConstant,false);
 assert.equal(frameMetrics('N/A\n'),null);
});
test('server thread detects regions and aborts without keeping a worker alive',async()=>{
 const samples=new Float32Array(10000);samples.fill(.5,2000,6000);
 const result=await analyzeAudio({mode:'offset',track:samples,options:{gap:3,minimum:.5}},AbortSignal.timeout(10000));
 assert.equal(result.matches.length,1);assert.equal(result.matches[0].start,1);
 const controller=new AbortController();controller.abort();
 await assert.rejects(analyzeAudio({mode:'offset',track:samples,options:{}},controller.signal),/timed out/);
});
test('expired Blob cleanup requires cron authentication and retains rows after delete failure',async()=>{
 process.env.CRON_SECRET='test-cron-secret';
 const asset={id:crypto.randomUUID(),pathname:'analysis/temp/source'};let pending=[asset],deleted=0,pruned=0;
 const repo={async expired(){return pending;},async remove(id){assert.equal(id,asset.id);pending=[];deleted++;},async prune(){pruned++;}};
 const handler=createAnalysisHandler({repository:()=>repo,remove:async paths=>{assert.deepEqual(paths,[asset.pathname,`analysis/${asset.id}/audio.f32`]);}});
 const req={method:'GET',url:'/api/analysis',headers:{authorization:'Bearer test-cron-secret'}};
 const denied=response();await handler({...req,headers:{}},denied);assert.equal(denied.code,401);assert.equal(deleted,0);
 const failing=createAnalysisHandler({repository:()=>repo,remove:async()=>{throw Error('Storage unavailable');}});
 const failure=response();await failing(req,failure);assert.equal(failure.code,500);assert.equal(deleted,0);
 const ok=response();await handler(req,ok);assert.equal(ok.code,200);assert.equal(deleted,1);assert.equal(pruned,1);
});
test('upload tokens are restricted to an owned pending path and leases release on decode failure',async()=>{
 const asset={id:crypto.randomUUID(),pathname:'analysis/temp/source',size:100,content_type:'audio/wav'};let released=0;
 const repo={async get(){return asset;},async quota(){},async lease(){return 'lease';},async release(){released++;}};
 const common={repository:()=>repo,owner:async()=> 'guest',quotaKey:()=>'',uploadHandler:async options=>options.onBeforeGenerateToken(options.body.pathname,asset.id)};
 const handler=createAnalysisHandler(common);
 const wrong=response();await handler(request('upload',{type:'blob.generate-client-token',pathname:'media/other/source'}),wrong);assert.equal(wrong.code,400);
 const allowed=response();await handler(request('upload',{type:'blob.generate-client-token',pathname:asset.pathname}),allowed);
 assert.equal(allowed.body.maximumSizeInBytes,100);assert.equal(allowed.body.allowOverwrite,false);assert.deepEqual(allowed.body.allowedContentTypes,['audio/wav']);
 const broken=createAnalysisHandler({...common,stat:async()=>({pathname:asset.pathname,size:100,contentType:'audio/wav'}),sign:async()=>'',decode:async()=>{throw Object.assign(Error('Bad audio'),{status:400});}});
 const failed=response();await broken(request('decode',{id:asset.id}),failed);assert.equal(failed.code,400);assert.equal(released,1);
});
