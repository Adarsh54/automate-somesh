const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();
  await page.goto(process.env.CUESTAMP_URL || 'http://127.0.0.1:5184/');
  const result=await page.evaluate(async()=>{
   const {default:AnalysisWorker}=await import('/src/analysis.worker.js?worker&inline');
   const source=new Float32Array(6000),movie=new Float32Array(20000);let seed=123;
   for(let i=0;i<source.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;source[i]=seed/2**32-.5;}
   movie.set(source,4000);
   return new Promise((resolve,reject)=>{
    const worker=new AnalysisWorker(),timer=setTimeout(()=>{worker.terminate();reject(Error('Worker timeout'));},10000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
    worker.onmessage=({data})=>{if(data.type==='progress')return;clearTimeout(timer);worker.terminate();resolve(data);};
    worker.postMessage({mode:'movie',movie,tracks:[{id:'test',title:'Test',samples:source}],options:{threshold:.45}});
   });
  });
  assert.equal(result.engine,'wasm');assert.equal(result.results[0].matches.length,1);assert.equal(result.results[0].matches[0].start,2);
  console.log('PASS real inline analysis worker loads and executes Wasm and returns the expected cue.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
