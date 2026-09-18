import test from 'node:test';import assert from 'node:assert/strict';
import {samplePeak,peakDb} from '../src/experimental/meters.js';
test('sample meters preserve headroom and measure absolute negative peaks',()=>{assert.equal(samplePeak(new Float32Array()),0);assert.equal(samplePeak(new Float32Array([.1,-1.5,.5])),1.5);assert.equal(peakDb(0),-Infinity);assert.equal(peakDb(1),0);assert.ok(Math.abs(peakDb(.5)+6.0206)<.0001);assert.ok(peakDb(1.5)>0);});
