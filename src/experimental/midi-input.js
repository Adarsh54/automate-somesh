import {createMidiCapture} from './midi-capture.js';
export function createMidiInput({beforeRecord,onTake,onChange,clock=()=>performance.now(),requestAccess=()=>navigator.requestMIDIAccess({sysex:false})}){
 let access=null,inputId='',port=null,capture=null,pending=null,timer=null,opening=false,connecting=false,notice='',epoch=0,disposed=false,started=0,placement=null,stopClick=null,monitor=null;
 const inputs=()=>access?[...access.inputs.values()].filter(p=>p.state==='connected'):[];
 const refresh=()=>{if(!disposed)onChange();};
 const detach=()=>{monitor?.stop();monitor=null;stopClick?.();stopClick=null;clearInterval(timer);timer=null;if(port){port.removeEventListener('midimessage',message);Promise.resolve(port.close()).catch(()=>{});port=null;}};
 function save(){
  if(!pending)return;
  try{if(pending.notes.length||pending.events.length){onTake(pending,placement);notice='MIDI take added to the timeline.';}else notice='No MIDI notes or controller events recorded.';pending=null;}
  catch(error){notice=error.message+' Your take is kept here; retry saving it.';}
  refresh();
 }
 function finish(reason=''){
  if(!capture)return;if(clock()<started){cancel();return;}pending={...capture.finish(clock()),name:port?.name||'MIDI take'};capture=null;detach();save();if(reason){notice=reason+' '+notice;refresh();}
 }
 function message(event){monitor?.push(event.data);if(capture&&!capture.push(event.data,event.timeStamp))finish('Recording limit reached.');}
 function stateChanged(){if(capture&&port?.state!=='connected')finish('MIDI input disconnected.');if(!inputs().some(p=>p.id===inputId))inputId=inputs()[0]?.id||'';refresh();}
 async function connect(){
  if(connecting)return;connecting=true;const token=++epoch;notice='Requesting MIDI access…';refresh();
  try{const next=await requestAccess();if(disposed||token!==epoch)return;access?.removeEventListener('statechange',stateChanged);access=next;access.addEventListener('statechange',stateChanged);inputId=inputs()[0]?.id||'';notice=inputId?'MIDI input ready.':'Connect a MIDI keyboard or controller.';}
  catch(error){if(!disposed&&token===epoch)notice=error.name==='NotAllowedError'?'MIDI access was denied. Allow MIDI access in your browser settings and reconnect.':'MIDI input is unavailable in this browser or device. You can still import MIDI files.';}
  finally{if(token===epoch){connecting=false;refresh();}}
 }
 async function record(){
  if(capture||opening||pending)return;const input=inputs().find(p=>p.id===inputId);if(!input){notice='Choose a connected MIDI input.';refresh();return;}
  opening=true;const token=++epoch;notice='Opening MIDI input…';refresh();
  try{await input.open();if(disposed||token!==epoch){if(port!==input)await input.close();return;}if(input.state!=='connected')throw Error('MIDI input disconnected before recording started.');const prepared=await beforeRecord();if(disposed||token!==epoch){if(port!==input)await input.close();return;}if(input.state!=='connected')throw Error('MIDI input disconnected before recording started.');placement=prepared;port=input;started=placement.captureStart??clock();capture=createMidiCapture(started);port.addEventListener('midimessage',message);stopClick=placement.startClick?.();monitor=placement.startMonitor?.();notice='Recording MIDI. Stop to keep the take; leaving this page discards it.';timer=setInterval(()=>{if(clock()-started>=600000)finish('Ten-minute recording limit reached.');else onChange('tick');},250);}
  catch(error){if(!disposed&&token===epoch){capture=null;detach();notice=error.message;}if(port!==input)await input.close().catch(()=>{});}
  finally{if(token===epoch){opening=false;refresh();}}
 }
 function cancel(){epoch++;capture=null;pending=null;opening=false;connecting=false;detach();notice='MIDI take canceled.';refresh();}
 return {
  get timelinePosition(){return capture?placement.start+Math.max(0,(clock()-started)/1000):null;},
  get countingIn(){return Boolean(capture&&clock()<started);},
  get active(){return Boolean(capture||opening||pending);},
  get liveText(){return clock()<started?`Count-in · ${((started-clock())/1000).toFixed(1)} s`:`${((clock()-started)/1000).toFixed(1)} s · ${capture?.count||0} notes/events`;},
  activate(){disposed=false;},
  view(esc,{disabled=false}={}){return `<section class="daw-midi-input"><div class="button-row"><strong>MIDI input</strong><button data-midi-connect ${connecting||capture||opening||pending||disabled?'disabled':''}>${connecting?'Connecting…':'Connect MIDI'}</button>${access?`<label>Device<select data-midi-device ${capture||opening||pending||disabled?'disabled':''}>${inputs().length?inputs().map(p=>`<option value="${esc(p.id)}" ${p.id===inputId?'selected':''}>${esc(p.name||'MIDI input')}</option>`).join(''):'<option value="">No connected inputs</option>'}</select></label>`:''}${capture?`<output data-midi-elapsed>${clock()<started?'Count-in…':((clock()-started)/1000).toFixed(1)+' s · '+capture.count+' notes/events'}</output><button data-midi-finish ${clock()<started?'disabled':''}>Stop &amp; save MIDI</button>`:pending?'<button data-midi-save>Retry saving take</button>':`<button data-midi-record ${!inputId||opening||disabled?'disabled':''}>${opening?'Opening…':'Record MIDI'}</button>`}${capture||opening||pending?'<button data-midi-cancel>Discard take</button>':''}</div><p class="muted">New MIDI takes start at the playhead. Enable arrangement playback below to record alongside existing tracks. Enable Hear MIDI while recording below to audition a triangle synth, including during count-in. Leaving this page discards an unsaved take.</p>${notice?`<p role="status">${esc(notice)}</p>`:''}</section>`;},
  bind(root){root.querySelector('[data-midi-connect]')?.addEventListener('click',connect);root.querySelector('[data-midi-record]')?.addEventListener('click',record);root.querySelector('[data-midi-finish]')?.addEventListener('click',()=>finish());root.querySelector('[data-midi-cancel]')?.addEventListener('click',cancel);root.querySelector('[data-midi-save]')?.addEventListener('click',save);root.querySelector('[data-midi-device]')?.addEventListener('change',e=>{inputId=e.target.value;});},
  dispose(){disposed=true;cancel();access?.removeEventListener('statechange',stateChanged);access=null;inputId='';},
 };
}
