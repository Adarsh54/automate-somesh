const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'click-test',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
 await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
 await page.locator('[data-metronome-form] [name="enabled"]').check();await page.locator('[data-metronome-form] [name="meter"]').fill('3');await page.locator('[data-metronome-form] [name="level"]').fill('-12');await page.getByRole('button',{name:'Apply metronome',exact:true}).click();
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:click-test')));
 assert.equal((await saved()).metronomeEnabled,true);await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await saved()).metronomeEnabled,false);await page.getByRole('button',{name:'Redo',exact:true}).click();
 const result=await page.evaluate(async()=>{
  const {scheduleMetronome}=await import('/src/experimental/metronome.js'),{renderCycle}=await import('/src/experimental/cycle.js');
  const s=JSON.parse(localStorage.getItem('cuestamp-experimental:click-test'));
  const peaks=b=>{const a=b.getChannelData(0);return [0,.25,.5,.75,1,1.5].map(t=>Math.max(...a.slice(Math.round(t*b.sampleRate),Math.round((t+.04)*b.sampleRate)).map(Math.abs)));};
  const render=async(position,db=-12,stop=false)=>{const c=new OfflineAudioContext(2,44100*2,44100);const handle=scheduleMetronome(c,{...s,metronomeDb:db},{position,baseTime:0,duration:2});if(stop){handle.stop();handle.stop();}return peaks(await c.startRendering());};
  const cycle={...s,loopStart:.25,loopEnd:2.25};return {normal:await render(0),seek:await render(.25),quiet:await render(0,-18),stopped:await render(0,-12,true),cycle:peaks(await renderCycle(cycle,new Map(),44100,{metronome:true})),dryCycle:peaks(await renderCycle(cycle,new Map(),44100))};
 });
 assert.ok(result.normal[0]>result.normal[2]*1.5);assert.equal(result.normal[1],0);assert.ok(result.normal[5]>.1);
 assert.equal(result.seek[0],0);assert.ok(result.seek[1]>.05);assert.ok(Math.abs(result.quiet[0]/result.normal[0]-10**(-6/20))<.001);
 assert.ok(result.stopped.every(v=>v===0));assert.ok(result.dryCycle.every(v=>v===0));assert.deepEqual(result.cycle,result.seek);
 // The app's actual WAV bounce must not contain the enabled click.
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Bounce WAV',exact:true}).click();const wav=await fs.readFile(await(await pending).path());assert.ok(wav.subarray(44).every(v=>v===0));
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();await page.getByRole('button',{name:'Stop',exact:true}).click();
 await page.reload();assert.equal(await page.locator('[data-metronome-form] [name="enabled"]').isChecked(),true);assert.equal(await page.locator('[data-metronome-form] [name="meter"]').inputValue(),'3');
 await page.screenshot({path:'/tmp/cuestamp-metronome.png'});assert.deepEqual(errors,[]);console.log('PASS metronome controls/undo/persistence, accented PCM, seek, cycle, stop and exclusion from exported WAV.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
