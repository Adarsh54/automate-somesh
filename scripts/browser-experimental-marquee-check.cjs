const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/auth?*',r=>r.fulfill({json:{configured:true,user:{id:'marquee-test',email:'test@example.com'},profile:{name:'Test',occupation:'Composer',complete:true}}}));await page.route('**/api/projects*',r=>r.fulfill({json:{projects:[]}}));await page.route('**/api/daw',r=>r.fulfill({json:{configured:false}}));
 await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5190/')+'#/experimental');await page.getByText('Command harness',{exact:true}).click();
 await page.locator('#daw-json').fill(JSON.stringify([{op:'track.add',values:{id:'t',kind:'midi'}},{op:'region.add',target:'t',values:{id:'r',duration:8}},...[[60,1,1],[64,1.5,.5],[67,4,1]].map(([pitch,start,duration],i)=>({op:'note.add',target:'r',values:{id:['a','b','c'][i],pitch,start,duration}}))]));await page.getByRole('button',{name:'Execute commands',exact:true}).click();await page.locator('[data-region="r"]').click();
 const notes=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-experimental:marquee-test')).tracks[0].regions[0].notes);
 const chosen=()=>page.locator('[data-note][aria-pressed="true"]').evaluateAll(elements=>elements.map(e=>e.dataset.note).sort());
 async function box(ids,{reverse=false,key=null,cancel=false}={}){
  await page.locator('.daw-note-grid').scrollIntoViewIfNeeded();await page.locator('.daw-note-grid').evaluate(el=>el.scrollTop=(127-70)*16);
  const boxes=await Promise.all(ids.map(id=>page.locator(`[data-note="${id}"]`).boundingBox()));let from={x:Math.min(...boxes.map(b=>b.x))-8,y:Math.min(...boxes.map(b=>b.y))-4},to={x:Math.max(...boxes.map(b=>b.x+b.width))+8,y:Math.max(...boxes.map(b=>b.y+b.height))+4};if(reverse)[from,to]=[to,from];if(key)await page.keyboard.down(key);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});
  assert.equal(await page.locator('.daw-note-marquee').count(),1);if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(key)await page.keyboard.up(key);
 }
 await page.locator('[data-piano-tool]').selectOption('select');await box(['a','b'],{reverse:true});assert.deepEqual(await chosen(),['a','b']);assert.equal((await notes()).length,3);
 const edge=page.locator('[data-note="a"] [data-note-resize]');await edge.scrollIntoViewIfNeeded();const b=await edge.boundingBox();await page.mouse.move(b.x+2,b.y+5);await page.mouse.down();await page.mouse.move(b.x+42,b.y+5,{steps:8});await page.mouse.up();assert.deepEqual((await notes()).map(n=>n.duration),[1.5,1,1]);
 await page.locator('[data-notes-resize] [name="beats"]').fill('-1');await page.getByRole('button',{name:'Resize selected notes',exact:true}).click();assert.deepEqual((await notes()).map(n=>n.duration),[1,.5,1]);await page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await notes()).map(n=>n.duration),[1.5,1,1]);await page.getByRole('button',{name:'Redo',exact:true}).click();
 await box(['c'],{key:'Control'});assert.deepEqual(await chosen(),['a','b','c']);await box(['a'],{cancel:true});assert.deepEqual(await chosen(),['a','b','c']);
 await page.locator('[data-piano-tool]').selectOption('draw');await box(['a','b'],{key:'Alt'});assert.deepEqual(await chosen(),['a','b']);assert.equal((await notes()).length,3);
 await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.locator('[data-pitch="60"]').click({position:{x:550,y:8}});assert.equal((await notes()).length,4);
 await page.getByRole('button',{name:'Select all notes',exact:true}).click();await page.screenshot({path:'/tmp/cuestamp-marquee.png'});assert.deepEqual(errors,[]);console.log('PASS marquee/reverse/additive/cancel/Alt selection, grouped drag/numeric resizing, undo/redo and preserved Draw mode.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
