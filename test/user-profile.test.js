import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createUserProfileRepository} from '../server/user-profile.js';
import auth from '../api/auth.js';
test('profile onboarding, validation and owner isolation persist in Postgres',async()=>{
 const db=new PGlite();try{
  for(const file of ['001_users_projects.sql','004_user_profiles.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  await db.exec("INSERT INTO app_users(id,email,first_name) VALUES('alice','alice@test','Alice'),('bob','bob@test','Bob')");
  const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  const repo=createUserProfileRepository(query);
  assert.deepEqual(await repo.get('alice'),{name:'Alice',occupation:'',complete:false});
  await assert.rejects(repo.save('alice',{name:' ',occupation:'Composer'}),{status:400});
  await assert.rejects(repo.save('alice',{name:'Alice',occupation:'x'.repeat(121)}),{status:400});
  await repo.save('alice',{name:' Alice Smith ',occupation:' Composer ',id:'bob'});
  assert.deepEqual(await repo.get('alice'),{name:'Alice Smith',occupation:'Composer',complete:true});
  assert.equal((await repo.get('bob')).complete,false);
  await db.exec("UPDATE app_users SET first_name='Provider name' WHERE id='alice'");
  assert.equal((await repo.get('alice')).name,'Alice Smith');
 }finally{await db.close();}
});
test('profile writes require authentication and same-origin requests',async()=>{
 Object.assign(process.env,{WORKOS_API_KEY:'test',WORKOS_CLIENT_ID:'test',SESSION_SECRET:'x'.repeat(40),APP_URL:'https://cuestamp.test',DATABASE_URL:'postgresql://unused'});
 const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
 const missing=res();await auth({method:'POST',url:'/api/auth?action=profile',headers:{origin:'https://cuestamp.test'}},missing);assert.equal(missing.code,401);
 const csrf=res();await auth({method:'POST',url:'/api/auth?action=profile',headers:{origin:'https://evil.test'}},csrf);assert.equal(csrf.code,403);
});
