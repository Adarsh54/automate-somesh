import test from 'node:test';
import assert from 'node:assert/strict';
import {detectionKey,detectionReady} from '../src/detection-gate.js';
const draft=()=>({production:{rate:'24'},thresholdDb:-40,silenceGap:1,tracks:[{id:'score',filename:'score.wav',duration:60,offset:'01:00:00:00'}]});
test('steps require completed detection for the current score and settings',()=>{
 const s=draft();assert.equal(detectionReady(s),false);
 s.analysisReport={count:0,detectionKey:detectionKey(s)};assert.equal(detectionReady(s),true);
 for(const change of [x=>x.scoreOffset='02:00:00:00',x=>x.thresholdDb=-30,x=>x.silenceGap=2,x=>x.tracks[0].id='replacement',x=>x.production.rate='25']){
  const changed=structuredClone(s);change(changed);assert.equal(detectionReady(changed),false);
  changed.analysisReport.detectionKey=detectionKey(changed);assert.equal(detectionReady(changed),true);
 }
 s.tracks=[];assert.equal(detectionReady(s),false);
});
test('credit and title edits do not require repeating detection',()=>{
 const s=draft();s.analysisReport={detectionKey:detectionKey(s)};
 s.tracks[0].cueProfileName='Composer';s.production.title='Film';
 assert.equal(detectionReady(s),true);
});
