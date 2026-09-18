const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'region-bounce',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
 await page.addInitScript(()=>{const start=OfflineAudioContext.prototype.startRendering;OfflineAudioContext.prototype.startRendering=async function(){if(window.holdBounce)await new Promise(resolve=>window.releaseBounce=resolve);return start.call(this);};});
 await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');assert.equal(await page.getByRole('button',{name:'Bounce region',exact:true}).isDisabled(),true);
 const bytes=await page.evaluate(async()=>{const {encodeWav}=await import('/src/experimental/wav.js');const c=new OfflineAudioContext(1,44100*3,44100),b=c.createBuffer(1,44100*3,44100),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=i/44100*.1;return [...new Uint8Array(await encodeWav(b,{bitDepth:32}).arrayBuffer())];});
 await page.locator('#daw-files').setInputFiles({name:'Ramp.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes)});await page.locator('.daw-region.audio').waitFor();
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:region-bounce'))),t=initial.tracks[0],r=t.regions[0];
 await page.getByText('Command harness',{exact:true}).click();await page.locator('#daw-json').fill(JSON.stringify([
 {op:'region.set',target:r.id,values:{name:'Selected phrase',start:3,offset:.5,duration:1}},
 {op:'region.add',target:t.id,values:{name:'Unavailable unrelated audio',assetId:'missing',start:6,duration:1}},
 {op:'track.add',values:{id:'bus',kind:'bus'}},{op:'track.set',target:t.id,values:{output:'bus'}},
 {op:'effect.add',target:'bus',values:{kind:'delay',time:.1,feedback:0,mix:1}},
 {op:'automation.point',target:initial.id,values:{parameter:'gainDb',time:3,value:-6}},
 {op:'track.add',values:{id:'midi',kind:'midi'}},{op:'track.set',target:'midi',values:{solo:true}},
 {op:'region.add',target:'midi',values:{id:'midi-region',start:3,duration:1}},{op:'note.add',target:'midi-region',values:{pitch:69,duration:.5}}
 ]));await page.getByRole('button',{name:'Execute commands',exact:true}).click();await page.locator(`[data-region="${r.id}"]`).click();
 await page.locator('.daw-bounce-settings summary').click();await page.locator('[data-bounce-depth]').selectOption('32');
 await page.evaluate(()=>window.holdBounce=true);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Bounce region',exact:true}).click();await page.waitForFunction(()=>Boolean(window.releaseBounce));
 await page.locator('#daw-title').fill('Changed during bounce');await page.locator('#daw-title').dispatchEvent('change');await page.evaluate(()=>{window.holdBounce=false;window.releaseBounce();});
 const download=await pending,wav=await fs.readFile(await download.path());assert.equal(download.suggestedFilename(),'Untitled session-Selected phrase.wav');assert.ok(Math.abs(wav.readUInt32LE(44)-Math.round(1.1*44100))<=1,`Unexpected region frames: ${wav.readUInt32LE(44)}`); // ceil((1 + .1) * 44100)
 const value=t=>wav.readFloatLE(56+Math.floor(t*44100)*8);assert.equal(value(.05),0);assert.ok(Math.abs(value(.2)-.06*Math.SQRT1_2*10**(-6/20))<.00002);assert.ok(value(1.05)>.03);
 await page.locator('[data-region="midi-region"]').click();const next=page.waitForEvent('download');await page.getByRole('button',{name:'Bounce region',exact:true}).click();const midiWav=await fs.readFile(await(await next).path());assert.equal(midiWav.readUInt32LE(44),44100);assert.ok(Math.abs(midiWav.readFloatLE(56+10000*8))>.0001);
 assert.deepEqual(errors,[]);console.log('PASS actual region WAVs: selected-only media, source offset, bus delay/tail, master automation, MIDI synthesis and session snapshot during editing.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
