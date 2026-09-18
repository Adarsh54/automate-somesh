import {controllerValue,schedulePitchBend} from './midi-events.js';
const bendRate=value=>2**(((value-8192)/(value<8192?8192:8191)*2)/12);
export function samplerOffset(note,root,events,at){
 const rate=2**((note.pitch-root)/12);let previous=note.start,bend=controllerValue(events,'pitchBend',null,previous,8192),offset=0;
 for(const event of events.filter(e=>e.type==='pitchBend'&&e.start>previous&&e.start<at).sort((a,b)=>a.start-b.start)){offset+=(event.start-previous)*rate*bendRate(bend);previous=event.start;bend=event.value;}
 return offset+Math.max(0,at-previous)*rate*bendRate(bend);
}
export function scheduleSampler(context,destination,buffer,root,note,events,relative,when,end,nodes){
 const at=Math.max(note.start,relative),remaining=end-at;if(remaining<=0||note.velocity===0)return;
 const offset=samplerOffset(note,root,events,at);if(offset>=buffer.duration)return;
 const source=context.createBufferSource(),amp=context.createGain(),start=when+Math.max(0,note.start-relative);source.buffer=buffer;source.playbackRate.value=2**((note.pitch-root)/12);schedulePitchBend(source,events,at,start,end);
 amp.gain.setValueAtTime(0,start);amp.gain.linearRampToValueAtTime(note.velocity,start+Math.min(.005,remaining/3));amp.gain.setValueAtTime(note.velocity,start+Math.max(Math.min(.005,remaining/3),remaining-.02));amp.gain.linearRampToValueAtTime(0,start+remaining);source.connect(amp).connect(destination);source.start(start,offset);source.stop(start+remaining);nodes.push(source,amp);
}
