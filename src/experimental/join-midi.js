import {z} from 'zod';
const options=z.object({regionIds:z.string().min(1).max(101000)}).strict();
export function joinedMidiRegion(track,target,values){
 if(track?.kind!=='midi')throw Error('Join requires MIDI regions on the same track.');
 const v=options.parse(values),ids=[target,...v.regionIds.split(',')];
 if(ids.length>1000||ids.some(id=>!id)||new Set(ids).size!==ids.length)throw Error('Choose distinct additional regions, excluding the selected region.');
 const wanted=new Set(ids),regions=track.regions.filter(r=>wanted.has(r.id));
 if(regions.length!==ids.length)throw Error('Every joined region must belong to this MIDI track.');
 const anchor=regions.find(r=>r.id===target),start=Math.min(...regions.map(r=>r.start)),end=Math.max(...regions.map(r=>r.start+r.duration)),duration=end-start;
 if(duration>86400)throw Error('The joined region exceeds the 86,400-second limit.');
 const noteCount=regions.reduce((n,r)=>n+r.notes.length,0),eventCount=regions.reduce((n,r)=>n+r.events.length,0);
 if(noteCount>20000||eventCount>20000)throw Error('The joined region can contain at most 20,000 notes and 20,000 MIDI events.');
 // Stable chronological ordering: later-starting source regions win equal-time
 // controller ties. Original note/event IDs survive; only region-relative time changes.
 const ordered=[...regions].sort((a,b)=>a.start-b.start);
 const merge=key=>ordered.flatMap(r=>r[key].map(item=>({...item,start:r.start-start+item.start}))).sort((a,b)=>a.start-b.start);
 const region={...anchor,start,duration,offset:0,assetId:null,reverse:false,notes:merge('notes'),events:merge('events')};
 const changedSettings=regions.some(r=>['gainDb','mute','fadeIn','fadeOut','fadeInShape','fadeOutShape'].some(k=>r[k]!==anchor[k]));
 return {region,ids,changedSettings,hasEvents:eventCount>0};
}
export function joinMidiView(track,region,esc){
 if(track?.kind!=='midi'||!region)return '';
 const others=track.regions.filter(r=>r.id!==region.id).sort((a,b)=>a.start-b.start);
 return `<details class="daw-join-midi"><summary>Join MIDI regions</summary><form data-join-midi><p class="muted">Join other regions on this track into ${esc(region.name)}. Notes and events keep their timeline positions. Gaps become empty space inside the joined region.</p><div class="daw-join-options">${others.map(r=>`<label><input type="checkbox" name="regionIds" value="${esc(r.id)}"><span>${esc(r.name)} <small>${r.start.toFixed(2)}–${(r.start+r.duration).toFixed(2)} s · ${r.notes.length} note${r.notes.length===1?'':'s'}</small></span></label>`).join('')||'<p class="muted">Add another MIDI region on this track to join it.</p>'}</div><div class="button-row"><button type="button" data-join-all ${others.length?'':'disabled'}>Select all</button><button type="button" data-join-clear ${others.length?'':'disabled'}>Clear</button></div><output data-join-preview></output><p class="muted">Uses the selected region’s name, gain, mute and fades over the combined length. Source regions become one editable MIDI region. Controller events share channel state after joining, which can change how notes sound. Undo restores the separate regions.</p><button type="submit">Join regions</button></form></details>`;
}
export function bindJoinMidi(root,{track,region,execute,guard}){
 const form=root.querySelector('[data-join-midi]');if(!form||!region)return;const button=form.querySelector('[type=submit]'),checks=[...form.querySelectorAll('input[name=regionIds]')];
 const values=()=>({regionIds:checks.filter(c=>c.checked).map(c=>c.value).join(',')});
 const update=()=>{try{if(!checks.some(c=>c.checked))throw Error('Choose at least one other region to join.');const plan=joinedMidiRegion(track,region.id,values());form.querySelector('[data-join-preview]').textContent=`${plan.ids.length} regions → ${plan.region.duration.toFixed(2)} s · ${plan.region.notes.length} notes · ${plan.region.events.length} MIDI events.${plan.changedSettings?' Different region gain, mute or fades will be replaced by the selected region’s settings.':''}${plan.hasEvents?' Review playback after joining: controllers now share channel state.':''}`;button.disabled=false;}catch(e){form.querySelector('[data-join-preview]').textContent=e.message;button.disabled=true;}};
 form.onchange=update;form.querySelector('[data-join-all]').onclick=()=>{checks.forEach(c=>c.checked=true);update();};form.querySelector('[data-join-clear]').onclick=()=>{checks.forEach(c=>c.checked=false);update();};
 form.onsubmit=guard(e=>{e.preventDefault();update();if(!button.disabled)execute([{op:'region.joinMidi',target:region.id,values:values()}],'Joined MIDI regions');});update();
}
