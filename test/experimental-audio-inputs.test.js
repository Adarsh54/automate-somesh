import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioInputs} from '../src/experimental/audio-inputs.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('audio inputs filter devices, preserve missing selection and remove listeners',async()=>{
 let list=[{kind:'audioinput',deviceId:'mic',label:'Interface'},{kind:'videoinput',deviceId:'camera'},{kind:'audiooutput',deviceId:'speaker'},{kind:'audioinput',deviceId:'mic'},{kind:'audioinput',deviceId:'default'}],listener;
 const inputs=createAudioInputs({mediaDevices:{enumerateDevices:async()=>list,addEventListener:(_,fn)=>listener=fn,removeEventListener:(_,fn)=>{assert.equal(fn,listener);listener=null;}}});
 inputs.activate();await tick();inputs.select('mic');assert.equal(inputs.deviceId,'mic');assert.match(inputs.view(String),/Interface/);assert.doesNotMatch(inputs.view(String),/camera|speaker/);assert.equal((inputs.view(String).match(/value="mic"/g)||[]).length,1);
 list=[];await listener();assert.equal(inputs.deviceId,'mic');assert.match(inputs.view(String),/Selected input unavailable/);inputs.dispose();assert.equal(listener,null);
});
test('audio inputs ignore stale enumeration and disposal results',async()=>{
 const pending=[];let changes=0;
 const inputs=createAudioInputs({mediaDevices:{enumerateDevices:()=>new Promise(r=>pending.push(r))},onChange:()=>changes++});inputs.activate();const newer=inputs.refresh();pending[1]([{kind:'audioinput',deviceId:'new',label:'New'}]);await newer;pending[0]([{kind:'audioinput',deviceId:'old',label:'Old'}]);await tick();assert.match(inputs.view(String),/New/);assert.doesNotMatch(inputs.view(String),/Old/);
 const last=inputs.refresh();inputs.dispose();const count=changes;pending[2]([]);await last;assert.equal(changes,count);
});
test('device enumeration failures are visible without requesting microphone access',async()=>{
 const inputs=createAudioInputs({mediaDevices:{enumerateDevices:async()=>{throw Error('Permission denied');}}});inputs.activate();await tick();assert.match(inputs.view(String),/Permission denied/);assert.equal(inputs.deviceId,undefined);inputs.dispose();
});
