import {z} from 'zod';
import {selectedMidiNotes} from './note-selection.js';
const options=z.object({bounds:z.enum(['phrase','region']).default('phrase'),noteId:z.string().optional(),noteIds:z.string().max(2020000).optional()}).strict();
// Mirror complete note intervals, rather than just their onsets. Repeating the
// operation restores the original phrase, including unequal lengths and gaps.
export function reverseNoteEdits(region,values={}){
 const v=options.parse(values),notes=selectedMidiNotes(region,v);
 if(!notes.length)throw Error('Add or select notes to reverse.');
 const start=v.bounds==='region'?0:Math.min(...notes.map(n=>n.start)),end=v.bounds==='region'?region.duration:Math.max(...notes.map(n=>n.start+n.duration));
 return notes.map(n=>{const reversed=start+(end-(n.start+n.duration));if(reversed<-1e-9||reversed+n.duration>region.duration+1e-9)throw Error('Reversed notes must fit inside the region.');return {id:n.id,start:Math.max(0,reversed)};});
}
const state=settings=>settings.reverseTools??={scope:'region',bounds:'phrase'};
export function reverseNotesView(settings){const s=state(settings);return `<details class="daw-reverse-tools"><summary>Reverse note timing</summary><form data-reverse-form class="button-row"><label>Apply to<select name="scope"><option value="region" ${s.scope==='region'?'selected':''}>All notes in region</option><option value="selected" ${s.scope==='selected'?'selected':''}>Selected notes</option></select></label><label>Reverse within<select name="bounds"><option value="phrase" ${s.bounds==='phrase'?'selected':''}>Phrase bounds</option><option value="region" ${s.bounds==='region'?'selected':''}>Entire region</option></select></label><button>Reverse notes</button></form><output data-reverse-preview></output><p class="muted">Mirrors note starts and ends within the phrase or region. Pitches, lengths, velocities and channels stay unchanged. Controller events and instrument envelopes are not reversed.</p></details>`;}
export function bindReverseNotes(root,{region,settings,execute,guard}){
 const form=root.querySelector('[data-reverse-form]');if(!form)return;const s=state(settings);
 const values=()=>({bounds:s.bounds,...(s.scope==='selected'?{noteIds:(settings.selectedIds||[]).join(',')}:{})});
 const update=()=>{s.scope=form.elements.scope.value;s.bounds=form.elements.bounds.value;try{if(s.scope==='selected'&&!settings.selectedIds?.length)throw Error('Select notes in the piano roll first.');const edits=reverseNoteEdits(region,values()),original=new Map(region.notes.map(n=>[n.id,n.start])),changed=edits.filter(e=>Math.abs(e.start-original.get(e.id))>1e-9).length;root.querySelector('[data-reverse-preview]').textContent=`${changed} of ${edits.length} notes will move.`;form.querySelector('button').disabled=!changed;}catch(e){root.querySelector('[data-reverse-preview]').textContent=e.message;form.querySelector('button').disabled=true;}};
 form.onchange=update;form.onsubmit=guard(e=>{e.preventDefault();update();if(!form.querySelector('button').disabled)execute([{op:'notes.reverse',target:region.id,values:values()}],'Reversed MIDI note timing');});update();
}
