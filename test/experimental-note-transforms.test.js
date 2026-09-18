import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,applyCommands,SessionHistory} from '../src/experimental/session.js';
import {planDawEdit} from '../server/daw-agent.js';
const setup=()=>applyCommands(newSession(),[
 {op:'track.add',values:{id:'t',kind:'midi'}},
 {op:'region.add',target:'t',values:{id:'r',duration:2}},
 ...[{id:'a',start:.14,duration:.1,velocity:.7},{id:'b',start:1.85,duration:.15,velocity:0},{id:'c',start:0,duration:.2,velocity:1}].map(values=>({op:'note.add',target:'r',values:{pitch:64,channel:3,...values}})),
]);
const notes=s=>s.tracks[0].regions[0].notes;
const edit=(s,op,values)=>applyCommands(s,[{op,target:'r',values}]);
test('quantization supports strength, swing, single-note scope and region edges',()=>{
 const s=setup(),straight=edit(s,'notes.quantize',{grid:.125,strength:.5,noteId:'a'});
 assert.ok(Math.abs(notes(straight)[0].start-.1325)<1e-10);
 assert.deepEqual(notes(straight).slice(1),notes(s).slice(1));
 const swing=edit(s,'notes.quantize',{grid:.125,swing:.5});
 assert.equal(notes(swing)[0].start,.1875);
 assert.equal(notes(swing)[1].start,1.85);assert.equal(notes(swing)[1].duration,.15);
 assert.deepEqual(notes(edit(s,'notes.quantize',{grid:.125,strength:0})),notes(s));
 // Existing grid-only commands still perform full straight quantization.
 assert.equal(notes(edit(s,'notes.quantize',{grid:.125}))[0].start,.125);
});
test('humanization is deterministic, order-independent, bounded, and leaves silent notes silent',()=>{
 const s=setup(),values={timing:.03,duration:.02,velocity:.1,seed:42};
 const next=edit(s,'notes.humanize',values);
 assert.deepEqual(next,edit(s,'notes.humanize',values));assert.notDeepEqual(notes(next),notes(s));
 assert.notDeepEqual(notes(next),notes(edit(s,'notes.humanize',{...values,seed:43})));
 for(let i=0;i<3;i++){
  const before=notes(s)[i],after=notes(next)[i];
  assert.ok(Math.abs(after.start-before.start)<=.03+1e-10);
  assert.ok(Math.abs(after.duration-before.duration)<=.02+1e-10);
  assert.ok(Math.abs(after.velocity-before.velocity)<=.1+1e-10);
  assert.ok(after.start>=0&&after.duration>0&&after.start+after.duration<=2);
  assert.equal(after.pitch,before.pitch);assert.equal(after.channel,before.channel);
 }
 assert.equal(notes(next)[1].velocity,0);
 const reversed=structuredClone(s);notes(reversed).reverse();
 assert.deepEqual(notes(edit(reversed,'notes.humanize',values)).reverse(),notes(next));
 const single=edit(s,'notes.humanize',{...values,noteId:'a'});
 assert.deepEqual(notes(single)[0],notes(next)[0]);assert.deepEqual(notes(single).slice(1),notes(s).slice(1));
 assert.deepEqual(notes(edit(s,'notes.humanize',{seed:0})),notes(s));
});
test('invalid transforms reject atomically and valid changes undo/redo exactly',()=>{
 const s=setup(),history=new SessionHistory(s);
 for(const [op,values] of [['notes.quantize',{grid:0}],['notes.quantize',{grid:.1,strength:2}],['notes.quantize',{grid:.1,swing:-.1}],['notes.humanize',{seed:-1}],['notes.humanize',{seed:1,timing:Infinity}],['notes.humanize',{seed:1,velocity:2}],['notes.humanize',{timing:.01}],['notes.humanize',{seed:1,noteId:'missing'}]]){
  assert.throws(()=>history.execute([{op:'track.set',target:'t',values:{gainDb:-6}},{op,target:'r',values}]));
  assert.deepEqual(history.session,s);
 }
 history.execute([{op:'notes.humanize',target:'r',values:{seed:42,timing:.02,velocity:.03}}]);
 const changed=notes(history.session);history.undo();assert.deepEqual(notes(history.session),notes(s));
 history.redo();assert.deepEqual(notes(history.session),changed);
 const audio=applyCommands(s,[{op:'track.add',values:{id:'audio'}},{op:'region.add',target:'audio',values:{id:'audio-r'}}]);
 assert.throws(()=>applyCommands(audio,[{op:'notes.humanize',target:'audio-r',values:{seed:1}}]),/MIDI/);
});
test('agent proposals validate the same seeded transformation used by manual edits',async()=>{
 const session=setup(),commands=[{op:'notes.humanize',target:'r',values:{seed:42,timing:.01,velocity:5/127}}];
 const response=await planDawEdit({session,instruction:'Humanize timing by 10 ms and velocity by 5 steps'},{key:'test',model:'test',fetchImpl:async()=>({ok:true,json:async()=>({output:[{type:'function_call',name:'edit_session',arguments:JSON.stringify({summary:'Humanized notes',commands})}]})})});
 assert.deepEqual(notes(applyCommands(session,response.commands,response.revision)),notes(applyCommands(session,commands)));
});
