import test from 'node:test';import assert from 'node:assert/strict';
import {recordingTiming} from '../src/experimental/recording-timing.js';
import {createMidiCapture} from '../src/experimental/midi-capture.js';
import {newSession,SessionHistory} from '../src/experimental/session.js';
test('count-in duration follows tempo and bar length with capture rounded to an audio frame',()=>{
 const plan=recordingTiming({tempo:120,meter:3,countInBars:2},10,48000);
 assert.equal(plan.countInSeconds,3);assert.equal(plan.captureTime,13.025);assert.equal(plan.startFrame,625200);
 const odd=recordingTiming({tempo:137,meter:7,countInBars:1},.5,44100);assert.equal(odd.startFrame,Math.ceil(odd.captureTime*44100));assert.ok(Math.abs(odd.captureTime-odd.clickTime-odd.countInSeconds)<1/44100);
 assert.equal(recordingTiming(null,0,44100).countInSeconds,0);
});
test('MIDI pre-roll messages are ignored without poisoning the recorded note state',()=>{
 const take=createMidiCapture(2000);take.push([0x90,60,100],1000);take.push([0xb0,7,20],1500);take.push([0x80,60,0],2100);
 take.push([0x90,64,100],2200);take.push([0x80,64,0],2500);const result=take.finish(2600);
 assert.equal(result.events.length,0);assert.equal(result.notes.length,1);assert.equal(result.notes[0].pitch,64);assert.equal(result.notes[0].start,.2);assert.equal(result.notes[0].duration,.3);
});
test('count-in is an independent persisted undoable recording setting',()=>{
 const h=new SessionHistory(newSession());assert.equal(h.session.countInBars,0);h.execute([{op:'session.set',values:{countInBars:2}}]);assert.equal(h.session.metronomeRecordEnabled,false);h.undo();assert.equal(h.session.countInBars,0);h.redo();assert.equal(h.session.countInBars,2);
 for(const n of [-1,.5,3])assert.throws(()=>h.execute([{op:'session.set',values:{countInBars:n}}]));
});
