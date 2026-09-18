import test from 'node:test';
import assert from 'node:assert/strict';
import {createMidiCapture} from '../src/experimental/midi-capture.js';
test('MIDI capture pairs repeated notes by channel and closes held notes at stop',()=>{
 const take=createMidiCapture(1000);
 take.push([0x90,60,100],1100);take.push([0x90,60,80],1200);take.push([0x91,60,90],1300);
 take.push([0x80,60,0],1400);take.push([0x90,60,0],1500);
 const result=take.finish(2000);
 assert.equal(result.notes.length,3);assert.equal(result.notes[0].channel,0);assert.equal(result.notes[2].channel,1);
 assert.ok(Math.abs(result.notes[0].duration-.3)<1e-9);assert.ok(Math.abs(result.notes[1].duration-.3)<1e-9);assert.equal(result.notes[2].duration,.7);
 assert.equal(result.notes[0].velocity,100/127);assert.deepEqual(take.finish(3000),result);assert.equal(take.push([0x90,61,127],2100),false);
});
test('MIDI capture preserves sustain, bend, program and pressure while ignoring malformed/system events',()=>{
 const take=createMidiCapture(0);
 for(const [data,time] of [[[0xb2,64,127],100],[[0xe2,0,96],200],[[0xc2,12],300],[[0xd2,55],400],[[0xa2,60,77],500]])take.push(data,time);
 for(const data of [[0xf8],[0xf0,1,2,0xf7],[0x90,60],[0x90,200,80],[]])assert.equal(take.push(data,600),true);
 const {events,notes}=take.finish(700);assert.equal(notes.length,0);assert.deepEqual(events.map(e=>e.type),['controlChange','pitchBend','programChange','channelPressure','polyPressure']);
 assert.equal(events[0].parameter,64);assert.equal(events[1].value,12288);assert.ok(events.every(e=>e.channel===2));
});
test('capture limits stop accepting data without losing already captured material',()=>{
 const take=createMidiCapture(0,{maxItems:2,maxSeconds:1});
 assert.equal(take.push([0x90,60,100],0),true);assert.equal(take.push([0x90,61,100],100),true);assert.equal(take.push([0x90,62,100],200),false);
 assert.equal(take.push([0xb0,7,100],1000),false);const result=take.finish(1500);assert.equal(result.notes.length,2);assert.equal(result.notes[0].duration,1);
 assert.equal(result.notes[1].duration,.9);
});
