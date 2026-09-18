export const defaultNoteTools={scope:'region',grid:.25,strength:100,swing:0,timing:10,duration:0,velocity:5,seed:42};
export function noteToolsView(settings,hasSelection) {
 const number=(name,label,min,max,step=1)=>`<label>${label}<input name="${name}" data-note-tool="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${settings[name]}" required></label>`;
 return `<details class="daw-note-tools"><summary>Timing &amp; feel</summary><label class="daw-note-scope">Apply to<select data-note-tool="scope"><option value="region" ${settings.scope==='region'?'selected':''}>All notes in region</option><option value="selected" ${settings.scope==='selected'?'selected':''}>Selected note${hasSelection?'':' (select a note first)'}</option></select></label><div class="daw-note-tool-forms"><form data-note-quantize><h4>Quantize</h4><label>Grid<select name="grid" data-note-tool="grid">${[[1,'1/4'],[.5,'1/8'],[.25,'1/16'],[.125,'1/32'],[1/3,'1/8 triplet'],[1/6,'1/16 triplet']].map(([grid,label])=>`<option value="${grid}" ${settings.grid===grid?'selected':''}>${label}</option>`).join('')}</select></label>${number('strength','Strength · %',0,100)}${number('swing','Swing delay · %',0,75)}<button type="submit">Apply quantize</button></form><form data-note-humanize><h4>Humanize</h4>${number('timing','Timing · ± ms',0,1000)}${number('duration','Length · ± ms',0,1000)}${number('velocity','Velocity · ± MIDI steps',0,127)}${number('seed','Variation seed',0,4294967295)}<button type="submit">Apply humanize</button></form></div><p class="muted">Quantize moves note starts toward the grid; swing delays alternate grid points. Humanize varies timing, length and velocity without changing pitches. Notes stay inside the region. Undo before trying another variation to compare from the same starting point.</p></details>`;
}
export function bindNoteTools(root,{region,tempo,selected,settings,execute,guard}) {
 root.querySelectorAll('[data-note-tool]').forEach(el=>el.addEventListener('change',()=>{
  const key=el.dataset.noteTool;if(key==='scope')settings.scope=el.value;
  else if(el.validity.valid)settings[key]=Number(el.value);
 }));
 const scope=()=>{if(settings.scope==='region')return {};if(!region.notes.some(n=>n.id===selected))throw Error('Select a note first, or choose all notes in region.');return {noteId:selected};};
 root.querySelector('[data-note-quantize]')?.addEventListener('submit',guard(e=>{
  e.preventDefault();const f=e.currentTarget.elements;
  execute([{op:'notes.quantize',target:region.id,values:{...scope(),grid:Number(f.grid.value)*60/tempo,strength:Number(f.strength.value)/100,swing:Number(f.swing.value)/100}}],'Quantized MIDI notes');
 }));
 root.querySelector('[data-note-humanize]')?.addEventListener('submit',guard(e=>{
  e.preventDefault();const f=e.currentTarget.elements;
  execute([{op:'notes.humanize',target:region.id,values:{...scope(),timing:Number(f.timing.value)/1000,duration:Number(f.duration.value)/1000,velocity:Number(f.velocity.value)/127,seed:Number(f.seed.value)}}],'Humanized MIDI notes');
 }));
}
