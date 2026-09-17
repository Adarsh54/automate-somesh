import {encodeBlobUrlPath} from '../server/blob-url.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {createReelRepository,waveformPeaks} from '../server/reels.js';
import {createMediaRepository} from '../server/media.js';
import {createProjectRepository} from '../server/projects.js';
import {createReelHandler} from '../api/reels.js';
import {prepareAudio} from '../server/reel-processing.js';
Object.assign(process.env,{WORKOS_API_KEY:'test',WORKOS_CLIENT_ID:'test',SESSION_SECRET:'x'.repeat(40),APP_URL:'https://cuestamp.test',DATABASE_URL:'postgresql://unused'});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}});
test('publishing snapshots owned prepared audio; revisions, leases, permissions and revocation are enforced',async()=>{
 const db=new PGlite();
 try{
  for(const file of ['001_users_projects.sql','002_media_assets.sql','007_audio_edits.sql','006_reels.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
  const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const repo=createReelRepository(query),media=createMediaRepository(query),projects=createProjectRepository(query);
  const asset=await media.reserve('alice',{filename:'track.wav',size:100});
  await media.complete('alice',asset.id,{pathname:asset.pathname,size:100,contentType:'audio/wav'});
  const resume=await media.reserve('alice',{filename:'Resume.pdf',size:100});await media.complete('alice',resume.id,{pathname:resume.pathname,size:100,contentType:'application/pdf'});
  const id=crypto.randomUUID(),data={profile:{name:'Alice',email:'alice@example.com',occupation:'Composer',bio:'Original music'},appearance:{accent:'#abcdef',theme:'light',description:'Selected works'},trackColors:{[asset.id]:'#123456'},resumeId:resume.id,resumeName:'Resume.pdf',type:'reel',title:'Demo',status:'draft',audioIds:[asset.id],trackTitles:{[asset.id]:'Custom title'}};
  const foreign=await media.reserve('bob',{filename:'Other.pdf',size:100});await media.complete('bob',foreign.id,{pathname:foreign.pathname,size:100,contentType:'application/pdf'});await assert.rejects(projects.save('alice',{id,revision:0,data:{...data,resumeId:foreign.id}}),{status:400});
  await assert.rejects(projects.save('alice',{id,revision:0,data:{...data,resumeId:asset.id}}),{status:400});
  await projects.save('alice',{id,revision:0,data});
  const input={id,revision:1,allowDownloads:false};
  await assert.rejects(repo.publish('alice',input),{status:409});
  await assert.rejects(repo.prepare('bob',asset.id,()=>assert.fail()),{status:404});
  await assert.rejects(repo.prepare('alice',asset.id,async()=>{throw Error('decode failed');}),/decode failed/);
  let finish;const pending=repo.prepare('alice',asset.id,()=>new Promise(resolve=>{finish=resolve;}));
  while(!finish)await new Promise(resolve=>setTimeout(resolve,5));
  await assert.rejects(repo.prepare('alice',asset.id,()=>assert.fail()),{status:409,code:'REEL_PREPARING'});
  const waitingHandler=createReelHandler({repository:()=>repo,auth:async()=>({user:{id:'alice'}}),prepare:()=>assert.fail('must not start a duplicate decoder')}),waiting=response();
  await waitingHandler({method:'POST',url:'/api/reels?action=prepare',headers:{origin:'https://cuestamp.test','content-type':'application/json'},body:{id:asset.id}},waiting);assert.equal(waiting.code,202);assert.equal(waiting.body.status,'processing');
  finish({pathname:'reels/test/preview.mp3',duration:2,peaks:[0,.5,1]});await pending;
  await repo.prepare('alice',asset.id,()=>assert.fail('must reuse cache'));
  await assert.rejects(repo.publish('bob',input),{status:404});
  await assert.rejects(repo.publish('alice',{...input,revision:4}),{status:409});
  const publication=await repo.publish('alice',input);
  assert.equal((await repo.publicReel(publication.token)).tracks[0].title,'Custom title');
  assert.equal((await repo.publicReel(publication.token)).allowDownloads,true);assert.equal((await repo.publicReel(publication.token)).appearance.accent,'#abcdef');assert.equal((await repo.publicReel(publication.token)).profile.name,'Alice');assert.equal((await repo.publicReel(publication.token)).tracks[0].color,'#123456');
  await query`UPDATE reel_publications SET manifest=jsonb_set(manifest,'{allowDownloads}','false') WHERE project_id=${id}`;
  assert.equal((await repo.publicReel(publication.token)).allowDownloads,true);
  const created=(await projects.get('alice',id)).created_at;
  await projects.save('alice',{id,revision:1,data:{...data,title:'Private edit'}});
  assert.equal((await repo.publicReel(publication.token)).title,'Demo');
  assert.deepEqual((await projects.list('alice'))[0].created_at,created);
  const handler=createReelHandler({repository:()=>repo,auth:async()=>null,sign:async path=>{assert.ok(['reels/test/preview.mp3',resume.pathname].includes(path));return 'https://blob.test/signed';}});
  for(const [action,code] of [['public',200],['stream',302],['download',302],['resume',302]]){
   const res=response();await handler({method:'GET',url:`/api/reels?action=${action}&token=${publication.token}&track=${asset.id}`,headers:{}},res);assert.equal(res.code,code);
   if(action==='public'){assert.equal(res.body.reel.tracks[0].pathname,undefined);assert.equal(res.body.reel.resumePath,undefined);assert.equal(res.body.reel.hasResume,true);assert.equal(res.headers['Cache-Control'],'no-store');}
  }
  const anon=response();await handler({method:'POST',url:'/api/reels?action=publish',headers:{}},anon);assert.equal(anon.code,401);
  const owner=createReelHandler({repository:()=>repo,auth:async()=>({user:{id:'alice'}})}),csrf=response();
  await owner({method:'POST',url:'/api/reels?action=publish',headers:{origin:'https://evil.test'}},csrf);assert.equal(csrf.code,403);
  const updated=await repo.publish('alice',{...input,revision:2,allowDownloads:true});assert.equal(updated.token,publication.token);
  const download=response();await handler({method:'GET',url:`/api/reels?action=download&token=${publication.token}&track=${asset.id}`,headers:{}},download);assert.equal(download.code,302);
  await assert.rejects(repo.revoke('bob',id),{status:404});await repo.revoke('alice',id);
  await assert.rejects(repo.publicReel(publication.token),{status:404});
  const republished=await repo.publish('alice',{...input,revision:2});assert.notEqual(republished.token,publication.token);
 }finally{await db.close();}
});
test('real FFmpeg prepares a browser-compatible MP3 and waveform from an owned source',async()=>{
 const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(16036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 for(let i=0;i<8000;i++)wav.writeInt16LE(i<4000?0:Math.round(4000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
 const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':wav.length});res.end(wav);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  let stored=false;
  const result=await prepareAudio({id:crypto.randomUUID(),pathname:'owned/test.wav'},{sign:async()=>`http://127.0.0.1:${server.address().port}/tone.wav`,store:async(path,mp3,options)=>{assert.equal(options.access,'private');assert.equal(options.contentType,'audio/mpeg');assert.ok(mp3.length>1000);stored=true;return {pathname:path};}});
  assert.ok(stored);assert.ok(Math.abs(result.duration-1)<.01);assert.equal(result.peaks.length,360);assert.equal(Math.max(...result.peaks.slice(0,160)),0);assert.equal(Math.max(...result.peaks),1);
  assert.ok(waveformPeaks(Buffer.alloc(32)).every(p=>p===0));
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('signed Blob URLs preserve percent-encoded filenames and signature parameters',()=>{
 const path='media/uuid/Space%20%26%20caf%C3%A9.wav';
 const url=new URL(encodeBlobUrlPath('https://example.private.blob.vercel-storage.com/'+path+'?vercel-blob-signature=test',path));
 assert.equal(decodeURIComponent(url.pathname.slice(1)),path);
 assert.equal(url.searchParams.get('vercel-blob-signature'),'test');
});
