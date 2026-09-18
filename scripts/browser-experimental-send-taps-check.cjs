const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'send-taps',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  await page.getByRole('button',{name:'+ Audio track',exact:true}).click();
  await page.getByRole('button',{name:'+ Bus',exact:true}).click();
  await page.locator('[data-send-form] [name=tap]').selectOption('preFader');
  await page.getByRole('button',{name:'Add / update send',exact:true}).click();
  assert.equal(await page.locator('[data-send-tap]').inputValue(),'preFader');
  await page.locator('[data-send-tap]').selectOption('postFader');
  assert.equal(await page.locator('[data-send-gain]').inputValue(),'-12');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal(await page.locator('[data-send-tap]').inputValue(),'preFader');
  await page.locator('[data-send-gain]').fill('-6');await page.locator('[data-send-gain]').press('Tab');
  assert.equal(await page.locator('[data-send-tap]').inputValue(),'preFader');
  await page.reload();assert.equal(await page.locator('[data-send-tap]').inputValue(),'preFader');
  assert.equal(await page.locator('[data-send-gain]').inputValue(),'-6');
  const curve=page.locator('[data-send-automation]');
  await curve.locator('summary').click();
  await curve.locator('[data-auto-form] [name=value]').fill('-24');await curve.getByRole('button',{name:'Add point',exact:true}).click();
  assert.equal(await curve.getAttribute('open'),'');
  await curve.locator('[data-auto-form] [name=time]').fill('1');await curve.locator('[data-auto-form] [name=value]').fill('0');
  await curve.getByRole('button',{name:'Add point',exact:true}).click();assert.equal(await curve.locator('[data-auto-points]>div').count(),2);
  assert.equal(await page.locator('.daw-mix-detail [data-auto-points]>div').count(),0);
  await curve.getByRole('button',{name:'Clear curve',exact:true}).click();assert.equal(await curve.locator('[data-auto-points]>div').count(),0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await curve.locator('[data-auto-points]>div').count(),2);
  await page.reload();await curve.locator('summary').click();assert.equal(await curve.locator('[data-auto-points]>div').count(),2);
  const metrics=await page.evaluate(async()=>{
   const {newSession,applyCommands}=await import('/src/experimental/session.js'),{scheduleSession}=await import('/src/experimental/audio-engine.js'),{stemSession}=await import('/src/experimental/routing.js');
   async function render(tap,{mute=false,bus=false,filtered=false,automated=false,sendCurve=false,position=0,stem=false}={}){
    const commands=[{op:'track.add',values:{id:'audio'}},{op:'region.add',target:'audio',values:{assetId:'file',duration:1}},
     {op:'track.add',values:{id:'sink',kind:'bus'}},{op:'track.set',target:'sink',values:{mute:true}},
     {op:'track.add',values:{id:'return',kind:'bus'}}];
    if(bus)commands.push({op:'track.add',values:{id:'group',kind:'bus'}},{op:'track.set',target:'audio',values:{output:'group'}});
    const target=bus?'group':'audio';commands.push(
     {op:'track.set',target,values:{gainDb:-12,pan:-1,mute,output:'sink'}},
     {op:'send.set',target,values:{busId:'return',gainDb:0,tap}});
    if(filtered)commands.push({op:'effect.add',target,values:{kind:'eq',type:'lowpass',frequency:100}});
    if(automated)commands.push({op:'automation.point',target,values:{parameter:'gainDb',time:0,value:-24}},{op:'automation.point',target,values:{parameter:'gainDb',time:1,value:0}});
    if(sendCurve)commands.push({op:'send.automation.point',target,values:{busId:'return',time:0,value:-24}},{op:'send.automation.point',target,values:{busId:'return',time:1,value:0}});
    const s=applyCommands(newSession(),commands),ctx=new OfflineAudioContext(2,44100,44100),buffer=ctx.createBuffer(1,44100,44100);
    for(let i=0;i<44100;i++)buffer.getChannelData(0)[i]=.2*Math.sin(i*2*Math.PI*1000/44100);
    scheduleSession(ctx,stem?stemSession(s,s.tracks[0]):s,new Map([['file',buffer]]),position,{baseTime:0});const audio=await ctx.startRendering();
    const rms=(channel,start=.3,end=.7)=>{const samples=audio.getChannelData(channel).subarray(Math.floor(start*44100),Math.floor(end*44100));return Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length);};
    return {left:rms(0),right:rms(1),early:rms(0,.05,.15),late:rms(0,.8,.9),middle:rms(0,.55,.65)};
   }
   return {sendCurve:await render('preFader',{sendCurve:true}),sendSeek:await render('preFader',{sendCurve:true,position:.5}),sendStem:await render('preFader',{sendCurve:true,stem:true}),mutedCurve:await render('preFader',{sendCurve:true,mute:true,bus:true}),pre:await render('preFader'),post:await render('postFader'),pan:await render('postPan'),muted:await render('preFader',{mute:true}),mutedBus:await render('preFader',{mute:true,bus:true}),filtered:await render('preFader',{filtered:true}),autoPre:await render('preFader',{automated:true}),autoPost:await render('postFader',{automated:true})};
  });
  assert.ok(metrics.sendCurve.late/metrics.sendCurve.early>5);assert.ok(Math.abs(metrics.sendSeek.early-metrics.sendCurve.middle)<.00001);assert.deepEqual(metrics.sendStem,metrics.sendCurve);assert.equal(metrics.mutedCurve.left,0);
  assert.ok(Math.abs(metrics.pre.left-metrics.pre.right)<1e-8);
  assert.ok(Math.abs(metrics.post.left/metrics.pre.left-10**(-12/20))<1e-6);
  assert.ok(Math.abs(metrics.post.left-metrics.post.right)<1e-8);
  assert.ok(metrics.pan.left>metrics.post.left);assert.ok(metrics.pan.right<1e-9);
  assert.equal(metrics.muted.left,0);assert.equal(metrics.mutedBus.left,0);
  assert.ok(metrics.filtered.left<metrics.pre.left*.05);
  assert.ok(Math.abs(metrics.autoPre.late/metrics.autoPre.early-1)<.001);
  assert.ok(metrics.autoPost.late/metrics.autoPost.early>5);
  await page.locator('.daw-routing').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cuestamp-send-taps.png'});
  assert.deepEqual(errors,[]);console.log('PASS send position UI, undo/persistence, PCM fader/pan independence, automation, post-insert filtering and source/bus mute, send curves, seek and stems.',metrics);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
