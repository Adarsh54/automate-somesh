// Monitoring is a separate branch. Never route this gain into the capture worklet.
export function createInputMonitor(context,source,{enabled=false,levelDb=-18,destination=context.destination}={}){
 const gain=context.createGain();let stopped=false;
 function set(nextEnabled,nextLevel=levelDb){
  if(typeof nextEnabled!=='boolean'||!Number.isFinite(nextLevel)||nextLevel< -60||nextLevel>0)throw Error('Monitor level must be between -60 and 0 dB.');
  if(stopped)return;enabled=nextEnabled;levelDb=nextLevel;
  gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setTargetAtTime(enabled?10**(levelDb/20):0,context.currentTime,.005);
 }
 gain.gain.value=0;set(enabled,levelDb);source.connect(gain);gain.connect(destination);
 return {set,get enabled(){return enabled&&!stopped;},stop(){if(stopped)return;stopped=true;gain.gain.cancelScheduledValues(context.currentTime);gain.gain.value=0;source.disconnect(gain);gain.disconnect();}};
}
