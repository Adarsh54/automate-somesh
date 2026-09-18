import {frameRates} from './timecode.js';
import {midiEventSchema,chasedEvents} from './midi-events.js';
import {validateRouting} from './routing.js';
import {trimmedRegion} from './region-edit.js';
import {effectSchema,automationSchema} from './effects.js';
import {z} from 'zod';
const ident=z.string().min(1).max(100),time=z.number().finite().min(0).max(86400),db=z.number().finite().min(-96).max(12);
const note=z.object({id:ident,channel:z.number().int().min(0).max(15).default(0),pitch:z.number().int().min(0).max(127),start:time,duration:z.number().positive().max(3600),velocity:z.number().min(0).max(1)});
const region=z.object({id:ident,name:z.string().max(200),assetId:ident.nullable(),start:time,offset:time,duration:z.number().positive().max(86400),gainDb:db,fadeIn:time,fadeOut:time,reverse:z.boolean(),notes:z.array(note).max(20000),events:z.array(midiEventSchema).max(20000).default([])});
const track=z.object({id:ident,name:z.string().max(200),kind:z.enum(['audio','midi','video','bus']),gainDb:db,pan:z.number().min(-1).max(1),mute:z.boolean(),solo:z.boolean(),instrument:z.enum(['sine','triangle','square','sawtooth','drumKit']),regions:z.array(region).max(1000),output:ident.nullable().default(null),sends:z.array(z.object({busId:ident,gainDb:db})).max(16).default([]),effects:z.array(effectSchema).max(16).default([]),automation:z.array(automationSchema).max(2000).default([])});
export const sessionSchema=z.object({version:z.literal(1),id:ident,title:z.string().max(200),revision:z.number().int().nonnegative(),tempo:z.number().min(20).max(300),meter:z.number().int().min(1).max(16),masterDb:db,frameRate:z.number().refine(value=>frameRates.includes(value),'Unsupported frame rate.').default(24),tracks:z.array(track).max(128),markers:z.array(z.object({id:ident,name:z.string().max(200),time})).max(1000)});
export const newSession=()=>({version:1,id:crypto.randomUUID(),title:'Untitled session',revision:0,tempo:120,meter:4,masterDb:0,tracks:[],markers:[]});
export const operations=['session.set','track.add','track.set','track.delete','send.set','send.delete','region.add','region.extractAudio','region.trim','region.set','region.delete','region.split','region.duplicate','event.add','event.set','event.delete','note.add','note.set','note.delete','notes.quantize','notes.transpose','marker.add','marker.delete','effect.add','effect.set','effect.delete','effect.move','automation.point','automation.delete','automation.clear'];
export const commandSchema=z.object({op:z.enum(operations),target:z.string().max(100).optional(),values:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({})}).strict();
export const batchSchema=z.array(commandSchema).min(1).max(100);
const pick=(values,allowed)=>{for(const key of Object.keys(values))if(!allowed.includes(key))throw Error(`Unsupported field: ${key}`);return values;};
export function applyCommands(input,commands,expectedRevision=input.revision){
 const session=sessionSchema.parse(structuredClone(input));if(session.revision!==expectedRevision)throw Error('The session changed. Run the instruction again.');
 for(const {op,target,values:v} of batchSchema.parse(commands)){
  const t=session.tracks.find(t=>t.id===target),owner=session.tracks.find(t=>t.regions.some(r=>r.id===target)),r=owner?.regions.find(r=>r.id===target);
  const noteRegion=session.tracks.flatMap(t=>t.regions).find(r=>r.notes.some(n=>n.id===target)),n=noteRegion?.notes.find(n=>n.id===target);
  const need=(entity,label)=>{if(!entity)throw Error(`${label} not found: ${target}`);return entity;};
  switch(op){
   case 'session.set':{const previousTempo=session.tempo;Object.assign(session,pick(v,['title','tempo','meter','masterDb','frameRate']));if(v.tempo!==undefined){const ratio=previousTempo/v.tempo;for(const t of session.tracks.filter(t=>t.kind==='midi'))for(const r of t.regions){r.start*=ratio;r.duration*=ratio;r.fadeIn*=ratio;r.fadeOut*=ratio;for(const n of r.notes){n.start*=ratio;n.duration*=ratio;}for(const e of r.events)e.start*=ratio;}}break;}
   case 'track.add':session.tracks.push(track.parse({id:crypto.randomUUID(),name:'New track',kind:'audio',gainDb:0,pan:0,mute:false,solo:false,instrument:'triangle',regions:[],...pick(v,['id','name','kind','instrument'])}));break;
   case 'track.set':Object.assign(need(t,'Track'),pick(v,['name','gainDb','pan','mute','solo','instrument','output']));break;
   case 'track.delete':need(t,'Track');session.tracks=session.tracks.filter(x=>x!==t);for(const other of session.tracks){if(other.output===target)other.output=null;other.sends=other.sends.filter(s=>s.busId!==target);}break;
   case 'send.set':{need(t,'Track');pick(v,['busId','gainDb']);const send=t.sends.find(s=>s.busId===v.busId);if(send)send.gainDb=v.gainDb;else t.sends.push({busId:v.busId,gainDb:v.gainDb});break;}
   case 'send.delete':need(t,'Track');pick(v,['busId']);t.sends=t.sends.filter(s=>s.busId!==v.busId);break;
   case 'region.add':need(t,'Track').regions.push(region.parse({id:crypto.randomUUID(),name:'Region',assetId:null,start:0,offset:0,duration:4,gainDb:0,fadeIn:0,fadeOut:0,reverse:false,notes:[],...pick(v,['id','name','assetId','start','offset','duration'])}));break;
   case 'region.set':Object.assign(need(r,'Region'),pick(v,['name','start','offset','duration','gainDb','fadeIn','fadeOut','reverse']));break;
   case 'region.delete':need(r,'Region');owner.regions=owner.regions.filter(x=>x!==r);break;
   case 'region.extractAudio':need(r,'Region');if(owner.kind!=='video'||!r.assetId)throw Error('Select a movie region to extract its audio.');pick(v,['name','trackId','regionId']);session.tracks.push(track.parse({...owner,id:v.trackId||crypto.randomUUID(),name:v.name||owner.name+' audio',kind:'audio',regions:[{...structuredClone(r),id:v.regionId||crypto.randomUUID(),notes:[],events:[]}]}));break;
   case 'region.trim':need(r,'Region');if(owner.kind==='midi')throw Error('Trim audio or video regions; use the note editor for MIDI.');pick(v,['start','end']);Object.assign(r,trimmedRegion(r,v.start,v.end));break;
   case 'region.duplicate':need(r,'Region');pick(v,['start']);owner.regions.push({...structuredClone(r),id:crypto.randomUUID(),start:v.start??r.start+r.duration,notes:r.notes.map(n=>({...n,id:crypto.randomUUID()})),events:r.events.map(e=>({...e,id:crypto.randomUUID()}))});break;
   case 'region.split':{
    need(r,'Region');pick(v,['time']);const at=Number(v.time)-r.start;if(!Number.isFinite(at)||at<=0||at>=r.duration)throw Error('Split must be inside the region.');
    if(r.reverse)throw Error('Unreverse the region before splitting it.');
    const right={...structuredClone(r),id:crypto.randomUUID(),start:r.start+at,offset:r.offset+at,duration:r.duration-at,fadeIn:0,fadeOut:Math.min(r.fadeOut,r.duration-at),events:[...chasedEvents(r.events,at),...r.events.filter(e=>e.start>=at).map(e=>({...e,id:crypto.randomUUID(),start:e.start-at}))],notes:r.notes.filter(n=>n.start+n.duration>at).map(n=>({...n,id:crypto.randomUUID(),start:Math.max(0,n.start-at),duration:Math.min(n.duration,n.start+n.duration-at)}))};
    r.events=r.events.filter(e=>e.start<at);r.duration=at;r.fadeOut=0;r.fadeIn=Math.min(r.fadeIn,at);r.notes=r.notes.filter(n=>n.start<at).map(n=>({...n,duration:Math.min(n.duration,at-n.start)}));owner.regions.push(right);break;
   }
   case 'event.add':need(r,'Region');if(owner.kind!=='midi')throw Error('Choose a MIDI region.');r.events.push(midiEventSchema.parse({id:crypto.randomUUID(),...pick(v,['id','type','start','channel','parameter','value'])}));break;
   case 'event.set':{const event=session.tracks.flatMap(t=>t.regions).flatMap(r=>r.events).find(e=>e.id===target);need(event,'MIDI event');Object.assign(event,midiEventSchema.parse({...event,...pick(v,['type','start','channel','parameter','value'])}));break;}
   case 'event.delete':{const owner=session.tracks.flatMap(t=>t.regions).find(r=>r.events.some(e=>e.id===target));need(owner,'MIDI event');owner.events=owner.events.filter(e=>e.id!==target);break;}
   case 'note.add':need(r,'Region');if(owner.kind!=='midi')throw Error('Choose a MIDI region.');r.notes.push(note.parse({id:crypto.randomUUID(),pitch:60,start:0,duration:.5,velocity:.8,...pick(v,['id','pitch','start','duration','velocity','channel'])}));break;
   case 'note.set':Object.assign(need(n,'Note'),pick(v,['pitch','start','duration','velocity','channel']));break;
   case 'note.delete':need(n,'Note');noteRegion.notes=noteRegion.notes.filter(x=>x!==n);break;
   case 'notes.quantize':need(r,'Region');pick(v,['grid']);if(!Number.isFinite(v.grid)||v.grid<=0)throw Error('Grid must be positive seconds.');for(const n of r.notes)n.start=Math.round(n.start/v.grid)*v.grid;break;
   case 'notes.transpose':need(r,'Region');pick(v,['semitones']);if(!Number.isInteger(v.semitones))throw Error('Enter whole semitones.');for(const n of r.notes)n.pitch+=v.semitones;break;
   case 'effect.add':need(t,'Track');t.effects.push(effectSchema.parse({id:crypto.randomUUID(),...v}));break;
   case 'effect.set':{const e=session.tracks.flatMap(t=>t.effects).find(e=>e.id===target);need(e,'Effect');Object.assign(e,effectSchema.parse({...e,...pick(v,Object.keys(e).filter(k=>!['id','kind'].includes(k)))}));break;}
   case 'effect.delete':{const track=session.tracks.find(t=>t.effects.some(e=>e.id===target));need(track,'Effect');track.effects=track.effects.filter(e=>e.id!==target);break;}
   case 'effect.move':{const track=session.tracks.find(t=>t.effects.some(e=>e.id===target));need(track,'Effect');pick(v,['index']);if(!Number.isInteger(v.index)||v.index<0||v.index>=track.effects.length)throw Error('Effect index outside chain.');const [effect]=track.effects.splice(track.effects.findIndex(e=>e.id===target),1);track.effects.splice(v.index,0,effect);break;}
   case 'automation.point':{need(t,'Track');const point=automationSchema.parse({id:crypto.randomUUID(),...pick(v,['id','parameter','time','value'])});const previous=t.automation.find(p=>p.parameter===point.parameter&&p.time===point.time);if(previous)previous.value=point.value;else t.automation.push(point);break;}
   case 'automation.delete':{const track=session.tracks.find(t=>t.automation.some(p=>p.id===target));need(track,'Automation point');track.automation=track.automation.filter(p=>p.id!==target);break;}
   case 'automation.clear':need(t,'Track');pick(v,['parameter']);if(!['gainDb','pan'].includes(v.parameter))throw Error('Unknown automation parameter.');t.automation=t.automation.filter(p=>p.parameter!==v.parameter);break;
   case 'marker.add':session.markers.push({id:crypto.randomUUID(),name:'Marker',...pick(v,['name','time'])});break;
   case 'marker.delete':if(!session.markers.some(m=>m.id===target))throw Error('Marker not found.');session.markers=session.markers.filter(m=>m.id!==target);break;
  }
 }
 session.revision++;sessionSchema.parse(session);validateRouting(session);
 const ids=[session.id,...session.tracks.flatMap(t=>[t.id,...t.effects.map(e=>e.id),...t.automation.map(p=>p.id),...t.regions.flatMap(r=>[r.id,...r.notes.map(n=>n.id),...r.events.map(e=>e.id)])]),...session.markers.map(m=>m.id)];if(new Set(ids).size!==ids.length)throw Error('IDs must be unique.');
 for(const t of session.tracks)for(const r of t.regions){if(r.fadeIn+r.fadeOut>r.duration)throw Error('Fades must fit inside the region.');for(const e of r.events)if(e.start>r.duration+.001)throw Error('MIDI events must fit inside their region.');for(const n of r.notes)if(n.start+n.duration>r.duration+.001)throw Error('Notes must fit inside their region.');}
 return session;
}
export class SessionHistory{
 constructor(session=newSession()){this.session=sessionSchema.parse(session);validateRouting(this.session);this.past=[];this.future=[];}
 execute(commands,revision=this.session.revision){const next=applyCommands(this.session,commands,revision);this.past.push(this.session);if(this.past.length>100)this.past.shift();this.future=[];this.session=next;return next;}
 undo(){if(!this.past.length)return;this.future.push(this.session);this.session={...this.past.pop(),revision:this.session.revision+1};}
 redo(){if(!this.future.length)return;this.past.push(this.session);this.session={...this.future.pop(),revision:this.session.revision+1};}
}
