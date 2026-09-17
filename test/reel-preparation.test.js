import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReelTrack} from '../src/reel-preparation.js';
test('preview waits for an existing preparation and uses the completed track',async()=>{
 let calls=0;const waits=[],track={id:'audio',duration:5,peaks:[0,1,0]};
 const result=await prepareReelTrack(async(action,body)=>{assert.equal(action,'prepare');assert.equal(body.id,'audio');return ++calls<3?{status:'processing',retryAfter:2}:{track};},'audio',{wait:async ms=>waits.push(ms)});
 assert.equal(result,track);assert.deepEqual(waits,[2000,2000]);
});
test('preview preserves decoder errors and bounds preparation waits',async()=>{
 await assert.rejects(prepareReelTrack(async()=>{throw Error('Invalid audio');},'audio'),/Invalid audio/);
 let clock=0;
 await assert.rejects(prepareReelTrack(async()=>({status:'processing'}),'audio',{now:()=>clock,wait:async ms=>{clock+=ms;},maxWaitMs:3000}),/taking longer than expected/);
});
