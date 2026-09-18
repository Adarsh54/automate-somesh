const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const port=new EventTarget();Object.assign(port,{id:'keyboard',name:'Keyboard',state:'connected',open:async()=>port,close:async()=>port});const access=new EventTarget();access.inputs=new Map([[port.id,port]]);Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access});
  window.emitMidi=data=>{const e=new Event('midimessage');Object.defineProperty(e,'data',{value:new Uint8Array(data)});port.dispatchEvent(e);};
  window.clicks=new Set();const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;AudioBufferSourceNode.prototype.start=function(...args){if(this.loop)clicks.add(this);return start.apply(this,args);};AudioBufferSourceNode.prototype.stop=function(...args){if(!args.length||args[0]<=this.context.currentTime)clicks.delete(this);return stop.apply(this,args);};
  const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.inputTracks=[];navigator.mediaDevices.getUserMedia=async options=>{const stream=await get(options);inputTracks.push(...stream.getTracks());return stream;};
 });
 await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'count-in',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
 await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:count-in')));
 await page.locator('[data-metronome-form] [name="meter"]').fill('1');await page.locator('[data-metronome-form] [name="countIn"]').selectOption('2');await page.getByRole('button',{name:'Apply metronome',exact:true}).click();
 await page.locator('[data-seek="2"]').click();await page.locator('[data-midi-connect]').click();await page.locator('[data-midi-record]').click();await page.locator('[data-midi-finish]').waitFor();assert.equal(await page.locator('[data-midi-finish]').isDisabled(),true);assert.equal(await page.evaluate(()=>clicks.size),1);
 await page.evaluate(()=>{emitMidi([0x90,60,100]);emitMidi([0x80,60,0]);});await page.waitForFunction(()=>!document.querySelector('[data-midi-finish]')?.disabled);
 await page.evaluate(()=>{emitMidi([0x90,64,100]);emitMidi([0x80,64,0]);});await page.locator('[data-midi-finish]').click();
 let s=await saved();assert.equal(s.tracks.length,1);assert.equal(s.tracks[0].regions[0].start,2);assert.deepEqual(s.tracks[0].regions[0].notes.map(n=>n.pitch),[64]);assert.equal(await page.evaluate(()=>clicks.size),0);
 await page.locator('[data-midi-record]').click();await page.locator('[data-midi-finish]').waitFor();await page.locator('[data-midi-cancel]').click();assert.equal((await saved()).tracks.length,1);assert.equal(await page.evaluate(()=>clicks.size),0);
 await page.getByRole('button',{name:'Record audio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-record-time]')?.textContent.includes('Count-in'));assert.equal(await page.getByRole('button',{name:'Stop recording',exact:true}).isDisabled(),true);
 await page.screenshot({path:'/tmp/cuestamp-count-in.png'});
 await page.waitForFunction(()=>parseFloat(document.querySelector('[data-record-time]')?.textContent)>.2);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByText('Recorded take added to the timeline.',{exact:true}).waitFor();
 s=await saved();const audio=s.tracks.find(t=>t.kind==='audio').regions[0];assert.equal(audio.start,2);assert.ok(audio.duration>.2&&audio.duration<1,`Pre-roll included: ${audio.duration}`);assert.equal(await page.evaluate(()=>clicks.size),0);assert.ok(await page.evaluate(()=>inputTracks.every(t=>t.readyState==='ended')));
 await page.getByRole('button',{name:'Record audio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-record-time]')?.textContent.includes('Count-in'));await page.getByRole('button',{name:'Cancel take',exact:true}).click();assert.equal((await saved()).tracks.length,2);await page.waitForFunction(()=>inputTracks.every(t=>t.readyState==='ended'));assert.equal(await page.evaluate(()=>clicks.size),0);
 const rendered=await page.evaluate(async()=>{
 const {recordingTiming}=await import('/src/experimental/recording-timing.js'),{scheduleRecordingClick}=await import('/src/experimental/metronome.js');
 const render=async enabled=>{const c=new OfflineAudioContext(2,44100*2,44100),s={tempo:120,meter:1,countInBars:2,metronomeRecordEnabled:enabled,metronomeDb:0};scheduleRecordingClick(c,s,0,recordingTiming(s,0,44100));const a=(await c.startRendering()).getChannelData(0);return [.025,1.025].map(t=>Math.max(...a.slice(Math.ceil(t*44100),Math.ceil((t+.04)*44100)).map(Math.abs)));};return {off:await render(false),on:await render(true)};
 });assert.ok(rendered.off[0]>.1);assert.equal(rendered.off[1],0);assert.ok(rendered.on[1]>.1);
 await page.reload();assert.equal(await page.locator('[data-metronome-form] [name="countIn"]').inputValue(),'2');assert.deepEqual(errors,[]);
 console.log('PASS audio/MIDI count-in, pre-roll exclusion, disabled early save, playhead placement, cancellation cleanup and persistence.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
