const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1440,height:1100}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(process.env.CUEBOOK_URL||'http://127.0.0.1:5174/automate-somesh/');
 const nav=n=>p.locator('#sidebar-nav').getByRole('button',{name:n,exact:true}).click();
 const jump=n=>p.locator('#sidebar-nav').getByRole('button',{name:n,exact:true}).evaluate(e=>e.click()); // no blur: regression for model updates on input
 const saved=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('cuebook-v1')));
 const ready=()=>p.waitForFunction(()=>!document.querySelector('#cancel-analysis'));
 assert.equal(await p.locator('#shared-details').count(),1);
 assert.equal(await p.locator('#shared-details [data-field="last"]').isVisible(),true);
 assert.equal(await p.locator('#shared-details [data-field="name"]').isVisible(),true);
 assert.equal(await p.locator('[data-track]').count(),0);
 assert.equal(await p.evaluate(()=>document.querySelector('#shared-details').getBoundingClientRect().top < document.querySelector('.workflow-modes').getBoundingClientRect().top),true);
 await p.locator('#sidebar-toggle').click();assert.equal(await p.locator('#shared-details [data-field="last"]').isVisible(),true);
 // Sequential navigation visits every remaining numbered step in each workflow and sidebar state.
 const order=['library','cues','production','review'];
 for(const mode of ['movie','offset','manual']) {
  await p.locator(`[data-mode="${mode}"]`).click();
  await p.locator('#shared-details [data-field="last"]').fill('Navigation draft');
  for(let i=0;i<4;i++) {
   assert.equal(await p.locator('#sidebar-nav [aria-current="page"]').getAttribute('data-tab'),order[i]);
   if(i===0) {assert.equal(await p.locator('#shared-details').count(),1);assert.equal(await p.locator('#shared-details [data-field="last"]').inputValue(),'Navigation draft');}
   if(i<3) await p.locator('[data-step="next"]').first().click();
  }
  for(let i=3;i>0;i--) {
   await p.locator('[data-step="back"]').last().click();
   assert.equal(await p.locator('#sidebar-nav [aria-current="page"]').getAttribute('data-tab'),order[i-1]);
  }
  await nav('Find your cues');
  assert.equal(await p.locator('#sidebar-nav [aria-current="page"]').getAttribute('data-tab'),'library');
  assert.equal(await p.locator('#sidebar-nav [data-tab="shared"]').count(),0);
  await nav('Find your cues');await p.locator('#sidebar-toggle').click();
 }
 // Fill directly on the initial main page, with no sidebar navigation.
 // Removing a focused contributor must not redirect a pending blur into its neighbor.
 await p.locator('[data-add-credit="Composer"]').click();
 await p.locator('[data-credit="2"] [data-field="last"]').fill('Keep writer');
 await p.locator('[data-credit="0"] [data-field="last"]').fill('Removed writer');
 await p.locator('[data-remove-credit="0"]').evaluate(e=>e.click());
 assert.equal((await saved()).sharedCueDetails.credits.find(c=>c.role==='Publisher').last,'');
 assert.equal((await saved()).sharedCueDetails.credits.find(c=>c.role==='Composer').last,'Keep writer');
 await p.locator('[data-remove-credit="1"]').click();await p.locator('[data-remove-credit="0"]').click();await p.locator('[data-add-credit="Composer"]').click();await p.locator('[data-add-credit="Publisher"]').click();
 // Restore conventional role order only for fixed export row assertions below.
 await p.reload();await nav('Find your cues');
 await p.locator('#shared-details [data-field="category"]').selectOption('original');
 for(const [key,value] of [['first','Common'],['last','Writer'],['name','Shared publisher']]) await p.locator(`#shared-details [data-field="${key}"]`).fill(value);
 for(const e of await p.locator('#shared-details [data-field="pro"]').all()) await e.fill('BMI');
 for(const e of await p.locator('#shared-details [data-field="share"]').all()) await e.fill('100');
 assert.equal((await saved()).sharedCueDetails.credits[1].share,'100');
 await p.locator('[data-add-credit="Composer"]').click();assert.equal((await saved()).sharedCueDetails.credits[0].last,'Writer');
 await p.locator('[data-remove-credit="2"]').click();
 await p.locator('[data-field="last"]').fill('Common writer');
 assert.equal(await p.locator('[data-field="last"]').evaluate(e=>e===document.activeElement),true);
 await jump('Find your cues');await nav('Find your cues');assert.equal(await p.locator('#shared-details').count(),1);assert.equal(await p.locator('.workflow-modes').count(),1);assert.equal(await p.locator('[data-field="last"]').inputValue(),'Common writer');
 await p.locator('[data-field="last"]').fill('Common writer');await p.reload();await nav('Find your cues');assert.equal(await p.locator('#shared-details').count(),1);assert.equal(await p.locator('.workflow-modes').count(),1);assert.equal(await p.locator('[data-field="last"]').inputValue(),'Common writer');
 await p.locator('#sidebar-toggle').click();assert.equal(await p.locator('[data-field="last"]').inputValue(),'Common writer');
 await p.screenshot({path:'/tmp/cuebook-shared-form.png',fullPage:true});
 await nav('Find your cues');await p.locator('[data-mode="offset"]').click();await p.locator('[data-upload]').first().setInputFiles(`${process.env.FIXTURES||'/tmp/cuebook-fixtures'}/score.wav`);await ready();
 await p.locator('[data-field="offset"]').fill('01:00:00:00');await p.locator('#analyze').click();await ready();
 let state=await saved();assert.equal(state.cues.length,2);assert.deepEqual(state.cues.map(c=>c.usage),["BI","BI"]);assert.equal(state.cues[0].credits,undefined);assert.equal(state.cues[0].category,undefined);
 const ids=state.cues.map(c=>c.id);
 await nav('Timings & usage');const first=p.locator('[data-cue]').nth(0),second=p.locator('[data-cue]').nth(1);
 assert.equal(await first.locator('[data-field="category"]').inputValue(),'original');assert.match(await first.textContent(),/Common writer/);
 await second.locator('[data-override-credits]').click();await second.locator('[data-field="last"]').fill('Solo writer');await second.locator('[data-field="name"]').fill('Solo publisher');
 await second.locator('[data-field="category"]').selectOption('sourced');
 await first.locator('[data-field="usage"]').selectOption('BV');await first.locator('[data-field="title"]').fill('Independent title');
 await jump('Find your cues');await p.locator('[data-field="last"]').fill('Changed shared writer');await p.locator('[data-field="name"]').fill('Changed shared publisher');
 await jump('Timings & usage');assert.equal(await first.locator('[data-field="title"]').inputValue(),'Independent title');assert.match(await first.textContent(),/Changed shared writer/);assert.equal(await second.locator('[data-field="last"]').inputValue(),'Solo writer');
 const originalStart=await first.locator('[data-field="start"]').inputValue();await first.locator('[data-field="start"]').fill('01:0');await jump('Find your cues');await nav('Timings & usage');assert.equal(await first.locator('[data-field="start"]').inputValue(),'01:0');await first.locator('[data-field="start"]').fill(originalStart);
 await second.locator('[data-field="share"]').first().fill('');await jump('Review & export');assert.match(await p.locator('.issues').textContent(),/shares/);await nav('Timings & usage');assert.equal(await second.locator('[data-field="share"]').first().inputValue(),'');await second.locator('[data-field="share"]').first().fill('100');
 await second.locator('[data-reset-shared="credits"]').evaluate(e=>e.click());assert.match(await second.textContent(),/Changed shared writer/);assert.equal(await second.locator('[data-field="category"]').inputValue(),'sourced');
 await second.locator('[data-override-credits]').click();await second.locator('[data-field="last"]').fill('Solo writer');await second.locator('[data-field="name"]').fill('Solo publisher');
 await second.locator('[data-reset-shared="category"]').click();assert.equal(await second.locator('[data-field="category"]').inputValue(),'original');await second.locator('[data-field="category"]').selectOption('sourced');
 await p.reload();await nav('Timings & usage');assert.equal(await second.locator('[data-field="last"]').inputValue(),'Solo writer');assert.match(await first.textContent(),/Changed shared writer/);
 await nav('Find your cues');await p.locator('[data-track]').click();await p.locator('[data-reattach]').setInputFiles(`${process.env.FIXTURES||'/tmp/cuebook-fixtures'}/score.wav`);await ready();
 await p.locator('#analyze').click();await ready();state=await saved();assert.deepEqual(state.cues.map(c=>c.id),ids);assert.equal(state.cues[0].usage,'BV');assert.equal(state.cues[1].credits[0].last,'Solo writer');assert.equal(state.cues[0].credits,undefined);
 await p.locator('[data-clear-results="offset"]').click();await nav('Find your cues');await p.locator('[data-field="last"]').fill('Latest shared writer');await p.locator('#undo-clear').click();assert.equal((await saved()).cues[0].credits,undefined);
 await nav('Find your cues');await p.locator('[data-clear-results="offset"]').click();await p.locator('#analyze').click();await ready();assert.equal((await saved()).cues[1].credits[0].last,'Solo writer');
 await p.locator('[data-mode="manual"]').click();await p.locator('[data-add-cue]').click();assert.equal((await saved()).cues.at(-1).usage,'BI');assert.equal((await saved()).cues.at(-1).credits,undefined);await p.locator('[data-remove-cue]').last().click();
 await nav('Find your cues');await p.locator('[data-mode="movie"]').click();await nav('Find your cues');assert.equal(await p.locator('[data-field="last"]').inputValue(),'Latest shared writer');await nav('Find your cues');await p.locator('[data-mode="offset"]').click();
 await nav('Timings & usage');assert.equal(await p.locator('[data-field="usage"]').first().inputValue(),'BV');await p.locator('#confirm-detections').click();
 await nav('Production details');await p.locator('[data-field="title"]').fill('Shared details export');await jump('Review & export');assert.equal(await p.locator('#export').isEnabled(),true);
 if(process.env.EXPECT_API==='true') {
  await p.route('**/api/validate', route=>route.abort(), {times:1});
  await p.locator('#export').click();
  await p.waitForFunction(()=>document.querySelector('.notice')?.textContent.includes('could not reach'));
  assert.equal((await saved()).cues[0].title,'Independent title');
  assert.equal(await p.locator('#export').isEnabled(),true);
 }
 const apiRequest = process.env.EXPECT_API==='true' ? p.waitForRequest(r=>r.url().endsWith('/api/validate')) : null;
 const dl=p.waitForEvent('download');await p.locator('#export').click();await (await dl).saveAs('/tmp/cuebook-shared.xlsx');
 if(apiRequest) {
  const payload=(await apiRequest).postDataJSON();
  assert.equal(payload.cues[0].usage,'BV');
  assert.equal(payload.cueDetailsArchive,undefined);
  assert.equal(payload.tracks[0].filename,undefined);
  assert.equal(payload.sharedCueDetails.credits[0].ipi,undefined);
 }
 await nav('Find your cues');await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await p.locator('[data-field="last"]').isVisible(),true);await p.screenshot({path:'/tmp/cuebook-shared-mobile.png',fullPage:true});
 // Legacy values become explicit overrides, including after reload and shared edits.
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('cuebook-v1'));s.cues[0].credits=structuredClone(s.sharedCueDetails.credits);s.cues[0].credits[0].last='Legacy writer';s.cues[0].category='original';delete s.sharedCueDetails;delete s.cueDetailsVersion;localStorage.setItem('cuebook-v1',JSON.stringify(s));});
 await p.reload();await nav('Find your cues');await p.locator('[data-field="last"]').fill('New shared writer');await nav('Timings & usage');assert.equal(await p.locator('[data-cue]').first().locator('[data-field="last"]').inputValue(),'Legacy writer');assert.equal(await p.locator('[data-cue]').nth(1).locator('[data-field="last"]').inputValue(),'Solo writer');
 assert.deepEqual(errors,[]);console.log('PASS shared live propagation, per-group override/reset, input-before-blur/navigation, partial timing/share drafts, sidebar/contributors, stable IDs, reload/reattach, rerun/clear/undo, paths, XLSX, mobile');await b.close();
})();
