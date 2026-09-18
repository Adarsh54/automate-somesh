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
test('range bounce uses a snapshot of cycle bounds, audible overlapping media and exact duration',()=>{
 const s=fixture();s.tracks.forEach(t=>t.solo=false);s.loopStart=1000.5;s.loopEnd=1001.5;s.loopEnabled=false;s.tracks[0].regions[1].start=1200;
 const plan=createBouncePlan(s,{mode:'range'});assert.equal(plan.position,1000.5);assert.equal(plan.duration,1);assert.deepEqual(plan.assets,['source']);assert.equal(plan.entries[0].document.tracks[0].regions.length,1);assert.equal(plan.entries[0].document.tracks[0].output,'bus');assert.equal(plan.zip,false);s.loopEnd=2000;s.tracks[0].regions[0].offset=8;assert.equal(plan.entries[0].document.loopEnd,1001.5);assert.equal(plan.entries[0].document.tracks[0].regions[0].offset,2);
 assert.throws(()=>createBouncePlan(s,{mode:'range'}),/10 minutes/);s.loopEnd=s.loopStart;assert.throws(()=>createBouncePlan(s,{mode:'range'}),/valid cycle/);
});
test('export master bypass is snapshot-only and preserves track/bus processing across all modes',()=>{
 const s=fixture();s.tracks.forEach(t=>{t.solo=false;t.regions.forEach(r=>r.start=0);});s.loopStart=0;s.loopEnd=1;s.masterDb=-6;s.masterPan=.4;s.masterAutomation=[{id:'master-point',parameter:'gainDb',time:0,value:-9}];
 const withMaster=applyCommands(s,[{op:'effect.add',target:s.id,values:{id:'master-reverb',kind:'reverb',decay:2}}]),before=structuredClone(withMaster);
 for(const mode of ['mix','stems','region','range'])for(const masterMode of ['full','noInserts','bypass']){
  const plan=createBouncePlan(withMaster,{mode,masterMode,regionId:'r'});
  assert.equal(plan.duration,mode==='range'?1:masterMode==='full'?5:3);
  for(const {document:d}of plan.entries){assert.equal(d.masterEffects.length,masterMode==='full'?1:0);assert.equal(d.masterDb,masterMode==='bypass'?0:-6);assert.equal(d.masterPan,masterMode==='bypass'?0:.4);assert.deepEqual(d.masterAutomation,masterMode==='bypass'?[]:before.masterAutomation);assert.deepEqual(d.tracks.find(t=>t.id==='bus').effects,before.tracks.find(t=>t.id==='bus').effects);}
 }
 assert.deepEqual(withMaster,before);assert.throws(()=>createBouncePlan(withMaster,{masterMode:'invalid'}),/master processing/);
});
