const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'midi-trim-test',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
 await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
 await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
 await page.getByText('Command harness',{exact:true}).click();
 await page.locator('#daw-json').fill(JSON.stringify([
 {op:'track.add',values:{id:'t',kind:'midi'}}, {op:'region.add',target:'t',values:{id:'r',duration:6}},
 {op:'note.add',target:'r',values:{id:'n',start:.5,duration:4,pitch:60}},
 {op:'event.add',target:'r',values:{type:'controlChange',start:.2,parameter:7,value:60}}
 ]));await page.getByRole('button',{name:'Execute commands',exact:true}).click();
 await page.locator('[data-region="r"]').click();
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:midi-trim-test')).tracks[0].regions[0]);
 const handle=page.locator('[data-region="r"] [data-region-handle="trim-start"]');await handle.scrollIntoViewIfNeeded();
 const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+32,box.y+box.height/2,{steps:8});await page.mouse.up();
 let r=await saved();assert.equal(r.start,1);assert.equal(r.duration,5);assert.equal(r.notes[0].start,0);assert.equal(r.notes[0].duration,3.5);assert.equal(r.events[0].start,0);
 await page.locator('[data-midi-trim] [name="end"]').fill('3');await page.getByRole('button',{name:'Crop MIDI',exact:true}).click();
 r=await saved();assert.equal(r.duration,2);assert.equal(r.notes[0].duration,2);
 await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await saved()).duration,5);
 await page.getByRole('button',{name:'Redo',exact:true}).click();assert.equal((await saved()).duration,2);
 // Actual offline synthesis must be silent before the new start and audible inside.
 const peaks=await page.evaluate(async()=>{const {scheduleSession}=await import('/src/experimental/audio-engine.js');const s=JSON.parse(localStorage.getItem('cuestamp-experimental:midi-trim-test'));const ctx=new OfflineAudioContext(2,44100*4,44100);scheduleSession(ctx,s,new Map(),0,{baseTime:0});const b=await ctx.startRendering(),a=b.getChannelData(0);return [.5,1.5,3.5].map(t=>Math.max(...a.slice(t*44100,t*44100+200).map(Math.abs)));});
 assert.equal(peaks[0],0);assert.ok(peaks[1]>.001);assert.equal(peaks[2],0);
 await page.reload();assert.equal((await saved()).duration,2);assert.deepEqual(errors,[]);
 console.log('PASS MIDI edge drag, numeric crop, controller chase, undo/redo, persistence and rendered boundaries.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
