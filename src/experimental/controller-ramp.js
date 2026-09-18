import {z} from 'zod';
const rampSchema=z.object({type:z.enum(['controlChange','pitchBend']),channel:z.number().int().min(0).max(15).default(0),parameter:z.number().int().min(0).max(127).default(0),start:z.number().finite().nonnegative(),end:z.number().finite().positive(),from:z.number().int().nonnegative(),to:z.number().int().nonnegative(),step:z.number().finite().positive(),curve:z.enum(['linear','easeIn','easeOut']).default('linear')}).strict();
export function controllerRamp(region,values){
 const v=rampSchema.parse(values),max=v.type==='pitchBend'?16383:127;
 if(v.end<=v.start||v.end>region.duration)throw Error('The ramp must start before it ends and stay inside the MIDI region.');
 if(v.from>max||v.to>max)throw Error(`Controller values must be between 0 and ${max}.`);
 if(v.type==='pitchBend'&&v.parameter!==0)throw Error('Pitch bend uses parameter 0.');
 const intervals=Math.ceil((v.end-v.start)/v.step),count=intervals+1;
 if(count>2000)throw Error('A ramp supports up to 2,000 points. Increase point spacing.');
 const kept=region.events.filter(e=>!(e.type===v.type&&e.channel===v.channel&&(v.type==='pitchBend'||e.parameter===v.parameter)&&e.start>=v.start&&e.start<=v.end));
 if(kept.length+count>20000)throw Error('This ramp would exceed the region’s 20,000-event limit.');
 const generated=Array.from({length:count},(_,i)=>{const fraction=i/intervals,t=v.curve==='easeIn'?fraction*fraction:v.curve==='easeOut'?1-(1-fraction)**2:fraction;return {id:crypto.randomUUID(),type:v.type,channel:v.channel,parameter:v.parameter,start:i===intervals?v.end:v.start+(v.end-v.start)*fraction,value:Math.round(v.from+(v.to-v.from)*t)};});
 return [...kept,...generated].sort((a,b)=>a.start-b.start);
}
