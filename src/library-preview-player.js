import {localWaveform} from './reel-local-preview.js';
const cache=new WeakMap();
const time=value=>`${Math.floor((value||0)/60)}:${String(Math.floor((value||0)%60)).padStart(2,'0')}`;
const speaker='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
export const libraryPreviewMarkup=()=>`<div class="library-wave-player"><button type="button" class="library-wave-play" aria-label="Play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7z"/></svg></button><div class="library-wave-seek"><svg class="library-wave-bars" viewBox="0 0 720 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 50H720"/></svg><input type="range" min="0" max="1000" value="0" aria-label="Seek through audio" disabled></div><div class="library-wave-volume"><button type="button" aria-label="Mute">${speaker}</button><input type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></div><div class="library-wave-time"><span data-wave-status>Loading waveform…</span><time>0:00 / 0:00</time></div></div>`;
async function peaksFor(file){
 if(cache.has(file))return cache.get(file);
 const pending=(async()=>{
  try{return (await localWaveform(file)).peaks;}catch{}
  if(file.size>100*1024*1024)throw Error('Waveform unavailable');
  const context=new AudioContext();
  try{
   const buffer=await context.decodeAudioData(await file.arrayBuffer()),peaks=new Array(240).fill(0);
   for(let ch=0;ch<buffer.numberOfChannels;ch++){
    const data=buffer.getChannelData(ch);
    for(let i=0;i<peaks.length;i++)for(let j=Math.floor(i*data.length/peaks.length),end=Math.floor((i+1)*data.length/peaks.length);j<end;j++)peaks[i]=Math.max(peaks[i],Math.abs(data[j]));
   }
   const max=Math.max(.001,...peaks);return peaks.map(p=>p/max);
  }finally{await context.close();}
 })();cache.set(file,pending);pending.catch(()=>cache.delete(file));return pending;
}
export function bindLibraryPreview(audio,file){
 const root=audio?.parentElement.querySelector('.library-wave-player');if(!root)return;
 const play=root.querySelector('.library-wave-play'),seek=root.querySelector('.library-wave-seek input'),wave=root.querySelector('.library-wave-bars'),mute=root.querySelector('.library-wave-volume button'),volume=root.querySelector('.library-wave-volume input'),status=root.querySelector('[data-wave-status]');
 function update(){
  const duration=Number.isFinite(audio.duration)?audio.duration:0,position=audio.currentTime||0;
  play.innerHTML=audio.paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm7 0h4v14h-4z"/></svg>';
  play.setAttribute('aria-label',audio.paused?'Play':'Pause');seek.disabled=!duration;seek.value=duration?position/duration*1000:0;seek.setAttribute('aria-valuetext',`${time(position)} of ${time(duration)}`);
  root.querySelector('time').textContent=`${time(position)} / ${time(duration)}`;
  wave.querySelectorAll('rect').forEach((bar,i,bars)=>bar.classList.toggle('played',position>0&&i/bars.length<position/duration));
 }
 play.onclick=async()=>{if(!audio.paused){audio.pause();return;}try{await audio.play();}catch{status.textContent='Could not play audio. Try again.';}};
 seek.oninput=()=>{if(Number.isFinite(audio.duration)){audio.currentTime=Number(seek.value)/1000*audio.duration;update();}};
 mute.onclick=()=>{audio.muted=!audio.muted;};volume.oninput=()=>{audio.volume=Number(volume.value);audio.muted=false;};
 audio.onvolumechange=()=>{mute.setAttribute('aria-label',audio.muted?'Unmute':'Mute');mute.classList.toggle('is-muted',audio.muted||audio.volume===0);volume.value=audio.muted?0:audio.volume;};
 audio.ontimeupdate=audio.onloadedmetadata=audio.onplay=audio.onpause=audio.onended=update;
 audio.onerror=()=>{status.textContent='Could not play this file.';};update();
 if(file)peaksFor(file).then(peaks=>{
  if(!root.isConnected)return;
  const count=180,bars=Array.from({length:count},(_,i)=>Math.max(0,...peaks.slice(Math.floor(i*peaks.length/count),Math.max(Math.floor(i*peaks.length/count)+1,Math.floor((i+1)*peaks.length/count)))));
  wave.innerHTML=bars.map((p,i)=>{const h=Math.max(2,p*94);return `<rect x="${i*4}" y="${(100-h)/2}" width="2" height="${h}" rx="1"/>`;}).join('');status.textContent='';update();
 }).catch(()=>{if(root.isConnected)status.textContent='Waveform unavailable · Playback still available';});
 else status.textContent='Waveform unavailable';
}
