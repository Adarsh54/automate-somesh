import test from 'node:test';import assert from 'node:assert/strict';
import {newSession,SessionHistory} from '../src/experimental/session.js';
import {sustainedEnd} from '../src/experimental/midi-events.js';
import {writeMidi,readMidi} from '../src/experimental/midi.js';
const setup=()=>{const h=new SessionHistory(newSession());h.execute([{op:'track.add',values:{id:'t',kind:'midi',instrument:'sine'}},{op:'region.add',target:'t',values:{id:'r',start:2,duration:4}},{op:'region.set',target:'r',values:{fadeIn:.1,fadeOut:.2}},...[[0,'held'],[1,'released'],[2,'boundary']].map(([channel,id])=>({op:'note.add',target:'r',values:{id,pitch:60+channel,channel,start:.1,duration:.3,velocity:.6}})),...[{id:'down',channel:0,start:0,value:127},{id:'up',channel:0,start:3,value:0},{id:'otherdown',channel:2,start:0,value:127},{id:'otherup',channel:2,start:1,value:0}].map(values=>({op:'event.add',target:'r',values:{...values,type:'controlChange',parameter:64}})),{op:'event.add',target:'r',values:{id:'bend',channel:0,type:'pitchBend',start:.5,value:12288}}]);return h;};
test('splitting carries pedal-held notes, chases state per channel and stops at the original pedal release',()=>{
 const h=setup(),before=structuredClone(h.session);h.execute([{op:'region.split',target:'r',values:{time:3}}]);const [left,right]=h.session.tracks[0].regions;
 assert.equal(left.start,2);assert.equal(left.duration,1);assert.equal(left.fadeIn,.1);assert.equal(left.fadeOut,0);assert.equal(right.start,3);assert.equal(right.duration,3);assert.equal(right.offset,0);assert.equal(right.fadeIn,0);assert.equal(right.fadeOut,.2);
 assert.deepEqual(left.notes.map(n=>n.id),['held','released','boundary']);assert.equal(right.notes.length,1);const held=right.notes[0];assert.equal(held.pitch,60);assert.equal(held.channel,0);assert.equal(held.start,0);assert.equal(held.duration,2);assert.equal(held.velocity,.6);assert.notEqual(held.id,'held');
 assert.equal(sustainedEnd(held,right.events.filter(e=>e.channel===0),right.duration),2);
 assert.ok(right.events.some(e=>e.type==='pitchBend'&&e.value===12288&&e.start===0));assert.ok(right.events.some(e=>e.channel===0&&e.parameter===64&&e.value===127&&e.start===0));assert.ok(right.events.some(e=>e.channel===2&&e.parameter===64&&e.value===0&&e.start===0));assert.ok(!left.events.some(e=>e.id==='otherup'));
 h.undo();assert.deepEqual(h.session.tracks,before.tracks);h.redo();assert.equal(h.session.tracks[0].regions[1].notes.length,1);
 const ids=h.session.tracks[0].regions.flatMap(r=>[r.id,...r.notes.map(n=>n.id),...r.events.map(e=>e.id)]);assert.equal(ids.length,new Set(ids).size);
});
test('crossing and boundary-start notes retain gate lengths; invalid splits leave the batch unchanged',()=>{
 const h=setup();h.execute([{op:'note.add',target:'r',values:{id:'crossing',start:.8,duration:.7,pitch:67,channel:1}},{op:'note.add',target:'r',values:{id:'exact',start:1,duration:.5,pitch:69,channel:1}}]);const before=structuredClone(h.session);
 for(const time of [2,6,NaN]){assert.throws(()=>h.execute([{op:'session.set',values:{title:'bad'}},{op:'region.split',target:'r',values:{time}}]));assert.deepEqual(h.session,before);}
 h.execute([{op:'region.split',target:'r',values:{time:3}}]);const [left,right]=h.session.tracks[0].regions;
 assert.ok(Math.abs(left.notes.find(n=>n.id==='crossing').duration-.2)<1e-9);assert.ok(!left.notes.some(n=>n.id==='exact'));assert.equal(right.notes.find(n=>n.pitch===67).duration,.5);assert.equal(right.notes.find(n=>n.pitch===69).start,0);assert.equal(right.notes.find(n=>n.pitch===69).duration,.5);
});
test('carried sustain notes and chased controller state survive MIDI export',()=>{
 const h=setup();h.execute([{op:'region.split',target:'r',values:{time:3}}]);const tracks=readMidi(writeMidi(h.session).buffer).tracks,notes=tracks.flatMap(t=>t.notes),events=tracks.flatMap(t=>t.events);
 const carried=notes.find(n=>n.pitch===60&&n.start===3);assert.ok(carried);assert.equal(carried.duration,2);assert.equal(carried.channel,0);assert.ok(events.some(e=>e.parameter===64&&e.value===0&&e.start===5&&e.channel===0));
});

test('long pedal holds remain splittable without exceeding the individual note-length limit',()=>{
 const h=setup();h.execute([{op:'region.set',target:'r',values:{duration:8000}},{op:'event.set',target:'up',values:{start:7000}}]);h.execute([{op:'region.split',target:'r',values:{time:3}}]);const right=h.session.tracks[0].regions[1],note=right.notes.find(n=>n.channel===0);assert.equal(note.duration,3600);assert.equal(sustainedEnd(note,right.events.filter(e=>e.channel===0),right.duration),6999);
});
