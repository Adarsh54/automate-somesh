import test from 'node:test';import assert from 'node:assert/strict';
import {SessionHistory,newSession} from '../src/experimental/session.js';
import {joinedMidiRegion} from '../src/experimental/join-midi.js';
import {writeMidi,readMidi} from '../src/experimental/midi.js';
const fixture=()=>{const h=new SessionHistory(newSession());h.execute([{op:'track.add',values:{id:'t',kind:'midi'}},...['first','second','third'].flatMap((id,i)=>[{op:'region.add',target:'t',values:{id,name:id,start:i*3+1,duration:2}},{op:'note.add',target:id,values:{id:id+'n',start:.25,duration:.5,pitch:60+i,channel:i,velocity:.6}},{op:'event.add',target:id,values:{id:id+'e',type:'controlChange',parameter:11,value:100+i,start:.1,channel:i}}])]);return h;};
test('join keeps absolute note/event times, attributes and IDs; retains selected region and restores all sources on undo',()=>{
 const h=fixture(),before=structuredClone(h.session),old=before.tracks[0].regions;
 h.execute([{op:'region.joinMidi',target:'second',values:{regionIds:'first'}}]);const regions=h.session.tracks[0].regions,joined=regions.find(r=>r.id==='second');
 assert.equal(regions.length,2);assert.equal(joined.name,'second');assert.equal(joined.start,1);assert.equal(joined.duration,5);
 assert.deepEqual(joined.notes,[old[0].notes[0],{...old[1].notes[0],start:3.25}]);assert.deepEqual(joined.events,[old[0].events[0],{...old[1].events[0],start:3.1}]);assert.deepEqual(regions.find(r=>r.id==='third'),old[2]);
 h.undo();assert.deepEqual(h.session.tracks,before.tracks);h.redo();assert.deepEqual(h.session.tracks[0].regions,regions);
});
test('overlaps and tied controller times use stable chronological ordering and selected region settings',()=>{
 const h=fixture();h.execute([{op:'region.set',target:'second',values:{start:1.5,gainDb:-6,fadeIn:.2,fadeOut:.3,mute:true}},{op:'event.set',target:'firste',values:{start:.6}},{op:'event.set',target:'seconde',values:{start:.1,channel:0}},{op:'region.set',target:'third',values:{start:1.5}}]);
 const plan=joinedMidiRegion(h.session.tracks[0],'second',{regionIds:'third,first'});assert.equal(plan.changedSettings,true);assert.equal(plan.hasEvents,true);assert.equal(plan.region.gainDb,-6);assert.equal(plan.region.fadeIn,.2);assert.equal(plan.region.fadeOut,.3);assert.equal(plan.region.mute,true);
 assert.deepEqual(plan.region.events.map(e=>e.id),['firste','seconde','thirde']);assert.equal(plan.region.duration,2.5);assert.deepEqual(plan.region.notes.map(n=>n.start),[.25,.75,.75]);
});
test('invalid selection, incompatible tracks and output limits reject an entire join batch',()=>{
 const h=fixture(),before=structuredClone(h.session);for(const values of [{regionIds:''},{regionIds:'first'},{regionIds:'second,second'},{regionIds:'second,'},{regionIds:'missing'},{regionIds:'second',extra:true}]){assert.throws(()=>h.execute([{op:'session.set',values:{title:'bad'}},{op:'region.joinMidi',target:'first',values}]));assert.deepEqual(h.session,before);}
 h.execute([{op:'track.add',values:{id:'other',kind:'midi'}},{op:'region.add',target:'other',values:{id:'otherRegion',duration:1}},{op:'track.add',values:{id:'audio',kind:'audio'}},{op:'region.add',target:'audio',values:{id:'audioRegion',duration:1}}]);
 assert.throws(()=>h.execute([{op:'region.joinMidi',target:'first',values:{regionIds:'otherRegion'}}]),/same|belong/);assert.throws(()=>h.execute([{op:'region.joinMidi',target:'audioRegion',values:{regionIds:'first'}}]),/MIDI/);
 const track=structuredClone(before.tracks[0]);track.regions[1].start=86400;assert.throws(()=>joinedMidiRegion(track,'first',{regionIds:'second'}),/86,400/);
 track.regions[1].start=4;track.regions[0].notes=Array(20000).fill(track.regions[0].notes[0]);assert.throws(()=>joinedMidiRegion(track,'first',{regionIds:'second'}),/20,000/);
 track.regions[0].notes=[];track.regions[0].events=Array(20000).fill(track.regions[0].events[0]);assert.throws(()=>joinedMidiRegion(track,'first',{regionIds:'second'}),/20,000/);
});
test('joined MIDI exports preserve the original absolute event and note timeline',()=>{
 const h=fixture(),read=()=>readMidi(writeMidi(h.session).buffer).tracks;
 const notes=tracks=>tracks.flatMap(t=>t.notes).map(({pitch,start,duration,channel})=>({pitch,start,duration,channel})).sort((a,b)=>a.start-b.start);
 const events=tracks=>tracks.flatMap(t=>t.events).map(({type,start,parameter,value,channel})=>({type,start,parameter,value,channel})).sort((a,b)=>a.start-b.start);
 const before=read();h.execute([{op:'region.joinMidi',target:'third',values:{regionIds:'second,first'}}]);const after=read();assert.deepEqual(notes(after),notes(before));assert.deepEqual(events(after),events(before));
});
