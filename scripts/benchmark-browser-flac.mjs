// Prototype benchmark only. Install libflacjs separately and set FLAC_BENCH_RUNTIME.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [input,output]=process.argv.slice(2),runtime=process.env.FLAC_BENCH_RUNTIME;
if(!input||!output||!runtime)throw Error('Provide input WAV, output directory, and FLAC_BENCH_RUNTIME.');
const worker=`importScripts('/libflac.min.wasm.js');
self.onmessage=async({data:file})=>{let encoder;try{
 const started=performance.now();await new Promise(resolve=>{if(Flac.isReady())resolve();else Flac.onready=resolve;});
 const {wavInfo}=await import('/reel-waveform.js'),info=await wavInfo(file);
 if(info.format!==1||![16,24].includes(info.bits))throw Error('Only integer 16/24-bit PCM is supported by this benchmark.');
 const frames=info.samples/info.channels,chunks=[],width=info.bits/8;
 encoder=Flac.create_libflac_encoder(info.rate,info.channels,info.bits,5,frames,true);
 if(!encoder||Flac.init_encoder_stream(encoder,bytes=>chunks.push(bytes.slice()))!==0)throw Error('Encoder initialization failed.');
 const chunkFrames=65536;
 for(let frame=0;frame<frames;frame+=chunkFrames){
  const count=Math.min(chunkFrames,frames-frame),v=new DataView(await file.slice(info.start+frame*info.align,info.start+(frame+count)*info.align).arrayBuffer()),pcm=new Int32Array(count*info.channels);
  for(let i=0;i<pcm.length;i++){const p=i*width;if(width===2)pcm[i]=v.getInt16(p,true);else{let n=v.getUint8(p)|v.getUint8(p+1)<<8|v.getUint8(p+2)<<16;if(n&0x800000)n-=0x1000000;pcm[i]=n;}}
  if(!Flac.FLAC__stream_encoder_process_interleaved(encoder,pcm,count))throw Error('Encoding failed.');
 }
 if(!Flac.FLAC__stream_encoder_finish(encoder))throw Error('Verification failed.');
 const blob=new Blob(chunks,{type:'audio/flac'});self.postMessage({blob,ms:Math.round(performance.now()-started),size:blob.size,frames,sampleRate:info.rate,bits:info.bits});
}catch(e){self.postMessage({error:e.message});}finally{if(encoder)Flac.FLAC__stream_encoder_delete(encoder);}};`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),name=url.pathname;
 if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<input type="file">');return;}
 if(name==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(worker);return;}
 const files={'/libflac.min.wasm.js':join(runtime,'dist/libflac.min.wasm.js'),'/libflac.min.wasm.wasm':join(runtime,'dist/libflac.min.wasm.wasm'),'/reel-waveform.js':new URL('../src/reel-waveform.js',import.meta.url)};
 if(!files[name]){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(files[name]));
}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
try{
 await mkdir(output,{recursive:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('input').setInputFiles(resolve(input));
 const downloadPromise=page.waitForEvent('download',{timeout:120000});
 const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const worker=new Worker('/worker.js'),start=performance.now();let ticks=0;const timer=setInterval(()=>ticks++,10),timeout=setTimeout(()=>{worker.terminate();clearInterval(timer);reject(Error('Encoding timed out'));},110000);
  worker.onerror=()=>{clearTimeout(timeout);clearInterval(timer);worker.terminate();reject(Error('Worker failed'));};
  worker.onmessage=({data})=>{clearTimeout(timeout);clearInterval(timer);worker.terminate();if(data.error){reject(Error(data.error));return;}const a=document.createElement('a');a.href=URL.createObjectURL(data.blob);a.download='browser-level-5.flac';a.click();const {blob,...stats}=data;resolve({...stats,totalMs:Math.round(performance.now()-start),mainThreadTimerTicks:ticks});};
  worker.postMessage(document.querySelector('input').files[0]);
 }));
 await (await downloadPromise).saveAs(join(output,'browser-level-5.flac'));await writeFile(join(output,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.close();}
