import test from 'node:test';import assert from 'node:assert/strict';
import {newSession,applyCommands,SessionHistory} from '../src/experimental/session.js';
const fixture=()=>applyCommands(newSession(),[{op:'track.add',values:{id:'t',kind:'midi'}},{op:'region.add',target:'t',values:{id:'r',duration:8}},...['a','b','c'].map((id,i)=>({op:'note.add',target:'r',values:{id,pitch:60+i*4,start:1+i*.5,duration:1}}))]);
test('selected group move, duplicate and delete are atomic and preserve unselected notes',()=>{
 const h=new SessionHistory(fixture()),original=structuredClone(h.session.tracks);
 h.execute([{op:'notes.move',target:'r',values:{noteIds:'a,b',seconds:.5,semitones:2}}]);let notes=h.session.tracks[0].regions[0].notes;assert.deepEqual(notes.map(n=>[n.start,n.pitch]),[[1.5,62],[2,66],[2,68]]);
 h.undo();assert.deepEqual(h.session.tracks,original);h.redo();
 h.execute([{op:'notes.duplicate',target:'r',values:{noteIds:'a,b',seconds:2}}]);notes=h.session.tracks[0].regions[0].notes;assert.equal(notes.length,5);assert.equal(new Set(notes.map(n=>n.id)).size,5);assert.deepEqual(notes.slice(3).map(n=>n.start),[3.5,4]);
 h.execute([{op:'notes.delete',target:'r',values:{noteIds:'a,b'}}]);assert.equal(h.session.tracks[0].regions[0].notes.length,3);h.undo();assert.equal(h.session.tracks[0].regions[0].notes.length,5);
 const before=structuredClone(h.session);for(const values of [{noteIds:'a,missing',seconds:1},{noteIds:'a,a'},{noteIds:''},{noteIds:'a,b',seconds:-2},{noteIds:'a,b',semitones:100},{noteIds:'a',semitones:.5}])assert.throws(()=>h.execute([{op:'notes.move',target:'r',values}]));assert.deepEqual(h.session,before);
});
test('group quantize and humanize use explicit IDs and reject ambiguous selection',()=>{
 const s=fixture();const q=applyCommands(s,[{op:'notes.quantize',target:'r',values:{noteIds:'a,b',grid:2}}]);assert.deepEqual(q.tracks[0].regions[0].notes.map(n=>n.start),[2,2,2]);
 const h=applyCommands(s,[{op:'notes.humanize',target:'r',values:{noteIds:'a,b',seed:2,timing:.1}}]);assert.deepEqual(h.tracks[0].regions[0].notes[2],s.tracks[0].regions[0].notes[2]);assert.notEqual(h.tracks[0].regions[0].notes[0].start,1);
 assert.throws(()=>applyCommands(s,[{op:'notes.quantize',target:'r',values:{noteId:'a',noteIds:'a,b',grid:1}}]));
});
test('bulk operations exceed the batch-command limit without losing single-step undo',()=>{
 const s=fixture(),r=s.tracks[0].regions[0];r.notes=Array.from({length:1001},(_,i)=>({...r.notes[0],id:'n'+i}));const h=new SessionHistory(s);h.execute([{op:'notes.move',target:'r',values:{noteIds:r.notes.map(n=>n.id).join(','),seconds:1}}]);assert.ok(h.session.tracks[0].regions[0].notes.every(n=>n.start===2));h.undo();assert.deepEqual(h.session.tracks[0].regions[0].notes,r.notes);
});
test('agent receives all selected IDs and validates a bulk proposal',async()=>{
 const {planDawEdit}=await import('../server/daw-agent.js');let request;
 const commands=[{op:'notes.move',target:'r',values:{noteIds:'a,b',semitones:1}}];
 const plan=await planDawEdit({instruction:'Transpose selected notes',session:fixture(),selection:'a',selectedNoteIds:['a','b']},{key:'test',model:'test',fetchImpl:async(_,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{type:'function_call',name:'edit_session',arguments:JSON.stringify({summary:'Transposed selection',commands})}]})};}});
 assert.deepEqual(JSON.parse(request.input[1].content).selectedNoteIds,['a','b']);assert.deepEqual(plan.commands,commands);
});
test('agent refuses stale or duplicated selection IDs before contacting the provider',async()=>{
 const {planDawEdit}=await import('../server/daw-agent.js');let called=false;
 for(const selectedNoteIds of [['missing'],['a','a']])await assert.rejects(planDawEdit({instruction:'Edit selected notes',session:fixture(),selectedNoteIds},{key:'test',model:'test',fetchImpl:async()=>{called=true;}}),/Selected notes/);
 assert.equal(called,false);
});
