import test from 'node:test';
import assert from 'node:assert/strict';
import {cueDetails, migrateCueDetails, matchingCue, effectiveCue, archiveCueDetails} from '../src/cue-details.js';
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
  assert.deepEqual(cueDetails(state.tracks[0]),{});
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

test('live defaults propagate while independent overrides reset cleanly and survive archives', () => {
  const state={tracks:[],cues:[]};migrateCueDetails(state);
  const first={id:'a',method:'offset',...cueDetails(null)},second={id:'b',method:'offset',...cueDetails(null)};
  state.cues=[first,second];state.sharedCueDetails.category='original';
  state.sharedCueDetails.credits[0].last='Shared writer';
  second.credits=structuredClone(state.sharedCueDetails.credits);second.credits[0].last='Override';second.category='sourced';
  state.sharedCueDetails.credits[0].last='Updated shared';
  assert.equal(effectiveCue(first,state.sharedCueDetails).credits[0].last,'Updated shared');
  assert.equal(effectiveCue(second,state.sharedCueDetails).credits[0].last,'Override');
  archiveCueDetails(state,'offset');
  assert.equal(state.cueDetailsArchive[0].credits,undefined);
  assert.equal(cueDetails(null,second).category,'sourced');
  delete second.credits;delete second.category;
  assert.equal(effectiveCue(second,state.sharedCueDetails).credits[0].last,'Updated shared');
  assert.equal(effectiveCue(second,state.sharedCueDetails).category,'original');
  migrateCueDetails(state);assert.equal(first.credits,undefined);
});
