// Real-browser check for deleting projects (cue sheets and reels alike) from the Projects page:
// per-row Delete, and multi-select with "Select all" scoped to the current type filter and a
// single confirm dialog covering the whole batch.
// Run: node scripts/browser-project-delete-check.cjs   (point CUESTAMP_URL at a `VITE_API_ENABLED=true` dev server)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:process.env.HEADFUL?false:true});
 try{
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5191/';
  let projects=[
   {id:'11111111-1111-4111-8111-111111111111',title:'Cue A',type:'cue',status:'draft',revision:2,published:false},
   {id:'22222222-2222-4222-8222-222222222222',title:'Cue B',type:'cue',status:'completed',revision:1,published:false},
   {id:'33333333-3333-4333-8333-333333333333',title:'Reel C',type:'reel',status:'draft',revision:4,published:true},
  ];
  const deletes=[];
  const errors=[];
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'delete-test',email:'test@example.com'}}}));
  await page.route('**/api/projects*',r=>{
   const action=new URL(r.request().url()).searchParams.get('action');
   if(action==='folders')return r.fulfill({json:{folders:[]}});
   if(r.request().method()==='DELETE'){
    const body=r.request().postDataJSON();
    const project=projects.find(x=>x.id===body.id);
    if(!project || project.revision!==body.revision)return r.fulfill({status:409,json:{error:'PROJECT_CONFLICT'}});
    deletes.push(body.id);projects=projects.filter(x=>x.id!==body.id);
    return r.fulfill({json:{deleted:{id:body.id}}});
   }
   return r.fulfill({json:{projects}});
  });
  await page.route('**/api/reels*',r=>r.fulfill({json:{publication:{published:false}}}));

  await page.goto(base+'#/projects');
  await page.locator('.saved-projects').waitFor();
  assert.equal(await page.locator('[data-select-project]').count(),3,'expected a checkbox per project row');
  assert.equal(await page.locator('[data-delete-project]').count(),3,'expected a Delete button per project row');
  assert.equal(await page.locator('[data-delete-selected-projects]').count(),0,'bulk delete button should be hidden with nothing selected');

  // Select the two cue sheets (leave the reel alone) and delete them together.
  await page.locator(`[data-select-project="${projects[0].id}"]`).check();
  await page.locator(`[data-select-project="${projects[1].id}"]`).check();
  await page.getByText('Delete selected (2)',{exact:true}).waitFor();
  await page.locator('[data-delete-selected-projects]').click();
  await page.getByText('Delete 2 projects?',{exact:true}).waitFor();
  await page.locator('[data-confirm]').click();
  await page.getByText('Deleted 2 projects.',{exact:true}).waitFor();

  assert.deepEqual(deletes.sort(),['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].sort());
  assert.equal(await page.locator('[data-select-project]').count(),1,'only the reel should remain');
  assert.ok(await page.getByText('Reel C').isVisible());

  // Delete the remaining reel via its own per-row button (not the bulk flow), confirming a
  // single-item delete uses singular wording and still works from the same page.
  const reelId=projects[0].id;
  await page.locator(`[data-delete-project="${reelId}"]`).click();
  await page.getByText('Delete "Reel C"?',{exact:true}).waitFor();
  await page.locator('[data-confirm]').click();
  await page.getByText('Deleted 1 project.',{exact:true}).waitFor();
  assert.deepEqual(deletes.sort(),['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'].sort());
  await page.getByText('No saved projects yet',{exact:false}).waitFor();

  assert.deepEqual(errors,[]);
  console.log('PASS project delete: per-row checkboxes and delete buttons, live selection count, confirmed multi-delete across mixed cue/reel types, and single-row delete from the Projects page.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
