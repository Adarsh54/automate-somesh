const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const JSZip=require('jszip');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true,args:['--disable-audio-output']});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'bounce-test',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  await page.getByText('Session restored on this device.',{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-audio-input-refresh]')?.disabled);
  if(!await page.locator('#daw-json').isVisible())await page.getByText('Command harness',{exact:true}).click();
  await page.locator('#daw-json').fill(JSON.stringify([
   {op:'track.add',values:{id:'tone',kind:'midi',name:'Tone'}},
   {op:'region.add',target:'tone',values:{id:'region',duration:1}},
   {op:'note.add',target:'region',values:{pitch:69,start:0,duration:.5,velocity:1}}
  ]));
  await page.getByRole('button',{name:'Execute commands',exact:true}).click();
  if(!await page.locator('[data-bounce-rate]').isVisible())await page.locator('.daw-bounce-settings summary').click();
  await page.locator('[data-bounce-rate]').selectOption('48000');
  await page.locator('[data-bounce-depth]').selectOption('24');
  // Space automated downloads to avoid Chromium's rapid-download throttle.
  const download=async name=>{await new Promise(resolve=>setTimeout(resolve,1100));const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();return fs.readFile(await (await pending).path());};
  const wav=await download('Bounce WAV');
  assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav.readUInt16LE(34),24);
  assert.equal(wav.readUInt32LE(40),48000*2*3);
  // The note must already sound at 10 ms, not after the real-time 25 ms startup delay.
  let peak=0;for(let frame=480;frame<600;frame++){peak=Math.max(peak,Math.abs(wav.readIntLE(44+frame*6,3)));}
  assert.ok(peak>1000,`Unexpected silent leading padding: ${peak}`);
  if(!await page.locator('[data-bounce-rate]').isVisible())await page.locator('.daw-bounce-settings summary').click();
  await page.locator('[data-bounce-dither]').selectOption('tpdf');
  for(const depth of [16,24]){
   await page.locator('[data-bounce-depth]').selectOption(String(depth));
   const dithered=await download('Bounce WAV'),bytes=depth/8;
   let nonzero=0;for(let frame=47000;frame<48000;frame++)for(let c=0;c<2;c++){
    const sample=dithered.readIntLE(44+(frame*2+c)*bytes,bytes);
    assert.ok(Math.abs(sample)<=1,`Dithered silence exceeded one LSB: ${sample}`);nonzero+=sample!==0;
   }
   assert.ok(nonzero>300&&nonzero<700,`Expected dither in ${depth}-bit export: ${nonzero}`);
  }
  await page.locator('[data-bounce-depth]').selectOption('32');
  assert.equal(await page.locator('[data-bounce-dither]').isDisabled(),true);

  const zip=await JSZip.loadAsync(await download('Bounce stems'));
  const entries=Object.values(zip.files).filter(f=>!f.dir);assert.equal(entries.length,1);
  const float=await entries[0].async('nodebuffer');assert.equal(float.readUInt16LE(20),3);
  assert.equal(float.readUInt16LE(34),32);assert.equal(float.readUInt32LE(24),48000);
  assert.equal(float.readUInt32LE(44),48000);assert.equal(float.readUInt32LE(52),48000*2*4);
  for(let frame=47000;frame<48000;frame++)assert.equal(float.readFloatLE(56+frame*8),0,'Float must ignore the selected dither');
  // Verify the browser can decode the actual exported float WAV, not only its header.
  const decoded=await page.evaluate(async bytes=>{const ctx=new AudioContext();try{const b=await ctx.decodeAudioData(new Uint8Array(bytes).buffer);return {duration:b.duration,channels:b.numberOfChannels};}finally{await ctx.close();}},[...float]);
  assert.equal(decoded.duration,1);assert.equal(decoded.channels,2);
  // Grouped export must sum routed instruments before shared bus processing.
  if(!await page.locator('#daw-json').isVisible())await page.getByText('Command harness',{exact:true}).click();
  await page.locator('#daw-json').fill(JSON.stringify([
   {op:'track.add',values:{id:'group',kind:'bus',name:'Drums'}},
   {op:'track.set',target:'tone',values:{output:'group'}},
   {op:'effect.add',target:'group',values:{kind:'compressor',threshold:-30,ratio:8}},
   {op:'track.add',values:{id:'second',kind:'midi',name:'Second'}},
   {op:'track.set',target:'second',values:{output:'group'}},
   {op:'region.add',target:'second',values:{id:'second-region',duration:1}},
   {op:'note.add',target:'second-region',values:{pitch:60,start:.1,duration:.5,velocity:.8}},
   {op:'track.add',values:{id:'direct',kind:'midi',name:'Bass'}},
   {op:'region.add',target:'direct',values:{id:'direct-region',duration:1}},
   {op:'note.add',target:'direct-region',values:{pitch:48,start:.2,duration:.5,velocity:.7}}
  ]));
  await page.getByRole('button',{name:'Execute commands',exact:true}).click();
  if(!await page.locator('[data-bounce-rate]').isVisible())await page.locator('.daw-bounce-settings summary').click();
  await page.locator('[data-bounce-stems]').selectOption('groups');
  const groupedZip=await JSZip.loadAsync(await download('Bounce stems'));
  const groupedEntries=Object.values(groupedZip.files).filter(f=>!f.dir);
  assert.deepEqual(groupedEntries.map(f=>f.name),['01-Drums.wav','02-Bass.wav']);
  const groupedBuffers=await Promise.all(groupedEntries.map(f=>f.async('nodebuffer')));
  const mix=await download('Bounce WAV');
  assert.ok(groupedBuffers.every(b=>b.length===mix.length));
  // Shared compression inside one group is rendered with its instruments together.
  // With no cross-group nonlinear processing these files reconstruct the full mix.
  let peakError=0,energy=0;
  for(let offset=56;offset<mix.length;offset+=4){
   const sum=groupedBuffers.reduce((n,b)=>n+b.readFloatLE(offset),0);
   peakError=Math.max(peakError,Math.abs(sum-mix.readFloatLE(offset)));energy+=sum*sum;
  }
  assert.ok(energy>1);assert.ok(peakError<.000001,`Group sum mismatch: ${peakError}`);
  const beforeMaster=JSON.parse((await download('Export session JSON')).toString());
  if(!await page.locator('#daw-json').isVisible())await page.getByText('Command harness',{exact:true}).click();
  await page.locator('#daw-json').fill(JSON.stringify([
   {op:'session.set',values:{masterDb:-6,masterPan:1}},
   {op:'automation.point',target:beforeMaster.id,values:{parameter:'gainDb',time:0,value:-12}},
   {op:'effect.add',target:beforeMaster.id,values:{kind:'eq',type:'lowpass',frequency:20,q:.7}}
  ]));await page.getByRole('button',{name:'Execute commands',exact:true}).click();
  const full=await download('Bounce WAV');
  const setMaster=async value=>{await page.locator('.daw-bounce-settings').evaluate(el=>{el.open=true;});await page.locator('[data-bounce-master]').selectOption(value);};
  await setMaster('noInserts');const noInserts=await download('Bounce WAV');
  await setMaster('bypass');const bypass=await download('Bounce WAV');
  let fullEnergy=0,noInsertEnergy=0,originalEnergy=0;
  for(let offset=56;offset<mix.length;offset+=4){const original=mix.readFloatLE(offset);originalEnergy+=original*original;fullEnergy+=full.readFloatLE(offset)**2;noInsertEnergy+=noInserts.readFloatLE(offset)**2;assert.ok(Math.abs(bypass.readFloatLE(offset)-original)<1e-6);if((offset-56)%8===0)assert.ok(Math.abs(noInserts.readFloatLE(offset))<1e-6);}
  assert.ok(fullEnergy<noInsertEnergy*.05,'Master lowpass should strongly attenuate these notes');
  // Hard-right Web Audio stereo panning sums these identical L/R channels.
  assert.ok(Math.abs(noInsertEnergy/originalEnergy-2*10**(-12/10))<1e-5,`Master gain automation must survive insert bypass: ${noInsertEnergy/originalEnergy}`);
  const bypassZip=await JSZip.loadAsync(await download('Bounce stems')),stemBuffers=await Promise.all(Object.values(bypassZip.files).filter(f=>!f.dir).map(f=>f.async('nodebuffer')));
  for(let offset=56;offset<mix.length;offset+=4)assert.ok(Math.abs(stemBuffers.reduce((sum,b)=>sum+b.readFloatLE(offset),0)-mix.readFloatLE(offset))<1e-6);
  const afterMaster=JSON.parse((await download('Export session JSON')).toString());assert.equal(afterMaster.masterEffects.length,1);assert.equal(afterMaster.masterDb,-6);assert.equal(afterMaster.masterPan,1);assert.equal(afterMaster.masterAutomation[0].value,-12);
  if(!await page.locator('[data-bounce-rate]').isVisible())await page.locator('.daw-bounce-settings summary').click();
  await page.screenshot({path:'/tmp/cuestamp-bounce-settings.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS 16/24-bit TPDF samples, float dither bypass, master insert/channel bypass PCM verification, untouched session, selectable mix/stem WAV formats, sample rate, exact timeline start float WAV decoding, grouped ZIP names/alignment and PCM mix reconstruction.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
