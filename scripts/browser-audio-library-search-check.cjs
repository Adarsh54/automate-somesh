// Real-browser check for live title/filename search on the Audio Library page.
// Run: node scripts/browser-audio-library-search-check.cjs   (point CUESTAMP_URL at a `VITE_API_ENABLED=true` dev server)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:process.env.HEADFUL?false:true});
 try{
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5191/';
  const assets=[
   {id:'11111111-1111-4111-8111-111111111111',filename:'Midnight Theme.wav',size:1000,source_id:null},
   {id:'22222222-2222-4222-8222-222222222222',filename:'Client Cue.wav',size:2000,source_id:null},
   {id:'33333333-3333-4333-8333-333333333333',filename:'Demo Reel Bed.wav',size:3000,source_id:null},
  ];
  const errors=[];
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'library-search-test',email:'test@example.com'}}}));
  await page.route('**/api/media*',r=>{
   const action=new URL(r.request().url()).searchParams.get('action');
   if(action==='list')return r.fulfill({json:{assets}});
   return r.fulfill({json:{}});
  });
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));

  await page.goto(base+'#/audio');
  await page.locator('.collection-page').waitFor();
  await page.getByText('Midnight Theme.wav',{exact:false}).waitFor();
  assert.equal(await page.locator('.track-row').count(),3);

  await page.locator('#library-search').fill('reel');
  await page.getByText('Demo Reel Bed.wav',{exact:false}).waitFor();
  assert.equal(await page.locator('.track-row').count(),1,'search for "reel" should match only the reel bed file');
  assert.equal(await page.getByText('Midnight Theme.wav',{exact:false}).count(),0);

  await page.locator('#library-search').fill('MIDNIGHT');
  await page.getByText('Midnight Theme.wav',{exact:false}).waitFor();
  assert.equal(await page.locator('.track-row').count(),1,'search should be case-insensitive');

  await page.locator('#library-search').fill('no such file anywhere');
  await page.getByText('No matching audio',{exact:false}).waitFor();
  assert.equal(await page.locator('.track-row').count(),0);

  await page.locator('#library-search').fill('');
  await page.locator('.track-row').nth(2).waitFor();
  assert.equal(await page.locator('.track-row').count(),3);

  assert.deepEqual(errors,[]);
  console.log('PASS Audio Library search: live, case-insensitive filtering by filename, with a clear empty state.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
