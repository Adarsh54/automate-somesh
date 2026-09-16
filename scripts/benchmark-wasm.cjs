const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();
  await page.goto(process.env.CUESTAMP_URL || 'http://127.0.0.1:5184/');
  const results=await page.evaluate(async()=>{
   const {prepareMovie,matchTrack}=await import('/src/analysis.js');
   const {createWasmFFT}=await import('/src/wasm-fft.js');
   const cold=performance.now();
   const transform=await createWasmFFT(await(await fetch('/src/fft.wasm')).arrayBuffer());
   const startupMs=performance.now()-cold;
   const source=new Float32Array(16000),other=new Float32Array(10000),unmatched=new Float32Array(12000),movie=new Float32Array(600*2000);
   let seed=42;
   for(const samples of [movie,source,other,unmatched])for(let i=0;i<samples.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/2**32-.5)*(samples===movie?.02:.5);
   }
   for(const at of [15,125,550])for(let i=0;i<source.length;i++)movie[at*2000+i]+=source[i];
   for(let i=0;i<8000;i++)movie[210*2000+i]+=source[i+4000];
   for(let i=0;i<other.length;i++)movie[325*2000+i]+=other[i];
   const runs={javascript:[],wasm:[]};let counts;
   for(let round=0;round<4;round++)for(const engine of (round%2?['wasm','javascript']:['javascript','wasm'])) {
    const start=performance.now(),prepared=prepareMovie(movie,engine==='wasm'?{transform}:{});
    const results=[source,other,unmatched].map(track=>matchTrack(prepared,track));
    const elapsed=performance.now()-start;
    if(round>0)runs[engine].push(elapsed);
    const positions=JSON.stringify(results.map(r=>r.matches.map(m=>[m.start,m.end,m.sourceStart])));
    if(counts && positions!==counts)throw Error('Different detections');counts=positions;
   }
   return {startupMs,runs,positions:JSON.parse(counts)};
  });
  assert.deepEqual(results.positions.map(p=>p.length),[4,1,0]);
  const median=a=>[...a].sort((x,y)=>x-y)[1];
  results.javascriptMs=median(results.runs.javascript);results.wasmMs=median(results.runs.wasm);results.speedup=results.javascriptMs/results.wasmMs;
  console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
