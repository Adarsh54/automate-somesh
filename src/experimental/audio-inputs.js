// Hardware selection stays local to this workspace, never in a project document.
export function createAudioInputs({mediaDevices=globalThis.navigator?.mediaDevices,onChange=()=>{}}={}){
 let devices=[],selected='',active=false,generation=0,loading=false,error='';
 async function refresh(){
  if(!active)return;
  const request=++generation;loading=true;error='';onChange();
  try{
   if(!mediaDevices?.enumerateDevices)throw Error('Audio device selection is unavailable in this browser.');
   const list=await mediaDevices.enumerateDevices();
   if(!active||request!==generation)return;
   const seen=new Set();devices=list.filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default'&&!seen.has(d.deviceId)&&seen.add(d.deviceId)).map((d,i)=>({id:d.deviceId,label:d.label||`Audio input ${i+1}`}));
  }catch(e){if(active&&request===generation)error=e.message;}
  finally{if(active&&request===generation){loading=false;onChange();}}
 }
 return {
  get deviceId(){return selected||undefined;},
  select(id){selected=id;onChange();},
  refresh,
  activate(){if(active)return;active=true;mediaDevices?.addEventListener?.('devicechange',refresh);void refresh();},
  dispose(){active=false;++generation;loading=false;mediaDevices?.removeEventListener?.('devicechange',refresh);},
  view(esc,disabled=false){const missing=selected&&!devices.some(d=>d.id===selected);return `<div class="daw-toolbar"><label>Audio input<select data-audio-input ${disabled?'disabled':''}><option value="">System default</option>${missing?`<option value="${esc(selected)}" selected>Selected input unavailable</option>`:''}${devices.map(d=>`<option value="${esc(d.id)}" ${d.id===selected?'selected':''}>${esc(d.label)}</option>`).join('')}</select></label><button data-audio-input-refresh ${disabled||loading?'disabled':''}>${loading?'Refreshing inputs…':'Refresh inputs'}</button><small>${esc(error||(missing?'Reconnect your selected input or choose another.': 'Device names may appear after microphone permission is granted.'))}</small></div>`;},
  bind(root){root.querySelector('[data-audio-input]').onchange=e=>this.select(e.target.value);root.querySelector('[data-audio-input-refresh]').onclick=()=>void refresh();}
 };
}
