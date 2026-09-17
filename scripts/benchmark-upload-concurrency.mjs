// Real browser upload benchmark using synthetic data and the development Blob store.
// Run with --env-file=.env.local and PLAYWRIGHT_MODULE / PLAYWRIGHT_EXECUTABLE.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {del,head} from '@vercel/blob';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
if(process.env.APP_URL!=='http://127.0.0.1:5190')throw Error('Use the local development environment only.');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
if(!process.env.BENCH_CONCURRENCY)throw Error('Set BENCH_CONCURRENCY explicitly; each run uploads 190 MB.');
const concurrency=process.env.BENCH_CONCURRENCY.split(',').map(Number);
if(concurrency.some(n=>!Number.isInteger(n)||n<1||n>24))throw Error('Invalid concurrency');
const size=190_000_000,partSize=10_000_000,run=randomUUID(),results=[],paths=[];
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:'chrome'}),headless:true});
try{
 const page=await browser.newPage();await page.goto(process.env.APP_URL+'/reel.html');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');const protocols=new Set();cdp.on('Network.responseReceived',({response})=>{if(response.url.includes('vercel.com/api/blob'))protocols.add(response.protocol);});
 await page.exposeFunction('benchProgress',value=>console.log(JSON.stringify({progress:value})));
 for(const connections of concurrency){
  const pathname=`benchmarks/concurrency-${run}-${connections}.bin`;paths.push(pathname);
  const token=await generateClientTokenFromReadWriteToken({pathname,maximumSizeInBytes:size,validUntil:Date.now()+15*60_000,allowedContentTypes:['application/octet-stream'],addRandomSuffix:false});
  protocols.clear();let requests=0,failures=0,statuses={};
  const request=r=>{if(r.url().includes('vercel.com/api/blob')&&r.method()!=='OPTIONS')requests++;};
  const failed=r=>{if(r.url().includes('vercel.com/api/blob'))failures++;};
  const response=r=>{if(r.url().includes('vercel.com/api/blob')&&r.status()>=400)statuses[r.status()]=(statuses[r.status()]||0)+1;};
  page.on('request',request);page.on('requestfailed',failed);page.on('response',response);
  console.log(JSON.stringify({starting:connections,size,partSize}));
  try{
   const result=await page.evaluate(async({pathname,token,connections,size,partSize})=>{
    const {createMultipartUpload,uploadPart,completeMultipartUpload}=await import('/node_modules/.vite/deps/@vercel_blob_client.js');
    const bytes=new Uint8Array(partSize);for(let i=0;i<bytes.length;i+=65536)crypto.getRandomValues(bytes.subarray(i,Math.min(i+65536,bytes.length)));
    const chunk=new Blob([bytes]),parts=Array(Math.ceil(size/partSize)),loaded=parts.fill(0).slice(),timings=[],controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),10*60_000);
    const options={access:'private',token,contentType:'application/octet-stream',abortSignal:controller.signal};
    const start=performance.now();let next=0,lastReport=0;
    try{
     const upload=await createMultipartUpload(pathname,options),transferStart=performance.now();
     const send=async()=>{while(next<parts.length){const index=next++,t=performance.now();parts[index]=await uploadPart(pathname,chunk.slice(0,Math.min(partSize,size-index*partSize)),{...options,...upload,partNumber:index+1,onUploadProgress:p=>{loaded[index]=p.loaded;if(performance.now()-lastReport>10000){lastReport=performance.now();window.benchProgress({connections,percent:Math.floor(loaded.reduce((a,b)=>a+b,0)/size*100),seconds:Math.round((performance.now()-start)/1000)});}}});timings.push(performance.now()-t);}};
     await Promise.all(Array.from({length:connections},send));const transferMs=performance.now()-transferStart;
     await completeMultipartUpload(pathname,parts,{...options,...upload});
     return {connections,size,partSize,transferMs:Math.round(transferMs),totalMs:Math.round(performance.now()-start),mbps:Number((size*8/transferMs/1000).toFixed(2)),MBps:Number((size/transferMs/1000).toFixed(2)),slowestPartMs:Math.round(Math.max(...timings))};
    }finally{clearTimeout(deadline);controller.abort();}
   },{pathname,token,connections,size,partSize});
   const stored=await head(pathname);if(stored.size!==size)throw Error('Stored byte count did not match.');
   Object.assign(result,{requests,failedRequests:failures,httpErrors:statuses,protocols:[...protocols]});results.push(result);console.log(JSON.stringify({result}));
  }finally{page.off('request',request);page.off('requestfailed',failed);page.off('response',response);await del(pathname);}
  await writeFile('/tmp/cuestamp-upload-concurrency.json',JSON.stringify({run,results},null,2));
 }
}finally{await browser.close();for(const path of paths)await del(path);}
console.log(JSON.stringify({complete:results}));
