import test from 'node:test';import assert from 'node:assert/strict';
import {clickBar} from '../src/experimental/metronome.js';
import {newSession,SessionHistory} from '../src/experimental/session.js';
test('metronome defaults, validation and undo preserve existing projects',()=>{
 const h=new SessionHistory(newSession());assert.equal(h.session.metronomeEnabled,false);assert.equal(h.session.metronomeRecordEnabled,false);assert.equal(h.session.metronomeDb,-18);
 h.execute([{op:'session.set',values:{metronomeEnabled:true,metronomeRecordEnabled:true,metronomeDb:-12,meter:3}}]);
 assert.equal(h.session.meter,3);h.undo();assert.equal(h.session.metronomeEnabled,false);h.redo();assert.equal(h.session.metronomeDb,-12);
 const before=structuredClone(h.session);for(const values of [{metronomeDb:1},{metronomeDb:-61},{metronomeEnabled:'yes'},{metronomeRecordEnabled:'yes'},{meter:0}])assert.throws(()=>h.execute([{op:'session.set',values}]));assert.deepEqual(h.session,before);
});
test('click bar has beat spacing, downbeat accent and silence between beats',()=>{
 const {samples,duration}=clickBar(120,3,48000);assert.equal(duration,1.5);assert.equal(samples.length,72000);
 const peak=at=>Math.max(...samples.slice(at,at+1920).map(Math.abs));
 assert.ok(peak(0)>peak(24000)*1.5);assert.ok(peak(24000)>.3);assert.ok(peak(48000)>.3);assert.equal(peak(10000),0);
 const odd=clickBar(137,7,44100);assert.ok(Math.abs(odd.samples.length/44100-odd.duration)<1/44100);
 for(const args of [[0,4,44100],[120,0,44100],[120,4,0]])assert.throws(()=>clickBar(...args));
});
