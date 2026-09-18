import {automationView,bindAutomation} from './automation-editor.js';
import {effectTail} from './effects.js';
export const destinations=track=>[...(track.output?[track.output]:[]),...(track.sends||[]).map(s=>s.busId)];
export function validateRouting(session){
 const tracks=new Map(session.tracks.map(t=>[t.id,t]));
 for(const track of tracks.values()){
  if(track.kind==='bus'&&track.regions.length)throw Error('Buses receive routed audio and cannot contain regions.');
  if(track.kind==='video'&&(track.output||track.sends?.length))throw Error('Video reference tracks cannot route audio.');
  const sends=(track.sends||[]).map(s=>s.busId);if(new Set(sends).size!==sends.length)throw Error('Only one send per destination is supported.');
  for(const id of destinations(track))if(tracks.get(id)?.kind!=='bus')throw Error('Routing destination must be an existing bus.');
 }
 const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id))throw Error('Routing would create an audio feedback loop.');if(done.has(id))return;visiting.add(id);for(const next of destinations(tracks.get(id)))visit(next);visiting.delete(id);done.add(id);}for(const id of tracks.keys())visit(id);
}
export function audibleSources(session){
 const tracks=new Map(session.tracks.map(t=>[t.id,t])),solo=session.tracks.some(t=>t.kind!=='video'&&t.solo);
 function reachesSolo(track,visited=new Set()){if(visited.has(track.id))return false;visited.add(track.id);return track.solo||destinations(track).some(id=>tracks.has(id)&&reachesSolo(tracks.get(id),visited));}
 return session.tracks.filter(t=>!['bus','video'].includes(t.kind)&&!t.mute&&(!solo||reachesSolo(t))).map(t=>({...t,regions:t.regions.filter(r=>!r.mute)}));
}
export function routedTail(session,track){const byId=new Map(session.tracks.map(t=>[t.id,t]));function tail(t,seen=new Set()){if(seen.has(t.id))return 0;const next=new Set(seen).add(t.id);return effectTail(t.effects)+Math.max(0,...destinations(t).map(id=>byId.has(id)?tail(byId.get(id),next):0));}return tail(track);}
export function stemSession(session,track){return {...session,tracks:[...session.tracks.filter(t=>t.kind==='bus'),track].map(t=>({...t,solo:false}))};}
// Group by the final primary output bus, not by sends: each source belongs to
// exactly one file. Keep buses/sends to render that group's full mix contribution.
export function stemGroups(session,mode='tracks'){
 if(!['tracks','groups'].includes(mode))throw Error('Unknown stem grouping.');
 validateRouting(session);
 const byId=new Map(session.tracks.map(t=>[t.id,t])),groups=new Map();
 for(const source of session.tracks.filter(t=>!['video','bus'].includes(t.kind)&&!t.mute)){
  let owner=source;
  if(mode==='groups')while(owner.output)owner=byId.get(owner.output);
  if(!groups.has(owner.id))groups.set(owner.id,{id:owner.id,name:owner.name,sourceIds:[]});
  groups.get(owner.id).sourceIds.push(source.id);
 }
 return [...groups.values()].map(group=>({...group,document:{...session,tracks:session.tracks.filter(t=>t.kind==='bus'||group.sourceIds.includes(t.id)).map(t=>({...t,solo:false}))}}));
}
const openSendEditors=new WeakMap();
const tapOptions=selected=>[['preFader','Before volume'],['postFader','After volume'],['postPan','After pan']].map(([value,label])=>`<option value="${value}" ${value===(selected||'postPan')?'selected':''}>${label}</option>`).join('');
export function routingView(session,track,esc){const buses=session.tracks.filter(t=>t.kind==='bus'&&t.id!==track.id),options=selected=>buses.map(b=>`<option value="${esc(b.id)}" ${b.id===selected?'selected':''}>${esc(b.name)}</option>`).join('');return `<section class="daw-routing"><h4>Routing · ${esc(track.name)}</h4><label>Output<select data-route-output="${esc(track.id)}"><option value="">Master</option>${options(track.output)}</select></label><p class="muted">Sends copy this channel after its effects. Choose whether each send follows volume and pan. Muting the channel silences all its sends.</p>${(track.sends||[]).map(s=>`<div class="daw-send"><span>${esc(session.tracks.find(t=>t.id===s.busId)?.name||'Missing bus')}</span><label>Position<select data-send-tap="${esc(s.busId)}">${tapOptions(s.tap)}</select></label><label>Send · dB<input type="number" data-send-gain="${esc(s.busId)}" min="-96" max="12" step=".5" value="${s.gainDb}"></label><button data-send-remove="${esc(s.busId)}">Remove send</button></div><details class="daw-send-automation" data-send-automation="${esc(s.busId)}"><summary>Send automation · ${(s.automation||[]).length} points</summary>${automationView({id:s.busId,name:'Send to '+(session.tracks.find(t=>t.id===s.busId)?.name||'bus'),gainDb:s.gainDb,automation:s.automation||[]},esc,{gainOnly:true})}</details>`).join('')}${buses.length?`<form data-send-form><label>Bus<select name="busId">${options(null)}</select></label><label>Position<select name="tap">${tapOptions()}</select></label><label>Level · dB<input name="gainDb" type="number" min="-96" max="12" step=".5" value="-12" required></label><button type="submit">Add / update send</button></form>`:'<p class="muted">Use + Bus to create a routing destination.</p>'}</section>`;}
export function bindRouting(root,{track,execute,guard,duration=1}){if(!track)return;root.querySelector('[data-route-output]')?.addEventListener('change',guard(e=>execute([{op:'track.set',target:track.id,values:{output:e.target.value||null}}],'Changed output routing')));root.querySelector('[data-send-form]')?.addEventListener('submit',guard(e=>{e.preventDefault();execute([{op:'send.set',target:track.id,values:{busId:e.currentTarget.elements.busId.value,gainDb:Number(e.currentTarget.elements.gainDb.value),tap:e.currentTarget.elements.tap.value}}],'Updated send');}));root.querySelectorAll('[data-send-gain]').forEach(el=>el.onchange=guard(()=>execute([{op:'send.set',target:track.id,values:{busId:el.dataset.sendGain,gainDb:Number(el.value)}}],'Changed send level')));root.querySelectorAll('[data-send-tap]').forEach(el=>el.onchange=guard(()=>execute([{op:'send.set',target:track.id,values:{busId:el.dataset.sendTap,tap:el.value}}],'Changed send position')));root.querySelectorAll('[data-send-remove]').forEach(el=>el.onclick=guard(()=>execute([{op:'send.delete',target:track.id,values:{busId:el.dataset.sendRemove}}],'Removed send')));
 const openEditors=openSendEditors.get(root)||new Set();openSendEditors.set(root,openEditors);
 root.querySelectorAll('[data-send-automation]').forEach(scope=>{
  const key=track.id+':'+scope.dataset.sendAutomation;scope.open=openEditors.has(key);
  scope.addEventListener('toggle',()=>{if(scope.isConnected){if(scope.open)openEditors.add(key);else openEditors.delete(key);}});
  const send=track.sends.find(s=>s.busId===scope.dataset.sendAutomation);if(!send)return;
  bindAutomation(scope,{track:{id:send.busId,gainDb:send.gainDb,automation:send.automation||[]},execute,guard,duration,
   point:({time,value})=>({op:'send.automation.point',target:track.id,values:{busId:send.busId,time,value}}),
   clear:()=>({op:'send.automation.clear',target:track.id,values:{busId:send.busId}}),
  });
 });
}
