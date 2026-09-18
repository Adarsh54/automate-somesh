class CaptureProcessor extends AudioWorkletProcessor {
 constructor(options){super();this.startFrame=options?.processorOptions?.startFrame??0;this.active=true;this.chunks=[];this.frames=0;this.port.onmessage=e=>{if(e.data==='stop'){this.active=false;this.flush();this.port.postMessage({done:true});}};}
 flush(){if(!this.frames)return;const channels=this.chunks[0].length,pcm=Array.from({length:channels},()=>new Float32Array(this.frames));let offset=0;for(const chunk of this.chunks){for(let c=0;c<channels;c++)pcm[c].set(chunk[c]||chunk[0],offset);offset+=chunk[0].length;}this.port.postMessage({pcm},pcm.map(c=>c.buffer));this.chunks=[];this.frames=0;}
 process(inputs){const input=inputs[0];if(this.active&&input?.length&&input[0].length){const skip=Math.max(0,this.startFrame-currentFrame);if(skip>=input[0].length)return true;this.chunks.push(input.slice(0,2).map(c=>c.slice(skip)));this.frames+=input[0].length-skip;if(this.frames>=4096)this.flush();}return true;}
}
registerProcessor('cuestamp-capture',CaptureProcessor);
