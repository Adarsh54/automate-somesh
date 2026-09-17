const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readdirSync}=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5190/reel.html');
  const downloadPromise=page.waitForEvent('download');
  const result=await page.evaluate(async()=>{
   const {prepareLosslessUpload}=await import('/src/lossless-upload.js');
   const wav=(bits=24,format=1,random=false)=>{
    const size=1200000,b=new ArrayBuffer(size+44),v=new DataView(b),text=(p,s)=>[...s].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));
    text(0,'RIFF');v.setUint32(4,size+36,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,format,true);v.setUint16(22,2,true);v.setUint32(24,48000,true);v.setUint32(28,48000*2*bits/8,true);v.setUint16(32,2*bits/8,true);v.setUint16(34,bits,true);text(36,'data');v.setUint32(40,size,true);
    const bytes=new Uint8Array(b,44);for(let i=0;i<bytes.length;i++)bytes[i]=random?Math.floor(Math.random()*256):(i%3===2?255:i%19);
    return new File([b],'test.wav',{type:'audio/wav'});
   };
   const original=wav();let progress=0;const compressed=await prepareLosslessUpload(original,{onProgress:()=>progress++});
   if(compressed===original)throw Error('WASM compression fell back unexpectedly');
   const cancel=new AbortController();const canceled=prepareLosslessUpload(original,{signal:cancel.signal,onProgress:()=>cancel.abort(Error('Canceled'))});
   let aborted=false;try{await canceled;}catch(e){aborted=e.message==='Canceled';}
   const float=wav(32,3),noise=wav(16,1,true);
   const floatUnchanged=await prepareLosslessUpload(float)===float,noiseUnchanged=await prepareLosslessUpload(noise)===noise;
   // Exercise reservation metadata, cached retry and original local preview.
   const {createAudioLibrary}=await import('/src/audio-library.js');let reserved,attempts=0,preparations=0,uploads=[];
   const options={account:{user:{id:crypto.randomUUID()}},esc:String,onChange:()=>{},prepareUpload:async f=>{preparations++;return prepareLosslessUpload(f);},request:async(url,opts)=>{
    if(url.includes('list'))return {assets:[]};if(url.includes('reserve')){reserved=JSON.parse(opts.body);return {asset:{...reserved,id:'test-asset',pathname:'test.flac',contentType:'audio/flac'}};}return {};
   },uploadFile:async(_,f)=>{uploads.push({name:f.name,size:f.size});if(!attempts++)throw Error('Network interrupted');return {};}};
   let lib=createAudioLibrary(options);try{await lib.addMany([original]);}catch{}
   lib=createAudioLibrary(options);await lib.load();const local=await lib.fileFor(lib.entries()[0].id);await lib.addMany([local]);
   const pcmHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await original.slice(44).arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
   const a=document.createElement('a');a.download='lossless-check.flac';a.href=URL.createObjectURL(compressed);a.click();
   return {pcmHash,size:compressed.size,name:compressed.name,progress,aborted,floatUnchanged,noiseUnchanged,reserved,uploads,preparations,localOriginal:local.name===original.name&&local.size===original.size};
  });
  const output='/tmp/cuestamp-lossless-check.flac';await (await downloadPromise).saveAs(output);
  const pcm=execFileSync(require('ffmpeg-static'),['-v','error','-i',output,'-f','s24le','-'],{maxBuffer:4000000});
  assert.equal(createHash('sha256').update(pcm).digest('hex'),result.pcmHash);
  assert.equal(result.name,'test.flac');assert(result.size<1200000);assert(result.progress>1);assert(result.aborted);assert(result.floatUnchanged);assert(result.noiseUnchanged);assert(result.localOriginal);assert.equal(result.preparations,1);assert.equal(result.reserved.filename,'test.flac');assert.deepEqual(result.uploads[0],result.uploads[1]);
  console.log('PASS',JSON.stringify(result));
  if(process.argv[2]){
   await page.goto('http://127.0.0.1:5192/reel.html');await page.setContent('<input type="file">');await page.locator('input').setInputFiles(process.argv[2]);
   const worker=readdirSync('dist/assets').find(n=>n.startsWith('lossless-upload.worker-'));
   const download=page.waitForEvent('download');
   const production=await page.evaluate(worker=>new Promise((resolve,reject)=>{
    const start=performance.now(),w=new Worker('/assets/'+worker,{type:'module'});w.onerror=e=>reject(Error(e.message));w.onmessage=({data})=>{if(!data.done)return;w.terminate();if(!data.blob){reject(Error(data.error||'No compressed output'));return;}const a=document.createElement('a');a.download='production.flac';a.href=URL.createObjectURL(data.blob);a.click();resolve({bytes:data.blob.size,ms:Math.round(performance.now()-start)});};w.postMessage(document.querySelector('input').files[0]);
   }),worker);
   const output='/tmp/cuestamp-production-lossless.flac';await (await download).saveAs(output);
   const hash=path=>createHash('sha256').update(execFileSync(require('ffmpeg-static'),['-v','error','-i',path,'-f','s24le','-'],{maxBuffer:512*1024*1024})).digest('hex');
   assert.equal(hash(output),hash(process.argv[2]));console.log('PASS production worker, identical decoded samples:',production);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
