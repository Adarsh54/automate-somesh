import test from 'node:test';
import assert from 'node:assert/strict';
import {applyScoreOffset, scoreOffset} from '../src/score-offset.js';
import {convertRate, productionIssues} from '../src/project.js';
import {atOffset, toFrames} from '../src/timecode.js';
const state=()=>({mode:'offset',production:{title:'Score',rate:'24',startTimecode:''},movieOffset:'',tracks:[{id:'score',offset:'01:00:00:00'},{id:'library',purpose:'library',offset:'00:00:00:00'}],cues:[{trackId:'score',method:'offset',start:'01:00:05:12',end:'01:00:15:12',fileOffset:'01:00:00:00',relativeStart:5.5,relativeEnd:15.5,reviewed:true},{trackId:'score',method:'manual',start:'01:00:30:00',end:'01:00:40:00'}]});
test('full score offsets shift detected timings by frames without changing playback or unrelated tracks',()=>{
 const s=state();assert.equal(scoreOffset(s),'01:00:00:00');
 assert(applyScoreOffset(s,'00:59:55:00'));
 assert.equal(s.cues[0].start,'01:00:00:12');assert.equal(s.cues[0].end,'01:00:10:12');
 assert.equal(s.cues[0].relativeStart,5.5);assert.equal(s.cues[0].reviewed,false);
 assert.equal(s.cues[1].start,'01:00:30:00');assert.equal(s.tracks[1].offset,'00:00:00:00');
 assert.equal(atOffset(scoreOffset(s),5.5,'24'),s.cues[0].start);
 assert(applyScoreOffset(s,'02:00:00:06'));assert.equal(s.cues[0].start,'02:00:05:18');
});
test('invalid start drafts never shift cues and require correction before export',()=>{
 const s=state(),before=structuredClone(s.cues);
 for(const value of ['01:00','00:60:00:00','01:00:00:24']){assert.equal(applyScoreOffset(s,value),false);assert.deepEqual(s.cues,before);assert(productionIssues(s).includes('Correct the full score start timecode'));}
 assert(applyScoreOffset(s,'00:00:00:00'));assert.equal(s.cues[0].start,'00:00:05:12');
});
test('shared offset stays on the project frame grid when rate changes',()=>{
 const s=state();applyScoreOffset(s,'01:00:00:12');convertRate(s,'25');
 assert.equal(s.scoreOffset,s.tracks[0].offset);assert.equal(toFrames(s.scoreOffset,'25'),90013);
});
test('drop-frame input rejects nonexistent labels and accepts colon-separated valid starts',()=>{
 const s=state();s.production.rate='29.97df';
 assert.equal(applyScoreOffset(s,'00:01:00:00'),false);
 assert.equal(applyScoreOffset(s,'00:01:00:02'),true);
 assert.equal(atOffset(scoreOffset(s),1,'29.97df'),'00:01:01;02');
});
