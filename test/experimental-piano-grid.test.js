import test from 'node:test';
import assert from 'node:assert/strict';
import {notePlacement,noteDrag,snapTime} from '../src/experimental/piano-grid.js';
test('straight, triplet and free insertion keep notes within the region',()=>{
 assert.deepEqual(notePlacement(.49,2,.25,.125),{start:.25,duration:.25});
 const triplet=notePlacement(.49,2,1/6,.125);assert.equal(triplet.start,1/3);assert.equal(triplet.duration,1/6);
 assert.deepEqual(notePlacement(.49,2,0,.125),{start:.49,duration:.125});
 assert.deepEqual(notePlacement(.99,1,0,.125),{start:.99,duration:1-.99});
 assert.equal(notePlacement(1,1,0,.125),null);
 assert.equal(snapTime(.3,.1,{floor:true}),.30000000000000004);
});
test('dragging uses musical increments while preserving offsets, free movement and boundaries',()=>{
 const note={start:.13,duration:.2,pitch:60};
 assert.deepEqual(noteDrag(note,{seconds:.26,step:.25,regionDuration:2}),{start:.38,pitch:60});
 assert.deepEqual(noteDrag(note,{seconds:.06,step:0,semitones:2,regionDuration:2}),{start:.19,pitch:62});
 assert.deepEqual(noteDrag(note,{seconds:100,step:.25,semitones:100,regionDuration:2}),{start:1.8,pitch:127});
 assert.deepEqual(noteDrag(note,{seconds:-100,step:0,semitones:-100,regionDuration:2}),{start:0,pitch:0});
 assert.equal(noteDrag(note,{seconds:.18,step:1/6,resize:true,regionDuration:2}).duration,note.duration+1/6);
 assert.equal(noteDrag(note,{seconds:-5,step:0,resize:true,regionDuration:2}).duration,.001);
 assert.equal(noteDrag(note,{seconds:20,step:.25,resize:true,regionDuration:2}).duration,1.87);
});
