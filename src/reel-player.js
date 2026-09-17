import './reel-player.css';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const speakerIcon=muted=>`<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/>${muted?'<path d="m17 9 5 6m0-6-5 6"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
export const reelTime=seconds=>`${Math.floor((Number(seconds)||0)/60)}:${String(Math.floor((Number(seconds)||0)%60)).padStart(2,'0')}`;
// One player owns one audio element; mounting another view destroys the previous instance.
export class ReelPlayer{
 constructor(root,{title,tracks,allowDownloads=false,source,download}){
  this.root=root;this.tracks=tracks;this.source=source;this.download=download;this.index=0;this.audio=new Audio();this.audio.preload='metadata';
  root.innerHTML=`<section class="reel-player" aria-label="${escape(title)}"><div class="reel-player-heading"><span class="reel-kicker">REEL</span><h2>${escape(title)}</h2></div><div class="reel-transport"><button class="reel-play" aria-label="Play">▶</button><div class="reel-wave-wrap"><div class="reel-wave" aria-hidden="true"></div><input class="reel-seek" aria-label="Seek through track" type="range" min="0" max="1000" value="0" step="1"></div><button class="reel-mute" aria-label="Mute">${speakerIcon(false)}</button><input class="reel-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></div><div class="reel-now"><span></span><time>0:00 / 0:00</time></div><p class="reel-player-error" role="alert" hidden></p><ol class="reel-playlist">${tracks.map((t,i)=>`<li><button data-reel-track="${i}"><span class="reel-track-number">${String(i+1).padStart(2,'0')}</span><span class="reel-track-title">${escape(t.title)}</span><time>${reelTime(t.duration)}</time></button>${allowDownloads&&download?`<button class="reel-download" data-reel-download="${i}" aria-label="Download ${escape(t.title)} as MP3" title="Download MP3">↓</button>`:''}</li>`).join('')}</ol></section>`;
  this.play=root.querySelector('.reel-play');this.seek=root.querySelector('.reel-seek');this.wave=root.querySelector('.reel-wave');this.message=root.querySelector('.reel-player-error');
  this.play.onclick=()=>this.audio.paused?this.start():this.audio.pause();
  root.querySelector('.reel-mute').onclick=()=>{this.audio.muted=!this.audio.muted;this.volumeUI();};
  root.querySelector('.reel-volume').oninput=e=>{this.audio.volume=Number(e.target.value);this.audio.muted=false;this.volumeUI();};
  this.seek.oninput=()=>{if(Number.isFinite(this.audio.duration)){this.audio.currentTime=Number(this.seek.value)/1000*this.audio.duration;this.update();}};
  root.querySelectorAll('[data-reel-track]').forEach(b=>b.onclick=()=>{if(this.index===Number(b.dataset.reelTrack)){this.audio.paused?this.start():this.audio.pause();}else{this.select(Number(b.dataset.reelTrack));this.start();}});
  root.querySelectorAll('[data-reel-download]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await download(tracks[Number(b.dataset.reelDownload)]);}catch{this.error('The download failed. Please try again.');}finally{b.disabled=false;}});
  this.audio.ontimeupdate=this.audio.onloadedmetadata=()=>this.update();
  this.audio.onplay=this.audio.onpause=()=>this.update();
  this.audio.onerror=()=>this.error('This track could not be loaded. Refresh the reel and try again.');
  this.audio.onended=()=>{if(this.index<tracks.length-1){this.select(this.index+1);this.start();}else this.update();};
  if(tracks.length)this.select(0);else this.play.disabled=true;
 }
 select(index){
  this.audio.pause();this.index=index;const track=this.tracks[index];this.message.hidden=true;
  this.audio.src=this.source(track);this.audio.load();
  const peaks=track.peaks||Array(120).fill(.05);
  this.wave.innerHTML=`<svg viewBox="0 0 ${peaks.length*3} 100" preserveAspectRatio="none">${peaks.map((p,i)=>{const height=Math.max(2,Math.min(1,Number(p)||0)*100);return `<rect x="${i*3}" y="${(100-height)/2}" width="1.5" height="${height}"/>`;}).join('')}</svg>`;
  this.root.querySelectorAll('[data-reel-track]').forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-current',String(i===index));});
  this.root.querySelector('.reel-now span').textContent=track.title;
  this.seek.value='0';this.update();
 }
 async start(){try{this.message.hidden=true;await this.audio.play();}catch(e){if(e.name!=='AbortError')this.error('Playback could not start. Try pressing Play again.');}}
 error(text){this.message.textContent=text;this.message.hidden=false;}
 volumeUI(){const b=this.root.querySelector('.reel-mute');b.innerHTML=speakerIcon(this.audio.muted);b.setAttribute('aria-label',this.audio.muted?'Unmute':'Mute');}
 update(){
  const t=this.audio.currentTime||0,d=Number.isFinite(this.audio.duration)?this.audio.duration:(this.tracks[this.index]?.duration||0),ratio=d?t/d:0;
  this.play.textContent=this.audio.paused?'▶':'Ⅱ';this.play.setAttribute('aria-label',this.audio.paused?'Play':'Pause');
  this.seek.value=String(Math.round(ratio*1000));this.seek.setAttribute('aria-valuetext',`${reelTime(t)} of ${reelTime(d)}`);
  const bars=this.wave.querySelectorAll('rect');bars.forEach((bar,i)=>bar.classList.toggle('played',i/bars.length<=ratio));
  this.root.querySelector('.reel-now time').textContent=`${reelTime(t)} / ${reelTime(d)}`;
 }
 destroy(){this.audio.onended=null;this.audio.onerror=null;this.audio.onplay=null;this.audio.onpause=null;this.audio.ontimeupdate=null;this.audio.onloadedmetadata=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}
}
export async function downloadReelTrack(url,title){
 const response=await fetch(url);if(!response.ok)throw Error('Download failed');
 const objectUrl=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=objectUrl;a.download=(title.replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,100)||'track')+'.mp3';a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
}
