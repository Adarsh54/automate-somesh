import {selectedMidiNotes} from './note-selection.js';
import {z} from 'zod';

const noteId=z.string().min(1).max(100).optional();
const quantizeOptions=z.object({
 grid:z.number().finite().min(.0001).max(60),
 strength:z.number().min(0).max(1).default(1),
 swing:z.number().min(0).max(.75).default(0),noteId,noteIds:z.string().max(2020000).optional(),
}).strict();
const humanizeOptions=z.object({
 timing:z.number().min(0).max(1).default(0),
 duration:z.number().min(0).max(1).default(0),
 velocity:z.number().min(0).max(1).default(0),
 seed:z.number().int().min(0).max(0xffffffff),noteId,noteIds:z.string().max(2020000).optional(),
}).strict();
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
// A pair contains an on-beat and a delayed off-beat. Search adjacent pairs so
// the closest swung point is chosen, including at pair boundaries.
export function quantizeNotes(region,values) {
 const {grid,strength,swing,noteId,noteIds}=quantizeOptions.parse(values);
 for(const note of selectedMidiNotes(region,{noteId,noteIds})) {
  const pair=Math.floor(note.start/(2*grid)),points=[];
  for(let p=Math.max(0,pair-1);p<=pair+1;p++)points.push(p*2*grid,(p*2+1+swing)*grid);
  const target=points.reduce((best,point)=>Math.abs(point-note.start)<=Math.abs(best-note.start)?point:best);
  if(strength>0)note.start=clamp(note.start+(target-note.start)*strength,0,Math.max(0,region.duration-note.duration));
 }
}

// Hash note IDs independently: reordered notes or a single-note scope yield the
// same variation for the same seed, on both server validation and browser apply.
function signedRandom(seed,id,parameter) {
 let hash=2166136261;
 for(const char of `${seed}:${id}:${parameter}`){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
 hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;
 hash=Math.imul(hash,0x846ca68b);hash^=hash>>>16;
 return (hash>>>0)/0xffffffff*2-1;
}
export function humanizeNotes(region,values) {
 const {timing,duration,velocity,seed,noteId,noteIds}=humanizeOptions.parse(values);
 for(const note of selectedMidiNotes(region,{noteId,noteIds})) {
  if(timing>0)note.start=clamp(note.start+signedRandom(seed,note.id,'start')*timing,0,Math.max(0,region.duration-note.duration));
  if(duration>0)note.duration=clamp(note.duration+signedRandom(seed,note.id,'duration')*duration,Math.min(.001,note.duration),Math.min(3600,region.duration-note.start));
  // Preserve intentional silent notes and avoid turning sounding notes off.
  if(velocity>0&&note.velocity>0)note.velocity=clamp(note.velocity+signedRandom(seed,note.id,'velocity')*velocity,Math.min(note.velocity,1/127),1);
 }
}
