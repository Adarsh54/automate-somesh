// Real-browser check for multi-select reel deletion: select-all, partial selection, the
// "Delete selected (N)" button's count, and that the right DELETE requests are sent for the
// right reels (with their current revision), leaving the unselected reel in the list.
// Run: node scripts/browser-reel-bulk-delete-check.cjs   (point CUESTAMP_URL at a `VITE_API_ENABLED=true` dev server)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:process.env.HEADFUL?false:true});
 try{
  const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5191/';
  let reels=[
   {id:'11111111-1111-4111-8111-111111111111',title:'Reel A',type:'reel',status:'draft',revision:3,published:false},
   {id:'22222222-2222-4222-8222-222222222222',title:'Reel B',type:'reel',status:'draft',revision:1,published:false},
   {id:'33333333-3333-4333-8333-333333333333',title:'Reel C',type:'reel',status:'draft',revision:5,published:false},
  ];
  const deletes=[];
  const errors=[];
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'bulk-delete-test',email:'test@example.com'}}}));
  await page.route('**/api/projects*',r=>{
   if(r.request().method()==='DELETE'){
    const body=r.request().postDataJSON();
    const reel=reels.find(x=>x.id===body.id);
    if(!reel || reel.revision!==body.revision)return r.fulfill({status:409,json:{error:'PROJECT_CONFLICT'}});
    deletes.push(body.id);reels=reels.filter(x=>x.id!==body.id);
    return r.fulfill({json:{deleted:{id:body.id}}});
   }
   return r.fulfill({json:{projects:reels}});
  });
  await page.route('**/api/reels*',r=>r.fulfill({json:{publication:{published:false}}}));
  await page.route('**/api/media*',r=>r.fulfill({json:{assets:[]}}));

  await page.goto(base+'#/reels/new');
  await page.locator('.saved-reels').waitFor();
  assert.equal(await page.locator('[data-select-reel]').count(),3,'expected a checkbox per saved reel');
  assert.equal(await page.locator('[data-delete-selected-reels]').count(),0,'bulk delete button should be hidden with nothing selected');

  // Select two of the three reels and confirm the count updates live.
  await page.locator(`[data-select-reel="${reels[0].id}"]`).check();
  await page.getByText('Delete selected (1)',{exact:true}).waitFor();
  await page.locator(`[data-select-reel="${reels[2].id}"]`).check();
  await page.getByText('Delete selected (2)',{exact:true}).waitFor();
  assert.equal(await page.locator('#select-all-reels').isChecked(),false,'select-all should not be checked with a partial selection');

  // Select all, then deselect one, to confirm the master checkbox behaves correctly both ways.
  await page.locator('#select-all-reels').check();
  await page.getByText('Delete selected (3)',{exact:true}).waitFor();
  await page.locator(`[data-select-reel="${reels[1].id}"]`).uncheck();
  await page.getByText('Delete selected (2)',{exact:true}).waitFor();
  assert.equal(await page.locator('#select-all-reels').isChecked(),false);

  // Delete the two still-selected reels (A and C), leaving B.
  await page.locator('[data-delete-selected-reels]').click();
  await page.getByText('Delete 2 reels?',{exact:true}).waitFor();
  await page.locator('[data-confirm]').click();
  await page.getByText('Deleted 2 reels.',{exact:true}).waitFor();

  assert.deepEqual(deletes.sort(),['11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333'].sort());
  assert.equal(await page.locator('[data-select-reel]').count(),1,'only the unselected reel should remain');
  assert.ok(await page.getByText('Reel B').isVisible());
  assert.equal(await page.locator('[data-delete-selected-reels]').count(),0,'bulk button should disappear once nothing is selected');

  // Single-reel delete (via the per-row button, not the bulk flow) should still work independently.
  await page.locator(`[data-delete-reel="${reels[0].id}"]`).click();
  await page.getByText('Delete “Reel B”?',{exact:true}).waitFor();
  await page.locator('[data-confirm]').click();
  await page.getByText('Saved reels appear here.').waitFor();
  assert.equal(reels.length,0);

  assert.deepEqual(errors,[]);
  console.log('PASS reel bulk delete: per-row checkboxes, live selection count, select-all/partial states, confirmed multi-delete, and single-row delete still work independently.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
