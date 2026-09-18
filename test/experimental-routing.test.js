import test from 'node:test';import assert from 'node:assert/strict';
import {newSession,applyCommands,SessionHistory} from '../src/experimental/session.js';
import {audibleSources,stemSession} from '../src/experimental/routing.js';import {sessionDuration} from '../src/experimental/audio-engine.js';
const setup=()=>applyCommands(newSession(),[{op:'track.add',values:{id:'a'}},{op:'region.add',target:'a',values:{duration:1}},{op:'track.add',values:{id:'b',kind:'bus'}},{op:'track.add',values:{id:'c',kind:'bus'}}]);
test('send tap and level update independently, default to post-pan, and undo together',()=>{
 const h=new SessionHistory(applyCommands(setup(),[{op:'send.set',target:'a',values:{busId:'b',gainDb:-12}}]));
 assert.equal(h.session.tracks[0].sends[0].tap,'postPan');
 h.execute([{op:'send.set',target:'a',values:{busId:'b',tap:'preFader'}}]);
 assert.deepEqual(h.session.tracks[0].sends[0],{busId:'b',gainDb:-12,tap:'preFader'});
 h.execute([{op:'send.set',target:'a',values:{busId:'b',gainDb:-6}}]);
 assert.deepEqual(h.session.tracks[0].sends[0],{busId:'b',gainDb:-6,tap:'preFader'});
 h.undo();assert.equal(h.session.tracks[0].sends[0].gainDb,-12);
 h.undo();assert.equal(h.session.tracks[0].sends[0].tap,'postPan');
 const before=structuredClone(h.session);
 for(const values of [{busId:'b',tap:'unknown'},{busId:'b',tap:null},{busId:'c',gainDb:-6,tap:null},{busId:'c',tap:'preFader'}]){
  assert.throws(()=>h.execute([{op:'send.set',target:'a',values}]));assert.deepEqual(h.session,before);
 }
 // Projects saved before tap selection retain their previous routing on load.
 const old=structuredClone(before);delete old.tracks[0].sends[0].tap;
 assert.equal(new SessionHistory(old).session.tracks[0].sends[0].tap,'postPan');
});
test('routing validates destinations, bus regions and feedback loops atomically',()=>{const s=setup();for(const commands of [[{op:'track.set',target:'a',values:{output:'missing'}}],[{op:'track.set',target:'b',values:{output:'a'}}],[{op:'track.set',target:'b',values:{output:'c'}},{op:'send.set',target:'c',values:{busId:'b',gainDb:-6}}],[{op:'region.add',target:'b',values:{duration:1}}]])assert.throws(()=>applyCommands(s,commands));assert.equal(s.tracks[1].output,null);});
test('deleting a bus clears references and undo restores routes and sends',()=>{const h=new SessionHistory(applyCommands(setup(),[{op:'track.set',target:'a',values:{output:'b'}},{op:'send.set',target:'a',values:{busId:'c',gainDb:-12}}]));h.execute([{op:'track.delete',target:'b'},{op:'track.delete',target:'c'}]);assert.equal(h.session.tracks[0].output,null);assert.deepEqual(h.session.tracks[0].sends,[]);h.undo();assert.equal(h.session.tracks[0].output,'b');assert.equal(h.session.tracks[0].sends[0].gainDb,-12);});
test('bus solo includes upstream sources, routed tails and stem buses survive',()=>{const s=applyCommands(setup(),[{op:'track.set',target:'a',values:{output:'b'}},{op:'track.set',target:'b',values:{output:'c'}},{op:'track.set',target:'c',values:{solo:true}},{op:'effect.add',target:'b',values:{kind:'reverb',decay:2}},{op:'effect.add',target:'c',values:{kind:'reverb',decay:3}},{op:'track.add',values:{id:'unrelated'}}]);assert.deepEqual(audibleSources(s).map(t=>t.id),['a']);assert.equal(sessionDuration(s),6);const stem=stemSession(s,s.tracks[0]);assert.equal(stem.tracks.filter(t=>t.kind==='bus').length,2);assert.ok(stem.tracks.every(t=>!t.solo));assert.equal(stem.tracks.at(-1).output,'b');});
