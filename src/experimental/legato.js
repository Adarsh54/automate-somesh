import {z} from 'zod';
import {selectedMidiNotes} from './note-selection.js';
const options=z.object({mode:z.enum(['legato','shorten']).default('legato'),gap:z.number().finite().min(-10).max(10).default(0),following:z.enum(['all','selected']).default('all'),match:z.enum(['channel','pitch']).default('channel'),last:z.enum(['keep','regionEnd']).default('keep'),noteId:z.string().optional(),noteIds:z.string().max(2020000).optional()}).strict();
// Return an edit plan without mutating notes, so invalid selections or gaps roll
// back the entire operation. Search sorted onset groups rather than every pair.
export function legatoEdits(region,values={}){
 const v=options.parse(values),selected=selectedMidiNotes(region,v),candidates=v.following==='selected'?selected:region.notes,buckets=new Map();
 const key=n=>(n.channel||0)+(v.match==='pitch'?':'+n.pitch:'');
 for(const n of candidates){const k=key(n);if(!buckets.has(k))buckets.set(k,new Set());buckets.get(k).add(n.start);}
 const onsets=new Map([...buckets].map(([k,times])=>[k,[...times].sort((a,b)=>a-b)]));
 return selected.map(note=>{
  const times=onsets.get(key(note))||[];let lo=0,hi=times.length;while(lo<hi){const mid=(lo+hi)>>1;if(times[mid]<=note.start)lo=mid+1;else hi=mid;}
  if(lo===times.length&&v.last==='keep')return {id:note.id,duration:note.duration};
  const end=lo===times.length?region.duration:Math.min(region.duration,times[lo]-v.gap),length=end-note.start;
  if(length<=0)throw Error('The gap would make a note zero-length or negative. Use a smaller gap.');
  const duration=v.mode==='shorten'?Math.min(note.duration,length):length;
  if(duration>3600)throw Error('A note cannot exceed 3,600 seconds. Choose a closer following note.');
  return {id:note.id,duration};
 });
}
