// Development-only: real Neon and private Blob, synthetic identity, no WorkOS login.
import {neon} from '@neondatabase/serverless';
import {del} from '@vercel/blob';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createMediaHandler} from '../api/media.js';
import {createMediaRepository} from '../server/media.js';
import {createProjectRepository} from '../server/projects.js';

if(process.env.APP_URL!=='http://127.0.0.1:5190')throw Error('Use the documented local development environment only.');
if(!process.env.DATABASE_URL||!process.env.BLOB_READ_WRITE_TOKEN)throw Error('Development Neon and Blob configuration are required.');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const query=neon(process.env.DATABASE_URL);
const [target]=await query.query("SELECT current_setting('neon.branch_id',true) AS branch");
if(target.branch!=='br-withered-violet-a5u6xm3o')throw Error('This check is restricted to the documented local-development Neon branch.');
const [schema]=await query.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='folder_id') AS ready");
if(!schema.ready)throw Error('Development schema is stale. Run npm run db:migrate first.');
const user='daw-smoke-'+randomUUID();
const media=createMediaRepository(query),projects=createProjectRepository(query);
const mediaHandler=createMediaHandler({auth:async()=>({user:{id:user}}),repository:()=>media});
let browser;
try {
  await query`INSERT INTO app_users(id,email) VALUES(${user},${user+'@example.invalid'})`;
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // Only authentication and HTTP transport are adapted. Repository, token generation,
  // multipart browser upload, Blob completion and signed downloads use real services.
  await page.route('**/api/auth?*',route=>route.fulfill({json:{configured:true,user:{id:user,email:user+'@example.invalid'},profile:{name:'DAW smoke',occupation:'Test',complete:true}}}));
  await page.route('**/api/daw',route=>route.fulfill({json:{configured:false}}));
  await page.route('**/api/projects*',async route=>{
    const request=route.request(),url=new URL(request.url());
    try {
      if(url.searchParams.get('action')==='folders')return route.fulfill({json:{folders:[]}});
      if(request.method()==='POST')return route.fulfill({json:{project:await projects.save(user,request.postDataJSON())}});
      const id=url.searchParams.get('id');
      return route.fulfill({json:id?{project:await projects.get(user,id)}:{projects:await projects.list(user)}});
    }catch(error){return route.fulfill({status:error.status||500,json:{error:error.message}});}
  });
  await page.route('**/api/media*',async route=>{
    const request=route.request(),response={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
    await mediaHandler({url:request.url(),method:request.method(),headers:{...request.headers(),origin:process.env.APP_URL},body:request.method()==='POST'?request.postDataJSON():undefined},response);
    await route.fulfill({status:response.code,json:response.body});
  });
  const wav=Buffer.alloc(44+32000*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  for(let i=0;i<32000;i++)wav.writeInt16LE(Math.round(4000*Math.sin(i*2*Math.PI*440/16000)),44+i*2);
  await page.goto(process.env.APP_URL+'/#/experimental');
  await page.locator('#daw-files').setInputFiles({name:'DAW source & round trip.wav',mimeType:'audio/wav',buffer:wav});
  await page.locator('.daw-region.audio').waitFor();
  await page.locator('#daw-title').fill('Synthetic cloud DAW round trip');
  await page.locator('#daw-title').dispatchEvent('change');
  await page.getByRole('button',{name:'Save to account',exact:true}).click();
  await page.getByText('Session saved to your account.',{exact:true}).waitFor({timeout:120000});
  const listed=await projects.list(user);
  assert.equal(listed.length,1);assert.equal(listed[0].type,'daw');
  const saved=await projects.get(user,listed[0].id),assetIds=Object.values(saved.data.assets);
  assert.equal(assetIds.length,1);
  assert.equal((await media.get(user,assetIds[0])).ready,true);
  await assert.rejects(projects.get(user+'-other',saved.id),{status:404});
  await assert.rejects(projects.save(user,{id:saved.id,revision:0,data:saved.data}),{status:409});
  // Remove all device copies, then restore through Projects and a real signed Blob URL.
  await page.evaluate(async()=>{
    localStorage.clear();
    await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('cuestamp-experimental');request.onsuccess=resolve;request.onerror=()=>reject(request.error);});
  });
  await page.goto(process.env.APP_URL+'/#/projects');
  await page.reload();
  await page.locator(`[data-cloud-open="${saved.id}"]`).first().click();
  await page.locator('.daw-region.audio').waitFor({timeout:120000});
  const restored=await page.evaluate(async user=>{
    const {assetStore}=await import('/src/experimental/media-store.js');
    const records=await assetStore(user,'readonly');
    return {count:records.length,bytes:Array.from(new Uint8Array(await records[0].file.arrayBuffer()))};
  },user);
  assert.equal(restored.count,1);assert.deepEqual(Buffer.from(restored.bytes),wav);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>parseFloat(document.querySelector('[data-clock]').textContent)>.2);
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.getByRole('button',{name:'Save to account',exact:true}).click();
  await page.getByText('Session saved to your account.',{exact:true}).waitFor({timeout:30000});
  assert.equal((await projects.get(user,saved.id)).revision,2);
  assert.equal((await query`SELECT id FROM media_assets WHERE user_id=${user}`).length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS live development Neon + private multipart Blob upload + source-byte restoration + playback + revision update without duplicate media. WorkOS login is mocked.');
} finally {
  await browser?.close();
  const paths=(await query`SELECT pathname FROM media_assets WHERE user_id=${user}`).map(row=>row.pathname);
  try {if(paths.length)await del(paths);}
  finally {await query`DELETE FROM app_users WHERE id=${user}`;}
  console.log('Removed synthetic DAW test media, projects and account.');
}
