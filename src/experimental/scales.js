import {z} from 'zod';
import {selectedMidiNotes} from './note-selection.js';
export const scales=[['major','Major',[0,2,4,5,7,9,11]],['minor','Natural minor',[0,2,3,5,7,8,10]],['harmonicMinor','Harmonic minor',[0,2,3,5,7,8,11]],['dorian','Dorian',[0,2,3,5,7,9,10]],['phrygian','Phrygian',[0,1,3,5,7,8,10]],['lydian','Lydian',[0,2,4,6,7,9,11]],['mixolydian','Mixolydian',[0,2,4,5,7,9,10]],['locrian','Locrian',[0,1,3,5,6,8,10]],['majorPentatonic','Major pentatonic',[0,2,4,7,9]],['minorPentatonic','Minor pentatonic',[0,3,5,7,10]],['chromatic','Chromatic',[0,1,2,3,4,5,6,7,8,9,10,11]]];
const options=z.object({root:z.number().int().min(0).max(11),scale:z.enum(scales.map(([id])=>id)),direction:z.enum(['nearest','up','down']).default('nearest'),tie:z.enum(['down','up']).default('down'),noteId:z.string().optional(),noteIds:z.string().max(2020000).optional()}).strict();
export function scalePitchClasses(root,scale){const parsed=options.parse({root,scale});return new Set(scales.find(([id])=>id===parsed.scale)[2].map(interval=>(interval+root)%12));}
export function scaleNoteEdits(region,values){
 const v=options.parse(values),classes=scalePitchClasses(v.root,v.scale),allowed=Array.from({length:128},(_,i)=>i).filter(p=>classes.has(p%12));
 return selectedMidiNotes(region,v).map(note=>{const candidates=allowed.filter(p=>v.direction==='nearest'||(v.direction==='up'?p>=note.pitch:p<=note.pitch));if(!candidates.length)throw Error('No scale pitch is available in that direction within MIDI 0–127. Choose Nearest or the other direction.');let pitch=candidates[0];for(const p of candidates){const distance=Math.abs(p-note.pitch),best=Math.abs(pitch-note.pitch);if(distance<best||(distance===best&&(v.tie==='up'?p>pitch:p<pitch)))pitch=p;}return {id:note.id,pitch};});
}
