import {readMidi,decodeMidiImport} from './midi.js';
import {quantizeNotes,humanizeNotes} from './note-transforms.js';
import {frameRates} from './timecode.js';
import {midiEventSchema,chasedEvents} from './midi-events.js';
import {validateRouting} from './routing.js';
import {trimmedRegion} from './region-edit.js';
import {effectSchema,automationSchema} from './effects.js';
import {z} from 'zod';
const ident=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),time=z.number().finite().min(0).max(86400),db=z.number().finite().min(-96).max(12);
const note=z.object({id:ident,channel:z.number().int().min(0).max(15).default(0),pitch:z.number().int().min(0).max(127),start:time,duration:z.number().positive().max(3600),velocity:z.number().min(0).max(1)});
const region=z.object({id:ident,name:z.string().max(200),assetId:ident.nullable(),start:time,offset:time,duration:z.number().positive().max(86400),gainDb:db,fadeIn:time,fadeOut:time,reverse:z.boolean(),notes:z.array(note).max(20000),events:z.array(midiEventSchema).max(20000).default([])});
const track=z.object({id:ident,name:z.string().max(200),kind:z.enum(['audio','midi','video','bus']),gainDb:db,pan:z.number().min(-1).max(1),mute:z.boolean(),solo:z.boolean(),instrument:z.enum(['sine','triangle','square','sawtooth','drumKit']),regions:z.array(region).max(1000),output:ident.nullable().default(null),sends:z.array(z.object({busId:ident,gainDb:db,tap:z.enum(['preFader','postFader','postPan']).default('postPan'),automation:z.array(automationSchema.refine(p=>p.parameter==='gainDb','Send automation supports gain only.')).max(2000).default([])})).max(16).default([]),effects:z.array(effectSchema).max(16).default([]),automation:z.array(automationSchema).max(2000).default([])});
export const sessionSchema=z.object({version:z.literal(1),id:ident,title:z.string().max(200),revision:z.number().int().nonnegative(),tempo:z.number().min(20).max(300),meter:z.number().int().min(1).max(16),masterDb:db,masterPan:z.number().min(-1).max(1).default(0),masterAutomation:z.array(automationSchema).max(2000).default([]),masterEffects:z.array(effectSchema).max(16).default([]),loopEnabled:z.boolean().default(false),loopStart:time.default(0),loopEnd:time.default(4),frameRate:z.number().refine(value=>frameRates.includes(value),'Unsupported frame rate.').default(24),tracks:z.array(track).max(128),markers:z.array(z.object({id:ident,name:z.string().max(200),time})).max(1000)});
export const newSession=()=>({version:1,id:crypto.randomUUID(),title:'Untitled session',revision:0,tempo:120,meter:4,masterDb:0,masterPan:0,masterAutomation:[],masterEffects:[],tracks:[],markers:[]});
export const operations=['midi.import','session.set','track.add','track.set','track.delete','send.set','send.delete','send.automation.point','send.automation.clear','region.add','region.extractAudio','region.trim','region.set','region.delete','region.split','region.duplicate','event.add','event.set','event.delete','note.add','note.set','note.delete','notes.quantize','notes.humanize','notes.transpose','marker.add','marker.delete','effect.add','effect.set','effect.delete','effect.move','automation.point','automation.set','automation.delete','automation.clear'];
export const commandSchema=z.object({op:z.enum(operations),target:z.string().max(100).optional(),values:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({})}).strict();
export const batchSchema=z.array(commandSchema).min(1).max(100);
const pick=(values,allowed)=>{for(const key of Object.keys(values))if(!allowed.includes(key))throw Error(`Unsupported field: ${key}`);return values;};
export function applyCommands(input,commands,expectedRevision=input.revision){
 const session=sessionSchema.parse(structuredClone(input));if(session.revision!==expectedRevision)throw Error('The session changed. Run the instruction again.');
 for(const {op,target,values:v} of batchSchema.parse(commands)){
  const t=session.tracks.find(t=>t.id===target),owner=session.tracks.find(t=>t.regions.some(r=>r.id===target)),r=owner?.regions.find(r=>r.id===target);
  const noteRegion=session.tracks.flatMap(t=>t.regions).find(r=>r.notes.some(n=>n.id===target)),n=noteRegion?.notes.find(n=>n.id===target);
  const effectChains=[session.masterEffects,...session.tracks.map(t=>t.effects)],automationChains=[session.masterAutomation,...session.tracks.flatMap(t=>[t.automation,...t.sends.map(s=>s.automation)])];
  const need=(entity,label)=>{if(!entity)throw Error(`${label} not found: ${target}`);return entity;};
  switch(op){
   case 'midi.import':{
    pick(v,['data','start']);const start=time.parse(v.start??0),midi=readMidi(decodeMidiImport(v.data));
    if(!midi.tracks.length)throw Error('This MIDI file has no notes or channel events to import.');
    if(session.tracks.length+midi.tracks.length>128)throw Error('Import would exceed the 128-track session limit.');
    const imported=midi.tracks.map(source=>{
     if(source.notes.length>20000||source.events.length>20000)throw Error('Each imported MIDI track supports up to 20,000 notes and 20,000 channel events.');
     const duration=Math.max(.1,...source.notes.map(n=>n.start+n.duration),...source.events.map(e=>e.start+.001));
     return track.parse({id:crypto.randomUUID(),name:source.name.slice(0,200),kind:'midi',gainDb:0,pan:0,mute:false,solo:false,instrument:'triangle',
      regions:[{id:crypto.randomUUID(),name:source.name.slice(0,200),assetId:null,start,offset:0,duration,gainDb:0,fadeIn:0,fadeOut:0,reverse:false,notes:source.notes,events:source.events}],
     });
    });
    session.tracks.push(...imported);break;
   }
   case 'session.set':{const previousTempo=session.tempo;Object.assign(session,pick(v,['title','tempo','meter','masterDb','masterPan','frameRate','loopEnabled','loopStart','loopEnd']));if(v.tempo!==undefined){const ratio=previousTempo/v.tempo;for(const t of session.tracks.filter(t=>t.kind==='midi'))for(const r of t.regions){r.start*=ratio;r.duration*=ratio;r.fadeIn*=ratio;r.fadeOut*=ratio;for(const n of r.notes){n.start*=ratio;n.duration*=ratio;}for(const e of r.events)e.start*=ratio;}}break;}
   case 'track.add':session.tracks.push(track.parse({id:crypto.randomUUID(),name:'New track',kind:'audio',gainDb:0,pan:0,mute:false,solo:false,instrument:'triangle',regions:[],...pick(v,['id','name','kind','instrument'])}));break;
   case 'track.set':Object.assign(need(t,'Track'),pick(v,['name','gainDb','pan','mute','solo','instrument','output']));break;
   case 'track.delete':need(t,'Track');session.tracks=session.tracks.filter(x=>x!==t);for(const other of session.tracks){if(other.output===target)other.output=null;other.sends=other.sends.filter(s=>s.busId!==target);}break;
   case 'send.set':{need(t,'Track');pick(v,['busId','gainDb','tap']);const send=t.sends.find(s=>s.busId===v.busId);if(send){if(v.gainDb!==undefined)send.gainDb=v.gainDb;if(v.tap!==undefined)send.tap=v.tap;}else t.sends.push({busId:v.busId,gainDb:v.gainDb,tap:v.tap===undefined?'postPan':v.tap,automation:[]});break;}
   case 'send.automation.point':{need(t,'Track');pick(v,['busId','id','time','value']);const send=need(t.sends.find(s=>s.busId===v.busId),'Send');const point=automationSchema.parse({id:v.id??crypto.randomUUID(),parameter:'gainDb',time:v.time,value:v.value});const previous=send.automation.find(p=>p.time===point.time);if(previous)previous.value=point.value;else send.automation.push(point);break;}
   case 'send.automation.clear':{need(t,'Track');pick(v,['busId']);const send=need(t.sends.find(s=>s.busId===v.busId),'Send');send.automation=[];break;}
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
   case 'notes.quantize':need(r,'Region');if(owner.kind!=='midi')throw Error('Choose a MIDI region.');quantizeNotes(r,v);break;
   case 'notes.humanize':need(r,'Region');if(owner.kind!=='midi')throw Error('Choose a MIDI region.');humanizeNotes(r,v);break;
   case 'notes.transpose':need(r,'Region');pick(v,['semitones']);if(!Number.isInteger(v.semitones))throw Error('Enter whole semitones.');for(const n of r.notes)n.pitch+=v.semitones;break;
   case 'effect.add':(target===session.id?session.masterEffects:need(t,'Track').effects).push(effectSchema.parse({id:crypto.randomUUID(),...v}));break;
   case 'effect.set':{const e=effectChains.flat().find(e=>e.id===target);need(e,'Effect');Object.assign(e,effectSchema.parse({...e,...pick(v,Object.keys(e).filter(k=>!['id','kind'].includes(k)))}));break;}
   case 'effect.delete':{const chain=effectChains.find(effects=>effects.some(e=>e.id===target));need(chain,'Effect');chain.splice(chain.findIndex(e=>e.id===target),1);break;}
   case 'effect.move':{const chain=effectChains.find(effects=>effects.some(e=>e.id===target));need(chain,'Effect');pick(v,['index']);if(!Number.isInteger(v.index)||v.index<0||v.index>=chain.length)throw Error('Effect index outside chain.');const [effect]=chain.splice(chain.findIndex(e=>e.id===target),1);chain.splice(v.index,0,effect);break;}
   case 'automation.point':{const points=target===session.id?session.masterAutomation:need(t,'Track').automation;const point=automationSchema.parse({id:crypto.randomUUID(),...pick(v,['id','parameter','time','value'])});const previous=points.find(p=>p.parameter===point.parameter&&p.time===point.time);if(previous)previous.value=point.value;else points.push(point);break;}
   case 'automation.set':{const points=automationChains.find(points=>points.some(p=>p.id===target));need(points,'Automation point');const current=points.find(p=>p.id===target),next=automationSchema.parse({...current,...pick(v,['time','value'])});if(points.some(p=>p.id!==target&&p.parameter===next.parameter&&p.time===next.time))throw Error('An automation point already exists at this time.');Object.assign(current,next);break;}
   case 'automation.delete':{const points=automationChains.find(points=>points.some(p=>p.id===target));need(points,'Automation point');points.splice(points.findIndex(p=>p.id===target),1);break;}
   case 'automation.clear':{const points=target===session.id?session.masterAutomation:need(t,'Track').automation;pick(v,['parameter']);if(!['gainDb','pan'].includes(v.parameter))throw Error('Unknown automation parameter.');for(let i=points.length-1;i>=0;i--)if(points[i].parameter===v.parameter)points.splice(i,1);break;}
   case 'marker.add':session.markers.push({id:crypto.randomUUID(),name:'Marker',...pick(v,['name','time'])});break;
   case 'marker.delete':if(!session.markers.some(m=>m.id===target))throw Error('Marker not found.');session.markers=session.markers.filter(m=>m.id!==target);break;
  }
 }
 session.revision++;sessionSchema.parse(session);if(session.loopEnd<=session.loopStart)throw Error('Cycle end must follow its start.');validateRouting(session);
 const ids=[session.id,...session.masterAutomation.map(p=>p.id),...session.masterEffects.map(e=>e.id),...session.tracks.flatMap(t=>[t.id,...t.effects.map(e=>e.id),...t.automation.map(p=>p.id),...t.sends.flatMap(s=>s.automation.map(p=>p.id)),...t.regions.flatMap(r=>[r.id,...r.notes.map(n=>n.id),...r.events.map(e=>e.id)])]),...session.markers.map(m=>m.id)];if(new Set(ids).size!==ids.length)throw Error('IDs must be unique.');
 for(const t of session.tracks)for(const r of t.regions){if(r.fadeIn+r.fadeOut>r.duration)throw Error('Fades must fit inside the region.');for(const e of r.events)if(e.start>r.duration+.001)throw Error('MIDI events must fit inside their region.');for(const n of r.notes)if(n.start+n.duration>r.duration+.001)throw Error('Notes must fit inside their region.');}
 return session;
}
export class SessionHistory{
 constructor(session=newSession()){this.session=sessionSchema.parse(session);validateRouting(this.session);this.past=[];this.future=[];}
 execute(commands,revision=this.session.revision){const next=applyCommands(this.session,commands,revision);this.past.push(this.session);if(this.past.length>100)this.past.shift();this.future=[];this.session=next;return next;}
 undo(){if(!this.past.length)return;this.future.push(this.session);this.session={...this.past.pop(),revision:this.session.revision+1};}
 redo(){if(!this.future.length)return;this.past.push(this.session);this.session={...this.future.pop(),revision:this.session.revision+1};}
}
