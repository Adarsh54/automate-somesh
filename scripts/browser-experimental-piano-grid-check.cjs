const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'piano-grid',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));
  await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));
  await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
  await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');
  await page.getByRole('button',{name:'+ Instrument track',exact:true}).click();await page.getByRole('button',{name:'+ MIDI region',exact:true}).click();
  const notes=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:piano-grid')).tracks[0].regions[0].notes);
  const snap=page.getByLabel('Piano roll snap',{exact:true});
  await snap.selectOption(String(1/3));await page.locator('[data-pitch="72"]').click({position:{x:68,y:8}});
  const id=(await notes())[0].id,handle=page.locator(`[data-note="${id}"]`);
  assert.ok(Math.abs((await notes())[0].duration-1/6)<1e-10);
  async function drag(dx,{resize=false,shift=false}={}){
   const locator=resize?handle.locator('[data-note-resize]'):handle;await locator.scrollIntoViewIfNeeded();const rect=await locator.boundingBox();
   if(shift)await page.keyboard.down('Shift');
   await page.mouse.move(rect.x+2,rect.y+5);await page.mouse.down();await page.mouse.move(rect.x+2+dx,rect.y+5,{steps:5});await page.mouse.up();
   if(shift)await page.keyboard.up('Shift');
  }
  let before=(await notes())[0];await drag(14);let current=(await notes())[0];assert.ok(Math.abs(current.start-before.start-1/6)<1e-8);
  await snap.selectOption('0');before=current;await drag(7);current=(await notes())[0];assert.ok(Math.abs(current.start-before.start-.0875)<1e-8);
  await snap.selectOption('1');before=current;await drag(7,{shift:true});current=(await notes())[0];assert.ok(Math.abs(current.start-before.start-.0875)<1e-8);
  before=current;await drag(11,{resize:true,shift:true});current=(await notes())[0];assert.ok(Math.abs(current.duration-before.duration-.1375)<1e-8);
  assert.equal(await snap.inputValue(),'1');
  const edited=current;await page.getByRole('button',{name:'Undo',exact:true}).click();assert.ok(Math.abs((await notes())[0].duration-before.duration)<1e-8);
  await page.getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual((await notes())[0],edited);
  await page.locator('#daw-tempo').fill('60');await page.locator('#daw-tempo').press('Tab');assert.equal(await snap.inputValue(),'1');
  assert.equal(await page.locator('.daw-note-grid').evaluate(el=>el.style.getPropertyValue('--piano-snap-width')),'80px');
  assert.ok(Math.abs((await notes())[0].start-edited.start*2)<1e-8);
  const saved=await notes();await page.reload();await page.locator('[data-region]').click();assert.deepEqual(await notes(),saved);
  await page.locator('.daw-piano').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cuestamp-piano-grid.png'});
  assert.deepEqual(errors,[]);console.log('PASS triplet placement, relative grid dragging, free move/resize, Shift bypass, undo/redo, tempo-aware grid and saved notes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
