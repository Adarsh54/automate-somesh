import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createProjectRepository} from '../server/projects.js';
import {createMediaRepository} from '../server/media.js';

test('deleting a reel requires its owner and current revision, cascades sharing, and preserves library audio',async()=>{
 const db=new PGlite();
 try{
  for(const file of ['001_users_projects.sql','002_media_assets.sql','006_reels.sql','007_audio_edits.sql','007_reel_analytics.sql','008_reel_listen_events.sql','009_reel_share_links.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
  const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const repo=createProjectRepository(query),media=createMediaRepository(query);
  const audio=await media.reserve('alice',{filename:'score.wav',size:100});
  await media.complete('alice',audio.id,{pathname:audio.pathname,size:audio.size,contentType:audio.contentType});
  const id=crypto.randomUUID(),link=crypto.randomUUID(),listen=crypto.randomUUID();
  await repo.save('alice',{id,revision:0,data:{type:'reel',title:'Reel',status:'draft',audioIds:[audio.id]}});
  await db.query('INSERT INTO reel_publications(project_id,token,manifest) VALUES ($1,$2,$3)',[id,crypto.randomUUID(),'{}']);
  await db.query('INSERT INTO reel_share_links(id,project_id,token,name) VALUES ($1,$2,$3,$4)',[link,id,crypto.randomUUID(),'Link']);
  await db.query('INSERT INTO reel_listens(id,project_id,link_id) VALUES ($1,$2,$3)',[listen,id,link]);
  await db.query('INSERT INTO reel_listen_tracks(listen_id,track_id,track_title) VALUES ($1,$2,$3)',[listen,audio.id,'Score']);
  await assert.rejects(repo.deleteReel('bob',{id,revision:1}),{status:409});
  await assert.rejects(repo.deleteReel('alice',{id,revision:2}),{status:409});
  await assert.rejects(repo.deleteReel('alice',{id,revision:0}),{status:400});
  assert.equal((await repo.get('alice',id)).revision,1);
  assert.deepEqual(await repo.deleteReel('alice',{id,revision:1}),{id});
  await assert.rejects(repo.get('alice',id),{status:404});
  for(const table of ['reel_publications','reel_share_links','reel_listens','reel_listen_tracks'])assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,0);
  assert.deepEqual((await media.listAudio('alice')).map(a=>a.id),[audio.id]);
  const cueId=crypto.randomUUID();
  await db.query('INSERT INTO projects(id,user_id,title,data) VALUES ($1,$2,$3,$4)',[cueId,'alice','Cue','{"type":"cue"}']);
  await assert.rejects(repo.deleteReel('alice',{id:cueId,revision:1}),{status:409});
  assert.equal((await repo.get('alice',cueId)).title,'Cue');
 }finally{await db.close();}
});
