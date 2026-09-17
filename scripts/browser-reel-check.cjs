const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const tone=Buffer.alloc(80044);tone.write('RIFF');tone.writeUInt32LE(80036,4);tone.write('WAVEfmt ',8);tone.writeUInt32LE(16,16);tone.writeUInt16LE(1,20);tone.writeUInt16LE(1,22);tone.writeUInt32LE(8000,24);tone.writeUInt32LE(16000,28);tone.writeUInt16LE(2,32);tone.writeUInt16LE(16,34);tone.write('data',36);tone.writeUInt32LE(80000,40);for(let i=0;i<40000;i++)tone.writeInt16LE(Math.round(3000*Math.sin(2*Math.PI*440*i/8000)*(Math.sin(i/4000)**2)),44+i*2);
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5190/';
  if(!process.env.CUESTAMP_REEL_URL){
   await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:null}}));
   await page.goto(base);await page.getByRole('button',{name:'Continue as guest'}).click();await page.locator('.new-project-fab').click();await page.getByRole('button',{name:/Reels Create/}).click();
   await page.locator('#reel-title').fill('After Hours — Selected Works');await page.locator('#reel-upload').setInputFiles({name:'Midnight.wav',mimeType:'audio/wav',buffer:tone});await page.locator('[data-reel-title]').waitFor();await page.locator('[data-reel-title]').fill('Where the Light Stays');
   await page.locator('#preview-reel').click();await page.locator('.reel-player').waitFor();await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.reel-now time')?.textContent.startsWith('0:01'));
   await page.getByRole('button',{name:'Pause',exact:true}).click();await page.screenshot({path:'/tmp/cuestamp-reel-editor.png',fullPage:true});
   await page.locator('aside').getByRole('link',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Leave workspace',exact:true}).click();await page.locator('.reel-player').waitFor({state:'detached'});assert.equal(await page.locator('.reel-player').count(),0);
   const manifest={title:'After Hours — Selected Works',allowDownloads:true,tracks:[{id:'one',title:'Where the Light Stays',duration:5,peaks:Array.from({length:360},(_,i)=>Math.abs(Math.sin(i/25))*Math.abs(Math.sin(i/3)))}]};
   await page.route('**/api/reels*',r=>{const action=new URL(r.request().url()).searchParams.get('action');return action==='public'?r.fulfill({json:{reel:manifest}}):(()=>{const range=r.request().headers().range;const start=Number(range?.match(/bytes=(\d+)/)?.[1]||0);return r.fulfill({status:range?206:200,body:tone.subarray(start),headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${tone.length-1}/${tone.length}`}:{})}});})();});
   await page.goto(new URL('reel.html?token=demo',base).href);
  }else await page.goto(process.env.CUESTAMP_REEL_URL);
  await page.locator('.reel-player').waitFor();await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.reel-now time')?.textContent.startsWith('0:01'));await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('slider',{name:'Seek through track'}).fill('650');await page.getByRole('slider',{name:'Seek through track'}).dispatchEvent('input');await page.waitForFunction(()=>document.querySelector('.reel-now time')?.textContent.startsWith('0:03')); 
  await page.getByRole('button',{name:'Mute',exact:true}).click();await page.getByRole('button',{name:'Unmute',exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');await page.locator('.reel-download').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.mp3$/);
  await page.screenshot({path:'/tmp/cuestamp-reel-public.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/cuestamp-reel-mobile.png',fullPage:true});
  await page.goto(page.url()+'&embed=1&theme=light');await page.locator('.reel-player').waitFor();assert.equal(await page.locator('body.embedded.light').count(),1);assert.equal(await page.locator('aside').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS reel playback, seek, pause, mute, MP3 download, mobile layout and standalone embed'+(process.env.CUESTAMP_REEL_URL?' (live backend).':' plus guest preview.'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
