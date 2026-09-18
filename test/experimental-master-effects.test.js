import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,sessionSchema,applyCommands,SessionHistory} from '../src/experimental/session.js';
import {sessionDuration} from '../src/experimental/audio-engine.js';
import {stemSession} from '../src/experimental/routing.js';
test('older sessions acquire an empty master chain without changing their mix',()=>{
 const old=newSession();delete old.masterEffects;
 assert.deepEqual(sessionSchema.parse(old).masterEffects,[]);
 assert.equal(sessionDuration(old),1);
});
test('master chain shares validated effect editing, ordering, bypass, deletion and undo',()=>{
 const session=newSession(),history=new SessionHistory(session);
 history.execute([
  {op:'effect.add',target:session.id,values:{id:'eq',kind:'eq',type:'highpass',frequency:80}},
  {op:'effect.add',target:session.id,values:{id:'comp',kind:'compressor',threshold:-18}},
  {op:'effect.move',target:'comp',values:{index:0}},
  {op:'effect.set',target:'eq',values:{enabled:false}},
 ]);
 assert.deepEqual(history.session.masterEffects.map(e=>e.id),['comp','eq']);
 assert.equal(history.session.masterEffects[1].enabled,false);
 const before=structuredClone(history.session);
 assert.throws(()=>history.execute([{op:'effect.delete',target:'eq'},{op:'effect.set',target:'comp',values:{ratio:30}}]));
 assert.deepEqual(history.session,before);
 history.execute([{op:'effect.delete',target:'comp'}]);assert.equal(history.session.masterEffects.length,1);
 history.undo();assert.deepEqual(history.session.masterEffects,before.masterEffects);
 history.redo();assert.equal(history.session.masterEffects[0].id,'eq');
 assert.deepEqual(sessionSchema.parse(JSON.parse(JSON.stringify(history.session))).masterEffects,history.session.masterEffects);
});
test('master effects enforce per-chain limits and globally unique IDs',()=>{
 const s=newSession();
 assert.throws(()=>applyCommands(s,Array.from({length:17},(_,i)=>({op:'effect.add',target:s.id,values:{id:`fx-${i}`,kind:'eq'}}))));
 assert.throws(()=>applyCommands(s,[{op:'effect.add',target:s.id,values:{id:'duplicate',kind:'eq'}},{op:'track.add',values:{id:'duplicate'}}]),/unique/);
 assert.throws(()=>applyCommands(s,[{op:'effect.add',target:s.id,values:{id:'same-fx',kind:'eq'}},{op:'track.add',values:{id:'t'}},{op:'effect.add',target:'t',values:{id:'same-fx',kind:'eq'}}]),/unique/);
});
test('master tails extend the arrangement and are retained for isolated stem rendering',()=>{
 const s=newSession(),next=applyCommands(s,[{op:'track.add',values:{id:'t'}},{op:'region.add',target:'t',values:{duration:2}},
  {op:'effect.add',target:'t',values:{kind:'reverb',decay:1}},
  {op:'effect.add',target:s.id,values:{id:'master-reverb',kind:'reverb',decay:2}},
 ]);
 assert.equal(sessionDuration(next),5);
 const stem=stemSession(next,next.tracks[0]);assert.deepEqual(stem.masterEffects,next.masterEffects);assert.equal(sessionDuration(stem),5);
 const bypassed=applyCommands(next,[{op:'effect.set',target:'master-reverb',values:{enabled:false}}]);assert.equal(sessionDuration(bypassed),3);
});
