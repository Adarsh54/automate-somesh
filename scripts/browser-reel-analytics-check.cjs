// Real-browser check for reel listen analytics: an owner publishes a reel (mocked account
// endpoints, no WorkOS/Neon credentials needed), a separate "listener" page opens the public
// reel link and actually plays audio, and the owner's analytics panel is verified to reflect it.
// Run: node scripts/browser-reel-analytics-check.cjs   (point CUESTAMP_URL at a `VITE_API_ENABLED=true` dev server)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:process.env.HEADFUL?false:true});
 try{
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5191/';
  const trackId='cccccccc-cccc-4ccc-accc-cccccccccccc';
  let project,publication=null,published=null,listenSeq=0;
  const opens=[],progressEvents=[];
  const errors=[];

  const recordOpen=(body,ua)=>{listenSeq++;const listenId=`11111111-1111-4111-8${String(listenSeq).padStart(11,'0')}`;opens.push({listenId,openedAt:new Date().toISOString(),userAgent:ua||'',referrer:body.referrer||''});return listenId;};
  const recordProgress=body=>{progressEvents.push({listenId:body.listenId,trackId:body.trackId,trackTitle:body.trackTitle,position:body.position,duration:body.duration});};
  const analyticsSummary=()=>{
   const byTrack=new Map();
   for(const e of progressEvents){
    const cur=byTrack.get(e.trackId)||{trackId:e.trackId,trackTitle:e.trackTitle,plays:0,maxRatio:0,completions:0,seen:new Set()};
    if(!cur.seen.has(e.listenId)){cur.plays++;cur.seen.add(e.listenId);}
    if(e.duration)cur.maxRatio=Math.max(cur.maxRatio,e.position/e.duration);
    if(e.duration && e.position/e.duration>=0.9 && !cur.completedListens?.has?.(e.listenId)){cur.completions++;}
    byTrack.set(e.trackId,cur);
   }
   const tracks=[...byTrack.values()].map(t=>({trackId:t.trackId,trackTitle:t.trackTitle,plays:t.plays,avgRatio:t.plays?t.maxRatio:null,completions:t.completions}));
   const recent=opens.map(o=>({id:o.listenId,openedAt:o.openedAt,userAgent:o.userAgent,referrer:o.referrer,tracks:progressEvents.filter(e=>e.listenId===o.listenId).map(e=>({trackId:e.trackId,trackTitle:e.trackTitle,maxSeconds:e.position,durationSeconds:e.duration,completed:Boolean(e.duration && e.position/e.duration>=0.9)}))}));
   return {opens:opens.length,tracks,recent};
  };

  const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(16036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
  for(let i=0;i<8000;i++)wav.writeInt16LE(i<4000?0:Math.round(4000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);

  const reelsRoute=async r=>{
   const url=new URL(r.request().url()),action=url.searchParams.get('action');
   if(r.request().method()==='GET'){
    if(action==='stream')return r.fulfill({status:200,contentType:'audio/wav',body:wav});
    if(action==='public')return r.fulfill({json:{reel:published}});
    if(action==='analytics')return r.fulfill({json:{analytics:analyticsSummary()}});
    return r.fulfill({json:{publication}});
   }
   const body=r.request().postDataJSON();
   if(action==='open')return r.fulfill({json:{listenId:recordOpen(body,r.request().headers()['user-agent'])}});
   if(action==='progress'){recordProgress(body);return r.fulfill({json:{ok:true}});}
   if(action==='prepare')return r.fulfill({json:{track:{id:body.id,duration:1,peaks:[.2,.6,1,.4]}}});
   if(action==='publish'){publication={token:'dddddddd-dddd-4ddd-addd-dddddddddddd'};published={title:project.title,allowDownloads:true,tracks:[{id:trackId,title:'Test track',duration:1,peaks:[.2,.6,1,.4]}]};return r.fulfill({json:{publication}});}
   return r.fulfill({status:404,body:''});
  };

  const context=await browser.newContext();

  // --- Owner: create and publish a reel ---
  const editor=await context.newPage();editor.on('pageerror',e=>errors.push(e.message));
  await editor.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'analytics-test',email:'test@example.com'}}}));
  await editor.route('**/api/media*',r=>r.fulfill({json:{assets:[{id:trackId,filename:'Track.wav',content_type:'audio/wav',size:16044}]}}));
  await editor.route('**/api/projects*',r=>{
   if(r.request().method()==='POST'){const input=r.request().postDataJSON();project={...input,revision:input.revision+1,title:input.data.title,type:'reel',status:'draft',updated_at:new Date().toISOString()};return r.fulfill({json:{project}});}
   const url=new URL(r.request().url());
   if(url.searchParams.has('id'))return r.fulfill({json:{project}});
   return r.fulfill({json:{projects:project?[{...project,published:Boolean(publication)}]:[]}});
  });
  await editor.route('**/api/reels*',reelsRoute);

  await editor.goto(base+'#/reels/new');
  await editor.locator('#reel-title').fill('Analytics test reel');
  await editor.locator('#reel-library').click();
  await editor.locator('.audio-choice').first().waitFor();
  await editor.locator('.audio-choice').first().click();
  await editor.getByRole('button',{name:/Add audio/}).click();
  await editor.getByRole('textbox',{name:'Track 1 title'}).fill('Test track');
  await editor.locator('#publish-reel').click();
  await editor.getByText('Your reel is published. Anyone with the link can listen.').waitFor();
  assert.ok(publication?.token,'reel did not publish');

  // Analytics panel should show "no listens yet" before anyone opens the link.
  await editor.locator('.reel-analytics').waitFor();
  assert.match(await editor.locator('.reel-analytics').innerText(),/No one has opened this reel/);

  // --- Listener: open the real public page and actually play audio ---
  const listener=await context.newPage();listener.on('pageerror',e=>errors.push(e.message));
  await listener.route('**/api/reels*',reelsRoute);
  await listener.goto(base+`reel.html?token=${publication.token}`);
  await listener.locator('.reel-play').waitFor();
  await listener.locator('.reel-play').click();
  await listener.waitForTimeout(1500);
  await listener.locator('.reel-play').click(); // pause -> flushes a final progress report
  await listener.waitForTimeout(300);

  assert.equal(opens.length,1,'expected exactly one recorded link open');
  assert.ok(progressEvents.length>=1,'expected at least one progress report');
  const last=progressEvents[progressEvents.length-1];
  assert.equal(last.trackId,trackId);
  assert.ok(last.position>0,'expected nonzero playback position to be reported');

  // --- Owner: reload and confirm the analytics panel reflects the real listen ---
  await editor.reload();
  await editor.locator('.reel-analytics').waitFor();
  const summaryText=await editor.locator('.reel-analytics').innerText();
  assert.match(summaryText,/1 link open/);
  assert.match(summaryText,/Test track/);
  assert.match(summaryText,/1 play/);

  assert.deepEqual(errors,[]);
  console.log('PASS reel analytics: listener open+progress events fired from real playback and rendered on the owner analytics panel.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
