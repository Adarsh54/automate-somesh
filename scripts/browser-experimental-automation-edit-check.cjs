const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'auto-edit',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  const session=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:auto-edit')));
  await page.getByText('Command harness',{exact:true}).click();
  await page.locator('#daw-json').fill(JSON.stringify([
   {op:'track.add',values:{id:'t'}},{op:'region.add',target:'t',values:{duration:8}},
   {op:'track.add',values:{id:'b',kind:'bus'}},{op:'send.set',target:'t',values:{busId:'b',gainDb:-12}},
   {op:'automation.point',target:'t',values:{id:'a',parameter:'gainDb',time:1,value:-24}},
   {op:'automation.point',target:'t',values:{id:'z',parameter:'gainDb',time:4,value:0}},
   {op:'send.automation.point',target:'t',values:{id:'send-a',busId:'b',time:0,value:-12}}
  ]));
  await page.getByRole('button',{name:'Execute commands',exact:true}).click();
  const scope=page.locator('.daw-mix-detail > .daw-automation'),graph=scope.locator('[data-auto-graph]'),handle=scope.locator('[data-auto-point="a"]');
  await graph.scrollIntoViewIfNeeded();
  const box=await graph.boundingBox(),point=await handle.boundingBox();
  await page.mouse.move(point.x+point.width/2,point.y+point.height/2);await page.mouse.down();
  await page.mouse.move(box.x+(8+584*2/8)/600*box.width,box.y+(8+(12+12)/108*144)/160*box.height,{steps:8});await page.mouse.up();
  let state=await session(),points=state.tracks[0].automation;assert.equal(points.length,2);assert.ok(Math.abs(points[0].time-2)<.03);assert.ok(Math.abs(points[0].value+12)<.3);
  const dragged=structuredClone(points[0]);
  await handle.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
  points=(await session()).tracks[0].automation;assert.ok(Math.abs(points[0].time-dragged.time-.2)<1e-9);assert.ok(Math.abs(points[0].value-dragged.value-.5)<1e-9);
  await page.keyboard.press('Delete');assert.equal((await session()).tracks[0].automation.length,1);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await session()).tracks[0].automation.length,2);
  const editor=scope.locator('[data-auto-edit="a"]');
  await editor.locator('[name=time]').fill('3');await editor.locator('[name=value]').fill('-30');await editor.getByRole('button',{name:'Update point',exact:true}).click();
  assert.equal((await session()).tracks[0].automation[0].time,3);
  await editor.locator('[name=time]').fill('4');await editor.getByRole('button',{name:'Update point',exact:true}).click();
  assert.match(await page.locator('.daw-status').textContent(),/already exists/);assert.equal((await session()).tracks[0].automation[0].time,3);
  const send=page.locator('[data-send-automation="b"]');await send.locator('summary').click();
  await send.locator('[data-auto-edit="send-a"] [name=value]').fill('-6');await send.getByRole('button',{name:'Update point',exact:true}).click();
  state=await session();assert.equal(state.tracks[0].sends[0].automation[0].value,-6);assert.equal(state.tracks[0].automation[0].value,-30);
  await page.reload();assert.deepEqual((await session()).tracks,state.tracks);
  await graph.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cuestamp-automation-edit.png'});
  assert.deepEqual(errors,[]);console.log('PASS automation handle drag, repeated keyboard edits/focus, delete/undo, numeric updates, collision rollback, send isolation and persistence.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
