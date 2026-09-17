const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
function wav(frequency) {
  const rate=8000, frames=240000, b=Buffer.alloc(44+frames*2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
  b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(12000*Math.sin(i*2*Math.PI*frequency/rate)),44+i*2);
  return b;
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const base=process.env.CUESTAMP_URL || 'http://127.0.0.1:5173/';
    await page.goto(base+'#/audio');
    await page.locator('#continue-guest').click();
    await page.locator('[data-library-upload]').setInputFiles([
      {name:'first.wav',mimeType:'audio/wav',buffer:wav(220)},
      {name:'second.wav',mimeType:'audio/wav',buffer:wav(440)},
    ]);
    await page.waitForFunction(()=>document.querySelectorAll('[data-library-preview]').length===2 && !document.querySelector('[data-library-upload]').disabled);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-v1'))?.tracks?.filter(t=>t.purpose!=='library').length || 0),0);
    await page.locator('[data-library-preview]').first().click();
    await page.waitForFunction(()=>document.querySelector('#track-preview')?.readyState>=1);
    assert(await page.locator('#track-preview').evaluate(e=>e.paused && e.currentTime===0));
    await page.locator('#track-preview').evaluate(e=>e.play());
    await page.waitForFunction(()=>!document.querySelector('#track-preview').paused);
    await page.locator('#track-preview').evaluate(e=>{e.pause();e.currentTime=15;});
    await page.locator('#library-source-label').fill('My first cue');
    await page.screenshot({path:'/tmp/cuestamp-audio-files.png',fullPage:true});
    await page.locator('[data-library-preview]').first().click();
    assert(await page.locator('#track-preview').evaluate(e=>e.paused && e.currentTime>=15));
    await page.locator('[data-library-preview]').nth(1).click();
    await page.waitForFunction(()=>document.querySelector('#track-preview')?.readyState>=1);
    assert(await page.locator('#track-preview').evaluate(e=>e.paused && e.currentTime===0));
    assert.equal(await page.locator('[data-preview-seek], #preview-toggle').count(),0);
    await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('[data-library-preview]').length===2);
    assert.equal(await page.locator('[data-library-preview]').filter({hasText:'My first cue'}).count(),1);
    assert.equal(await page.getByText('2 audio files are ready.',{exact:true}).count(),0);
    await page.locator('[data-library-preview]').filter({hasText:'My first cue'}).dragTo(page.locator('aside a[href="#/workspace"]'));
    await page.waitForFunction(()=>document.querySelectorAll('[data-track-offset]').length===1 && !document.querySelector('#analyze').disabled);
    assert.equal(await page.locator('[data-library-preview], [data-upload="library"], .library-grid').count(),0);
    assert.equal(await page.locator('.journey').count(),0);
    await page.locator('#cue-audio-library').click();
    await page.locator('.audio-choice').first().waitFor();
    await page.locator('.audio-choice').filter({hasText:'first.wav'}).click();
    await page.locator('.audio-picker [data-choose]').click();
    await page.waitForFunction(()=>!document.querySelector('.audio-picker'));
    assert.equal(await page.locator('[data-track-offset]').count(),1);
    await page.locator('#analyze').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cuestamp-v1')).analysisReport?.count>0);
    const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('cuestamp-v1')));
    assert.equal(draft.tracks.filter(t=>t.purpose!=='library').length,1);
    assert(draft.cues.every(c=>draft.tracks.find(t=>t.id===c.trackId).filename==='first.wav'));
    await page.locator('aside a[href="#/audio"]').click();
    await page.locator('.confirm-dialog [data-confirm]').click();
    await page.locator('[data-library-preview]').first().waitFor();
    await page.locator('.track-row').filter({hasText:'My first cue'}).locator('[data-library-remove]').click();
    await page.locator('.confirm-dialog [data-confirm]').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-library-preview]').length===1);
    await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('[data-library-preview]').length===1);
    await page.locator('aside a[href="#/workspace"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-track-offset]').length===1 && !document.querySelector('#analyze').disabled);
    assert.deepEqual(errors,[]);
    // Migrate an existing library-only draft and its original IndexedDB file.
    const legacy=await browser.newPage();
    await legacy.goto(base);
    await legacy.evaluate(async bytes=>{
      const file=new File([new Uint8Array(bytes)],'legacy.wav',{type:'audio/wav'});
      const {createLocalAudio}=await import('/src/local-audio.js');
      await createLocalAudio('cuestamp-v1').put('legacy-track',file);
      localStorage.setItem('cuestamp-v1',JSON.stringify({production:{rate:'24'},tracks:[{id:'legacy-track',title:'Legacy cue',filename:'legacy.wav',duration:30,offset:'01:00:00:00',purpose:'library'}],cues:[],mode:'offset'}));
      sessionStorage.setItem('cuestamp-guest','yes');
    },[...wav(550)]);
    await legacy.goto(base+'#/audio');
    await legacy.reload();
    await legacy.locator('[data-library-preview]').filter({hasText:'Legacy cue'}).waitFor();
    await legacy.reload();
    await legacy.locator('[data-library-preview]').filter({hasText:'Legacy cue'}).waitFor();
    assert.equal(await legacy.locator('[data-library-preview]').filter({hasText:'Legacy cue'}).count(),1);
    console.log('PASS: Audio Files uploads, inline paused preview, seek, labels, reload, library removal, cue-sheet drag/reuse, detection isolation, and legacy migration.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
