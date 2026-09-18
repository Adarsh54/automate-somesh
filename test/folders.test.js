import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createFoldersRepository} from '../server/folders.js';
import {createProjectRepository} from '../server/projects.js';

async function setup() {
 const db=new PGlite();
 for(const file of ['001_users_projects.sql','002_media_assets.sql','010_folders.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','a@test'),('bob','b@test')");
 const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
 return {db,query,folders:createFoldersRepository(query),projects:createProjectRepository(query)};
}

test('folders are created, renamed and listed per owner, isolated from other accounts',async()=>{
 const {db,folders}=await setup();
 try{
  const scores=await folders.create('alice',{name:'  Film scores  '});
  assert.equal(scores.name,'Film scores');
  await folders.create('alice',{name:'Client work'});
  assert.deepEqual((await folders.list('alice')).map(f=>f.name),['Client work','Film scores']);
  assert.deepEqual(await folders.list('bob'),[]);
  await assert.rejects(folders.create('alice',{name:'  '}),{status:400});
  const renamed=await folders.rename('alice',{id:scores.id,name:'Feature scores'});
  assert.equal(renamed.name,'Feature scores');
  await assert.rejects(folders.rename('bob',{id:scores.id,name:'Stolen'}),{status:404});
 }finally{await db.close();}
});

test('deleting a folder clears it from any project instead of deleting the project',async()=>{
 const {db,folders,projects}=await setup();
 try{
  const folder=await folders.create('alice',{name:'Reels for the label'});
  const id=crypto.randomUUID();
  await projects.save('alice',{id,revision:0,data:{type:'cue',production:{title:'Cue',rate:'24'},tracks:[],cues:[],sharedCueDetails:{category:'unknown',credits:[]},mode:'manual',movieOffset:'0',silenceGap:1,thresholdDb:-40,matchThreshold:0.5}});
  await projects.moveProject('alice',{id,folderId:folder.id});
  assert.equal((await projects.list('alice')).find(p=>p.id===id).folderId,folder.id);
  await folders.remove('alice',{id:folder.id});
  assert.equal((await projects.list('alice')).find(p=>p.id===id).folderId,null);
  await assert.rejects(folders.remove('alice',{id:folder.id}),{status:404});
 }finally{await db.close();}
});

test('moving a project requires ownership of both the project and the target folder',async()=>{
 const {db,folders,projects}=await setup();
 try{
  const aliceFolder=await folders.create('alice',{name:'Alice folder'});
  const bobFolder=await folders.create('bob',{name:'Bob folder'});
  const id=crypto.randomUUID();
  await projects.save('alice',{id,revision:0,data:{type:'cue',production:{title:'Cue',rate:'24'},tracks:[],cues:[],sharedCueDetails:{category:'unknown',credits:[]},mode:'manual',movieOffset:'0',silenceGap:1,thresholdDb:-40,matchThreshold:0.5}});
  await assert.rejects(projects.moveProject('alice',{id,folderId:bobFolder.id}),{status:404});
  await assert.rejects(projects.moveProject('bob',{id,folderId:aliceFolder.id}),{status:404});
  const moved=await projects.moveProject('alice',{id,folderId:aliceFolder.id});
  assert.equal(moved.folderId,aliceFolder.id);
  const cleared=await projects.moveProject('alice',{id,folderId:null});
  assert.equal(cleared.folderId,null);
 }finally{await db.close();}
});
