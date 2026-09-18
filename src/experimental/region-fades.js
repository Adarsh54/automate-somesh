const clamp=value=>Math.max(0,Math.min(1,value));
const curve=(progress,shape)=>shape==='equalPower'?Math.sin(clamp(progress)*Math.PI/2):clamp(progress);
export function regionEnvelope(region,time){return Math.min(region.fadeIn?curve(time/region.fadeIn,region.fadeInShape):1,region.fadeOut?curve((region.duration-time)/region.fadeOut,region.fadeOutShape):1);}
export function regionEnvelopePoints(region){
 const times=new Set([0,region.fadeIn,region.duration-region.fadeOut,region.duration]);
 // Piecewise-linear approximation of sine fades; endpoints remain exact.
 for(const side of ['fadeIn','fadeOut'])if(region[side]>0&&region[side+'Shape']==='equalPower')for(let i=1;i<64;i++)times.add(side==='fadeIn'?region[side]*i/64:region.duration-region[side]*i/64);
 return [...times].sort((a,b)=>a-b).map(time=>({time,value:regionEnvelope(region,time)}));
}
export function scheduleRegionEnvelope(param,region,relative,when,level){param.setValueAtTime(level*regionEnvelope(region,relative),when);for(const point of regionEnvelopePoints(region))if(point.time>relative)param.linearRampToValueAtTime(level*point.value,when+point.time-relative);}
export function crossfadeRegions(first,second,shape='equalPower'){
 if(!['linear','equalPower'].includes(shape))throw Error('Choose a linear or equal-power crossfade.');
 if(!first||!second||first.id===second.id)throw Error('Select two different audio regions on the same track.');
 const [left,right]=[first,second].sort((a,b)=>a.start-b.start),end=left.start+left.duration,overlap=end-right.start;
 if(left.start>=right.start||overlap<=0||end>=right.start+right.duration)throw Error('Crossfade requires overlapping regions: one starts earlier and ends earlier than the other.');
 if(left.fadeIn+overlap>left.duration+1e-9||right.fadeOut+overlap>right.duration+1e-9)throw Error('Crossfade overlaps an existing outer fade. Shorten that fade first.');
 return [{id:left.id,values:{fadeOut:overlap,fadeOutShape:shape}},{id:right.id,values:{fadeIn:overlap,fadeInShape:shape}}];
}
export function crossfadeView(track,region,esc){
 if(track?.kind!=='audio'||!region)return '';
 const candidates=track.regions.filter(other=>{try{crossfadeRegions(region,other);return true;}catch{return false;}});
 return `<section class="daw-crossfade"><h4>Crossfade</h4>${candidates.length?`<form data-crossfade><label>Crossfade with<select name="other">${candidates.map(other=>`<option value="${other.id}">${esc(other.name)} · ${other.start.toFixed(2)} s${other.mute?' · Muted':''}</option>`).join('')}</select></label><label>Curve<select name="shape"><option value="equalPower">Equal power</option><option value="linear">Linear</option></select></label><button>Apply crossfade</button></form><small>Fades span the full overlap. Equal power suits different sounds; linear suits matching material. Moving either region requires reapplying the crossfade.</small>`:'<p class="muted">Overlap two audio regions on this track to crossfade them. One must start and end earlier; leave room outside the overlap for any existing fades.</p>'}</section>`;
}
