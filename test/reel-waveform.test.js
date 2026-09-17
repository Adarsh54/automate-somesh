import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {wavPeaks,wavInfo} from '../src/reel-waveform.js';
const wasm=await readFile(new URL('../src/waveform.wasm',import.meta.url));
function wav(bits,format=1,frames=400000){
 const channels=2,width=bits/8,b=Buffer.alloc(44+frames*channels*width);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(format,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(48000*channels*width,28);b.writeUInt16LE(channels*width,32);b.writeUInt16LE(bits,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 for(let i=0;i<frames*channels;i++){const p=44+i*width,v=i%2===0?0:Math.sin(i*.023)*.7;if(format===3)b.writeFloatLE(v,p);else if(bits===8)b.writeUInt8(Math.round(v*127+128),p);else b.writeIntLE(Math.round(v*(2**(bits-1)-1)),p,width);}
 return new Blob([b]);
}
for(const [bits,format] of [[8,1],[16,1],[24,1],[32,1],[32,3]])test(`Wasm waveform reads chunked ${bits}-bit format ${format} and both channels`,async()=>{
 const result=await wavPeaks(wav(bits,format),wasm);assert.equal(result.peaks.length,360);assert.equal(result.duration,400000/48000);assert.equal(Math.max(...result.peaks),1);assert.ok(result.peaks.every(p=>Number.isFinite(p)&&p>.9));
});
test('invalid and truncated WAV is rejected',async()=>{await assert.rejects(wavInfo(new Blob(['bad'])));const file=wav(16);await assert.rejects(wavInfo(file.slice(0,file.size-1)),/incomplete/);});
