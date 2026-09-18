const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'master-test',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  const session=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:master-test')));
  await page.getByRole('button',{name:'+ Instrument track',exact:true}).click();
  await page.getByRole('button',{name:'+ MIDI region',exact:true}).click();
  await page.getByRole('button',{name:'Master channel · 0 effects',exact:true}).click();
  await page.getByRole('button',{name:'Add effect',exact:true}).click();
  await page.locator('[data-effect-form] [name=type]').selectOption('lowpass');
  await page.locator('[data-effect-form] [name=frequency]').fill('100');
  await page.getByRole('button',{name:'Apply effect',exact:true}).click();
  assert.equal((await session()).masterEffects[0].frequency,100);
  assert.equal((await session()).tracks[0].effects.length,0);
  await page.locator('[data-new-effect]').selectOption('reverb');
  await page.getByRole('button',{name:'Add effect',exact:true}).click();
  await page.locator('[data-effect-up]').nth(1).click();
  assert.equal((await session()).masterEffects[0].kind,'reverb');
  await page.locator('[data-effect-form]').first().locator('[name=enabled]').uncheck();
  await page.locator('[data-effect-form]').first().getByRole('button',{name:'Apply effect',exact:true}).click();
  assert.equal((await session()).masterEffects[0].enabled,false);
  await page.locator('[data-effect-remove]').first().click();
  assert.equal((await session()).masterEffects.length,1);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  const saved=await session();assert.equal(saved.masterEffects.length,2);
  await page.reload();await page.getByRole('button',{name:'Master channel · 2 effects',exact:true}).click();
  assert.deepEqual((await session()).masterEffects,saved.masterEffects);
  await page.locator('[data-auto-form] [name=value]').fill('-24');
  await page.getByRole('button',{name:'Add point',exact:true}).click();
  await page.locator('[data-auto-form] [name=time]').fill('2');
  await page.locator('[data-auto-form] [name=value]').fill('0');
  await page.getByRole('button',{name:'Add point',exact:true}).click();
  await page.locator('[data-auto-parameter]').selectOption('pan');
  await page.locator('[data-auto-form] [name=value]').fill('-1');
  await page.getByRole('button',{name:'Add point',exact:true}).click();
  const automated=await session();assert.equal(automated.masterAutomation.length,3);assert.equal(automated.tracks[0].automation.length,0);
  await page.getByRole('button',{name:'Clear curve',exact:true}).click();assert.equal((await session()).masterAutomation.length,2);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await session()).masterAutomation,automated.masterAutomation);
  await page.locator('[data-master-pan]').fill('.25');await page.locator('[data-master-pan]').press('Tab');
  assert.equal((await session()).masterPan,.25);
  await page.reload();await page.getByRole('button',{name:'Master channel · 2 effects',exact:true}).click();
  assert.deepEqual((await session()).masterAutomation,automated.masterAutomation);
  const metrics=await page.evaluate(async()=>{
   const {newSession,applyCommands}=await import('/src/experimental/session.js');
   const {scheduleSession,sessionDuration}=await import('/src/experimental/audio-engine.js');
   async function render(effect=null,{gain=0,opposite=false,impulse=false,bypass=false,automation=[],position=0,pan=0}={}){
    const initial=newSession(),commands=[{op:'session.set',values:{masterDb:gain,masterPan:pan}}];
    for(let i=0;i<2;i++)commands.push({op:'track.add',values:{id:'t'+i}},{op:'region.add',target:'t'+i,values:{id:'r'+i,assetId:'file'+i,duration:1}});
    for(const point of automation)commands.push({op:'automation.point',target:initial.id,values:point});
    if(effect)commands.push({op:'effect.add',target:initial.id,values:{...effect,enabled:!bypass}});
    const session=applyCommands(initial,commands),ctx=new OfflineAudioContext(2,44100*Math.ceil(sessionDuration(session)),44100),buffers=new Map();
    for(let c=0;c<2;c++){const buffer=ctx.createBuffer(1,44100,44100),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(impulse?(i===0?1:0):.5*Math.sin(i*2*Math.PI*1000/44100))*(opposite&&c===1?-1:1);buffers.set('file'+c,buffer);}
    const playback=scheduleSession(ctx,session,buffers,position,{baseTime:0});const output=await ctx.startRendering();playback.stop();return {data:output.getChannelData(0),right:output.getChannelData(1),duration:output.duration};
   }
   const rms=(data,a=.3,b=.8)=>{const slice=data.subarray(Math.floor(a*44100),Math.floor(b*44100));return Math.sqrt(slice.reduce((sum,v)=>sum+v*v,0)/slice.length);};
   const eq={kind:'eq',type:'lowpass',frequency:100},comp={kind:'compressor',threshold:-30,ratio:12,attack:.001,knee:0};
   const dry=await render(),filtered=await render(eq),bypass=await render(eq,{bypass:true}),compressed=await render(comp),quiet=await render(comp,{gain:-6}),cancelled=await render(comp,{opposite:true}),reverb=await render({kind:'reverb',decay:2,mix:1},{impulse:true});
   const curve=[{parameter:'gainDb',time:0,value:-24},{parameter:'gainDb',time:1,value:0},{parameter:'pan',time:0,value:-1}],automated=await render(null,{automation:curve}),seek=await render(null,{automation:curve,position:.5}),staticPan=await render(null,{pan:-1});
   return {early:rms(automated.data,.05,.15),late:rms(automated.data,.8,.9),autoRight:rms(automated.right),seek:rms(seek.data,.05,.15),absolute:rms(automated.data,.55,.65),staticRight:rms(staticPan.right),dry:rms(dry.data),filtered:rms(filtered.data),bypass:rms(bypass.data),compressed:rms(compressed.data),quiet:rms(quiet.data),cancelled:rms(cancelled.data),tail:rms(reverb.data,1.1,1.5),duration:reverb.duration};
  });
  assert.ok(metrics.late>metrics.early*5);assert.ok(metrics.autoRight<1e-9);assert.ok(metrics.staticRight<1e-9);assert.ok(Math.abs(metrics.seek-metrics.absolute)<.0001);
  assert.ok(metrics.filtered<metrics.dry*.05);
  assert.ok(Math.abs(metrics.bypass-metrics.dry)<1e-8);
  assert.ok(metrics.compressed<metrics.dry*.6);
  assert.ok(Math.abs(metrics.quiet/metrics.compressed-10**(-6/20))<.0001);
  assert.ok(metrics.cancelled<1e-9);assert.ok(metrics.tail>0);assert.equal(metrics.duration,3);
  await page.locator('.daw-mix-detail').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cuestamp-master-effects.png'});
  assert.deepEqual(errors,[]);console.log('PASS master chain UI, persistence, bypass/reorder/undo, summed PCM processing, master gain/pan automation and seek, and reverb tails.',metrics);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
