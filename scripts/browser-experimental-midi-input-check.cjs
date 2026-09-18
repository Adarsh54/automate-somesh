const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   class Port extends EventTarget{
    id='test-input';name='Test MIDI Keyboard';state='connected';listening=0;closes=0;
    addEventListener(type,fn,...rest){if(type==='midimessage')this.listening++;super.addEventListener(type,fn,...rest);}
    removeEventListener(type,fn,...rest){if(type==='midimessage')this.listening--;super.removeEventListener(type,fn,...rest);}
    async open(){if(window.holdMidiOpen)await new Promise(resolve=>window.resolveMidiOpen=resolve);return this;}
    async close(){this.closes++;return this;}
   }
   const port=window.testMidiPort=new Port(),access=window.testMidiAccess=new EventTarget();access.inputs=new Map([[port.id,port]]);
   Object.defineProperty(navigator,'requestMIDIAccess',{value:async options=>{window.midiOptions=options;if(window.denyMidi)throw new DOMException('Denied','NotAllowedError');return access;},configurable:true});
   window.emitMidi=data=>{const event=new Event('midimessage');Object.defineProperty(event,'data',{value:new Uint8Array(data)});port.dispatchEvent(event);};
   const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(window.failMidiSave&&key==='cuestamp-experimental:midi-input'){window.failMidiSave=false;throw new DOMException('Test storage full','QuotaExceededError');}return original.call(this,key,value);};
  });
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'midi-input',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  const session=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:midi-input')));
  await page.getByRole('button',{name:'Connect MIDI',exact:true}).click();await page.locator('[data-midi-device]').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.midiOptions),{sysex:false});
  await page.getByRole('button',{name:'Record MIDI',exact:true}).click();await page.locator('[data-midi-finish]').waitFor();
  assert.equal(await page.getByRole('button',{name:'+ Instrument track',exact:true}).isDisabled(),true);
  await page.evaluate(()=>{emitMidi([0x92,60,100]);emitMidi([0xb2,11,80]);emitMidi([0xe2,0,96]);emitMidi([0x82,60,0]);});
  await page.getByRole('button',{name:'Stop & save MIDI',exact:true}).click();
  let saved=await session();assert.equal(saved.tracks.length,1);assert.equal(saved.tracks[0].regions[0].notes[0].channel,2);assert.equal(saved.tracks[0].regions[0].events.length,2);
  assert.equal(await page.evaluate(()=>testMidiPort.listening),0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await session()).tracks.length,0);await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.getByRole('button',{name:'Record MIDI',exact:true}).click();await page.locator('[data-midi-finish]').waitFor();await page.evaluate(()=>emitMidi([0x90,65,100]));
  await page.getByRole('button',{name:'Discard take',exact:true}).click();assert.equal((await session()).tracks.length,1);
  await page.getByRole('button',{name:'Record MIDI',exact:true}).click();await page.locator('[data-midi-finish]').waitFor();
  await page.evaluate(()=>{emitMidi([0x90,67,100]);testMidiPort.state='disconnected';testMidiAccess.dispatchEvent(new Event('statechange'));});
  await page.getByText(/MIDI input disconnected/).waitFor();assert.equal((await session()).tracks.length,2);assert.equal(await page.evaluate(()=>testMidiPort.listening),0);
  await page.evaluate(()=>{testMidiPort.state='connected';testMidiAccess.dispatchEvent(new Event('statechange'));});
  await page.getByRole('button',{name:'Record MIDI',exact:true}).click();await page.locator('[data-midi-finish]').waitFor();
  await page.evaluate(()=>{emitMidi([0x90,69,100]);window.failMidiSave=true;});await page.getByRole('button',{name:'Stop & save MIDI',exact:true}).click();
  await page.getByRole('button',{name:'Retry saving take',exact:true}).waitFor();assert.equal((await session()).tracks.length,2);
  await page.getByRole('button',{name:'Retry saving take',exact:true}).click();saved=await session();assert.equal(saved.tracks.length,3);
  await page.evaluate(()=>window.holdMidiOpen=true);await page.getByRole('button',{name:'Record MIDI',exact:true}).click();await page.waitForFunction(()=>Boolean(window.resolveMidiOpen));
  await page.evaluate(()=>location.hash='/projects');await page.locator('#experimental-root').waitFor({state:'detached'});
  await page.evaluate(()=>window.resolveMidiOpen());await page.waitForFunction(()=>testMidiPort.listening===0);assert.equal((await session()).tracks.length,3);
  await page.evaluate(()=>{window.holdMidiOpen=false;location.hash='/experimental';});await page.getByRole('button',{name:'Connect MIDI',exact:true}).waitFor();
  await page.evaluate(()=>window.denyMidi=true);await page.getByRole('button',{name:'Connect MIDI',exact:true}).click();await page.getByText(/MIDI access was denied/).waitFor();
  await page.screenshot({path:'/tmp/cuestamp-midi-input.png'});assert.deepEqual(errors,[]);
  console.log('PASS simulated Web MIDI permission, capture/import/undo, cancel, disconnect, save retry and late-open navigation cleanup. Physical hardware not exercised.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
