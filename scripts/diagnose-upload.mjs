import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {del} from '@vercel/blob';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
import {writeFile} from 'node:fs/promises';
if(process.env.APP_URL!=='http://127.0.0.1:5190')throw Error('Development only');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true}),results=[];
try{
 const page=await browser.newPage();await page.goto(process.env.APP_URL+'/reel.html');const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');let network=[];
 cdp.on('Network.responseReceived',({response:r})=>{if(r.url.includes('vercel.com/api/blob'))network.push({status:r.status,protocol:r.protocol,reused:r.connectionReused,region:r.headers['x-vercel-id'],timing:r.timing});});
 for(const progress of [true,false]){
  const pathname=`benchmarks/diagnose-${randomUUID()}.bin`,size=6_000_000,token=await generateClientTokenFromReadWriteToken({pathname,maximumSizeInBytes:size,allowedContentTypes:['application/octet-stream'],addRandomSuffix:false,validUntil:Date.now()+600000});network=[];const attempts=[];
  const listener=r=>{if(r.url().includes('vercel.com/api/blob')&&r.method()!=='OPTIONS')attempts.push({attempt:r.headers()['x-api-blob-request-attempt']});};page.on('request',listener);
  try{
   const result=await page.evaluate(async({pathname,token,size,progress})=>{const {put}=await import('/node_modules/.vite/deps/@vercel_blob_client.js');const bytes=new Uint8Array(size);for(let i=0;i<size;i+=65536)crypto.getRandomValues(bytes.subarray(i,Math.min(size,i+65536)));const started=performance.now(),events=[];await put(pathname,new Blob([bytes]),{access:'private',token,contentType:'application/octet-stream',abortSignal:AbortSignal.timeout(60000),...(progress?{onUploadProgress:p=>events.push({ms:Math.round(performance.now()-started),loaded:p.loaded,percent:p.percentage})}:{})});return {progress,ms:Math.round(performance.now()-started),events};},{pathname,token,size,progress});
   results.push({...result,attempts,network});console.log(JSON.stringify(results.at(-1)));
  }finally{page.off('request',listener);await del(pathname);}
 }
}finally{await browser.close();await writeFile('/tmp/cuestamp-upload-diagnostics.json',JSON.stringify(results,null,2));}
