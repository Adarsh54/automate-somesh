import {samplerEnvelope,scheduleSamplerEnvelope} from './sampler-envelope.js';
import {controllerValue,schedulePitchBend} from './midi-events.js';
const bendRate=value=>2**(((value-8192)/(value<8192?8192:8191)*2)/12);
export function samplerOffset(note,root,events,at){
 const rate=2**((note.pitch-root)/12);let previous=note.start,bend=controllerValue(events,'pitchBend',null,previous,8192),offset=0;
 for(const event of events.filter(e=>e.type==='pitchBend'&&e.start>previous&&e.start<at).sort((a,b)=>a.start-b.start)){offset+=(event.start-previous)*rate*bendRate(bend);previous=event.start;bend=event.value;}
 return offset+Math.max(0,at-previous)*rate*bendRate(bend);
}
export function samplerLoop(buffer,{sampleLoop=false,sampleLoopStart=0,sampleLoopEnd=null}={}){
 if(!sampleLoop)return {loop:false};
 const end=sampleLoopEnd??buffer.duration;
 if(!Number.isFinite(sampleLoopStart)||!Number.isFinite(end)||sampleLoopStart<0||end>buffer.duration||end-sampleLoopStart+Number.EPSILON*Math.max(1,buffer.duration)<1/buffer.sampleRate)throw Error('Sampler loop points must span at least one sample and stay inside the source file.');
 return {loop:true,loopStart:sampleLoopStart,loopEnd:end};
}
export function loopedSampleOffset(offset,loop){return loop.loop&&offset>=loop.loopEnd?loop.loopStart+(offset-loop.loopStart)%(loop.loopEnd-loop.loopStart):offset;}
export function scheduleSampler(context,destination,buffer,root,note,events,relative,when,end,nodes,settings={}){
 const envelope=samplerEnvelope(settings),at=Math.max(note.start,relative),remaining=end+envelope.release-at;if(remaining<=0||note.velocity===0)return;
 const loop=samplerLoop(buffer,settings),offset=loopedSampleOffset(samplerOffset(note,root,events,at),loop);if(offset>=buffer.duration)return;
 const source=context.createBufferSource(),amp=context.createGain(),start=when+Math.max(0,note.start-relative);source.buffer=buffer;Object.assign(source,loop);source.playbackRate.value=2**((note.pitch-root)/12);schedulePitchBend(source,events,at,start,end+envelope.release);
 scheduleSamplerEnvelope(amp.gain,start,at-note.start,end-note.start,note.velocity,envelope);source.connect(amp).connect(destination);source.start(start,offset);source.stop(start+remaining);nodes.push(source,amp);
}
