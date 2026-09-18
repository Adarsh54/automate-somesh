const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true,args:['--disable-audio-output','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const page=await browser.newPage();await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'channel-test',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  await page.locator('[data-audio-channels]').selectOption('left');await page.getByRole('button',{name:'Record audio',exact:true}).click();await page.waitForFunction(()=>parseFloat(document.querySelector('[data-record-time]')?.textContent)>.2);assert.equal(await page.locator('[data-audio-channels]').isDisabled(),true);await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByText('Recorded take added to the timeline.',{exact:true}).waitFor();
  const savedChannels=await page.evaluate(async()=>{const {assetStore}=await import('/src/experimental/media-store.js');const records=await assetStore('channel-test','readonly');const c=new AudioContext();try{return (await c.decodeAudioData(await records[0].file.arrayBuffer())).numberOfChannels;}finally{await c.close();}});assert.equal(savedChannels,1);
  const results=await page.evaluate(async()=>{
   const {createRecordingChannels}=await import('/src/experimental/recording-channels.js');const {startRecording}=await import('/src/experimental/recording.js');const {createInputMonitor}=await import('/src/experimental/input-monitor.js');
   const offline={};
   for(const mode of ['stereo','left','right']){
    const c=new OfflineAudioContext(2,4800,48000),b=c.createBuffer(2,4800,48000);b.getChannelData(0).fill(.2);b.getChannelData(1).fill(-.4);const src=c.createBufferSource();src.buffer=b;const route=createRecordingChannels(c,src,mode);createInputMonitor(c,route.output,{enabled:true,levelDb:0});src.start();const rendered=await c.startRendering();offline[mode]=[rendered.getChannelData(0)[4700],rendered.getChannelData(1)[4700]];route.stop();route.stop();
   }
   const original=navigator.mediaDevices.getUserMedia,c=new AudioContext();await c.resume();const captures={},requests=[];
   try{
    for(const mode of ['stereo','left','right']){
     const dest=c.createMediaStreamDestination(),merger=c.createChannelMerger(2),l=c.createConstantSource(),r=c.createConstantSource();l.offset.value=.2;r.offset.value=-.4;l.connect(merger,0,0);r.connect(merger,0,1);merger.connect(dest);l.start();r.start();navigator.mediaDevices.getUserMedia=async opts=>{requests.push(opts);return dest.stream;};
     try{const take=await startRecording({inputChannels:mode});await new Promise(resolve=>setTimeout(resolve,350));const wav=await take.stop(),buffer=await c.decodeAudioData(await wav.arrayBuffer());captures[mode]={channels:buffer.numberOfChannels,values:Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)[Math.floor(buffer.length/2)]),stopped:dest.stream.getTracks().every(t=>t.readyState==='ended')};}finally{l.stop();r.stop();merger.disconnect();dest.stream.getTracks().forEach(t=>t.stop());}
    }
    const mono=c.createMediaStreamDestination();const track=mono.stream.getAudioTracks()[0];track.getSettings=()=>({channelCount:1});navigator.mediaDevices.getUserMedia=async()=>mono.stream;let rejected;try{await startRecording({inputChannels:'right'});}catch(e){rejected=e.message;}return {offline,captures,requests,rejected,rejectedStopped:track.readyState==='ended'};
   }finally{navigator.mediaDevices.getUserMedia=original;await c.close();}
  });
  const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.001,`${actual} ≠ ${expected}`);
  near(results.offline.stereo[0],.2);near(results.offline.stereo[1],-.4);for(const v of results.offline.left)near(v,.2);for(const v of results.offline.right)near(v,-.4);
  assert.equal(results.captures.stereo.channels,2);assert.equal(results.captures.left.channels,1);assert.equal(results.captures.right.channels,1);near(results.captures.stereo.values[0],.2);near(results.captures.stereo.values[1],-.4);near(results.captures.left.values[0],.2);near(results.captures.right.values[0],-.4);assert.ok(Object.values(results.captures).every(v=>v.stopped));assert.equal(results.requests[2].audio.channelCount.min,2);assert.match(results.rejected,/only one channel/);assert.equal(results.rejectedStopped,true);
  console.log('PASS input-channel selector and saved mono take, isolated L/R PCM, stereo preservation, centered mono monitoring, unavailable-channel rejection and cleanup.',results.captures);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
