import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,applyCommands} from '../src/experimental/session.js';
import {stemGroups,validateRouting} from '../src/experimental/routing.js';
const fixture=()=>applyCommands(newSession(),[
 ...['kit','drums','verb'].map(id=>({op:'track.add',values:{id,name:id,kind:'bus'}})),
 ...['kick','snare','bass','muted'].map(id=>({op:'track.add',values:{id,name:id,kind:'midi'}})),
 {op:'track.add',values:{id:'movie',kind:'video'}},
 {op:'track.set',target:'kick',values:{output:'kit',solo:true}},
 {op:'track.set',target:'kit',values:{output:'drums'}},
 {op:'track.set',target:'snare',values:{output:'drums'}},
 {op:'track.set',target:'muted',values:{mute:true}},
 {op:'send.set',target:'bass',values:{busId:'drums',gainDb:-12}},
 {op:'send.set',target:'drums',values:{busId:'verb',gainDb:-6}},
]);
test('output stems partition sources by final primary bus without duplicating send contributors',()=>{
 const session=fixture(),before=structuredClone(session),groups=stemGroups(session,'groups');
 assert.deepEqual(groups.map(g=>[g.name,g.sourceIds]),[['drums',['kick','snare']],['bass',['bass']]]);
 for(const group of groups){validateRouting(group.document);assert.ok(group.document.tracks.every(t=>!t.solo));assert.equal(group.document.tracks.filter(t=>t.kind==='bus').length,3);}
 assert.deepEqual(groups[1].document.tracks.find(t=>t.id==='bass').sends,session.tracks.find(t=>t.id==='bass').sends);
 assert.deepEqual(session,before);
});
test('individual mode preserves track export and handles empty/invalid grouping safely',()=>{
 assert.deepEqual(stemGroups(fixture()).map(g=>g.sourceIds),[['kick'],['snare'],['bass']]);
 assert.deepEqual(stemGroups(newSession(),'groups'),[]);
 assert.throws(()=>stemGroups(fixture(),'unknown'));
 const invalid=fixture();invalid.tracks[0].output='kit';assert.throws(()=>stemGroups(invalid,'groups'),/feedback/);
});
