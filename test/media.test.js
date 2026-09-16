import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createMediaRepository,parseMedia} from '../server/media.js';
import {createProjectRepository} from '../server/projects.js';
import {createMediaHandler} from '../api/media.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
Object.assign(process.env,{WORKOS_API_KEY:'test',WORKOS_CLIENT_ID:'test',SESSION_SECRET:'x'.repeat(40),APP_URL:'https://cuestamp.test',DATABASE_URL:'postgresql://unused'});
test('media metadata rejects unsafe paths, unsupported formats and oversized files',()=>{
  assert.equal(parseMedia({filename:'A.WAV',size:1}).contentType,'audio/wav');
  for(const input of [{filename:'../a.wav',size:1},{filename:'x.html',size:1},{filename:'x.wav',size:0},{filename:'x.wav',size:2147483649}]) assert.throws(()=>parseMedia(input),{status:400});
});
test('private media ownership, completion and project references are enforced by Postgres',async()=>{
 const db=new PGlite();
 try {
  for(const f of ['001_users_projects.sql','002_media_assets.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
  const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const repo=createMediaRepository(query),projects=createProjectRepository(query);
  const asset=await repo.reserve('alice',{filename:'score.wav',size:100});
  const data={production:{title:'Film',rate:'24'},tracks:[{id:'track',title:'Score',filename:'score.wav',offset:''}],cues:[],sharedCueDetails:{category:'unknown',credits:[]},mode:'manual',movieOffset:'',silenceGap:.35,thresholdDb:-40,matchThreshold:.45,media:{tracks:{track:asset.id}}};
  const input={id:crypto.randomUUID(),revision:0,data};
  await assert.rejects(repo.get('bob',asset.id),{status:404});
  await assert.rejects(projects.save('alice',input),{message:'MEDIA_NOT_READY'});
  await assert.rejects(repo.complete('alice',asset.id,{pathname:'wrong',size:100,contentType:'audio/wav'}),{message:'MEDIA_UPLOAD_MISMATCH'});
  const blob={pathname:asset.pathname,size:100,contentType:'audio/wav'};
  await assert.rejects(repo.complete('bob',asset.id,blob),{status:404});
  await repo.complete('alice',asset.id,blob);
  await repo.complete('alice',asset.id,blob); // idempotent retry
  await projects.save('alice',input);
  await assert.rejects(projects.save('bob',{...input,id:crypto.randomUUID()}),{message:'MEDIA_NOT_READY'});
  await projects.save('alice',{...input,id:crypto.randomUUID()}); // save-copy retains owned media
  assert.equal((await projects.get('alice',input.id)).data.media.tracks.track,asset.id);
  // Handler must authorize before it signs, stats or issues upload tokens.
  let signed=0;
  const handler=createMediaHandler({auth:async()=>({user:{id:'bob'}}),repository:()=>repo,sign:async()=>{signed++;}});
  const denied=response();await handler({method:'GET',url:'/api/media?id='+asset.id,headers:{}},denied);
  assert.equal(denied.code,404);assert.equal(signed,0);
  const noauth=createMediaHandler({auth:async()=>null,repository:()=>{throw Error('Must not query');}});
  const missing=response();await noauth({method:'GET',url:'/api/media',headers:{}},missing);assert.equal(missing.code,401);
  const owner=createMediaHandler({auth:async()=>({user:{id:'alice'}}),repository:()=>repo,sign:async options=>{assert.deepEqual(options.operations,['get']);assert.equal(options.pathname,asset.pathname);return {};},presign:async(_,options)=>{assert.equal(options.access,'private');return {presignedUrl:'https://private.test/signed'};},uploadHandler:async options=>options.onBeforeGenerateToken(asset.pathname,asset.id)});
  const ok=response();await owner({method:'GET',url:'/api/media?id='+asset.id,headers:{}},ok);assert.equal(ok.code,200);assert.equal(ok.headers['Cache-Control'],'no-store');
  const csrf=response();await owner({method:'POST',url:'/api/media',headers:{origin:'https://evil.test'}},csrf);assert.equal(csrf.code,403);
  const overwrite=response();await owner({method:'POST',url:'/api/media',headers:{origin:'https://cuestamp.test','content-type':'application/json'},body:{type:'blob.generate-client-token'}},overwrite);assert.equal(overwrite.code,400);
 } finally {await db.close();}
});
