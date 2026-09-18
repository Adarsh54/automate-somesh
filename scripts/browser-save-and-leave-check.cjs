// Isolated browser regression: mocked account APIs, no real account writes.
// PLAYWRIGHT_MODULE=/path/to/playwright CUESTAMP_URL=http://127.0.0.1:5190/ node scripts/browser-save-and-leave-check.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const type of ['cue','reel'])for(const target of ['#/projects','#/audio','#/credit-profiles']){
      const context=await browser.newContext();
      const page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      let failSave=true,saveStarted,finishSave;
      const started=new Promise(resolve=>saveStarted=resolve);
      const saving=new Promise(resolve=>finishSave=resolve);
      await page.route('**/api/**',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.pathname==='/api/auth')return route.fulfill({json:url.searchParams.get('action')==='credit-profiles'?{profiles:[]}:{configured:true,user:{id:'navigation-test',email:'test@example.com'},profile:{complete:true}}});
        if(url.pathname==='/api/projects'){
          if(request.method()==='POST'){
            if(failSave)return route.fulfill({status:500,json:{error:'Save failed'}});
            const body=request.postDataJSON();saveStarted();await saving;
            return route.fulfill({json:{project:{...body,revision:1,status:'draft',title:body.data.title || body.data.production.title}}});
          }
          // A failed list refresh must not turn a successful save into a failed save.
          return route.fulfill({status:500,json:{error:'List temporarily unavailable'}});
        }
        return route.fulfill({json:{profiles:[],assets:[],reels:[],links:[],folders:[]}});
      });
      const source=type==='cue'?'#/workspace/library':'#/reels/new';
      await page.goto((process.env.CUESTAMP_URL || 'http://127.0.0.1:5190/')+source);
      await page.locator(type==='cue'?'#workspace-project-title':'#reel-title').fill('Navigation regression');
      const leave=()=>page.locator(`aside a.nav[href="${target}"]`).click();
      await leave();
      await page.getByRole('button',{name:'Keep editing',exact:true}).click();
      assert.equal(new URL(page.url()).hash,source);
      await leave();
      await page.getByRole('button',{name:'Save and leave',exact:true}).click();
      await page.locator('.confirm-dialog [role="alert"]').filter({hasText:/Could not|Save failed/}).waitFor();
      assert.equal(new URL(page.url()).hash,source);
      failSave=false;
      await page.getByRole('button',{name:'Save and leave',exact:true}).click();
      await started;
      assert.equal(new URL(page.url()).hash,source,'Stay on the editor while saving');
      // Duplicate browser events must not replace the requested destination.
      await page.evaluate(()=>{window.dispatchEvent(new PopStateEvent('popstate'));window.dispatchEvent(new HashChangeEvent('hashchange'));});
      finishSave();
      await page.waitForURL(url=>url.hash===target);
      await page.locator('.confirm-dialog').waitFor({state:'detached'});
      assert.deepEqual(errors,[]);
      console.log(`PASS: ${type} saves and leaves for ${target}; cancel, failure, retry, pending save, and list failure`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
