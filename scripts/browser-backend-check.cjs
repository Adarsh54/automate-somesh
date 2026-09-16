const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage(),assets=new Map(),errors=[];let fail=false,delay=false,requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Replace only transport. The real Workflow and BackendAnalysis classes drive the UI.
  const module=readFileSync('src/backend-analysis.js','utf8').replace("import {upload} from '@vercel/blob/client';",`async function upload(path,file,options){options.onUploadProgress({percentage:100});return {};}`);
  await page.route('**/src/backend-analysis.js*',r=>r.fulfill({contentType:'text/javascript',body:module}));
  await page.route('**/api/auth?**',r=>r.fulfill({json:{configured:true,user:null}}));
  await page.route('**/api/analysis?**',async r=>{
   const action=new URL(r.request().url()).searchParams.get('action'),body=r.request().postDataJSON();requests.push({action,body});
   if(action==='reserve'){const id=randomUUID(),asset={...body,id,pathname:'analysis/'+id+'/source',contentType:'audio/wav'};assets.set(id,asset);return r.fulfill({json:{asset}});}
   if(action==='decode')return r.fulfill({json:{assetId:body.id,duration:20,codec:'pcm',frameMetrics:{frameRateIsConstant:true,underlyingFrameRate:24},embeddedTimecode:null}});
   if(action==='detect') {
    assert.equal(typeof body.id,'string');assert.ok(assets.has(body.id));assert.equal(body.samples,undefined);
    if(delay)await new Promise(resolve=>setTimeout(resolve,700));
    return r.fulfill(fail?{status:503,json:{error:'Please retry processing.'}}:{json:{matches:[{start:2,end:6,score:.9}]}}).catch(()=>{});
   }
  });
  await page.goto(process.env.CUESTAMP_URL||'http://127.0.0.1:5184/');
  await page.locator('#continue-guest').click();
  const file={name:'movie.mp4',mimeType:'video/mp4',buffer:Buffer.from('mock media')};
  await page.locator('#movie-upload').setInputFiles(file);
  await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  await page.locator('#movie-preview').waitFor({state:'attached'}).catch(async error=>{console.error(await page.locator('body').innerText(),requests,errors);throw error;});
  await page.locator('[data-upload]').setInputFiles({...file,name:'score.wav',mimeType:'audio/wav'});
  await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-v1')));
  let state=await saved();assert.equal(state.cues.length,1);const cue=state.cues[0];
  assert.equal(requests.filter(r=>r.action==='decode').length,2);
  assert.equal(requests.find(r=>r.action==='detect').body.mode,'movie');
  fail=true;await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  assert.deepEqual((await saved()).cues,[cue]);assert.match(await page.locator('body').innerText(),/Please retry processing/);
  fail=false;delay=true;await page.locator('#analyze').click();await page.locator('#cancel-analysis').click();
  await page.waitForTimeout(900);assert.deepEqual((await saved()).cues,[cue]);
  delay=false;await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  state=await saved();assert.equal(state.cues.length,1);assert.equal(state.cues[0].id,cue.id);
  assert.deepEqual(errors,[]);
  console.log('PASS backend browser integration: guest uploads, ID-only requests, detection, failed rerun, cancellation, retry and retained cue identity.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
