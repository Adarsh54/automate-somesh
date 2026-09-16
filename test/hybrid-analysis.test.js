import test from 'node:test';
import assert from 'node:assert/strict';
import {HybridAnalysis} from '../src/hybrid-analysis.js';
import {useBackend,BROWSER_MAX_BYTES} from '../src/processing-policy.js';
test('100 MB boundary keeps equal-size files local and routes larger files remotely',()=>{
 assert.equal(BROWSER_MAX_BYTES,100000000);
 for(const size of [0,99999999,100000000])assert.equal(useBackend({size}),false);
 assert.equal(useBackend({size:100000001}),true);
});
function setup(overrides={}) {
 const localCalls=[],uploads=[],requests=[],events=[];
 class LocalWorker {
  postMessage(payload){localCalls.push(payload);queueMicrotask(()=>this.onmessage({data:{type:'done',results:payload.tracks.map(t=>({id:t.id,matches:[{start:1,end:3}]}))}}));}
  terminate(){}
 }
 const job=new HybridAnalysis({LocalWorker,decode:async file=>{uploads.push(file.name);return {assetId:file.name+'-asset'};},request:async(action,body)=>{requests.push(body);return {matches:[{start:2,end:4}]};},...overrides});
 job.onmessage=({data})=>events.push(data);
 return {job,localCalls,uploads,requests,events};
}
const track=(id,remote=false)=>({id,title:id,file:{name:id},...(remote?{assetId:id+'-asset'}:{samples:new Float32Array(4000)})});
test('small files run locally without uploading, including when a large movie is unused',async()=>{
 const s=setup();await s.job.postMessage({mode:'offset',movieAssetId:'unused',tracks:[track('small')],options:{}});
 assert.equal(s.localCalls.length,1);assert.equal(s.requests.length,0);assert.equal(s.uploads.length,0);assert.equal(s.events.at(-1).type,'done');
 assert.equal(s.localCalls[0].tracks[0].file,undefined);
});
test('mixed offset tracks route individually and preserve original result order',async()=>{
 const s=setup();await s.job.postMessage({mode:'offset',tracks:[track('large',true),track('small')],options:{gap:3}});
 assert.deepEqual(s.localCalls[0].tracks.map(t=>t.id),['small']);assert.deepEqual(s.requests.map(r=>r.id),['large-asset']);assert.deepEqual(s.events.at(-1).results.map(t=>t.id),['large','small']);
});
test('large movie promotes small references while small movie promotes only large comparisons',async()=>{
 const large=setup();await large.job.postMessage({mode:'movie',movieAssetId:'movie-asset',tracks:[track('small'),track('large',true)],options:{}});
 assert.equal(large.localCalls.length,0);assert.deepEqual(large.uploads,['small']);assert.ok(large.requests.every(r=>r.movie==='movie-asset'));
 const small=setup();await small.job.postMessage({mode:'movie',movie:new Float32Array(6000),movieFile:{name:'movie'},tracks:[track('small'),track('large',true)],options:{}});
 assert.deepEqual(small.localCalls[0].tracks.map(t=>t.id),['small']);assert.deepEqual(small.uploads,['movie']);assert.equal(small.requests[0].movie,'movie-asset');
});
test('server failure discards partial local results and cancellation suppresses late results',async()=>{
 const failure=setup({request:async()=>{throw Error('Please retry');}});
 await failure.job.postMessage({mode:'offset',tracks:[track('small'),track('large',true)],options:{}});
 assert.equal(failure.events.at(-1).type,'error');assert.equal(failure.events.some(e=>e.type==='done'),false);
 let finish,start;const started=new Promise(r=>start=r);
 const cancel=setup({request:()=>{start();return new Promise(r=>finish=r);}});
 const pending=cancel.job.postMessage({mode:'offset',tracks:[track('large',true)],options:{}});
 await started;cancel.job.terminate();finish({matches:[]});await pending;
 assert.equal(cancel.events.some(e=>e.type==='done'||e.type==='error'),false);
});
