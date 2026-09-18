import {audibleSources,stemGroups,stemSession,routedTail} from './routing.js';
import {sessionDuration} from './audio-engine.js';
import {effectTail} from './effects.js';
const filename=name=>name.replace(/[^a-z0-9 _-]/gi,'').slice(0,80)||'region';
// Capture the complete document before any asynchronous decoding/rendering.
export function createBouncePlan(input,{mode='mix',stemMode='tracks',regionId}={}){
 const session=structuredClone(input);let position=0,duration=sessionDuration(session),entries,zip=false;
 if(mode==='mix')entries=[{name:session.title+'.wav',document:session}];
 else if(mode==='stems'){
  zip=true;entries=stemGroups(session,stemMode).map((group,i)=>({name:`${String(i+1).padStart(2,'0')}-${filename(group.name)}.wav`,document:group.document}));
  if(!entries.length)throw Error('Add unmuted tracks before bouncing stems.');
 }else if(mode==='region'){
  const track=session.tracks.find(t=>t.regions.some(r=>r.id===regionId)),region=track?.regions.find(r=>r.id===regionId);
  if(!region||!['audio','midi'].includes(track.kind))throw Error('Select an audio or MIDI region to bounce. Extract movie audio first for video regions.');
  position=region.start;duration=region.duration+routedTail(session,track)+effectTail(session.masterEffects);
  entries=[{name:session.title+'-'+filename(region.name)+'.wav',document:stemSession(session,{...track,regions:[region]})}];
 }else throw Error('Unknown bounce mode.');
 if(duration>600)throw Error('Experimental offline bounce currently supports up to 10 minutes.');
 const assets=new Set(entries.flatMap(entry=>audibleSources(entry.document).filter(t=>t.kind==='audio').flatMap(t=>t.regions.map(r=>r.assetId))));
 return {title:session.title,position,duration,entries,zip,assets:[...assets]};
}
