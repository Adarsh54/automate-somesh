import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createProjectRepository,parseProject} from '../server/projects.js';
import {createMediaRepository} from '../server/media.js';
import {createMediaHandler} from '../api/media.js';
test('reel drafts validate separately and cannot masquerade as completed cues',()=>{
 const data={type:'reel',title:'My reel',status:'draft',audioIds:[]},id=crypto.randomUUID();
 assert.equal(parseProject({id,revision:0,data}).data.type,'reel');
 for(const invalid of [{...data,title:' '},{...data,status:'completed'},{...data,type:'other'},{...data,audioIds:['invalid']},{...data,audioIds:[id,id]}])assert.throws(()=>parseProject({id,revision:0,data:invalid}),{status:400});
});
test('reels and shared audio preserve ownership, media readiness, project types and revisions',async()=>{
 const db=new PGlite();
 try{
  for(const f of ['001_users_projects.sql','002_media_assets.sql','007_audio_edits.sql','010_folders.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
  const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const media=createMediaRepository(query),projects=createProjectRepository(query);
  const audio=await media.reserve('alice',{filename:'score.wav',size:100});
  const video=await media.reserve('alice',{filename:'film.mp4',size:100});
  const data={type:'reel',title:'Film reel',status:'draft',audioIds:[audio.id]},id=crypto.randomUUID();
  assert.deepEqual(await media.listAudio('alice'),[]);
  await assert.rejects(projects.save('alice',{id,revision:0,data}),{message:'MEDIA_NOT_READY'});
  for(const a of [audio,video])await media.complete('alice',a.id,{pathname:a.pathname,size:a.size,contentType:a.contentType});
  assert.deepEqual((await media.listAudio('alice')).map(a=>a.id),[audio.id]);
  assert.deepEqual(await media.listAudio('bob'),[]);
  await assert.rejects(projects.save('bob',{id,revision:0,data}),{message:'MEDIA_NOT_READY'});
  await assert.rejects(projects.save('alice',{id,revision:0,data:{...data,audioIds:[video.id]}}),{message:'INVALID_REEL_AUDIO'});
  const saved=await projects.save('alice',{id,revision:0,data});
  assert.equal(saved.type,'reel');assert.equal(saved.status,'draft');
  assert.deepEqual((await projects.get('alice',id)).data,data);
  await assert.rejects(projects.get('bob',id),{status:404});
  await projects.save('alice',{id,revision:1,data:{...data,title:'Renamed reel'}});
  await assert.rejects(projects.save('alice',{id,revision:1,data}),{status:409});
  const cue={production:{title:'Cue project',rate:'24'},tracks:[],cues:[],sharedCueDetails:{category:'unknown',credits:[]},mode:'manual',movieOffset:'',silenceGap:3,thresholdDb:-100,matchThreshold:.45};
  await assert.rejects(projects.save('alice',{id,revision:2,data:cue}),{status:409});
  await projects.save('alice',{id:crypto.randomUUID(),revision:0,data:cue});
  assert.deepEqual(new Set((await projects.list('alice')).map(p=>p.type)),new Set(['cue','reel']));
  const handler=createMediaHandler({auth:async()=>({user:{id:'alice'}}),repository:()=>media});
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
  await handler({method:'GET',url:'/api/media?action=list',headers:{}},res);
  assert.equal(res.code,200);assert.equal(res.body.assets.length,1);assert.equal(res.body.assets[0].pathname,undefined);
 }finally{await db.close();}
});
