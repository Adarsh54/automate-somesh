import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommands,newSession,SessionHistory} from '../src/experimental/session.js';
const fixture=()=>applyCommands(newSession(),[
 {op:'track.add',values:{id:'t',kind:'midi'}},
 {op:'region.add',target:'t',values:{id:'r',start:2,duration:6}},
 {op:'note.add',target:'r',values:{id:'cross',start:.5,duration:2,pitch:60,channel:1}},
 {op:'note.add',target:'r',values:{id:'end',start:3,duration:2,pitch:64}},
 {op:'note.add',target:'r',values:{id:'outside',start:5,duration:1,pitch:67}},
 {op:'event.add',target:'r',values:{id:'old',type:'controlChange',parameter:7,value:100,start:.1}},
 {op:'event.add',target:'r',values:{id:'latest',type:'controlChange',parameter:7,value:70,start:.8}},
 {op:'event.add',target:'r',values:{id:'bend',type:'pitchBend',value:10000,start:.5,channel:1}},
 {op:'event.add',target:'r',values:{id:'boundary',type:'pitchBend',value:8192,start:1,channel:1}},
]);
test('MIDI crop preserves note identities/absolute timing and chases channel state with exact undo',()=>{
 const h=new SessionHistory(fixture()),original=structuredClone(h.session.tracks);
 h.execute([{op:'region.trim',target:'r',values:{start:3,end:6}}]);
 const r=h.session.tracks[0].regions[0];assert.equal(r.start,3);assert.equal(r.duration,3);
 assert.deepEqual(r.notes.map(n=>[n.id,n.start,n.duration,n.channel]),[['cross',0,1.5,1],['end',2,1,0]]);
 assert.deepEqual(r.events.map(e=>[e.type,e.start,e.value]),[['controlChange',0,70],['pitchBend',0,8192]]);
 const trimmed=structuredClone(h.session.tracks);h.undo();assert.deepEqual(h.session.tracks,original);h.redo();assert.deepEqual(h.session.tracks,trimmed);
});
test('MIDI crop retains pedal-held notes per channel and rejects extension atomically',()=>{
 const s=applyCommands(fixture(),[
 {op:'event.add',target:'r',values:{type:'controlChange',parameter:64,value:127,start:0,channel:1}},
 {op:'event.add',target:'r',values:{type:'controlChange',parameter:64,value:0,start:4,channel:1}},
 ]);
 const r=applyCommands(s,[{op:'region.trim',target:'r',values:{start:5,end:7}}]).tracks[0].regions[0];
 assert.deepEqual(r.notes.map(n=>[n.id,n.start,n.duration]),[['cross',0,1],['end',0,2]]);
 for(const values of [{start:1,end:4},{start:3,end:9},{start:5,end:5},{start:NaN,end:6}])assert.throws(()=>applyCommands(s,[{op:'region.trim',target:'r',values}]));
 assert.equal(s.tracks[0].regions[0].duration,6);
});
