import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,applyCommands,SessionHistory} from '../src/experimental/session.js';
import {automationValue} from '../src/experimental/effects.js';
const setup=()=>applyCommands(newSession(),[{op:'track.add',values:{id:'a'}},{op:'track.add',values:{id:'bus',kind:'bus'}},{op:'send.set',target:'a',values:{busId:'bus',gainDb:-12,tap:'preFader'}}]);
const send=s=>s.tracks[0].sends[0];
test('send curves upsert and interpolate independently from channel automation and static level',()=>{
 const s=applyCommands(setup(),[
  {op:'send.automation.point',target:'a',values:{busId:'bus',id:'begin',time:0,value:-24}},
  {op:'send.automation.point',target:'a',values:{busId:'bus',id:'end',time:4,value:0}},
  {op:'send.automation.point',target:'a',values:{busId:'bus',time:4,value:-6}},
  {op:'send.set',target:'a',values:{busId:'bus',gainDb:-18,tap:'postFader'}},
 ]);
 assert.equal(send(s).automation.length,2);assert.equal(send(s).gainDb,-18);
 assert.equal(automationValue(send(s).automation,'gainDb',2,send(s).gainDb),-15);
 assert.deepEqual(s.tracks[0].automation,[]);assert.equal(send(s).tap,'postFader');
 const h=new SessionHistory(s);h.execute([{op:'automation.delete',target:'begin'}]);assert.equal(send(h.session).automation.length,1);
 h.undo();assert.deepEqual(send(h.session).automation,send(s).automation);
 h.execute([{op:'send.automation.clear',target:'a',values:{busId:'bus'}}]);assert.deepEqual(send(h.session).automation,[]);
 assert.equal(send(h.session).gainDb,-18);h.undo();assert.deepEqual(send(h.session).automation,send(s).automation);
 h.execute([{op:'track.delete',target:'bus'}]);assert.deepEqual(h.session.tracks[0].sends,[]);h.undo();assert.deepEqual(send(h.session),send(s));
});
test('invalid send curves reject atomically and respect global IDs and backward defaults',()=>{
 const s=setup(),h=new SessionHistory(s);
 for(const values of [{busId:'missing',time:0,value:0},{busId:'bus',time:-1,value:0},{busId:'bus',time:0,value:13},{busId:'bus',time:0,value:0,parameter:'pan'},{busId:'bus',id:'a',time:0,value:0}]){
  assert.throws(()=>h.execute([{op:'track.set',target:'a',values:{gainDb:-6}},{op:'send.automation.point',target:'a',values}]));assert.deepEqual(h.session,s);
 }
 const old=structuredClone(s);delete send(old).automation;assert.deepEqual(send(new SessionHistory(old).session).automation,[]);
 const duplicate=[{op:'send.automation.point',target:'a',values:{busId:'bus',id:'same',time:0,value:0}},{op:'automation.point',target:'bus',values:{id:'same',parameter:'gainDb',time:0,value:0}}];
 assert.throws(()=>applyCommands(s,duplicate),/unique/);
});
