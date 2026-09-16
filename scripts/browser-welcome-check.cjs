const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/api/auth?**',r=>r.fulfill({json:{configured:true,user:null}}));
 await page.goto(process.env.CUESTAMP_URL||'http://127.0.0.1:5181/');
 await page.getByRole('heading',{name:'Welcome to Cuestamp'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Log in',exact:true}).getAttribute('href'),'/api/auth?action=login');
 assert.equal(await page.getByRole('link',{name:'Sign up',exact:true}).getAttribute('href'),'/api/auth?action=signup');
 await page.screenshot({path:'/tmp/cuestamp-welcome-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/cuestamp-welcome-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Continue as guest'}).click();
 await page.locator('#shared-details').waitFor();
 assert.match(await page.locator('header').textContent(),/Guest workspace/);
 assert.doesNotMatch(await page.locator('body').innerText(),/processed in your browser|Device-local|decoded locally|frontend/i);
 await page.locator('#shared-details [data-field="last"]').fill('Guest writer');
 await page.reload();await page.locator('#shared-details').waitFor();
 assert.equal(await page.locator('#shared-details [data-field="last"]').inputValue(),'Guest writer');
 assert.equal(await page.locator('#cloud-save').count(),0);
 // Failed login must offer guest access even if this tab previously selected guest.
 await page.goto((process.env.CUESTAMP_URL||'http://127.0.0.1:5181/')+'?authError=1');
 await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Continue as guest'}).click();
 await page.locator('#shared-details').waitFor();assert.equal(new URL(page.url()).search,'');
 console.log('PASS welcome: distinct login/signup, mobile layout, guest editing/reload and failed-login recovery');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
