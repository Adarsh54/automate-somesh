import {drumBuffer} from './drums.js';
// Live audition is independent of capture: count-in notes sound but are not saved.
export function createLiveMidiMonitor(context, {destination=context.destination,maxVoices=64,instrument='triangle',sampleBuffer=null,sampleRoot=60}={}) {
 if(!Number.isInteger(maxVoices)||maxVoices<1||maxVoices>128)throw Error('Live MIDI supports 1–128 voices.');
 if(!['triangle','sine','square','sawtooth','drumKit','sampler'].includes(instrument))throw Error('Unsupported monitor instrument.');
 if(instrument==='sampler'&&!sampleBuffer)throw Error('Assign a sampler source before monitoring MIDI.');
 const voices=new Set(),channels=new Map();let disposed=false;
 function channel(id){if(!channels.has(id)){const gain=context.createGain(),pan=context.createStereoPanner();gain.connect(pan);pan.connect(destination);channels.set(id,{gain,pan,volume:1,expression:1,bend:0,sustain:false});update(channels.get(id));}return channels.get(id);}
 function update(c){c.gain.gain.setValueAtTime(c.volume*c.expression,context.currentTime);}
 function destroy(v){voices.delete(v);v.osc.disconnect();v.gain.disconnect();}
 function release(v,immediate=false){if(v.released&&!immediate)return;v.released=true;const now=context.currentTime;if(immediate){v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(0,now);v.osc.stop(now);destroy(v);}else{v.gain.gain.cancelAndHoldAtTime(now);v.gain.gain.linearRampToValueAtTime(0,now+.03);v.osc.stop(now+.035);}}
 function push(data){
  if(disposed||!data||data.length<2)return;const status=data[0],kind=status&0xf0,id=status&15,a=data[1],b=data[2];
  if(status<0x80||status>=0xf0||a>127||a<0||([0x80,0x90,0xb0,0xe0].includes(kind)&&(!Number.isInteger(b)||b<0||b>127)))return;
  const c=channel(id),matching=()=>[...voices].filter(v=>v.channel===id);
  if(kind===0x90&&b){
   while(voices.size>=maxVoices)release(voices.values().next().value,true);
   const drum=instrument==='drumKit',sampler=instrument==='sampler',osc=(drum||sampler)?context.createBufferSource():context.createOscillator(),gain=context.createGain(),now=context.currentTime;
   if(drum){osc.buffer=drumBuffer(context,a);gain.gain.value=b/127;}else if(sampler){osc.buffer=sampleBuffer;osc.playbackRate.value=2**((a-sampleRoot)/12);osc.detune.value=c.bend*200;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(b/127,now+.005);}else{osc.type=instrument;osc.frequency.value=440*2**((a-69)/12);osc.detune.value=c.bend*200;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(b/127*.18,now+.008);}
   osc.connect(gain);gain.connect(c.gain);const v={osc,gain,drum,channel:id,pitch:a,held:true,released:false};voices.add(v);osc.onended=()=>destroy(v);osc.start();
  }else if(kind===0x80||(kind===0x90&&!b)){
   const v=matching().find(v=>v.pitch===a&&v.held);if(v){v.held=false;if(!c.sustain&&!v.drum)release(v);}
  }else if(kind===0xe0){const bend=(a|(b<<7))-8192;c.bend=bend/(bend<0?8192:8191);for(const v of matching())if(!v.drum)v.osc.detune.setValueAtTime(c.bend*200,context.currentTime);
  }else if(kind===0xb0){
   if(a===7){c.volume=b/127;update(c);}if(a===11){c.expression=b/127;update(c);}
   if(a===10)c.pan.pan.setValueAtTime((b-64)/(b<64?64:63),context.currentTime);
   if(a===64){c.sustain=b>=64;if(!c.sustain)for(const v of matching())if(!v.held&&!v.drum)release(v);}
   if(a===120)for(const v of matching())release(v,true);
   if(a===123)for(const v of matching()){v.held=false;if(!c.sustain&&!v.drum)release(v);}
   if(a===121){c.expression=1;c.bend=0;c.sustain=false;update(c);for(const v of matching()){if(!v.drum)v.osc.detune.setValueAtTime(0,context.currentTime);if(!v.held&&!v.drum)release(v);}}
  }
 }
 return {push,get voiceCount(){return voices.size;},stop(){if(disposed)return;disposed=true;for(const v of [...voices])release(v,true);for(const c of channels.values()){c.gain.disconnect();c.pan.disconnect();}channels.clear();}};
}
