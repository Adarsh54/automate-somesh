import test from 'node:test';import assert from 'node:assert/strict';
import {newSession,applyCommands} from '../src/experimental/session.js';
import {createBouncePlan} from '../src/experimental/bounce-plan.js';
const fixture=()=>applyCommands(newSession(),[
 {op:'track.add',values:{id:'a',kind:'audio'}},
 {op:'region.add',target:'a',values:{id:'r',name:'Phrase',assetId:'source',start:1000,offset:2,duration:2}},
 {op:'region.add',target:'a',values:{id:'other',assetId:'missing',start:1000,duration:2}},
 {op:'track.add',values:{id:'bus',kind:'bus'}},{op:'track.set',target:'a',values:{output:'bus'}},
 {op:'effect.add',target:'bus',values:{kind:'reverb',decay:1}},
 {op:'track.add',values:{id:'solo',kind:'midi'}},{op:'track.set',target:'solo',values:{solo:true}},
]);
test('region bounce isolates its region, retains buses and tails, and starts at its timeline position',()=>{
 const s=fixture(),plan=createBouncePlan(s,{mode:'region',regionId:'r'});assert.equal(plan.position,1000);assert.equal(plan.duration,3);assert.deepEqual(plan.assets,['source']);assert.equal(plan.entries[0].name,'Untitled session-Phrase.wav');
 assert.deepEqual(plan.entries[0].document.tracks.flatMap(t=>t.regions).map(r=>r.id),['r']);assert.equal(plan.entries[0].document.tracks.find(t=>t.id==='a').output,'bus');assert.ok(plan.entries[0].document.tracks.every(t=>!t.solo));
 s.tracks[0].regions[0].offset=20;s.title='Edited';assert.equal(plan.entries[0].document.tracks.find(t=>t.id==='a').regions[0].offset,2);assert.equal(plan.title,'Untitled session');
});
test('bounce asset loading follows rendered audibility and validates selection/limits',()=>{
 const s=fixture();assert.throws(()=>createBouncePlan(s),/10 minutes/);assert.throws(()=>createBouncePlan(s,{mode:'region',regionId:'missing'}),/Select/);
 s.tracks[0].regions.forEach(r=>r.start=0);assert.deepEqual(createBouncePlan(s).assets,[]);assert.deepEqual(createBouncePlan(s,{mode:'stems'}).assets,['source','missing']);
 s.tracks[0].mute=true;assert.deepEqual(createBouncePlan(s,{mode:'region',regionId:'r'}).assets,[]);
 assert.throws(()=>createBouncePlan(s,{mode:'unknown'}));s.tracks[0].kind='video';assert.throws(()=>createBouncePlan(s,{mode:'region',regionId:'r'}),/Extract movie/);
});
