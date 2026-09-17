const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],original='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  let assets=[{id:original,filename:'Original.wav',size:100,content_type:'audio/wav'}],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'audio-edit-test',email:'test@example.com'}}}));
  await page.route('**/api/media*',r=>{const url=new URL(r.request().url()),asset=assets.find(a=>a.id===url.searchParams.get('id'));return r.fulfill({json:asset?{filename:asset.filename,url:'/empty-audio.wav',sourceId:asset.source_id,edit:asset.edit_recipe}:{assets}});});
  await page.route('**/empty-audio.wav',r=>r.fulfill({status:404,body:''}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/reels*',r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{publication:null}});
   const body=r.request().postDataJSON();requests.push(body);
   const old=assets.find(a=>a.id===body.id),asset={id:require('node:crypto').randomUUID(),filename:'Original — reel.flac',size:90,source_id:old.source_id||old.id,parent_id:old.id,edit_recipe:body.edit};
   if(body.mode==='replace')old.superseded_by=asset.id;
   assets.push(asset);return r.fulfill({json:{asset}});
  });
  const base=process.env.CUESTAMP_URL||'http://127.0.0.1:5190/';
  await page.goto(base+'#/audio');await page.locator('[data-library-edit]').click();
  const dialog=page.locator('.audio-edit-dialog');await dialog.locator('[name=end]').fill('3');await dialog.locator('[name=start]').fill('1');await dialog.locator('[name=fadeIn]').fill('.5');await dialog.locator('[name=fadeOut]').fill('.5');await dialog.locator('[name=normalize]').check();
  await page.screenshot({path:'/tmp/cuestamp-audio-editor.png'});
  await dialog.getByRole('button',{name:'Save as copy',exact:true}).click();await dialog.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-library-edit]').count(),2);assert.equal(requests[0].mode,'copy');
  await page.locator('[data-library-edit]').nth(1).click();assert.equal(await dialog.locator('[name=start]').inputValue(),'1');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await dialog.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-library-edit]').count(),2);assert.equal(requests[1].mode,'replace');
  await page.goto(base+'#/reels/new');await page.locator('#reel-title').fill('Edited reel');await page.locator('#reel-library').click();await page.locator('.audio-choice').first().click();await page.getByRole('button',{name:'Add audio (1)',exact:true}).click();await page.locator('[data-edit-reel-audio]').click();
  await dialog.locator('[name=end]').fill('2');await dialog.getByRole('button',{name:'Apply to reel',exact:true}).click();await dialog.waitFor({state:'detached'});
  assert.equal(requests[2].mode,'copy');assert.equal(await page.locator('[data-edit-reel-audio]').getAttribute('data-edit-reel-audio'),assets.at(-1).id);
  assert.deepEqual(errors,[]);console.log('PASS: library copy/replace, edit restoration, linked reel application.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
