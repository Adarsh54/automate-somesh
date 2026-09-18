import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createCreditProfilesRepository} from '../server/credit-profiles.js';
test('account credit profiles isolate owners, survive reloads and reject stale edits',async()=>{
 const db=new PGlite();try{
  for(const f of ['001_users_projects.sql','005_credit_profiles.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_users(id,email) VALUES('alice','a@test'),('bob','b@test')");
  const sql=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const repo=createCreditProfilesRepository(sql),data={id:'preset',name:'My credits',category:'original',address:'123 Music Lane',preparedBy:'Alice Writer',email:'alice@example.com',credits:[{role:'Composer',last:'Writer',share:100}]};
  const saved=await repo.save('alice',data);assert.equal(saved.revision,1);
  const restored=(await repo.list('alice'))[0];
  assert.equal(restored.address,data.address);assert.equal(restored.preparedBy,data.preparedBy);assert.equal(restored.email,data.email);
  await assert.rejects(repo.save('alice',{...data,id:'invalid-email',email:'not-an-email'}),{status:400});
  assert.equal((await repo.list('bob')).length,0);
  await assert.rejects(repo.remove('bob',{id:'preset',revision:1}),{status:409});
  await assert.rejects(repo.save('bob',{...data,revision:1}),{status:409});
  const updated=await repo.save('alice',{...saved,name:'Updated'});assert.equal(updated.revision,2);
  await assert.rejects(repo.save('alice',saved),{status:409});
  await repo.save('alice',data,{importOnly:true});assert.equal((await repo.list('alice'))[0].name,'Updated');
  await repo.remove('alice',{id:'preset',revision:2});assert.equal((await repo.list('alice')).length,0);
 }finally{await db.close();}
});
