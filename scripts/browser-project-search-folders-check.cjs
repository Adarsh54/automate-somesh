// Real-browser check for search and folder organization on the Projects page: title search,
// creating/deleting folders, filtering by folder, and moving projects into folders one at a
// time or in bulk.
// Run: node scripts/browser-project-search-folders-check.cjs   (point CUESTAMP_URL at a `VITE_API_ENABLED=true` dev server)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:process.env.HEADFUL?false:true});
 try{
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5191/';
  const midnightId='11111111-1111-4111-8111-111111111111',clientId='22222222-2222-4222-8222-222222222222',demoId='33333333-3333-4333-8333-333333333333';
  let projects=[
   {id:midnightId,title:'Midnight Reel',type:'reel',status:'draft',revision:1,published:false,folderId:null},
   {id:clientId,title:'Client Cue Sheet',type:'cue',status:'draft',revision:1,published:false,folderId:null},
   {id:demoId,title:'Demo Reel',type:'reel',status:'draft',revision:1,published:false,folderId:null},
  ];
  let folders=[];
  const errors=[];
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'search-folders-test',email:'test@example.com'}}}));
  await page.route('**/api/projects*',r=>{
   const url=new URL(r.request().url()),action=url.searchParams.get('action'),method=r.request().method();
   if(action==='folders'){
    if(method==='GET')return r.fulfill({json:{folders}});
    const body=r.request().postDataJSON();
    if(method==='DELETE'){
     folders=folders.filter(f=>f.id!==body.id);
     projects=projects.map(p=>p.folderId===body.id?{...p,folderId:null}:p);
     return r.fulfill({json:{deleted:{id:body.id}}});
    }
    const folder={id:crypto.randomUUID(),name:body.name,created_at:new Date().toISOString()};
    folders=[...folders,folder];
    return r.fulfill({json:{folder}});
   }
   if(action==='move'){
    const body=r.request().postDataJSON();
    projects=projects.map(p=>p.id===body.id?{...p,folderId:body.folderId}:p);
    return r.fulfill({json:{project:{id:body.id,folderId:body.folderId}}});
   }
   return r.fulfill({json:{projects}});
  });
  await page.route('**/api/reels*',r=>r.fulfill({json:{publication:{published:false}}}));

  await page.goto(base+'#/projects');
  await page.locator('.saved-projects').waitFor();
  assert.equal(await page.locator('.collection-row').count(),3);

  // Search narrows the list live, by title, case-insensitively.
  await page.locator('#project-search').fill('reel');
  await page.getByText('Midnight Reel',{exact:false}).waitFor();
  assert.equal(await page.locator('.collection-row').count(),2,'search for "reel" should match Midnight Reel and Demo Reel');
  assert.equal(await page.getByText('Client Cue Sheet',{exact:false}).count(),0);
  await page.locator('#project-search').fill('midnight');
  assert.equal(await page.locator('.collection-row').count(),1);
  await page.locator('#project-search').fill('');
  await page.locator('.collection-row').nth(2).waitFor();
  assert.equal(await page.locator('.collection-row').count(),3);

  // Create a folder, then move one project into it via its per-row select.
  await page.locator('[data-new-folder]').click();
  await page.locator('#new-folder-name').fill('Client work');
  await page.locator('.folder-create button.primary').click();
  await page.getByRole('button',{name:/Client work \(0\)/}).waitFor();

  await page.locator(`[data-move-project="${clientId}"]`).selectOption({label:'Client work'});
  await page.getByRole('button',{name:/Client work \(1\)/}).waitFor();

  // Filtering by that folder shows only the moved project.
  await page.getByRole('button',{name:/Client work \(1\)/}).click();
  await page.locator('.collection-row').nth(0).waitFor();
  assert.equal(await page.locator('.collection-row').count(),1);
  assert.ok(await page.getByText('Client Cue Sheet',{exact:false}).isVisible());

  // Back to "All", bulk-move the other two projects into a second folder.
  await page.getByRole('button',{name:/^All \(3\)$/}).click();
  await page.locator('.collection-row').nth(2).waitFor();
  await page.locator(`[data-select-project="${midnightId}"]`).check();
  await page.locator(`[data-select-project="${demoId}"]`).check();
  await page.locator('[data-new-folder]').click();
  await page.locator('#new-folder-name').fill('Reels');
  await page.locator('.folder-create button.primary').click();
  await page.getByRole('button',{name:/^All \(3\)$/}).click();
  await page.locator(`[data-select-project="${midnightId}"]`).check();
  await page.locator(`[data-select-project="${demoId}"]`).check();
  await page.locator('#bulk-move-folder').selectOption({label:'Reels'});
  await page.getByRole('button',{name:/Reels \(2\)/}).waitFor();
  assert.equal(await page.locator('[data-select-project]:checked').count(),0,'selection clears after a bulk move');

  // Deleting the folder holding the two bulk-moved projects un-files them instead of deleting them.
  await page.locator('.folder-chip-wrap',{hasText:'Reels'}).locator('[data-delete-folder]').click();
  await page.locator('[data-confirm]').click();
  await page.getByRole('button',{name:/Unfiled \(2\)/}).waitFor();
  await page.getByRole('button',{name:/^All \(3\)$/}).waitFor();
  assert.equal(await page.locator('.collection-row').count(),3,'both projects remain after their folder is deleted');

  assert.deepEqual(errors,[]);
  console.log('PASS project search and folders: live title search, folder create/delete, per-row and bulk moves, and folder-scoped filtering all work.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
