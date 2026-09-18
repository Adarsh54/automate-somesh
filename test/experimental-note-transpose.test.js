import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionHistory,newSession} from '../src/experimental/session.js';
import {transposeNoteEdits} from '../src/experimental/note-transpose.js';
import {scales} from '../src/experimental/scales.js';
import {writeMidi,readMidi} from '../src/experimental/midi.js';
const fixture=()=>{const h=new SessionHistory(newSession());h.execute([{op:'track.add',values:{id:'t',kind:'midi'}},{op:'region.add',target:'t',values:{id:'r',duration:4}},...[60,64,67].map((pitch,i)=>({op:'note.add',target:'r',values:{id:'n'+i,pitch,start:i,duration:.5,velocity:.7,channel:i}})),{op:'event.add',target:'r',values:{id:'e',type:'polyPressure',parameter:60,value:70,start:0,channel:0}}]);return h;};
const r=h=>h.session.tracks[0].regions[0];
test('legacy chromatic transpose and chosen-note transpose preserve all non-pitch data with undo/redo',()=>{
 const h=fixture(),before=structuredClone(r(h));h.execute([{op:'notes.transpose',target:'r',values:{semitones:12}}]);
 assert.deepEqual(r(h),{...before,notes:before.notes.map(n=>({...n,pitch:n.pitch+12}))});h.undo();assert.deepEqual(r(h),before);h.redo();assert.equal(r(h).notes[0].pitch,72);
 h.execute([{op:'notes.transpose',target:'r',values:{mode:'chromatic',semitones:-1,noteIds:'n0,n2'}}]);assert.deepEqual(r(h).notes.map(n=>n.pitch),[71,76,78]);
 h.execute([{op:'notes.transpose',target:'r',values:{semitones:1,noteId:'n1'}}]);assert.deepEqual(r(h).notes.map(n=>n.pitch),[71,77,78]);assert.deepEqual(r(h).events,before.events);
});
test('diatonic steps follow major, minor and pentatonic scales across octave boundaries and every key',()=>{
 const h=fixture();h.execute([{op:'notes.transpose',target:'r',values:{mode:'diatonic',root:0,scale:'major',steps:1}}]);assert.deepEqual(r(h).notes.map(n=>n.pitch),[62,65,69]);
 h.execute([{op:'notes.transpose',target:'r',values:{mode:'diatonic',root:0,scale:'major',steps:-1}}]);assert.deepEqual(r(h).notes.map(n=>n.pitch),[60,64,67]);
 for(const [scale,,intervals] of scales)for(let root=0;root<12;root++){
  const notes=intervals.map((interval,i)=>({id:'x'+i,pitch:60+root+interval}));
  const up=transposeNoteEdits({notes},{mode:'diatonic',root,scale,steps:intervals.length});assert.deepEqual(up.map(n=>n.pitch),notes.map(n=>n.pitch+12));
  const down=transposeNoteEdits({notes},{mode:'diatonic',root,scale,steps:-intervals.length});assert.deepEqual(down.map(n=>n.pitch),notes.map(n=>n.pitch-12));
 }
 const minor=transposeNoteEdits({notes:[{id:'a',pitch:63},{id:'b',pitch:70}]},{mode:'diatonic',root:0,scale:'minor',steps:1});assert.deepEqual(minor.map(n=>n.pitch),[65,72]);
});
test('off-scale notes, invalid selection, overflow and non-MIDI targets reject atomically',()=>{
 const h=fixture(),before=structuredClone(h.session);
 for(const values of [{semitones:68},{semitones:-61},{semitones:.5},{semitones:NaN},{semitones:1,noteIds:''},{semitones:1,noteIds:'n0,n0'},{semitones:1,noteIds:'missing'},{semitones:1,noteId:'n0',noteIds:'n1'},{mode:'diatonic',root:0,scale:'minor',steps:1},{mode:'diatonic',root:0,scale:'major',steps:100},{mode:'diatonic',root:0,scale:'major',steps:1,semitones:2},{semitones:1,root:0},{mode:'bad',semitones:1}]){
  assert.throws(()=>h.execute([{op:'session.set',values:{title:'bad'}},{op:'notes.transpose',target:'r',values}]));assert.deepEqual(h.session,before);
 }
 assert.throws(()=>transposeNoteEdits({notes:[]},{semitones:1}),/Add or select/);
 for(const kind of ['audio','video']){h.execute([{op:'track.add',values:{id:kind,kind}},{op:'region.add',target:kind,values:{id:kind+'r',duration:1}}]);assert.throws(()=>h.execute([{op:'notes.transpose',target:kind+'r',values:{semitones:1}}]),/MIDI/);}
});
test('transposed pitches and preserved channel/timing data survive MIDI export',()=>{
 const h=fixture();h.execute([{op:'notes.transpose',target:'r',values:{mode:'diatonic',steps:2,root:0,scale:'major',noteIds:'n0,n2'}}]);
 const midi=readMidi(writeMidi(h.session).buffer),notes=midi.tracks.flatMap(t=>t.notes).sort((a,b)=>a.start-b.start);
 assert.deepEqual(notes.map(n=>n.pitch),[64,64,71]);assert.deepEqual(notes.map(n=>n.channel),[0,1,2]);assert.deepEqual(notes.map(n=>n.start),[0,1,2]);assert.ok(notes.every(n=>n.duration===.5));
});
