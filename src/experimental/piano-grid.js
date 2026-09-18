export const pianoSnapOptions=[[0,'Off'],[1,'1/4'],[.5,'1/8'],[.25,'1/16'],[.125,'1/32'],[1/3,'1/8 triplet'],[1/6,'1/16 triplet']];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function snapTime(value,step,{floor=false}={}){
 if(!step)return value;
 return (floor?Math.floor(value/step+1e-9):Math.round(value/step))*step;
}
export function notePlacement(time,regionDuration,step,defaultDuration){
 const start=snapTime(Math.max(0,time),step,{floor:true});
 if(start>=regionDuration)return null;
 return {start,duration:Math.min(step||defaultDuration,regionDuration-start)};
}
export function noteDrag(note,{seconds,semitones=0,step=0,resize=false,regionDuration}){
 const shift=snapTime(seconds,step);
 if(resize)return {duration:clamp(note.duration+shift,Math.min(step||.001,regionDuration-note.start),Math.min(3600,regionDuration-note.start))};
 return {start:clamp(note.start+shift,0,regionDuration-note.duration),pitch:clamp(note.pitch+Math.round(semitones),0,127)};
}
export function applyPianoGrid(root,beat,snap){
 const grid=root.querySelector('.daw-note-grid');if(!grid)return;
 grid.style.setProperty('--piano-snap-width',`${snap?beat*snap*80:1}px`);
 grid.style.setProperty('--piano-grid-color',snap?'var(--line)':'transparent');
}
