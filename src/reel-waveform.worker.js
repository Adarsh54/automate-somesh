import wasmUrl from './waveform.wasm?url&inline';
import {wavPeaks} from './reel-waveform.js';
self.onmessage=async({data:file})=>{
 try{const response=await fetch(wasmUrl);if(!response.ok)throw Error('Could not load waveform processing.');self.postMessage({result:await wavPeaks(file,await response.arrayBuffer())});}
 catch(error){self.postMessage({error:error.message});}
};
