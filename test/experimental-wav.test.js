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
