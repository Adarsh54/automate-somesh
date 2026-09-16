const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
 const assets=new Map(),projects=new Map();let uploads=0,failUpload=true;
 // Exercise the editor's real File/decode/restore path with an in-memory storage transport.
 const module=readFileSync('src/cloud-media.js','utf8').replace("import {upload} from '@vercel/blob/client';",`async function upload(path,file,options){const r=await fetch('/test-blob?path='+encodeURIComponent(path),{method:'POST',body:file});if(!r.ok)throw Error('Upload failed; retry Save project.');options.onUploadProgress({percentage:100});return {};}`);
 await page.route('**/src/cloud-media.js',r=>r.fulfill({contentType:'text/javascript',body:module}));
 await page.route('**/api/auth?**',r=>r.fulfill({json:{configured:true,user:{id:'alice',email:'alice@test'}}}));
 await page.route('**/api/projects**',r=>{
  if(r.request().method()==='POST'){const p=r.request().postDataJSON();p.title='Media test';p.revision++;p.updated_at=new Date().toISOString();projects.set(p.id,p);return r.fulfill({json:{project:p}});}
  return r.fulfill({json:{projects:[...projects.values()]}});
 });
 await page.route('**/api/media**',r=>{
  const u=new URL(r.request().url()),action=u.searchParams.get('action');
  if(action==='reserve'){const body=r.request().postDataJSON(),id=randomUUID(),asset={...body,id,pathname:id,contentType:body.filename.endsWith('.mp4')?'video/mp4':'audio/wav'};assets.set(id,asset);return r.fulfill({json:{asset}});}
  if(action==='complete')return r.fulfill({json:{asset:{id:r.request().postDataJSON().id}}});
  const a=assets.get(u.searchParams.get('id'));return r.fulfill({json:{...a,url:'/test-blob?path='+a.id}});
 });
 await page.route('**/test-blob?**',r=>{
  const a=assets.get(new URL(r.request().url()).searchParams.get('path'));
  if(r.request().method()==='POST'){if(failUpload){failUpload=false;return r.fulfill({status:503,body:'unavailable'});}a.body=r.request().postDataBuffer();uploads++;return r.fulfill({json:{ok:true}});}
  return r.fulfill({body:a.body,contentType:a.contentType});
 });
 await page.goto(process.env.CUESTAMP_URL||'http://127.0.0.1:5181/');
 await page.locator('#movie-upload').setInputFiles('/tmp/cuestamp-fixtures/movie.mp4');
 await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
 await page.locator('[data-upload]').first().setInputFiles('/tmp/cuestamp-fixtures/score.wav');
 await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
 await page.locator('#cloud-save').click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent.includes('Upload failed'));
 assert.equal(projects.size,0);assert.match(await page.locator('body').innerText(),/score/);
 await page.locator('#cloud-save').click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent==='Saved to your account.');
 assert.equal(uploads,2);assert.equal(projects.size,1);
 const saved=[...projects.values()][0].data;assert.ok(saved.media.movie);assert.equal(Object.keys(saved.media.tracks).length,1);
 await page.evaluate(()=>{const key='cuestamp-user:alice:draft',s=JSON.parse(localStorage.getItem(key));s.cues=[{id:'reviewed-cue',trackId:s.tracks[0].id,title:'Reviewed',method:'movie',start:'00:00:01:00',end:'00:00:02:00',usage:'BI',reviewed:true,staleSource:false}];s.movieOverrides={...s.movieOverrides,duration:'00:00:42'};localStorage.setItem(key,JSON.stringify(s));});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#cloud-status')?.textContent==='Media restored.');
 await page.locator('[data-track]').first().click();
 assert.equal(await page.locator('audio').count()>0,true);
 await page.locator('#cloud-copy').click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent==='Saved to your account.');
 assert.equal(uploads,2);assert.equal(projects.size,2);
 const copy=[...projects.values()][1].data;assert.equal(copy.cues[0].reviewed,true);assert.equal(copy.cues[0].staleSource,false);assert.equal(copy.movieOverrides.duration,'00:00:42');
 console.log('PASS media UI: failed upload retains draft, audio/video save, reload restores decoded media, copy reuses blobs');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
