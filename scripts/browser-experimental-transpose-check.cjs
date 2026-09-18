const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true,args:['--disable-audio-output']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'transpose',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  await page.getByText('Session restored on this device.',{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-audio-input-refresh]')?.disabled);await page.evaluate(()=>document.fonts.ready);
  await page.getByText('Command harness',{exact:true}).click();
  await page.locator('#daw-json').fill(JSON.stringify([{op:'track.add',values:{id:'t',kind:'midi',instrument:'sine'}},{op:'region.add',target:'t',values:{id:'r',duration:4}},...[60,64,67].map((pitch,i)=>({op:'note.add',target:'r',values:{id:'n'+i,pitch,start:i,duration:.5,velocity:.7,channel:i}}))]));
  await page.getByRole('button',{name:'Execute commands',exact:true}).click();await page.locator('[data-region=r]').click();
  await page.getByText('Transpose notes',{exact:true}).first().click();
  const form=page.locator('[data-transpose-form]'),apply=form.getByRole('button',{name:'Transpose notes',exact:true}),preview=page.locator('[data-transpose-preview]');
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:transpose'))),pitches=async()=>(await read()).tracks[0].regions[0].notes.map(n=>n.pitch);
  assert.equal(await apply.isDisabled(),true);assert.equal(await form.locator('[name=root]').isVisible(),false);
  await form.locator('[name=mode]').selectOption('diatonic');assert.equal(await form.locator('[name=root]').isVisible(),true);
  await form.locator('[name=amount]').fill('1');assert.match(await preview.textContent(),/3 of 3/);
  const before=await read();await apply.click();assert.deepEqual(await pitches(),[62,65,69]);const after=await read();
  const audio=await page.evaluate(async({before,after})=>{
   const {scheduleSession}=await import('/src/experimental/audio-engine.js');
   const frequency=async session=>{const ctx=new OfflineAudioContext(2,48000*4,48000);scheduleSession(ctx,session,new Map(),0,{baseTime:0});const pcm=(await ctx.startRendering()).getChannelData(0);let crossings=0;for(let i=4800;i<19200;i++)if(pcm[i-1]<0&&pcm[i]>=0)crossings++;return crossings/.3;};
   return {before:await frequency(before),after:await frequency(after)};
  },{before,after});assert.ok(Math.abs(audio.before-261.63)<5);assert.ok(Math.abs(audio.after-293.66)<5);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await pitches(),[60,64,67]);
  await page.getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual(await pitches(),[62,65,69]);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.locator('[data-note=n0]').click();await form.locator('[name=scope]').selectOption('selected');await form.locator('[name=mode]').selectOption('chromatic');await form.locator('[data-transpose-octave="1"]').click();assert.equal(await form.locator('[name=amount]').inputValue(),'12');await apply.click();assert.deepEqual(await pitches(),[72,64,67]);
  await page.locator('[data-notes-clear]').click();assert.equal(await apply.isDisabled(),true);assert.match(await preview.textContent(),/Select notes/);
  await form.locator('[name=scope]').selectOption('region');await form.locator('[name=amount]').fill('127');assert.equal(await apply.isDisabled(),true);assert.match(await preview.textContent(),/MIDI 0–127/);
  await form.locator('[name=amount]').fill('');assert.equal(await apply.isDisabled(),true);await form.locator('[name=amount]').fill('0.5');assert.equal(await apply.isDisabled(),true);
  await form.locator('[name=mode]').selectOption('diatonic');await form.locator('[name=scale]').selectOption('minor');await form.locator('[name=amount]').fill('1');assert.equal(await apply.isDisabled(),true);assert.match(await preview.textContent(),/outside this scale/);
  await form.locator('[name=scale]').selectOption('major');await form.locator('[data-transpose-octave="-1"]').click();assert.equal(await form.locator('[name=amount]').inputValue(),'-7');await apply.click();assert.deepEqual(await pitches(),[60,52,55]);
  await form.locator('[name=amount]').fill('2');await page.locator('.daw-transpose-tools').screenshot({path:'/tmp/cuestamp-transpose.png'});
  const saved=(await read()).tracks;await page.reload();await page.getByText('Session restored on this device.',{exact:true}).waitFor();assert.deepEqual((await read()).tracks,saved);assert.deepEqual(errors,[]);
  console.log('PASS chromatic/diatonic transposition, selected/all scope, octave presets, invalid/empty inputs, scale/range validation, undo/redo, persistence and real rendered pitch changes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
