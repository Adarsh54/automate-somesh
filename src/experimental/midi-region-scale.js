import {z} from 'zod';
const options=z.object({factor:z.number().finite().min(1/16).max(16)}).strict();
export function scaledMidiRegion(region,values){
 const {factor}=options.parse(values),duration=region.duration*factor;
 if(!Number.isFinite(duration)||duration>86400)throw Error('Scaled region exceeds the 86,400-second limit.');
 const notes=region.notes.map(n=>({...n,start:n.start*factor,duration:n.duration*factor}));
 if(notes.some(n=>n.duration>3600||n.duration<=0||n.start>86400))throw Error('Scaled notes exceed the supported time or length limits.');
 const events=(region.events||[]).map(e=>({...e,start:e.start*factor}));
 if(events.some(e=>e.start>86400))throw Error('Scaled controller events exceed the supported time limit.');
 const fadeIn=Math.min(duration,region.fadeIn*factor),fadeOut=Math.min(region.fadeOut*factor,Math.max(0,duration-fadeIn));
 return {duration,fadeIn,fadeOut,notes,events};
}
export function midiRegionScaleView(region){return `<form data-midi-region-scale><h4>Stretch MIDI region</h4><p class="muted">Retimes all notes and controller events together, including sustain and expression. Fades and the region boundary scale too. Timeline start, pitch, tempo, track automation and neighboring regions stay unchanged.</p><label>New length · seconds<input name="duration" type="number" min="${region.duration/16}" max="${Math.min(86400,region.duration*16)}" step="any" value="${region.duration}" required></label><div class="button-row"><button type="button" data-region-scale="0.5">Half length</button><button type="button" data-region-scale="2">Double length</button></div><output data-region-scale-preview></output><button type="submit">Stretch region</button></form>`;}
export function bindMidiRegionScale(root,{region,execute,guard}){
 const form=root.querySelector('[data-midi-region-scale]');if(!form||!region)return;const submit=form.querySelector('[type=submit]');
 const update=()=>{try{const value=form.elements.duration.value;if(value==='')throw Error('Enter the new region length.');const duration=Number(value),factor=duration/region.duration;if(!Number.isFinite(factor)||factor<1/16||factor>16)throw Error('Choose between 1/16 and 16 times the current region length.');const plan=scaledMidiRegion(region,{factor});root.querySelector('[data-region-scale-preview]').textContent=`${plan.notes.length} note${plan.notes.length===1?'':'s'} and ${plan.events.length} controller event${plan.events.length===1?'':'s'} · ${factor.toFixed(3)}× current length.`;submit.disabled=Math.abs(factor-1)<1e-9;return factor;}catch(e){root.querySelector('[data-region-scale-preview]').textContent=e.message;submit.disabled=true;}};
 form.oninput=update;form.querySelectorAll('[data-region-scale]').forEach(button=>button.onclick=()=>{form.elements.duration.value=region.duration*Number(button.dataset.regionScale);update();});form.onsubmit=guard(e=>{e.preventDefault();const factor=update();if(!submit.disabled)execute([{op:'region.timeScale',target:region.id,values:{factor}}],'Stretched MIDI region and controller timing');});update();
}
