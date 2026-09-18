import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,applyCommands,SessionHistory} from '../src/experimental/session.js';
import {writeMidi,encodeMidiImport,decodeMidiImport,MAX_MIDI_IMPORT_BYTES} from '../src/experimental/midi.js';
const fixture=(count=1000)=>{
 const s=applyCommands(newSession(),[{op:'track.add',values:{id:'t',kind:'midi',name:'Performance'}},{op:'region.add',target:'t',values:{id:'r',duration:count*.01+1}}]);
 s.tracks[0].regions[0].notes=Array.from({length:count},(_,i)=>({id:'n'+i,pitch:48+i%24,channel:i%16,start:i*.01,duration:.008,velocity:.7}));
 s.tracks[0].regions[0].events=Array.from({length:250},(_,i)=>({id:'e'+i,type:'controlChange',channel:i%16,parameter:11,start:i*.001,value:i%128}));
 return writeMidi(s);
};
test('large MIDI imports are one revision and one undo entry while retaining earlier undo and redo',()=>{
 const history=new SessionHistory();
 for(let i=0;i<99;i++)history.execute([{op:'session.set',values:{title:'Edit '+i}}]);
 const before=structuredClone(history.session),past=[...history.past],data=encodeMidiImport(fixture(10001).buffer);
 history.execute([{op:'midi.import',values:{data,start:3}}]);
 assert.equal(history.session.revision,before.revision+1);assert.equal(history.past.length,100);
 assert.deepEqual(history.past.slice(0,99),past);
 const region=history.session.tracks[0].regions[0];assert.equal(region.start,3);assert.equal(region.notes.length,10001);assert.equal(region.events.length,250);
 assert.equal(region.notes[17].channel,1);assert.equal(region.events[17].value,17);
 const imported=structuredClone(history.session.tracks);history.undo();assert.deepEqual(history.session.tracks,before.tracks);
 history.redo();assert.deepEqual(history.session.tracks,imported);history.undo();history.undo();assert.equal(history.session.title,'Edit 97');
});
test('malformed and over-limit imports preserve the document and both history stacks',()=>{
 const h=new SessionHistory();h.execute([{op:'session.set',values:{title:'Before'}}]);h.execute([{op:'session.set',values:{title:'After'}}]);h.undo();
 const snapshot=structuredClone({session:h.session,past:h.past,future:h.future});
 for(const data of ['invalid',encodeMidiImport(new Uint8Array(20).buffer),encodeMidiImport(fixture(20001).buffer)]){
  assert.throws(()=>h.execute([{op:'midi.import',values:{data}}]));assert.deepEqual({session:h.session,past:h.past,future:h.future},snapshot);
 }
 h.redo();assert.equal(h.session.title,'After');
 assert.throws(()=>encodeMidiImport(new ArrayBuffer(MAX_MIDI_IMPORT_BYTES+1)),/8 MB/);
 assert.throws(()=>decodeMidiImport('AAA==='),/Invalid/);
});
test('MIDI import creates unique IDs on repeated imports and rejects empty or excess tracks',()=>{
 const data=encodeMidiImport(fixture(20).buffer),s=applyCommands(newSession(),[{op:'midi.import',values:{data}},{op:'midi.import',values:{data,start:5}}]);
 assert.equal(s.tracks.length,2);assert.notEqual(s.tracks[0].regions[0].notes[0].id,s.tracks[1].regions[0].notes[0].id);
 assert.throws(()=>applyCommands(newSession(),[{op:'midi.import',values:{data:encodeMidiImport(writeMidi(newSession()).buffer)}}]),/no notes/);
 const full=structuredClone(s);full.tracks=Array.from({length:128},(_,i)=>({...structuredClone(s.tracks[0]),id:'track'+i,regions:[]}));
 assert.throws(()=>applyCommands(full,[{op:'midi.import',values:{data}}]),/128-track/);
});
