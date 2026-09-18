import {audioStatistics} from './audio-statistics.js';
self.onmessage=event=>{try{self.postMessage({channels:audioStatistics(event.data.channels)});}catch(error){self.postMessage({error:error.message});}};
