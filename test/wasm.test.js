import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWasmFFT} from '../src/wasm-fft.js';
import {fft,prepareMovie,matchTrack} from '../src/analysis.js';
const binary=await readFile(new URL('../src/fft.wasm',import.meta.url));
test('Wasm FFT matches JS forward/inverse transforms across memory growth and reuse',async()=>{
 const transform=await createWasmFFT(binary);
 for(const size of [2,128,16384,65536,128]) {
  const re=Float64Array.from({length:size},(_,i)=>Math.sin(i*.12)+Math.cos(i*.37)),im=new Float64Array(size);
  const wr=re.slice(),wi=im.slice();
  fft(re,im);transform(wr,wi);
  for(let i=0;i<size;i++){assert.ok(Math.abs(re[i]-wr[i])<1e-7);assert.ok(Math.abs(im[i]-wi[i])<1e-7);}
  fft(re,im,true);transform(wr,wi,true);
  for(let i=0;i<size;i++)assert.ok(Math.abs(re[i]-wr[i])<1e-9);
 }
 await assert.rejects(createWasmFFT(new Uint8Array([0,1])));
 assert.throws(()=>transform(new Float64Array(3),new Float64Array(3)),RangeError);
});
test('Wasm movie matching preserves repeated and trimmed detections and scores',async()=>{
 const transform=await createWasmFFT(binary),source=new Float32Array(16000),movie=new Float32Array(80000);
 let seed=42;
 for(let i=0;i<source.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;source[i]=(seed/2**32-.5)*.5+Math.sin(i*.2)*.2;}
 movie.set(source,6000);movie.set(source,36000);movie.set(source.subarray(4000,12000),62000);
 const js=matchTrack(prepareMovie(movie),source),wasm=matchTrack(prepareMovie(movie,{transform}),source);
 assert.equal(js.matches.length,3);assert.equal(wasm.matches.length,3);
 js.matches.forEach((m,i)=>{const w=wasm.matches[i];assert.equal(w.start,m.start);assert.equal(w.end,m.end);assert.equal(w.sourceStart,m.sourceStart);assert.ok(Math.abs(w.score-m.score)<1e-9);});
 assert.equal(matchTrack(prepareMovie(movie,{transform}),new Float32Array(16000)).matches.length,0);
});
test('unavailable or invalid Wasm cleanly selects the JavaScript fallback',async()=>{
 const {loadWasmFFT}=await import('../src/wasm-fft.js');
 for(const fetcher of [async()=>{throw Error('Offline');},async()=>({ok:false}),async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([0,1])})]) {
  const transform=await loadWasmFFT('/fft.wasm',fetcher);
  assert.equal(transform,undefined);
  const samples=new Float32Array(4000);samples.fill(.1);
  assert.equal(prepareMovie(samples,{transform}).transform,fft);
 }
});
