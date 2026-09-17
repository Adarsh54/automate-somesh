import runtimeUrl from 'libflacjs/dist/libflac.min.wasm.js?url';
import wasmUrl from 'libflacjs/dist/libflac.min.wasm.wasm?url';
import {wavInfo} from './reel-waveform.js';
self.onmessage=async({data:file})=>{
 let encoder,Flac;
 try{
  const info=await wavInfo(file,{maxDuration:Infinity});
  // Never quantize floating-point or higher bit-depth sources.
  if(info.format!==1||![16,24].includes(info.bits)||info.channels>8){self.postMessage({done:true});return;}
  self.FLAC_SCRIPT_LOCATION={'libflac.min.wasm.wasm':wasmUrl};
  await import(/* @vite-ignore */ runtimeUrl);
  Flac=self.Flac;
  await new Promise(resolve=>{if(Flac.isReady())resolve();else Flac.onready=resolve;});
  const frames=info.samples/info.channels,chunks=[],width=info.bits/8;
  encoder=Flac.create_libflac_encoder(info.rate,info.channels,info.bits,5,frames,true);
  if(!encoder||Flac.init_encoder_stream(encoder,bytes=>chunks.push(bytes.slice()))!==0)throw Error('Encoder initialization failed');
  for(let frame=0;frame<frames;frame+=65536){
   const count=Math.min(65536,frames-frame),v=new DataView(await file.slice(info.start+frame*info.align,info.start+(frame+count)*info.align).arrayBuffer()),pcm=new Int32Array(count*info.channels);
   for(let i=0;i<pcm.length;i++){const p=i*width;if(width===2)pcm[i]=v.getInt16(p,true);else{let n=v.getUint8(p)|v.getUint8(p+1)<<8|v.getUint8(p+2)<<16;if(n&0x800000)n-=0x1000000;pcm[i]=n;}}
   if(!Flac.FLAC__stream_encoder_process_interleaved(encoder,pcm,count))throw Error('Encoding failed');
   self.postMessage({percentage:Math.floor((frame+count)/frames*100)});
  }
  if(!Flac.FLAC__stream_encoder_finish(encoder))throw Error('Verification failed');
  self.postMessage({done:true,blob:new Blob(chunks,{type:'audio/flac'})});
 }catch(e){self.postMessage({done:true,error:e.message});}
 finally{if(encoder)Flac.FLAC__stream_encoder_delete(encoder);}
};
