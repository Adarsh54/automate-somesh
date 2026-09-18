import test from 'node:test';import assert from 'node:assert/strict';
import {newSession,SessionHistory} from '../src/experimental/session.js';
import {scheduleRecordingPlayback} from '../src/experimental/recording-playback.js';
test('recording playback is opt-in, persisted and independently undoable',()=>{
 const h=new SessionHistory(newSession());assert.equal(h.session.recordWithPlayback,false);h.execute([{op:'session.set',values:{recordWithPlayback:true}}]);assert.equal(h.session.recordWithPlayback,true);h.undo();assert.equal(h.session.recordWithPlayback,false);h.redo();assert.equal(h.session.recordWithPlayback,true);assert.throws(()=>h.execute([{op:'session.set',values:{recordWithPlayback:'yes'}}]));
 assert.doesNotThrow(()=>scheduleRecordingPlayback(null,{recordWithPlayback:false},null,0,0).stop());
});
