// Real-browser check for the account-wide "All reels" analytics dashboard: reels ranked by
// opens, the trend chart, entry points from Your Reels and from a single reel's analytics page,
// and clicking through from the dashboard back into a specific reel's detail page.
// Run: node scripts/browser-reel-account-analytics-check.cjs   (point CUESTAMP_URL at a `VITE_API_ENABLED=true` dev server)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:process.env.HEADFUL?false:true});
 try{
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5191/';
  const reelAId='11111111-1111-4111-8111-111111111111',reelBId='22222222-2222-4222-8222-222222222222';
  let projects=[
   {id:reelAId,title:'Popular reel',type:'reel',status:'draft',revision:1,published:true},
   {id:reelBId,title:'Quiet reel',type:'reel',status:'draft',revision:1,published:true},
  ];
  const accountAnalytics={
   totalReels:2,totalOpens:5,
   reels:[
    {id:reelAId,title:'Popular reel',opens:4,lastOpenedAt:new Date().toISOString()},
    {id:reelBId,title:'Quiet reel',opens:1,lastOpenedAt:new Date(Date.now()-86400000).toISOString()},
   ],
   daily:[{date:new Date().toISOString().slice(0,10),opens:5}],
  };
  const singleAnalytics={title:'Popular reel',opens:4,totalReelSeconds:60,avgSessionSeconds:20,avgCompletedRatio:0.5,tracks:[],daily:[],sessions:[]};
  const errors=[];
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'account-analytics-test',email:'test@example.com'}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects}}));
  await page.route('**/api/media*',r=>r.fulfill({json:{assets:[]}}));
  await page.route('**/api/reels*',r=>{
   const url=new URL(r.request().url()),action=url.searchParams.get('action'),id=url.searchParams.get('id');
   if(action==='analytics'&&!id)return r.fulfill({json:{analytics:accountAnalytics}});
   if(action==='analytics'&&id)return r.fulfill({json:{analytics:{...singleAnalytics,title:projects.find(p=>p.id===id)?.title||'Reel'}}});
   if(action==='links')return r.fulfill({json:{links:[]}});
   return r.fulfill({json:{publication:{published:true}}});
  });

  // --- Entry point 1: from Your Reels, when at least one reel is published ---
  await page.goto(base+'#/reels/new');
  await page.locator('.saved-reels').waitFor();
  await page.getByRole('link',{name:'All reels analytics'}).click();
  await page.getByRole('heading',{name:'All reels',exact:true}).waitFor();
  await page.getByText('Reels ranked by opens').waitFor();

  let text=await page.locator('.reel-analytics-page').innerText();
  assert.match(text,/Published reels/);
  assert.match(text,/Total opens/);
  const popularIndex=text.indexOf('Popular reel'),quietIndex=text.indexOf('Quiet reel');
  assert.ok(popularIndex>=0 && quietIndex>popularIndex,'expected the reel with more opens listed first');
  assert.match(text,/4 opens/);
  assert.match(text,/1 openLast/);

  // --- Clicking through from the dashboard opens that specific reel's own analytics page ---
  await page.locator(`[data-open-reel-analytics="${reelBId}"]`).click();
  await page.getByText('Quiet reel',{exact:false}).first().waitFor();
  assert.equal(await page.locator('.reel-analytics-page').count(),1);
  assert.equal(await page.locator('[data-open-reel-analytics]').count(),0,'should now be on the single-reel page, not the dashboard');

  // --- Entry point 2: "All reels" link from a single reel's analytics page, back to the dashboard ---
  await page.getByRole('link',{name:'All reels',exact:true}).click();
  await page.getByRole('heading',{name:'All reels',exact:true}).waitFor();
  await page.getByText('Reels ranked by opens').waitFor();

  assert.deepEqual(errors,[]);
  console.log('PASS account-wide reel analytics: reels ranked by opens, trend stats, and navigation to/from a single reel\'s analytics page all work.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
