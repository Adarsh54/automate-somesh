import {parentPort,workerData} from 'node:worker_threads';
import {detectRegions,prepareMovie,matchTrack} from '../src/analysis.js';
const {mode,track,movie,options}=workerData;
parentPort.postMessage(mode==='offset'?{matches:detectRegions(track,options)}:matchTrack(prepareMovie(movie),track,options));
