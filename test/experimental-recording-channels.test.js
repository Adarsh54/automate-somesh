import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecordingChannels} from '../src/experimental/recording-channels.js';
import {createAudioInputs} from '../src/experimental/audio-inputs.js';
test('recording channel selection rejects unavailable right input and unknown modes',()=>{
 for(const mode of ['stereo','left'])validateRecordingChannels(mode,1);
 validateRecordingChannels('right',2);validateRecordingChannels('right',undefined);
 assert.throws(()=>validateRecordingChannels('right',1),/only one channel/);
 for(const mode of ['mix',null,2,''])assert.throws(()=>validateRecordingChannels(mode),/Choose stereo/);
});
test('channel preference is transient, distinct from device selection and disabled during capture',()=>{
 const inputs=createAudioInputs({mediaDevices:{}});assert.equal(inputs.inputChannels,'stereo');inputs.select('interface');inputs.selectChannels('right');assert.equal(inputs.deviceId,'interface');assert.equal(inputs.inputChannels,'right');assert.match(inputs.view(String,true),/data-audio-channels disabled/);assert.match(inputs.view(String),/value="right" selected/);assert.throws(()=>inputs.selectChannels('invalid'));assert.equal(inputs.inputChannels,'right');assert.equal(createAudioInputs().inputChannels,'stereo');
});
