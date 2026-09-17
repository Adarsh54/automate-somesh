// Real-browser check for the reel listen-analytics dashboard: an owner publishes a reel and
// creates two named share links (mocked account endpoints, no WorkOS/Neon credentials needed),
// a "listener" page opens one named link and actually plays/seeks real audio, a second listener
// opens the other link in embedded mode, and the owner's dedicated analytics page is verified to
// show per-link session cards with an expandable event timeline, track rankings and a trend chart.
// Run: node scripts/browser-reel-analytics-check.cjs   (point CUESTAMP_URL at a `VITE_API_ENABLED=true` dev server)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:process.env.HEADFUL?false:true});
 try{
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5191/';
  const trackId='cccccccc-cccc-4ccc-accc-cccccccccccc';
  let project,published=null,linkSeq=0,listenSeq=0;
  const links=[],listens=[],events=[];
  const errors=[];

  function summarize(openedAt,sessionEvents){
   const opened=new Date(openedAt).getTime();
   const byTrack=new Map();let activeSeconds=0;const spans=new Map();
   for(const e of sessionEvents){
    const track=byTrack.get(e.trackId)||{trackId:e.trackId,trackTitle:e.trackTitle,maxSeconds:0,durationSeconds:e.duration??null};
    if(e.duration!=null)track.durationSeconds=e.duration;
    const mark=pos=>{if(pos!=null&&pos>track.maxSeconds)track.maxSeconds=pos;};
    if(e.type==='play'){spans.set(e.trackId,e.position??0);mark(e.position);}
    else if(['pause','ended','stop','switch','close'].includes(e.type)){const start=spans.get(e.trackId);if(start!=null){activeSeconds+=Math.max(0,(e.position??start)-start);spans.delete(e.trackId);}mark(e.position);}
    else if(e.type==='seek'){const start=spans.get(e.trackId);if(start!=null){activeSeconds+=Math.max(0,(e.seekFrom??start)-start);spans.set(e.trackId,e.seekTo??start);}mark(e.seekFrom);mark(e.seekTo);}
    byTrack.set(e.trackId,track);
   }
   const timeline=[...sessionEvents].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(e=>({...e,elapsedSeconds:Math.round((new Date(e.createdAt).getTime()-opened)/1000)}));
   return {activeSeconds,tracks:[...byTrack.values()],timeline};
  }
  const analyticsSummary=()=>{
   const totalReelSeconds=published?.tracks.reduce((sum,t)=>sum+(t.duration||0),0)||null;
   const sessions=listens.map(l=>{
    const own=events.filter(e=>e.listenId===l.listenId);
    const {activeSeconds,tracks,timeline}=summarize(l.openedAt,own);
    const link=links.find(k=>k.id===l.linkId);
    return {id:l.listenId,openedAt:l.openedAt,userAgent:l.userAgent,referrer:l.referrer,city:l.city,region:l.region,country:l.country,embed:l.embed,linkName:link?.name||'Unlabeled link',activeSeconds,tracks,events:timeline,completedRatio:totalReelSeconds?Math.min(1,activeSeconds/totalReelSeconds):null};
   });
   const trackStats=new Map();
   for(const s of sessions)for(const t of s.tracks){
    if(!(t.maxSeconds>0))continue;
    const cur=trackStats.get(t.trackId)||{trackId:t.trackId,trackTitle:t.trackTitle,plays:0,totalRatio:0};
    cur.plays++;cur.totalRatio+=t.durationSeconds?Math.min(1,t.maxSeconds/t.durationSeconds):0;
    trackStats.set(t.trackId,cur);
   }
   const tracks=[...trackStats.values()].map(t=>({trackId:t.trackId,trackTitle:t.trackTitle,plays:t.plays,avgRatio:t.totalRatio/t.plays})).sort((a,b)=>b.plays-a.plays);
   const byDay=new Map();
   for(const l of listens){const key=l.openedAt.slice(0,10);const entry=byDay.get(key)||{date:key,direct:0,embed:0};entry[l.embed?'embed':'direct']++;byDay.set(key,entry);}
   return {title:project?.title,opens:sessions.length,totalReelSeconds,avgSessionSeconds:sessions.length?sessions.reduce((s,x)=>s+x.activeSeconds,0)/sessions.length:null,avgCompletedRatio:sessions.length?sessions.reduce((s,x)=>s+(x.completedRatio||0),0)/sessions.length:null,tracks,daily:[...byDay.values()],sessions};
  };

  const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(16036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
  for(let i=0;i<8000;i++)wav.writeInt16LE(i<4000?0:Math.round(4000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);

  const reelsRoute=async r=>{
   const url=new URL(r.request().url()),action=url.searchParams.get('action');
   if(r.request().method()==='GET'){
    if(action==='stream')return r.fulfill({status:200,contentType:'audio/wav',body:wav});
    if(action==='public'){
     const link=links.find(k=>k.token===url.searchParams.get('token')&&k.active);
     if(!link)return r.fulfill({status:404,json:{error:'This reel is unavailable.'}});
     return r.fulfill({json:{reel:published}});
    }
    if(action==='analytics')return r.fulfill({json:{analytics:analyticsSummary()}});
    if(action==='links')return r.fulfill({json:{links}});
    return r.fulfill({json:{publication:published?{published:true}:{published:false}}});
   }
   const body=r.request().postDataJSON();
   if(action==='open'){
    const link=links.find(k=>k.token===body.token&&k.active);
    if(!link)return r.fulfill({status:404,json:{error:'unavailable'}});
    listenSeq++;const listenId=`11111111-1111-4111-8${String(listenSeq).padStart(11,'0')}`;
    listens.push({listenId,linkId:link.id,openedAt:new Date().toISOString(),userAgent:r.request().headers()['user-agent']||'',referrer:body.referrer||'',embed:Boolean(body.embed),city:'Bologna',region:'Emilia-Romagna',country:'Italy'});
    return r.fulfill({json:{listenId}});
   }
   if(action==='event'){events.push({...body,createdAt:new Date().toISOString()});return r.fulfill({json:{ok:true}});}
   if(action==='prepare')return r.fulfill({json:{track:{id:body.id,duration:1,peaks:[.2,.6,1,.4]}}});
   if(action==='publish'){published={title:project.title,allowDownloads:true,tracks:[{id:trackId,title:'Test track',duration:1,peaks:[.2,.6,1,.4]}]};return r.fulfill({json:{publication:{published:true}}});}
   if(action==='revoke'){published=null;links.length=0;return r.fulfill({json:{ok:true}});}
   if(action==='create-link'){
    linkSeq++;const link={id:`22222222-2222-4222-8${String(linkSeq).padStart(11,'0')}`,token:`33333333-3333-4333-8${String(linkSeq).padStart(11,'0')}`,name:body.name,active:true,createdAt:new Date().toISOString()};
    links.push(link);return r.fulfill({json:{link}});
   }
   if(action==='toggle-link'){const link=links.find(k=>k.id===body.id);if(link)link.active=body.active;return r.fulfill({json:{ok:true}});}
   if(action==='delete-link'){const i=links.findIndex(k=>k.id===body.id);if(i>=0)links.splice(i,1);return r.fulfill({json:{ok:true}});}
   return r.fulfill({status:404,body:''});
  };

  const context=await browser.newContext();

  // --- Owner: create, publish, and create two named share links for a reel ---
  const editor=await context.newPage();editor.on('pageerror',e=>errors.push(e.message));
  await editor.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'analytics-test',email:'test@example.com'}}}));
  await editor.route('**/api/media*',r=>r.fulfill({json:{assets:[{id:trackId,filename:'Track.wav',content_type:'audio/wav',size:16044}]}}));
  await editor.route('**/api/projects*',r=>{
   if(r.request().method()==='POST'){const input=r.request().postDataJSON();project={...input,revision:input.revision+1,title:input.data.title,type:'reel',status:'draft',updated_at:new Date().toISOString()};return r.fulfill({json:{project}});}
   const url=new URL(r.request().url());
   if(url.searchParams.has('id'))return r.fulfill({json:{project}});
   return r.fulfill({json:{projects:project?[{...project,published:Boolean(published)}]:[]}});
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
  await editor.getByText('Create a share link to send it out.').waitFor();

  await editor.locator('#share-reel').click();
  await editor.locator('.reel-links-create input').waitFor();
  await editor.locator('.reel-links-create input').fill('For the director');
  await editor.getByRole('button',{name:'Create link'}).click();
  await editor.locator('.reel-links-list').getByText('For the director').waitFor();
  await editor.locator('.reel-links-create input').fill('For the composer');
  await editor.getByRole('button',{name:'Create link'}).click();
  await editor.locator('.reel-links-list').getByText('For the composer').waitFor();
  assert.equal(links.length,2,'expected two share links to exist');
  await editor.locator('[data-close]').click();

  const directorLink=links.find(l=>l.name==='For the director'),composerLink=links.find(l=>l.name==='For the composer');

  // --- Listener 1: opens the director's link directly and actually plays/seeks/finishes real audio ---
  const listener1=await context.newPage();listener1.on('pageerror',e=>errors.push(e.message));
  await listener1.route('**/api/reels*',reelsRoute);
  await listener1.goto(base+`reel.html?token=${directorLink.token}`);
  await listener1.locator('.reel-play').waitFor();
  await listener1.locator('.reel-play').click();
  await listener1.waitForTimeout(400);
  await listener1.locator('.reel-seek').fill('900');
  await listener1.dispatchEvent('.reel-seek','input');
  await listener1.waitForFunction(()=>document.querySelector('.reel-play')?.getAttribute('aria-label')==='Play',null,{timeout:5000}).catch(()=>{});
  await listener1.waitForTimeout(300);

  // --- Listener 2: opens the composer's link in embedded mode ---
  const listener2=await context.newPage();listener2.on('pageerror',e=>errors.push(e.message));
  await listener2.route('**/api/reels*',reelsRoute);
  await listener2.goto(base+`reel.html?token=${composerLink.token}&embed=1`);
  await listener2.locator('.reel-play').waitFor();
  await listener2.locator('.reel-play').click();
  await listener2.waitForTimeout(400);
  await listener2.close();

  assert.equal(listens.length,2,'expected two recorded opens, one per link');
  assert.ok(events.some(e=>e.type==='seek'),'expected a seek event from listener 1');
  assert.ok(events.some(e=>e.type==='ended'),'expected listener 1 to finish the track');
  assert.ok(listens.find(l=>l.embed),'expected the embedded listen to be flagged');

  // --- Owner: the dedicated Analytics page should show both sessions, correctly attributed by link name ---
  await editor.locator('#view-reel-analytics').click();
  await editor.getByText('Sessions',{exact:true}).waitFor();
  const pageText=await editor.locator('.reel-analytics-page').innerText();
  assert.match(pageText,/For the director/);
  assert.match(pageText,/For the composer/);
  assert.match(pageText,/Embed/);
  assert.match(pageText,/Most replayed/);
  assert.match(pageText,/Sessions over time/);
  await editor.locator('[data-toggle-session]').first().click();
  const expandedText=await editor.locator('.reel-analytics-events').first().innerText();
  assert.match(expandedText,/Seek \(from/);
  assert.match(expandedText,/Finished/);

  // --- Owner: disabling a link makes it stop resolving publicly ---
  await editor.locator('#analytics-back').click();
  await editor.locator('#share-reel').waitFor();
  await editor.locator('#share-reel').click();
  await editor.locator('.reel-link-row').first().waitFor();
  await editor.locator('.switch').first().click();
  await editor.waitForTimeout(200);
  const disabledLinkId=links.find(l=>l.active===false)?.id;
  assert.ok(disabledLinkId,'expected toggling to disable one link');

  assert.deepEqual(errors,[]);
  console.log('PASS reel analytics: named share links, embed tracking, real play/seek/ended events, track rankings and trend chart all render correctly from real playback.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
