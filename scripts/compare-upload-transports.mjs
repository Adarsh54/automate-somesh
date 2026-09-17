// Small, sequential transport comparison. Uses synthetic data and removes test Blobs.
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {del} from '@vercel/blob';
import {put,generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
if(process.env.APP_URL!=='http://127.0.0.1:5190')throw Error('Development only');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true}),size=3_000_000,data=randomBytes(size),results=[];
try{
 const page=await browser.newPage();await page.goto(process.env.APP_URL+'/reel.html');
 for(const mode of ['browser-progress','node','browser-no-progress','node','browser-progress','browser-no-progress']){
  const pathname=`benchmarks/transport-${randomUUID()}.bin`,token=await generateClientTokenFromReadWriteToken({pathname,maximumSizeInBytes:size,allowedContentTypes:['application/octet-stream'],addRandomSuffix:false,validUntil:Date.now()+600000});
  try{
   let ms;
   if(mode==='node'){const start=performance.now();await put(pathname,data,{access:'private',token,contentType:'application/octet-stream',abortSignal:AbortSignal.timeout(30000)});ms=performance.now()-start;}
   else ms=await page.evaluate(async({pathname,token,size,progress})=>{
    const {put}=await import('/node_modules/.vite/deps/@vercel_blob_client.js'),bytes=new Uint8Array(size);for(let i=0;i<size;i+=65536)crypto.getRandomValues(bytes.subarray(i,Math.min(size,i+65536)));
    const start=performance.now();await put(pathname,new Blob([bytes]),{access:'private',token,contentType:'application/octet-stream',abortSignal:AbortSignal.timeout(30000),...(progress?{onUploadProgress:()=>{}}:{})});return performance.now()-start;
   },{pathname,token,size,progress:mode==='browser-progress'});
   const result={mode,size,ms:Math.round(ms),Mbps:Number((size*8/ms/1000).toFixed(2))};results.push(result);console.log(JSON.stringify(result));
  }finally{await del(pathname);}
 }
}finally{await browser.close();await writeFile('/tmp/cuestamp-upload-transports.json',JSON.stringify(results,null,2));}
