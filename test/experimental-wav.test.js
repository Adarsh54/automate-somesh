import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWav} from '../src/experimental/wav.js';
const buffer=(channels,sampleRate=48000)=>({numberOfChannels:channels.length,length:channels[0].length,sampleRate,getChannelData:c=>channels[c]});
test('24-bit PCM writes signed interleaved samples, clips overloads and pads odd data lengths',async()=>{
 const view=new DataView(await encodeWav(buffer([[-1,-.5,0,.5,1,2,-2]]),{bitDepth:24}).arrayBuffer());
 assert.equal(view.getUint16(20,true),1);assert.equal(view.getUint32(24,true),48000);
 assert.equal(view.getUint16(32,true),3);assert.equal(view.getUint16(34,true),24);
 assert.equal(view.getUint32(40,true),21);assert.equal(view.byteLength,66);assert.equal(view.getUint32(4,true),58);
 const samples=Array.from({length:7},(_,i)=>{const o=44+3*i,n=view.getUint8(o)|(view.getUint8(o+1)<<8)|(view.getUint8(o+2)<<16);return (n<<8)>>8;});
 assert.deepEqual(samples,[-8388608,-4194304,0,4194304,8388607,8388607,-8388608]);
 const stereo=new DataView(await encodeWav(buffer([[1,0],[-1,.5]]),{bitDepth:24}).arrayBuffer());
 assert.equal(stereo.getUint16(32,true),6);assert.equal(stereo.getUint32(28,true),288000);
 assert.deepEqual([...new Uint8Array(stereo.buffer,44,6)],[255,255,127,0,0,128]);
});
test('float WAV includes fact chunk and preserves headroom while sanitizing nonfinite samples',async()=>{
 const view=new DataView(await encodeWav(buffer([[1.5,-2,NaN,Infinity]],96000),{bitDepth:32}).arrayBuffer());
 assert.equal(view.getUint16(20,true),3);assert.equal(view.getUint32(24,true),96000);
 assert.equal(new TextDecoder().decode(new Uint8Array(view.buffer,36,4)),'fact');
 assert.equal(view.getUint32(44,true),4);assert.equal(view.getUint32(52,true),16);
 assert.deepEqual([0,1,2,3].map(i=>view.getFloat32(56+i*4,true)),[1.5,-2,0,0]);
});
test('default WAV remains 16-bit PCM for recordings and invalid formats reject',async()=>{
 const b=buffer([[-1,0,1]]),view=new DataView(await encodeWav(b).arrayBuffer());
 assert.equal(view.getUint16(34,true),16);assert.equal(view.byteLength,50);
 assert.deepEqual([0,1,2].map(i=>view.getInt16(44+i*2,true)),[-32768,0,32767]);
 assert.throws(()=>encodeWav(b,{bitDepth:8}),/Choose/);
});
const seededRandom=()=>{let seed=91234567;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const pcmSamples=async(blob,depth)=>{const v=new DataView(await blob.arrayBuffer()),step=depth/8,count=v.getUint32(40,true)/step;return Array.from({length:count},(_,i)=>{const o=44+i*step;return depth===16?v.getInt16(o,true):(v.getUint8(o)|(v.getUint8(o+1)<<8)|(v.getInt8(o+2)<<16));});};
test('TPDF preserves sub-LSB average levels with unbiased, signal-independent quantization error',async()=>{
 for(const bitDepth of [16,24])for(const level of [0,.25,-.25,.75]){
  const scale=2**(bitDepth-1),frames=100000,signal=Array(frames).fill(level/scale);
  const out=await pcmSamples(encodeWav(buffer([signal]),{bitDepth,dither:'tpdf',random:seededRandom()}),bitDepth);
  const mean=out.reduce((sum,x)=>sum+x-level,0)/frames,variance=out.reduce((sum,x)=>sum+(x-level)**2,0)/frames;
  assert.ok(Math.abs(mean)<.007,`bias ${mean} at ${bitDepth}/${level}`);
  assert.ok(Math.abs(variance-.25)<.008,`variance ${variance} at ${bitDepth}/${level}`);
  assert.ok(out.every(x=>Math.abs(x-level)<=1.5));
 }
});
test('dither is independent per channel, clips safely, and never affects float or default recording exports',async()=>{
 for(const bitDepth of [16,24]){
  const frames=50000,silence=Array(frames).fill(0),out=await pcmSamples(encodeWav(buffer([silence,silence]),{bitDepth,dither:'tpdf',random:seededRandom()}),bitDepth);
  let cross=0,different=0;for(let i=0;i<out.length;i+=2){cross+=out[i]*out[i+1];different+=out[i]!==out[i+1];}
  assert.ok(Math.abs(cross/frames)<.006);assert.ok(different>10000);
  const extremes=await pcmSamples(encodeWav(buffer([[2,-2,1,-1]]),{bitDepth,dither:'tpdf',random:()=>.5}),bitDepth),scale=2**(bitDepth-1);
  assert.deepEqual(extremes,[scale-1,-scale,scale-1,-scale]);
  // Opposite random extremes exercise rounding at both integer boundaries.
  let flip=false;const clipped=await pcmSamples(encodeWav(buffer([[1,-1]]),{bitDepth,dither:'tpdf',random:()=>{flip=!flip;return flip?.999999:0;}}),bitDepth);
  assert.ok(clipped[0]>0&&clipped[1]<0);
 }
 const fail=()=>{throw Error('Unexpected randomness');},b=buffer([[0,.5,-.5,1.5]]);
 assert.deepEqual(await encodeWav(b,{bitDepth:32,dither:'tpdf',random:fail}).arrayBuffer(),await encodeWav(b,{bitDepth:32}).arrayBuffer());
 await encodeWav(b,{random:fail}).arrayBuffer();
 assert.throws(()=>encodeWav(b,{dither:'invalid'}),/dither/);
});
