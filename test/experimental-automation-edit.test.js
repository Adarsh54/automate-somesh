import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,applyCommands,SessionHistory} from '../src/experimental/session.js';
import {automationValue} from '../src/experimental/effects.js';
test('automation.set edits track, master and send points without changing identity or parameter',()=>{
 const s=newSession(),h=new SessionHistory(applyCommands(s,[
  {op:'track.add',values:{id:'t'}},{op:'track.add',values:{id:'b',kind:'bus'}},{op:'send.set',target:'t',values:{busId:'b',gainDb:-6}},
  {op:'automation.point',target:'t',values:{id:'track-point',parameter:'gainDb',time:0,value:-24}},
  {op:'automation.point',target:s.id,values:{id:'master-point',parameter:'pan',time:0,value:-1}},
  {op:'send.automation.point',target:'t',values:{id:'send-point',busId:'b',time:0,value:-12}},
 ]));
 const before=structuredClone(h.session);
 h.execute([{op:'automation.set',target:'track-point',values:{time:1,value:-18}},{op:'automation.set',target:'master-point',values:{value:.5}},{op:'automation.set',target:'send-point',values:{time:3}}]);
 assert.deepEqual(h.session.tracks[0].automation[0],{id:'track-point',parameter:'gainDb',time:1,value:-18});
 assert.equal(h.session.masterAutomation[0].value,.5);assert.equal(h.session.tracks[0].sends[0].automation[0].time,3);
 h.undo();assert.deepEqual(h.session.tracks,before.tracks);assert.deepEqual(h.session.masterAutomation,before.masterAutomation);
 h.redo();assert.equal(h.session.tracks[0].automation[0].time,1);
});
test('point moves preserve neighboring points and reject time collisions and invalid fields atomically',()=>{
 const s=newSession(),h=new SessionHistory(applyCommands(s,[
  {op:'automation.point',target:s.id,values:{id:'a',parameter:'gainDb',time:0,value:-24}},
  {op:'automation.point',target:s.id,values:{id:'b',parameter:'gainDb',time:4,value:0}},
  {op:'automation.point',target:s.id,values:{id:'p',parameter:'pan',time:2,value:0}},
 ]));
 const before=structuredClone(h.session);
 for(const values of [{time:4},{time:-1},{time:86401},{value:13},{parameter:'pan'},{id:'new'}]){
  assert.throws(()=>h.execute([{op:'session.set',values:{masterDb:-6}},{op:'automation.set',target:'a',values}]));assert.deepEqual(h.session,before);
 }
 // Different parameters can share a time without overwriting one another.
 h.execute([{op:'automation.set',target:'a',values:{time:2}}]);assert.equal(h.session.masterAutomation.length,3);
 assert.equal(automationValue(h.session.masterAutomation,'gainDb',3,0),-12);
 assert.throws(()=>h.execute([{op:'automation.set',target:'p',values:{value:2}}]));
 assert.throws(()=>h.execute([{op:'automation.set',target:'missing',values:{time:1}}]),/not found/);
});
