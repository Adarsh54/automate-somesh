import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ffmpeg from 'ffmpeg-static';
import {parseEdit,editFilter,saveAudioEdit} from '../server/audio-edits.js';
import {runBinary} from '../server/audio-processing.js';
import {createMediaRepository} from '../server/media.js';
const edit={start:1,end:3,fadeIn:.5,fadeOut:.5,normalize:true};
test('audio edits validate snippets and fades',()=>{
 assert.deepEqual(parseEdit(edit),edit);
 for(const patch of [{start:-1},{end:1},{end:Infinity},{fadeIn:3},{fadeOut:-1},{normalize:'true'},{targetPeakDb:1},{targetPeakDb:-61},{targetPeakDb:NaN}])assert.throws(()=>parseEdit({...edit,...patch}),{status:400});
});
test('FFmpeg trims, applies gain, and fades both edges',async()=>{
 const pcm=await runBinary(ffmpeg,['-v','error','-f','lavfi','-i','aevalsrc=0.25:s=8000:d=4','-af',editFilter(edit,2),'-f','f32le','pipe:1'],AbortSignal.timeout(10000));
 assert.equal(pcm.length,2*8000*4);
 assert.ok(Math.abs(pcm.readFloatLE(0))<.001);
 assert.ok(Math.abs(pcm.readFloatLE(8000*4)-.5)<.001);
 assert.ok(Math.abs(pcm.readFloatLE(pcm.length-4))<.001);
});
test('audio edits keep originals, link copies, replace only the library version and enforce ownership',async()=>{
 const db=new PGlite();
 try{
  for(const f of ['001_users_projects.sql','002_media_assets.sql','007_audio_edits.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
  const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const repo=createMediaRepository(query),original=await repo.reserve('alice',{filename:'Original.wav',size:100});
  await repo.complete('alice',original.id,{pathname:original.pathname,size:100,contentType:'audio/wav'});
  let calls=0;
  const render=async source=>{calls++;assert.equal(source.id,original.id);return {pathname:'edits/'+crypto.randomUUID(),size:80};};
  const input={id:original.id,edit,mode:'copy'};
  await assert.rejects(saveAudioEdit(repo,'bob',input,{render}),{status:404});assert.equal(calls,0);
  const copy=await saveAudioEdit(repo,'alice',input,{render});
  assert.equal(copy.source_id,original.id);assert.equal(copy.parent_id,original.id);
  assert.equal((await repo.get('alice',original.id)).superseded_by,null);
  const replacement=await saveAudioEdit(repo,'alice',{...input,id:copy.id,mode:'replace'},{render});
  assert.equal(replacement.source_id,original.id);assert.equal(replacement.parent_id,copy.id);
  assert.equal((await repo.get('alice',copy.id)).superseded_by,replacement.id);
  assert.equal((await repo.get('alice',original.id)).pathname,original.pathname);
  let removed=false;
  await assert.rejects(saveAudioEdit(repo,'alice',{...input,id:copy.id,mode:'replace'},{render,remove:async()=>{removed=true;}}),{status:409});assert.ok(removed);
 }finally{await db.close();}
});

test('server normalizes only the selected snippet, ignoring louder audio outside it',async()=>{
 const {createServer}=await import('node:http');
 const {renderEdit}=await import('../server/audio-edits.js');
 const wav=await runBinary(ffmpeg,['-v','error','-f','lavfi','-i','aevalsrc=if(between(t\\,1\\,3)\\,0.25\\,0.8):s=8000:d=4','-c:a','pcm_s16le','-f','wav','pipe:1'],AbortSignal.timeout(10000));
 const server=createServer((req,res)=>{res.setHeader('Content-Type','audio/wav');res.setHeader('Content-Length',wav.length);res.end(wav);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  let bytes;
  const dependencies={sign:async()=>`http://127.0.0.1:${server.address().port}/source.wav`,store:async(path,data)=>{bytes=data;return {pathname:path};}};
  const result=await renderEdit({pathname:'original'},{...edit,targetPeakDb:-6},dependencies);
  assert.equal(bytes.toString('ascii',0,4),'fLaC');assert.equal(result.size,bytes.length);
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'edit-test-'));
  try{
   const path=join(dir,'result.flac');await writeFile(path,bytes);
   const pcm=await runBinary(ffmpeg,['-v','error','-i',path,'-f','f32le','pipe:1'],AbortSignal.timeout(10000));
   assert.equal(pcm.length,2*8000*4);
   assert.ok(Math.abs(pcm.readFloatLE(8000*4)-10**(-6/20))<.001);
   assert.ok(Math.abs(pcm.readFloatLE(0))<.001);assert.ok(Math.abs(pcm.readFloatLE(pcm.length-4))<.001);
  }finally{await rm(dir,{recursive:true,force:true});}
  await assert.rejects(renderEdit({pathname:'original'},{...edit,end:8},dependencies),{status:400});
 }finally{await new Promise(resolve=>server.close(resolve));}
});
