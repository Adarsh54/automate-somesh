import {effectPointSchema,validateEffectPoints,scheduleEffectParameter} from './effect-automation.js';
import {z} from 'zod';
const base={id:z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),enabled:z.boolean().default(true),automation:z.array(effectPointSchema).max(2000).default([])};
export const effectSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('gain'),gainDb:z.number().finite().min(-96).max(24).default(0),width:z.number().finite().min(0).max(2).default(1),invertLeft:z.boolean().default(false),invertRight:z.boolean().default(false),swap:z.boolean().default(false)}).strict(),
 z.object({...base,kind:z.literal('eq'),type:z.enum(['lowpass','highpass','peaking','lowshelf','highshelf']).default('peaking'),frequency:z.number().finite().min(20).max(20000).default(1000),q:z.number().finite().min(.1).max(20).default(1),gainDb:z.number().finite().min(-24).max(24).default(0)}).strict(),
 z.object({...base,kind:z.literal('compressor'),threshold:z.number().finite().min(-80).max(0).default(-24),ratio:z.number().finite().min(1).max(20).default(4),attack:z.number().finite().min(0).max(1).default(.003),release:z.number().finite().min(.001).max(1).default(.25),knee:z.number().finite().min(0).max(40).default(15)}).strict(),
 z.object({...base,kind:z.literal('delay'),time:z.number().finite().min(.01).max(2).default(.25),feedback:z.number().finite().min(0).max(.9).default(.3),mix:z.number().finite().min(0).max(1).default(.25)}).strict(),
 z.object({...base,kind:z.literal('reverb'),decay:z.number().finite().min(.1).max(8).default(2),mix:z.number().finite().min(0).max(1).default(.2)}).strict(),
]).superRefine(validateEffectPoints);
export const automationSchema=z.object({id:z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),parameter:z.enum(['gainDb','pan']),time:z.number().finite().min(0).max(86400),value:z.number().finite()}).superRefine((p,ctx)=>{const [min,max]=p.parameter==='gainDb'?[-96,12]:[-1,1];if(p.value<min||p.value>max)ctx.addIssue({code:'custom',message:'Automation value outside parameter range.'});});
export function automationValue(points,parameter,time,fallback){const ordered=points.filter(p=>p.parameter===parameter).sort((a,b)=>a.time-b.time);if(!ordered.length)return fallback;if(time<=ordered[0].time)return ordered[0].value;for(let i=1;i<ordered.length;i++){const left=ordered[i-1],right=ordered[i];if(time<=right.time)return left.value+(right.value-left.value)*(time-left.time)/(right.time-left.time);}return ordered.at(-1).value;}
export function scheduleAutomation(param,points,parameter,position,base,fallback){const transform=v=>parameter==='gainDb'?10**(v/20):v;param.setValueAtTime(transform(automationValue(points,parameter,position,fallback)),base);for(const point of points.filter(p=>p.parameter===parameter&&p.time>position).sort((a,b)=>a.time-b.time)){const t=base+point.time-position;if(parameter==='gainDb')param.exponentialRampToValueAtTime(transform(point.value),t);else param.linearRampToValueAtTime(point.value,t);}}
export function effectTail(effects=[]){const peak=(e,key)=>Math.max(e[key],...(e.automation||[]).filter(p=>p.parameter===key).map(p=>p.value));return Math.min(30,effects.filter(e=>e.enabled).reduce((sum,e)=>{if(e.kind==='reverb')return sum+e.decay;if(e.kind!=='delay'||peak(e,'mix')===0)return sum;const time=peak(e,'time'),feedback=peak(e,'feedback');return sum+time*(feedback>0?Math.ceil(Math.log(.001)/Math.log(feedback))+1:1);},0));}
export function connectEffects(context,input,effects,nodes,{position=0,base=context.currentTime}={}){let output=input;for(const effect of effects||[]){if(!effect.enabled)continue;
 if(effect.kind==='gain'){
  // Force speaker upmix before splitting so mono is present on both channels.
  const stereo=context.createGain(),split=context.createChannelSplitter(2),merge=context.createChannelMerger(2),gain=context.createGain();
  stereo.channelCount=2;stereo.channelCountMode='explicit';stereo.channelInterpretation='speakers';output.connect(stereo).connect(split);
  for(let source=0;source<2;source++)for(let destination=0;destination<2;destination++){
   const coefficient=context.createGain(),sign=(source===0?effect.invertLeft:effect.invertRight)?-1:1;
   scheduleEffectParameter(coefficient.gain,effect,'width',position,base,w=>sign*(source===destination?1+w:1-w)/2);
   split.connect(coefficient,source);coefficient.connect(merge,0,effect.swap?1-destination:destination);nodes.push(coefficient);
  }
  scheduleAutomation(gain.gain,effect.automation,'gainDb',position,base,effect.gainDb);merge.connect(gain);nodes.push(stereo,split,merge,gain);output=gain;
 }
 else if(effect.kind==='eq'){const filter=context.createBiquadFilter();filter.type=effect.type;scheduleEffectParameter(filter.frequency,effect,'frequency',position,base,v=>Math.min(v,context.sampleRate/2-1));scheduleEffectParameter(filter.Q,effect,'q',position,base);scheduleEffectParameter(filter.gain,effect,'gainDb',position,base);output.connect(filter);nodes.push(filter);output=filter;}
 else if(effect.kind==='compressor'){const compressor=context.createDynamicsCompressor();for(const key of ['threshold','ratio','attack','release','knee'])scheduleEffectParameter(compressor[key],effect,key,position,base);output.connect(compressor);nodes.push(compressor);output=compressor;}
 else{const dry=context.createGain(),wet=context.createGain(),sum=context.createGain();scheduleEffectParameter(dry.gain,effect,'mix',position,base,v=>1-v);scheduleEffectParameter(wet.gain,effect,'mix',position,base);output.connect(dry).connect(sum);nodes.push(dry,wet,sum);
  if(effect.kind==='delay'){const delay=context.createDelay(2),feedback=context.createGain();scheduleEffectParameter(delay.delayTime,effect,'time',position,base);scheduleEffectParameter(feedback.gain,effect,'feedback',position,base);output.connect(delay);delay.connect(feedback).connect(delay);delay.connect(wet).connect(sum);nodes.push(delay,feedback);}
  else{const convolver=context.createConvolver(),length=Math.ceil(context.sampleRate*effect.decay),impulse=context.createBuffer(2,length,context.sampleRate);let seed=9173;for(let c=0;c<2;c++){const data=impulse.getChannelData(c);for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/2147483648-1)*(1-i/length)**3;}}convolver.buffer=impulse;output.connect(convolver).connect(wet).connect(sum);nodes.push(convolver);}
  output=sum;
 }
 }return output;}
