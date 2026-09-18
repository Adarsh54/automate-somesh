import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('capture worklet preserves variable-sized stereo blocks and flushes remaining frames on stop',async()=>{let Processor;const messages=[];const sandbox={currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:message=>messages.push(message)};}},registerProcessor:(name,p)=>{assert.equal(name,'cuestamp-capture');Processor=p;},Float32Array};vm.runInNewContext(await readFile(new URL('../src/experimental/recording-worklet.js',import.meta.url),'utf8'),sandbox);const p=new Processor();p.process([[new Float32Array([.1,.2]),new Float32Array([-.1,-.2])]]);p.process([[new Float32Array([.3]),new Float32Array([-.3])]]);assert.equal(messages.length,0);p.port.onmessage({data:'stop'});assert.equal(messages[0].pcm.length,2);assert.deepEqual(Array.from(messages[0].pcm[0]),Array.from(new Float32Array([.1,.2,.3])));assert.deepEqual(Array.from(messages[0].pcm[1]),Array.from(new Float32Array([-.1,-.2,-.3])));assert.equal(messages[1].done,true);p.process([[new Float32Array([1])]]);assert.equal(messages.length,2);});

test('capture starts on its scheduled frame even when the boundary falls inside a worklet block',async()=>{
 let Processor;const messages=[],sandbox={currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_,p)=>Processor=p,Float32Array};
 vm.runInNewContext(await readFile(new URL('../src/experimental/recording-worklet.js',import.meta.url),'utf8'),sandbox);
 const p=new Processor({processorOptions:{startFrame:3}});p.process([[new Float32Array([10,11])]]);
 sandbox.currentFrame=2;p.process([[new Float32Array([12,13,14])]]);
 sandbox.currentFrame=5;p.process([[new Float32Array([15])]]);p.port.onmessage({data:'stop'});
 assert.deepEqual(Array.from(messages[0].pcm[0]),[13,14,15]);assert.equal(messages[1].done,true);
});
