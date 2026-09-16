const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
function wav(seconds){const samples=2000*seconds,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(2000,24);b.writeUInt32LE(4000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i*.6)*12000),44+i*2);return b;}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage(),assets=new Map(),calls=[],errors=[];let fail=false,slow=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>sessionStorage.setItem('cuestamp-guest','yes'));
  // Exact 100 MB boundary is unit-tested. Lower only the test threshold to use tiny real WAVs.
  await page.route('**/src/processing-policy.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const BROWSER_MAX_MB=.01;export const BROWSER_MAX_BYTES=10000;export const useBackend=file=>file.size>BROWSER_MAX_BYTES;'}));
  const backend=readFileSync('src/backend-analysis.js','utf8').replace("import {upload} from '@vercel/blob/client';",`async function upload(path,file,options){options.onUploadProgress({percentage:100});}`);
  await page.route('**/src/backend-analysis.js*',r=>r.fulfill({contentType:'text/javascript',body:backend}));
  await page.route('**/api/auth?**',r=>r.fulfill({json:{configured:true,user:null}}));
  await page.route('**/api/analysis?**',async r=>{
   const action=new URL(r.request().url()).searchParams.get('action'),body=r.request().postDataJSON();calls.push({action,body});
   if(action==='reserve'){const id=randomUUID(),asset={...body,id,pathname:'analysis/'+id+'/source',contentType:'audio/wav'};assets.set(id,asset);return r.fulfill({json:{asset}});}
   if(action==='decode')return r.fulfill({json:{assetId:body.id,duration:3,codec:'pcm',frameMetrics:null,embeddedTimecode:null}});
   if(action==='detect'){
    if(slow)await new Promise(resolve=>setTimeout(resolve,600));
    return r.fulfill(fail?{status:503,json:{error:'Retry server processing.'}}:{json:{matches:[{start:.5,end:2.5}]}}).catch(()=>{});
   }
  });
  await page.goto(process.env.CUESTAMP_URL||'http://127.0.0.1:5184/');
  await page.locator('[data-mode="offset"]').click();
  const small={name:'small.wav',mimeType:'audio/wav',buffer:wav(1)},large={name:'large.wav',mimeType:'audio/wav',buffer:wav(3)};
  await page.locator('[data-upload]').setInputFiles([small,large]);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cuestamp-v1'))?.tracks.length===2);
  assert.deepEqual(calls.filter(c=>c.action==='reserve').map(c=>c.body.filename),['large.wav']);
  await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-v1')));
  const cues=(await saved()).cues;assert.equal(cues.length,2);assert.equal(calls.filter(c=>c.action==='detect').length,1);
  fail=true;await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  assert.deepEqual((await saved()).cues,cues);assert.match(await page.locator('body').innerText(),/Retry server processing/);
  fail=false;slow=true;await page.locator('#analyze').click();await page.locator('#cancel-analysis').click();await page.waitForTimeout(800);
  assert.deepEqual((await saved()).cues,cues);
  slow=false;await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
  assert.deepEqual((await saved()).cues.map(c=>c.id),cues.map(c=>c.id));assert.deepEqual(errors,[]);
  console.log('PASS hybrid browser: small WAV decodes locally without upload, large WAV uses backend, mixed results, failed rerun/cancellation preserve cues, retry retains IDs.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
