import {libraryRequest} from './audio-library.js';
const clock=iso=>iso?new Date(iso).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Never';
const RANGES=['7','30','90'];
export function createReelAccountAnalyticsView({esc,onChange,onOpenReel}){
 let loading=false,error='',data=null,trendRange='30';
 async function load(){
  loading=true;error='';data=null;trendRange='30';onChange?.();
  try{data=(await libraryRequest('/api/reels?action=analytics')).analytics;}
  catch(e){error=e.message;}
  finally{loading=false;onChange?.();}
 }
 function header(subtitle){return `<div class="heading"><div><div class="eyebrow">REEL ANALYTICS</div><h1>All reels</h1><p>${subtitle}</p></div></div>`;}
 function trendPoints(range){
  const days=Number(range),end=new Date();end.setHours(0,0,0,0);
  const points=[];
  for(let i=days-1;i>=0;i--){
   const d=new Date(end);d.setDate(d.getDate()-i);
   const key=d.toISOString().slice(0,10);
   points.push({date:key,opens:Number((data.daily||[]).find(x=>x.date===key)?.opens)||0});
  }
  return points;
 }
 function trendsSection(){
  const points=trendPoints(trendRange);
  const max=Math.max(1,...points.map(p=>p.opens));
  const barW=100/points.length,gap=Math.min(barW*0.2,1.5);
  const bars=points.map((p,i)=>{
   const h=p.opens/max*88,x=i*barW+gap/2,width=Math.max(0.3,barW-gap);
   return `<rect x="${x}" y="${90-h}" width="${width}" height="${h}" class="reel-chart-direct"><title>${esc(`${p.date}: ${p.opens} opens`)}</title></rect>`;
  }).join('');
  const total=points.reduce((sum,p)=>sum+p.opens,0);
  return `<section class="panel reel-analytics-trends"><div class="section-title"><h2>Opens over time</h2><div class="button-row reel-chart-range">${RANGES.map(r=>`<button data-trend-range="${r}" class="${trendRange===r?'active':''}" ${trendRange===r?'aria-current="true"':''}>${r} days</button>`).join('')}</div></div>${total?`<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="reel-chart">${bars}</svg>`:'<p class="muted">No opens in this range yet.</p>'}</section>`;
 }
 function reelRows(){
  return `<ul class="reel-analytics-tracks">${data.reels.map(r=>`<li><span class="reel-analytics-track-title">${esc(r.title || 'Untitled reel')}</span><span>${r.opens} open${r.opens===1?'':'s'}</span><span>Last: ${esc(clock(r.lastOpenedAt))}</span><button data-open-reel-analytics="${esc(r.id)}">View details →</button></li>`).join('')}</ul>`;
 }
 function view(){
  if(loading&&!data)return `<section class="reel-analytics-page">${header('Loading…')}</section>`;
  if(error)return `<section class="reel-analytics-page">${header('')}<div class="project-error" role="alert">${esc(error)}</div></section>`;
  if(!data)return '';
  if(!data.totalReels)return `<section class="reel-analytics-page">${header('Listener activity across every reel you’ve published.')}<div class="empty"><h3>No published reels yet</h3><p>Publish a reel and create a share link to start seeing listens here.</p></div></section>`;
  const stats=`<div class="stats reel-analytics-stats"><div><strong>${data.totalReels}</strong><span>Published reels</span></div><div><strong>${data.totalOpens}</strong><span>Total opens</span></div></div>`;
  return `<section class="reel-analytics-page">${header('Listener activity across every reel you’ve published.')}${stats}${trendsSection()}<h2 class="reel-analytics-sessions-heading">Reels ranked by opens</h2>${reelRows()}</section>`;
 }
 function bind(){
  document.querySelectorAll('[data-trend-range]').forEach(button=>button.onclick=()=>{trendRange=button.dataset.trendRange;onChange?.();});
  document.querySelectorAll('[data-open-reel-analytics]').forEach(button=>button.onclick=()=>onOpenReel?.(button.dataset.openReelAnalytics));
 }
 return {view,bind,load};
}
