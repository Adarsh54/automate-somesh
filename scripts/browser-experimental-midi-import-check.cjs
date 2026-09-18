const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const {newSession,applyCommands}=await import('../src/experimental/session.js'),{writeMidi,readMidi}=await import('../src/experimental/midi.js');
 const source=applyCommands(newSession(),[{op:'track.add',values:{id:'t',kind:'midi',name:'Large performance'}},{op:'region.add',target:'t',values:{id:'r',duration:101}}]);
 source.tracks[0].regions[0].notes=Array.from({length:10001},(_,i)=>({id:'n'+i,pitch:48+i%24,channel:i%16,start:i*.01,duration:.008,velocity:.7}));
 source.tracks[0].regions[0].events=Array.from({length:250},(_,i)=>({id:'e'+i,type:'controlChange',channel:i%16,parameter:11,start:i*.001,value:i%128}));
 const fixture=Buffer.from(writeMidi(source));
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'midi-import',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  const session=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:midi-import')));
  await page.locator('#daw-title').fill('Existing arrangement');await page.locator('#daw-title').press('Tab');
  const before=await session();
  const started=Date.now();await page.locator('#daw-files').setInputFiles({name:'performance.mid',mimeType:'audio/midi',buffer:fixture});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:midi-import'))?.tracks.length===1);
  const imported=await session(),elapsed=Date.now()-started;
  assert.equal(imported.revision,before.revision+1);assert.equal(imported.tracks[0].regions[0].notes.length,10001);assert.equal(imported.tracks[0].regions[0].events.length,250);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await session()).tracks.length,0);
  // A failed import must leave the successful import available to Redo.
  await page.locator('#daw-files').setInputFiles({name:'broken.mid',mimeType:'audio/midi',buffer:Buffer.from('invalid MIDI bytes')});
  await page.waitForFunction(()=>document.querySelector('.daw-status')?.textContent.includes('MIDI'));
  assert.equal((await session()).tracks.length,0);assert.equal(await page.getByRole('button',{name:'Redo',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await session()).tracks,imported.tracks);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export MIDI',exact:true}).click();
  const midi=await fs.readFile(await (await pending).path()),roundTrip=readMidi(midi.buffer.slice(midi.byteOffset,midi.byteOffset+midi.byteLength));
  assert.equal(roundTrip.tracks[0].notes.length,10001);assert.equal(roundTrip.tracks[0].events.length,250);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await session()).title,'Untitled session');
  await page.getByRole('button',{name:'Redo',exact:true}).click();await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.reload();assert.deepEqual((await session()).tracks,imported.tracks);
  assert.deepEqual(errors,[]);console.log(`PASS 10,001-note / 250-event MIDI import (${elapsed} ms), one-step undo/redo, failure preservation, MIDI export and reload.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
