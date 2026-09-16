import test from 'node:test';
import assert from 'node:assert/strict';
import {cueDetails, migrateCueDetails, matchingCue} from '../src/cue-details.js';
import {cueIssues} from '../src/model.js';
test('legacy provenance and credits migrate to independent cue-owned values', () => {
  const state = {tracks:[{id:'t',category:'original',credits:[{role:'Composer',last:'Old',pro:'BMI',share:100}]}],cues:[{trackId:'t'},{trackId:'t',category:'sourced'}]};
  migrateCueDetails(state);
  assert.equal(state.cues[0].category,'original');
  assert.equal(state.cues[1].category,'sourced');
  state.cues[0].credits[0].last='New';
  assert.equal(state.cues[1].credits[0].last,'Old');
  assert.equal(state.tracks[0].credits[0].last,'Old');
  assert.equal(state.tracks[0].category,undefined);
  migrateCueDetails(state);
  assert.equal(state.cues[0].credits[0].last,'New');
  assert.equal(cueDetails(state.tracks[0]).category,'original');
});
test('rerun retains details only for a unique unchanged source segment', () => {
  const prior={trackId:'t',method:'offset',mediaName:'score.wav',relativeStart:1,relativeEnd:3,category:'sourced',credits:[]};
  assert.equal(matchingCue([prior],'t','offset',{start:1,end:3},'score.wav'),prior);
  assert.equal(matchingCue([prior],'t','offset',{start:1,end:4},'score.wav'),null);
  assert.equal(matchingCue([prior,prior],'t','offset',{start:1,end:3},'score.wav'),null);
  assert.equal(matchingCue([{...prior,staleSource:true}],'t','offset',{start:1,end:3},'score.wav'),null);
  assert.equal(matchingCue([prior],'t','movie',{start:1,end:3},'score.wav'),null);
});
test('cue validation uses its own credits rather than source credits', () => {
  const cue={title:'Cue',start:'00:00:01:00',end:'00:00:02:00',usage:'BI',credits:[]};
  const track={credits:[{role:'Composer',last:'A',pro:'BMI',share:100},{role:'Publisher',name:'B',pro:'BMI',share:100}]};
  assert.ok(cueIssues(cue,track,{rate:'24'}).includes('Add composer credits'));
});
