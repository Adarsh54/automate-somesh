import {audioStatistics,stereoStatistics} from './audio-statistics.js';
self.onmessage=event=>{try{self.postMessage({channels:audioStatistics(event.data.channels),stereo:stereoStatistics(event.data.channels)});}catch(error){self.postMessage({error:error.message});}};
