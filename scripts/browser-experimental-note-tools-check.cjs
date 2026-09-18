const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'note-tools',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  const url=(process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental';
  await page.goto(url);
  const session=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:note-tools')));
  const notes=async()=>(await session()).tracks[0].regions[0].notes;
  await page.getByText('Command harness',{exact:true}).click();
  await page.locator('#daw-json').fill(JSON.stringify([
   {op:'track.add',values:{id:'t',kind:'midi',name:'Piano'}},
   {op:'region.add',target:'t',values:{id:'r',duration:4}},
   {op:'note.add',target:'r',values:{id:'a',pitch:60,start:.14,duration:.25,velocity:.7}},
   {op:'note.add',target:'r',values:{id:'b',pitch:64,start:.74,duration:.25,velocity:.8}}
  ]));
  await page.getByRole('button',{name:'Execute commands',exact:true}).click();
  await page.locator('[data-region="r"]').click();
  await page.locator('[data-note="a"]').click();
  const original=await notes();
  await page.getByText('Timing & feel',{exact:true}).click();
  await page.locator('[data-note-tool="scope"]').selectOption('selected');
  await page.locator('[data-note-tool="strength"]').fill('50');
  await page.locator('[data-note-tool="swing"]').fill('50');
  await page.getByRole('button',{name:'Apply quantize',exact:true}).click();
  const quantized=await notes();assert.ok(Math.abs(quantized[0].start-.16375)<1e-9);assert.deepEqual(quantized[1],original[1]);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await notes(),original);
  await page.getByText('Timing & feel',{exact:true}).click();
  assert.equal(await page.locator('[data-note-tool="strength"]').inputValue(),'50');
  await page.locator('[data-note-tool="scope"]').selectOption('region');
  await page.locator('[data-note-tool="timing"]').fill('50');
  await page.locator('[data-note-tool="duration"]').fill('20');
  await page.locator('[data-note-tool="velocity"]').fill('10');
  await page.locator('[data-note-tool="seed"]').fill('7');
  await page.getByRole('button',{name:'Apply humanize',exact:true}).click();
  const humanized=await notes();assert.notDeepEqual(humanized,original);
  for(let i=0;i<2;i++){
   assert.ok(Math.abs(humanized[i].start-original[i].start)<=.05);
   assert.ok(Math.abs(humanized[i].duration-original[i].duration)<=.02);
   assert.ok(Math.abs(humanized[i].velocity-original[i].velocity)<=10/127);
  }
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual(await notes(),original);
  await page.getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual(await notes(),humanized);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export MIDI',exact:true}).click();
  const midi=await fs.readFile(await (await downloading).path()),{readMidi}=await import('../src/experimental/midi.js');
  const exported=readMidi(midi.buffer.slice(midi.byteOffset,midi.byteOffset+midi.byteLength)).tracks.flatMap(t=>t.notes);
  for(const n of humanized){const actual=exported.find(x=>x.pitch===n.pitch);assert.ok(Math.abs(actual.start-n.start)<.002);assert.ok(Math.abs(actual.velocity-n.velocity)<1/127);}
  await page.reload();await page.locator('[data-region="r"]').click();assert.deepEqual(await notes(),humanized);
  await page.getByText('Timing & feel',{exact:true}).click();
  await page.locator('.daw-note-tools').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/cuestamp-note-tools.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS MIDI timing/feel controls, selected-note scope, undo/redo, MIDI export and persisted changes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
