import {ReelPlayer,downloadReelTrack} from './reel-player.js';
import {createReelAnalytics} from './reel-analytics.js';
import './public-reel.css';
const params=new URLSearchParams(location.search),token=params.get('token'),root=document.querySelector('#public-reel');
if(params.get('embed')==='1')document.body.classList.add('embedded');
if(params.get('theme')==='light')document.body.classList.add('light');
const trackUrl=(action,track)=>`/api/reels?action=${action}&token=${encodeURIComponent(token)}&track=${encodeURIComponent(track.id)}`;
try{
 const response=await fetch(`/api/reels?action=public&token=${encodeURIComponent(token)}`);
 if(!response.ok)throw Error(response.status===404?'This reel is unavailable. Its owner may have stopped sharing it.':'This reel could not be loaded. Please try again.');
 const {reel}=await response.json();document.title=`${reel.title} · Cuestamp`;
 root.innerHTML='<div id="player"></div><footer><a href="/" target="_blank" rel="noopener">Made with Cuestamp</a><button id="share-reel">Copy link</button><span role="status" id="share-status"></span></footer>';
 const analytics=createReelAnalytics(token,{embed:params.get('embed')==='1'});
 const player=new ReelPlayer(root.querySelector('#player'),{...reel,resumeUrl:reel.hasResume?`/api/reels?action=resume&token=${encodeURIComponent(token)}`:null,source:t=>trackUrl('stream',t),download:t=>downloadReelTrack(trackUrl('download',t),t.title),onEvent:(type,track,extra)=>analytics.onEvent(type,track,extra)});
 document.querySelector('#share-reel').onclick=async()=>{const url=new URL('/reel.html',location.origin);url.searchParams.set('token',token);try{await navigator.clipboard.writeText(url.href);document.querySelector('#share-status').textContent='Link copied';}catch{document.querySelector('#share-status').textContent=url.href;}};
 window.addEventListener('pagehide',()=>player.destroy(),{once:true});
}catch(e){root.textContent=e.message;root.setAttribute('role','alert');}
