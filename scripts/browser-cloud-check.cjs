const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('dialog',d=>d.accept());
 let user={id:'alice',email:'alice@example.test'}, conflict=false;
 const projects=new Map();
 await page.route('**/api/auth?**',async route=>{
  if(route.request().method()==='POST')user=null;
  await route.fulfill({json:{configured:true,user}});
 });
 await page.route('**/api/projects**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!user)return route.fulfill({status:401,json:{error:'SIGN_IN_REQUIRED'}});
  if(request.method()==='POST'){
   if(conflict)return route.fulfill({status:409,json:{error:'PROJECT_CONFLICT'}});
   const body=request.postDataJSON(),project={...body,title:body.data.production.title||'Untitled production',revision:body.revision+1,updated_at:new Date().toISOString(),owner:user.id};
   projects.set(project.id,project);return route.fulfill({json:{project}});
  }
  const id=url.searchParams.get('id');
  await route.fulfill({json:id?{project:projects.get(id)}:{projects:[...projects.values()].filter(p=>p.owner===user.id)}});
 });
 await page.goto(process.env.CUEBOOK_URL||'http://127.0.0.1:5176/');
 await page.locator('#sidebar-nav [data-tab="production"]').click();
 await page.locator('#production [data-field="title"]').fill('Alice film');
 await page.locator('#cloud-save').click();
 await page.waitForFunction(()=>document.querySelector('#cloud-status')?.textContent==='Saved to your account.');
 assert.equal(projects.size,1);
 await page.locator('#production [data-field="title"]').fill('Alice newer');
 conflict=true;await page.locator('#cloud-save').click();
 await page.waitForFunction(()=>document.querySelector('#cloud-status')?.textContent.includes('another tab'));
 assert.equal(await page.locator('#production [data-field="title"]').inputValue(),'Alice newer');
 conflict=false;await page.locator('#cloud-copy').click();
 await page.waitForFunction(()=>document.querySelector('#cloud-status')?.textContent==='Saved to your account.');
 assert.equal(projects.size,2);
 await page.reload();await page.locator('#sidebar-nav [data-tab="production"]').click();
 assert.equal(await page.locator('#production [data-field="title"]').inputValue(),'Alice newer');
 user={id:'bob',email:'bob@example.test'};await page.reload();
 await page.locator('#sidebar-nav [data-tab="production"]').click();
 assert.equal(await page.locator('#production [data-field="title"]').inputValue(),'');
 await page.locator('#cloud-list').click();await page.waitForFunction(()=>document.querySelector('#cloud-status')?.textContent.includes('No saved projects'));
 await page.evaluate(()=>{
  const legacy=JSON.parse(localStorage.getItem('cuebook-user:alice:draft'));
  legacy.production.title='Imported browser film';localStorage.setItem('cuebook-v1',JSON.stringify(legacy));
 });
 await page.locator('#cloud-import').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cuebook-user:bob:draft')||'null')?.production.title==='Imported browser film');
 await page.locator('#sidebar-nav [data-tab="production"]').click();
 assert.equal(await page.locator('#production [data-field="title"]').inputValue(),'Imported browser film');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cuebook-v1')).production.title),'Imported browser film');
 await page.locator('#cloud-logout').click();
 await page.getByRole('link',{name:'Log in',exact:true}).waitFor();
 assert.equal(await page.locator('#cloud-save').count(),0);
 user={id:'alice',email:'alice@example.test'};await page.reload();
 await page.locator('#cloud-list').click();
 await page.locator('[data-cloud-open]').first().click();
 await page.locator('#sidebar-nav [data-tab="production"]').click();
 assert.equal(await page.locator('#production [data-field="title"]').inputValue(),'Alice film');
 console.log('PASS cloud UI: save, conflict retains draft, copy, reload, per-account draft isolation, project list/open and logout');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
