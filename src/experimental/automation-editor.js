import {automationValue} from './effects.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const round=value=>Number(value.toFixed(2));
const defaultParameters={gainDb:{label:'Volume (dB)',min:-96,max:12,step:.5},pan:{label:'Pan',min:-1,max:1,step:.05}};
export function automationView(track,esc,{gainOnly=false,parameters=gainOnly?{gainDb:defaultParameters.gainDb}:defaultParameters}={}){
 return `<section class="daw-automation"><h4>Automation · ${esc(track.name)}</h4><label>Parameter<select data-auto-parameter>${Object.entries(parameters).map(([key,spec])=>`<option value="${key}">${esc(spec.label)}</option>`).join('')}</select></label><p class="muted">Click to add a point; drag a point to move it. Focus a point and use arrow keys to adjust it, or Delete to remove it. Curves override the static control.</p><svg data-auto-graph viewBox="0 0 600 160" preserveAspectRatio="none" aria-label="Automation curve"></svg><form data-auto-form="${track.id}"><label>Time · seconds<input type="number" name="time" min="0" max="86400" step=".01" value="0" required></label><label>Value<input type="number" name="value" step=".1" value="0" required></label><button type="submit">Add point</button><button type="button" data-auto-clear="${track.id}">Clear curve</button></form><div data-auto-points></div></section>`;
}
export function bindAutomation(root,{track,execute,guard,duration,automationParameter='gainDb',onAutomationParameter=()=>{},
 point=values=>({op:'automation.point',target:track.id,values}),
 remove=id=>({op:'automation.delete',target:id}),
 parameters=defaultParameters,edit=(id,values)=>({op:'automation.set',target:id,values}),
 clear=parameter=>({op:'automation.clear',target:track.id,values:{parameter}}),
}){
 if(!root)return;
 const parameter=root.querySelector('[data-auto-parameter]');if(!parameter)return;
 const host=root.closest('#experimental-root')||root;
 const graph=root.querySelector('[data-auto-graph]'),pointsRoot=root.querySelector('[data-auto-points]'),form=root.querySelector('[data-auto-form]');
 function draw(){
  const key=parameter.value,{min,max,step}=parameters[key];
  const points=(track.automation||[]).filter(p=>p.parameter===key).sort((a,b)=>a.time-b.time),end=Math.min(86400,Math.max(1,duration,...points.map(p=>p.time)));
  // Keep handles inside the viewBox, including the first/last time and min/max value.
  const x=time=>8+time/end*584,y=value=>152-clamp((value-min)/(max-min),0,1)*144;
  const path=items=>{
   const ordered=[...items].sort((a,b)=>a.time-b.time);
   return [{time:0,value:automationValue(ordered,key,0,track[key])},...ordered,{time:end,value:automationValue(ordered,key,end,track[key])}].map((p,i)=>`${i?'L':'M'} ${x(p.time)} ${y(p.value)}`).join(' ');
  };
  const coords=event=>{
   const rect=graph.getBoundingClientRect();
   return {time:round(clamp(((event.clientX-rect.left)/rect.width*600-8)/584,0,1)*end),value:Number(clamp(max-((event.clientY-rect.top)/rect.height*160-8)/144*(max-min),min,max).toFixed(6))};
  };
  graph.innerHTML=`<path d="${path(points)}"/>${points.map(p=>`<circle data-auto-point="${p.id}" role="button" tabindex="0" aria-label="Automation point at ${p.time} seconds, ${p.value}${key==='gainDb'?' dB':''}" cx="${x(p.time)}" cy="${y(p.value)}" r="6"/>`).join('')}<text x="18" y="20">${max}${key==='gainDb'?' dB':''}</text><text x="18" y="146">${min}</text><text x="520" y="146">${end.toFixed(1)} s</text><text data-auto-drag-value x="160" y="20"></text>`;
  const applyEdit=(id,values)=>execute([edit(id,values)],'Moved automation point');
  graph.querySelectorAll('[data-auto-point]').forEach(handle=>{
   const original=points.find(p=>p.id===handle.dataset.autoPoint);
   handle.onclick=e=>e.stopPropagation();
   handle.onkeydown=guard(e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    if(e.key==='Delete'||e.key==='Backspace'){execute([remove(original.id)],'Removed automation point');return;}
    const multiplier=e.shiftKey?10:1,values=e.key==='ArrowLeft'||e.key==='ArrowRight'
     ?{time:round(clamp(original.time+(e.key==='ArrowRight'?1:-1)*.1*multiplier,0,86400))}
     :{value:Number(clamp(original.value+(e.key==='ArrowUp'?1:-1)*step*multiplier,min,max).toFixed(6))};
    applyEdit(original.id,values);
    host.querySelector(`[data-auto-point="${original.id}"]`)?.focus();
   });
   handle.onpointerdown=e=>{
    if(e.button!==0)return;e.stopPropagation();handle.focus({preventScroll:true});handle.setPointerCapture(e.pointerId);
    const start={x:e.clientX,y:e.clientY};let moved=false,values=null;
    const reset=()=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;};
    handle.onpointermove=event=>{
     if(!moved&&Math.abs(event.clientX-start.x)+Math.abs(event.clientY-start.y)<3)return;
     moved=true;values=coords(event);handle.setAttribute('cx',x(values.time));handle.setAttribute('cy',y(values.value));
     graph.querySelector('path').setAttribute('d',path(points.map(p=>p.id===original.id?{...p,...values}:p)));
     graph.querySelector('[data-auto-drag-value]').textContent=`${values.time.toFixed(2)} s · ${values.value.toFixed(2)}${key==='gainDb'?' dB':''}`;
    };
    handle.onpointercancel=()=>{reset();draw();};
    handle.onpointerup=guard(event=>{event.stopPropagation();reset();handle.releasePointerCapture(event.pointerId);if(moved&&values)applyEdit(original.id,values);});
   };
  });
  pointsRoot.innerHTML=points.map(p=>`<div><form data-auto-edit="${p.id}"><label>Time · seconds<input name="time" type="number" min="0" max="86400" step="any" value="${p.time}" required></label><label>${parameters[key].label}<input name="value" type="number" min="${min}" max="${max}" step="any" value="${p.value}" required></label><button type="submit">Update point</button><button type="button" data-auto-remove="${p.id}" aria-label="Remove automation point at ${p.time} seconds">Remove</button></form></div>`).join('');
  pointsRoot.querySelectorAll('[data-auto-edit]').forEach(editor=>editor.onsubmit=guard(e=>{e.preventDefault();applyEdit(editor.dataset.autoEdit,{time:Number(editor.elements.time.value),value:Number(editor.elements.value.value)});}));
  pointsRoot.querySelectorAll('[data-auto-remove]').forEach(button=>button.onclick=guard(()=>execute([remove(button.dataset.autoRemove)],'Removed automation point')));
  form.elements.value.min=min;form.elements.value.max=max;form.elements.value.step='any';if(Number(form.elements.value.value)<min||Number(form.elements.value.value)>max)form.elements.value.value=track[key]??min;
  graph.onclick=guard(event=>{if(event.target.closest('[data-auto-point]'))return;execute([point({parameter:key,...coords(event)})],'Added automation point');});
 }
 parameter.value=Object.hasOwn(parameters,automationParameter)?automationParameter:Object.keys(parameters)[0];parameter.onchange=()=>{onAutomationParameter(parameter.value);draw();};draw();
 form.onsubmit=guard(e=>{e.preventDefault();execute([point({parameter:parameter.value,time:Number(form.elements.time.value),value:Number(form.elements.value.value)})],'Added automation point');});
 root.querySelector('[data-auto-clear]').onclick=guard(()=>execute([clear(parameter.value)],'Cleared automation curve'));
}
