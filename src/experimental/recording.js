import {recordingTiming} from './recording-timing.js';
import {scheduleRecordingClick} from './metronome.js';
import {encodeWav} from './audio-engine.js';
export async function startRecording({signal,session=null,position=0,onProgress=()=>{},onLimit=()=>{}}={}){
 if(!navigator.mediaDevices?.getUserMedia||!globalThis.AudioWorkletNode)throw Error('Microphone recording requires a browser with AudioWorklet support and HTTPS.');
 let stream,context,node,source,timer,click,closed=false,resolveStop;const chunks=[];let frames=0,channels=0,peak=0,limitReached=false;
 const cleanup=()=>{click?.stop();clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());source?.disconnect();node?.disconnect();if(context&&context.state!=='closed')context.close().catch(()=>{});};
 const cancel=()=>{closed=true;resolveStop?.();cleanup();};signal?.addEventListener('abort',cancel,{once:true});
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2}},video:false});if(signal?.aborted)throw Error('Recording canceled.');
  context=new AudioContext();await context.audioWorklet.addModule(new URL('./recording-worklet.js',import.meta.url));await context.resume();if(signal?.aborted)throw Error('Recording canceled.');
  const timing=recordingTiming(session,context.currentTime,context.sampleRate),{startFrame,captureTime}=timing;
  node=new AudioWorkletNode(context,'cuestamp-capture',{processorOptions:{startFrame}});source=context.createMediaStreamSource(stream);
  node.port.onmessage=({data})=>{if(data.done){resolveStop?.();return;}if(closed||!data.pcm)return;const length=data.pcm[0].length;if(frames+length>context.sampleRate*600){if(!limitReached){limitReached=true;onLimit();}return;}channels=Math.max(channels,data.pcm.length);frames+=length;chunks.push(data.pcm);peak=0;for(const channel of data.pcm)for(const sample of channel)peak=Math.max(peak,Math.abs(sample));};
  source.connect(node).connect(context.destination);click=scheduleRecordingClick(context,session,position,timing);timer=setInterval(()=>onProgress({seconds:frames/context.sampleRate,peak,countInRemaining:Math.max(0,captureTime-context.currentTime)}),100);
  return {cancel,get countingIn(){return context.currentTime<captureTime;},async stop(){if(closed)throw Error('Recording has already ended.');click?.stop();try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Recording could not be finalized.')),3000);resolveStop=()=>{clearTimeout(timeout);resolve();};node.port.postMessage('stop');});if(closed)throw Error('Recording canceled.');closed=true;if(!frames)throw Error('No microphone audio was captured.');const buffer=context.createBuffer(channels,frames,context.sampleRate);let offset=0;for(const chunk of chunks){for(let c=0;c<channels;c++)buffer.getChannelData(c).set(chunk[c]||chunk[0],offset);offset+=chunk[0].length;}return new File([encodeWav(buffer)],`Take ${new Date().toISOString().replace(/[:.]/g,'-')}.wav`,{type:'audio/wav'});}finally{signal?.removeEventListener('abort',cancel);cleanup();}}};
 }catch(error){signal?.removeEventListener('abort',cancel);cleanup();throw error;}
}
