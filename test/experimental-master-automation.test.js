import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,sessionSchema,applyCommands,SessionHistory} from '../src/experimental/session.js';
import {automationValue} from '../src/experimental/effects.js';
import {planDawEdit} from '../server/daw-agent.js';
test('master volume/pan curves upsert, interpolate, clear independently and undo',()=>{
 const s=newSession(),h=new SessionHistory(s);
 h.execute([
  {op:'session.set',values:{masterPan:.5}},
  {op:'automation.point',target:s.id,values:{id:'start',parameter:'gainDb',time:0,value:-24}},
  {op:'automation.point',target:s.id,values:{id:'end',parameter:'gainDb',time:2,value:0}},
  {op:'automation.point',target:s.id,values:{parameter:'gainDb',time:2,value:-6}},
  {op:'automation.point',target:s.id,values:{id:'left',parameter:'pan',time:0,value:-1}},
 ]);
 assert.equal(h.session.masterAutomation.length,3);
 assert.equal(automationValue(h.session.masterAutomation,'gainDb',1,0),-15);
 const before=structuredClone(h.session.masterAutomation);
 h.execute([{op:'automation.clear',target:s.id,values:{parameter:'gainDb'}}]);
 assert.deepEqual(h.session.masterAutomation.map(p=>p.id),['left']);
 h.undo();assert.deepEqual(h.session.masterAutomation,before);
 h.execute([{op:'automation.delete',target:'left'}]);assert.equal(h.session.masterAutomation.length,2);
 assert.equal(h.session.masterPan,.5);
 assert.deepEqual(sessionSchema.parse(JSON.parse(JSON.stringify(h.session))).masterAutomation,h.session.masterAutomation);
});
test('master curve errors are atomic, IDs are globally unique and old sessions have neutral defaults',()=>{
 const s=newSession(),h=new SessionHistory(s);
 for(const command of [{op:'session.set',values:{masterPan:2}},{op:'automation.point',target:s.id,values:{parameter:'pan',time:0,value:2}},{op:'automation.clear',target:s.id,values:{parameter:'other'}}]){
  assert.throws(()=>h.execute([{op:'session.set',values:{masterDb:-6}},command]));assert.deepEqual(h.session,sessionSchema.parse(s));
 }
 assert.throws(()=>applyCommands(s,[{op:'automation.point',target:s.id,values:{id:'collision',parameter:'pan',time:0,value:0}},{op:'track.add',values:{id:'collision'}}]),/unique/);
 const old={...s};delete old.masterPan;delete old.masterAutomation;
 assert.equal(sessionSchema.parse(old).masterPan,0);assert.deepEqual(sessionSchema.parse(old).masterAutomation,[]);
});
test('agent can plan a validated complete-mix fade through the same command harness',async()=>{
 const s=newSession(),commands=[{op:'automation.point',target:s.id,values:{parameter:'gainDb',time:0,value:0}},{op:'automation.point',target:s.id,values:{parameter:'gainDb',time:4,value:-96}}];
 const plan=await planDawEdit({session:s,instruction:'Fade the whole mix out over four seconds'},{key:'test',model:'test',fetchImpl:async()=>({ok:true,json:async()=>({output:[{type:'function_call',name:'edit_session',arguments:JSON.stringify({summary:'Faded master',commands})}]})})});
 const next=applyCommands(s,plan.commands,plan.revision);assert.equal(automationValue(next.masterAutomation,'gainDb',2,0),-48);
});
