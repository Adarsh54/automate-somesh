const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const JSZip=require('jszip');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'bounce-test',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  await page.getByText('Command harness',{exact:true}).click();
  await page.locator('#daw-json').fill(JSON.stringify([
   {op:'track.add',values:{id:'tone',kind:'midi',name:'Tone'}},
   {op:'region.add',target:'tone',values:{id:'region',duration:1}},
   {op:'note.add',target:'region',values:{pitch:69,start:0,duration:.5,velocity:1}}
  ]));
  await page.getByRole('button',{name:'Execute commands',exact:true}).click();
  await page.locator('.daw-bounce-settings summary').click();
  await page.locator('[data-bounce-rate]').selectOption('48000');
  await page.locator('[data-bounce-depth]').selectOption('24');
  const download=async name=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();return fs.readFile(await (await pending).path());};
  const wav=await download('Bounce WAV');
  assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav.readUInt16LE(34),24);
  assert.equal(wav.readUInt32LE(40),48000*2*3);
  // The note must already sound at 10 ms, not after the real-time 25 ms startup delay.
  let peak=0;for(let frame=480;frame<600;frame++){peak=Math.max(peak,Math.abs(wav.readIntLE(44+frame*6,3)));}
  assert.ok(peak>1000,`Unexpected silent leading padding: ${peak}`);
  await page.locator('.daw-bounce-settings summary').click();
  await page.locator('[data-bounce-depth]').selectOption('32');
  const zip=await JSZip.loadAsync(await download('Bounce stems'));
  const entries=Object.values(zip.files).filter(f=>!f.dir);assert.equal(entries.length,1);
  const float=await entries[0].async('nodebuffer');assert.equal(float.readUInt16LE(20),3);
  assert.equal(float.readUInt16LE(34),32);assert.equal(float.readUInt32LE(24),48000);
  assert.equal(float.readUInt32LE(44),48000);assert.equal(float.readUInt32LE(52),48000*2*4);
  // Verify the browser can decode the actual exported float WAV, not only its header.
  const decoded=await page.evaluate(async bytes=>{const ctx=new AudioContext();try{const b=await ctx.decodeAudioData(new Uint8Array(bytes).buffer);return {duration:b.duration,channels:b.numberOfChannels};}finally{await ctx.close();}},[...float]);
  assert.equal(decoded.duration,1);assert.equal(decoded.channels,2);
  await page.locator('.daw-bounce-settings summary').click();
  await page.screenshot({path:'/tmp/cuestamp-bounce-settings.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS selectable mix/stem WAV formats, sample rate, exact timeline start and float WAV decoding.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
