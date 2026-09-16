import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudMedia} from '../src/cloud-media.js';
test('media saves retain uploaded files across errors and snapshot files during edits',async()=>{
 const file=new File(['audio'],'score.wav'),movie=new File(['video'],'movie.mp4');
 const state={tracks:[{id:'track'}],movieMetadata:{},media:{tracks:{}}},workflow={files:new Map([['track',file],['movie',movie]])};
 let uploads=0,finalizeFail=true,persisted=0;
 const media=createCloudMedia({state,workflow,persist:()=>persisted++,request:async(url,options)=>{
  if(url.includes('reserve')){const b=JSON.parse(options.body);return {asset:{id:b.filename,pathname:b.filename,contentType:'audio/wav'}};}
  if(finalizeFail){finalizeFail=false;throw Error('Temporary outage');}
  return {};
 },uploadFile:async(path)=>{uploads++;if(path==='score.wav')workflow.files.set('movie',new File(['new'],'replacement.mp4'));}});
 await assert.rejects(media.prepare(structuredClone(state),()=>{}),/Temporary outage/);
 assert.equal(uploads,1);assert.deepEqual(state.media.tracks,{});
 // Restore the original file for the next snapshot; an edit during upload must not change that snapshot.
 workflow.files.set('movie',movie);
 const snapshot=structuredClone(state);await media.prepare(snapshot,()=>{});
 assert.equal(uploads,2);assert.equal(snapshot.media.tracks.track,'score.wav');assert.equal(snapshot.media.movie,'movie.mp4');assert.ok(persisted>0);
 await media.prepare(structuredClone(state),()=>{});assert.equal(uploads,2);
});
test('missing media blocks a cloud save and analysis cannot race restoration',async()=>{
 const state={tracks:[{id:'missing'}]},workflow={files:new Map()};
 const media=createCloudMedia({state,workflow,persist:()=>{},request:()=>{throw Error('Must not request');}});
 await assert.rejects(media.prepare(structuredClone(state),()=>{}),/Reattach/);
 workflow.busy=true;await assert.rejects(media.prepare(structuredClone(state),()=>{}),/Wait/);
 await assert.rejects(media.restore(()=>{}),/Wait/);
});
