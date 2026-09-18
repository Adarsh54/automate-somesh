import test from 'node:test';import assert from 'node:assert/strict';
import {marqueeNotes} from '../src/experimental/piano-marquee.js';
import {newSession,applyCommands,SessionHistory} from '../src/experimental/session.js';
test('marquee selects intersecting visible notes in both drag directions',()=>{
 const notes=[{id:'a',pitch:60,start:1,duration:1},{id:'b',pitch:64,start:2,duration:.01},{id:'c',pitch:72,start:1,duration:1}];
 const from={x:100,y:(127-65)*16},to={x:200,y:(127-59)*16};
 assert.deepEqual(marqueeNotes(notes,from,to),['a','b']);assert.deepEqual(marqueeNotes(notes,to,from),['a','b']);
 assert.deepEqual(marqueeNotes(notes,{x:196,y:1000},{x:210,y:1100}),[]);
 assert.deepEqual(marqueeNotes(notes,{x:191,y:1000},{x:192,y:1050}),['b']);
});
test('bulk resize preserves relative starts and duration differences, with atomic bounds and undo',()=>{
 const s=applyCommands(newSession(),[{op:'track.add',values:{id:'t',kind:'midi'}},{op:'region.add',target:'t',values:{id:'r',duration:4}},{op:'note.add',target:'r',values:{id:'a',duration:.5,start:1}},{op:'note.add',target:'r',values:{id:'b',duration:1,start:2}}]);
 const h=new SessionHistory(s);h.execute([{op:'notes.resize',target:'r',values:{noteIds:'a,b',seconds:.5}}]);assert.deepEqual(h.session.tracks[0].regions[0].notes.map(n=>[n.start,n.duration]),[[1,1],[2,1.5]]);
 const before=structuredClone(h.session);for(const seconds of [-1,1,NaN])assert.throws(()=>h.execute([{op:'notes.resize',target:'r',values:{noteIds:'a,b',seconds}}]));assert.deepEqual(h.session,before);h.undo();assert.deepEqual(h.session.tracks,s.tracks);h.redo();assert.deepEqual(h.session.tracks,before.tracks);
});
