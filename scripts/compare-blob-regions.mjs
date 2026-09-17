// Compare private development Blob stores, using the same browser and payload.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {del} from '@vercel/blob';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
if(process.env.APP_URL!=='http://127.0.0.1:5190'||!process.env.SFO_BENCH_READ_WRITE_TOKEN)throw Error('Load development and SFO benchmark credentials.');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true}),size=3_000_000,results=[];
try{
 const page=await browser.newPage();await page.goto(process.env.APP_URL+'/reel.html');
 await page.evaluate(size=>{const b=new Uint8Array(size);for(let i=0;i<size;i+=65536)crypto.getRandomValues(b.subarray(i,Math.min(i+65536,size)));window.benchmarkPayload=new Blob([b]);},size);
 for(const region of ['sfo1','iad1','iad1','sfo1','sfo1','iad1']){
  const rwToken=region==='sfo1'?process.env.SFO_BENCH_READ_WRITE_TOKEN:process.env.BLOB_READ_WRITE_TOKEN;
  const pathname=`benchmarks/region-${randomUUID()}.bin`,token=await generateClientTokenFromReadWriteToken({token:rwToken,pathname,maximumSizeInBytes:size,allowedContentTypes:['application/octet-stream'],addRandomSuffix:false,validUntil:Date.now()+600000});
  try{
   const ms=await page.evaluate(async({pathname,token})=>{const {put}=await import('/node_modules/.vite/deps/@vercel_blob_client.js'),start=performance.now();await put(pathname,window.benchmarkPayload,{access:'private',token,contentType:'application/octet-stream',onUploadProgress:()=>{},abortSignal:AbortSignal.timeout(30000)});return performance.now()-start;},{pathname,token});
   const result={region,size,ms:Math.round(ms),Mbps:Number((size*8/ms/1000).toFixed(2))};results.push(result);console.log(JSON.stringify(result));
  }finally{await del(pathname,{token:rwToken});}
 }
}finally{await browser.close();await writeFile('/tmp/cuestamp-region-comparison.json',JSON.stringify(results,null,2));}
