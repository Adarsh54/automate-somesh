import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadAudioFile,useMultipartUpload} from '../src/audio-upload.js';
test('stalled upload rejects and releases its controller even if transport never settles',async()=>{
 const controllers=[];
 await assert.rejects(uploadAudioFile(()=>new Promise(()=>{}),'audio',{}, {},{stallMs:10,onController:c=>controllers.push(c)}),/Upload stalled/);
 assert.equal(controllers[0].signal.aborted,true);assert.equal(controllers.at(-1),null);
});
test('cancel releases busy upload and successful retries report progress',async()=>{
 let controller;
 const pending=uploadAudioFile(()=>new Promise(()=>{}),'audio',{}, {},{onController:c=>{if(c)controller=c;}});
 controller.abort(new Error('Upload canceled'));
 await assert.rejects(pending,/Upload canceled/);
 const updates=[];
 assert.equal(await uploadAudioFile(async(_,__,options)=>{options.onUploadProgress({loaded:100,percentage:100});return 'saved';},'audio',{}, {},{onProgress:p=>updates.push(p.percentage)}),'saved');
 assert.deepEqual(updates,[100]);
});

test('ordinary audio uses a single transfer; files above 100 MB retain multipart uploads',()=>{
 assert.equal(useMultipartUpload({size:15541955}),false);
 assert.equal(useMultipartUpload({size:100000000}),false);
 assert.equal(useMultipartUpload({size:100000001}),true);
});
