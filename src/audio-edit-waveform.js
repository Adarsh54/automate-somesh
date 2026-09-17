export function mountEditWaveform(host,{form,audio,onChange=()=>{}}){
 let duration=0,peaks=[],drag=null;
 const value=name=>Number(form.elements[name].value)||0;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const time=t=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
 host.innerHTML='<p data-wave-status class="muted" role="status">Preparing waveform…</p><div class="edit-wave-surface"><svg viewBox="0 0 1000 160" preserveAspectRatio="none" aria-label="Audio waveform: drag to select a snippet"><g data-bars></g><rect data-left-shade y="0" height="160"/><rect data-right-shade y="0" height="160"/><rect data-selection y="1" height="158"/><path data-envelope/><line data-playhead y1="0" y2="160"/></svg><button type="button" data-handle="start" role="slider" aria-label="Snippet start" title="Drag snippet start"></button><button type="button" data-handle="end" role="slider" aria-label="Snippet end" title="Drag snippet end"></button></div><div class="edit-wave-times"><span data-start-time>0:00</span><span data-length></span><span data-end-time></span></div><button type="button" data-play-selection disabled>Play snippet</button>';
 const surface=host.querySelector('.edit-wave-surface'),svg=host.querySelector('svg'),status=host.querySelector('[data-wave-status]'),play=host.querySelector('[data-play-selection]');
 const set=(name,n)=>{form.elements[name].value=n.toFixed(2);};
 const fades=()=>{const length=value('end')-value('start');set('fadeIn',Math.min(value('fadeIn'),length));set('fadeOut',Math.min(value('fadeOut'),Math.max(0,length-value('fadeIn'))));};
 function draw(){
  if(!duration)return;
  const start=clamp(value('start'),0,duration),end=clamp(value('end'),start,duration),x=t=>t/duration*1000;
  const attr=(selector,attrs)=>{const node=host.querySelector(selector);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);};
  attr('[data-left-shade]',{x:0,width:x(start)});attr('[data-right-shade]',{x:x(end),width:1000-x(end)});attr('[data-selection]',{x:x(start),width:x(end-start)});
  attr('[data-envelope]',{d:`M ${x(start)} 150 L ${x(start+Math.min(value('fadeIn'),end-start))} 10 L ${x(end-Math.min(value('fadeOut'),end-start))} 10 L ${x(end)} 150`});
  for(const name of ['start','end']){const node=host.querySelector(`[data-handle=${name}]`),v=name==='start'?start:end;node.style.left=`${v/duration*100}%`;node.setAttribute('aria-valuemin','0');node.setAttribute('aria-valuemax',duration);node.setAttribute('aria-valuenow',v);node.setAttribute('aria-valuetext',`${v.toFixed(2)} seconds`);node.disabled=form.elements.start.disabled;}
  host.querySelector('[data-start-time]').textContent=time(start);host.querySelector('[data-end-time]').textContent=time(end);host.querySelector('[data-length]').textContent=`${(end-start).toFixed(2)}s selected`;
  attr('[data-playhead]',{x1:x(audio.currentTime||0),x2:x(audio.currentTime||0)});play.disabled=form.elements.start.disabled||end<=start;
 }
 const point=event=>clamp((event.clientX-surface.getBoundingClientRect().left)/surface.getBoundingClientRect().width*duration,0,duration);
 surface.onpointerdown=event=>{if(!duration||form.elements.start.disabled)return;event.preventDefault();const handle=event.target.closest('[data-handle]');drag={kind:handle?.dataset.handle||'range',anchor:point(event)};surface.setPointerCapture(event.pointerId);};
 surface.onpointermove=event=>{if(!drag)return;const t=point(event);if(drag.kind==='start')set('start',Math.min(t,value('end')-.05));else if(drag.kind==='end')set('end',Math.max(t,value('start')+.05));else{const start=Math.min(t,drag.anchor);set('start',Math.min(start,duration-.05));set('end',Math.max(Math.max(t,drag.anchor),value('start')+.05));}fades();draw();onChange();};
 surface.onpointerup=()=>{drag=null;};surface.onpointercancel=()=>{drag=null;};
 host.querySelectorAll('[data-handle]').forEach(node=>node.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||node.disabled)return;event.preventDefault();const name=node.dataset.handle,min=name==='start'?0:value('start')+.05,max=name==='start'?value('end')-.05:duration;set(name,event.key==='Home'?min:event.key==='End'?max:clamp(value(name)+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?1:.1),min,max));fades();draw();onChange();});
 play.onclick=()=>{if(!audio.paused){audio.pause();return;}audio.currentTime=value('start');audio.play().catch(()=>{status.textContent='Audio playback is unavailable.';});};
 const playbackState=()=>{play.textContent=audio.paused?'Play snippet':'Pause snippet';};
 audio.addEventListener('play',playbackState);audio.addEventListener('pause',playbackState);audio.addEventListener('ended',playbackState);
 const tick=()=>{if(!audio.paused&&audio.currentTime>=value('end'))audio.pause();draw();};audio.addEventListener('timeupdate',tick);
 form.addEventListener('input',draw);
 return {draw,duration:()=>duration,setData(data){duration=data.duration;peaks=data.peaks;svg.querySelector('[data-bars]').innerHTML=peaks.map((p,i)=>`<rect x="${i/peaks.length*1000}" y="${80-Math.max(1,p*68)}" width="${Math.max(1,1000/peaks.length-1)}" height="${Math.max(2,p*136)}"/>`).join('');if(!form.elements.end.value)set('end',duration);status.textContent='Drag across the waveform to select a snippet, or move either handle. The line shows your fades.';draw();},error(){status.textContent='Waveform unavailable. You can still set the snippet times below.';},destroy(){audio.removeEventListener('timeupdate',tick);for(const event of ['play','pause','ended'])audio.removeEventListener(event,playbackState);}};
}
