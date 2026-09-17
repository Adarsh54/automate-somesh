import {libraryRequest} from './audio-library.js';
import {reelTime} from './reel-player.js';
const describeAgent=ua=>{
 if(!ua)return 'Unknown device';
 const browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)&&!/Chrome/.test(ua)?'Safari':'Browser';
 const os=/iPhone|iPad/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Mac OS/.test(ua)?'Mac':/Windows/.test(ua)?'Windows':/Linux/.test(ua)?'Linux':'';
 return [browser,os].filter(Boolean).join(' on ') || 'Unknown device';
};
const locationLabel=s=>{const parts=[s.city,s.region&&s.region!==s.city?s.region:null,s.country].filter(Boolean);return parts.length?parts.join(', '):'Unknown location';};
const hostFor=url=>{try{return new URL(url).hostname;}catch{return '';}};
const fmt=seconds=>{const s=Math.max(0,Math.round(Number(seconds)||0));return `${Math.floor(s/60)}m ${s%60}s`;};
const clock=iso=>new Date(iso).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const pct=ratio=>ratio==null?'—':`${Math.round(ratio*100)}%`;
const eventLabel=e=>{
 if(e.type==='play')return `Play (from ${reelTime(e.position)})`;
 if(e.type==='pause')return `Pause (at ${reelTime(e.position)})`;
 if(e.type==='seek')return `Seek (from ${reelTime(e.seekFrom)} to ${reelTime(e.seekTo)})`;
 if(e.type==='switch')return `Switched away (at ${reelTime(e.position)})`;
 if(e.type==='close'||e.type==='stop')return `Closed the reel (at ${reelTime(e.position)})`;
 if(e.type==='ended')return `Finished (100% of ${reelTime(e.duration)})`;
 return e.type;
};
const RANGES=['7','30','90'];
export function createReelAnalyticsView({esc,onChange,onBack}){
 let reelId=null,loading=false,error='',data=null,trendRange='30';
 const expanded=new Set();
 async function load(id){
  reelId=id;loading=true;error='';data=null;trendRange='30';onChange?.();
  try{data=(await libraryRequest(`/api/reels?action=analytics&id=${encodeURIComponent(id)}`)).analytics;}
  catch(e){error=e.message;}
  finally{loading=false;onChange?.();}
 }
 function header(subtitle){return `<div class="heading"><div><div class="eyebrow">REEL ANALYTICS</div><h1>${esc(data?.title || 'Reel analytics')}</h1><p>${subtitle}</p></div><button id="analytics-back">Back to reel</button></div>`;}
 function trendPoints(range){
  const days=Number(range),end=new Date();end.setHours(0,0,0,0);
  const points=[];
  for(let i=days-1;i>=0;i--){
   const d=new Date(end);d.setDate(d.getDate()-i);
   const key=d.toISOString().slice(0,10);
   const found=(data.daily||[]).find(x=>x.date===key);
   points.push({date:key,direct:Number(found?.direct)||0,embed:Number(found?.embed)||0});
  }
  return points;
 }
 function trendsSection(){
  const points=trendPoints(trendRange);
  const max=Math.max(1,...points.map(p=>p.direct+p.embed));
  const barW=100/points.length,gap=Math.min(barW*0.2,1.5);
  const bars=points.map((p,i)=>{
   const directH=p.direct/max*88,embedH=p.embed/max*88,x=i*barW+gap/2,width=Math.max(0.3,barW-gap);
   const label=`${p.date}: ${p.direct} direct, ${p.embed} embedded`;
   return `<rect x="${x}" y="${90-directH}" width="${width}" height="${directH}" class="reel-chart-direct"><title>${esc(label)}</title></rect><rect x="${x}" y="${90-directH-embedH}" width="${width}" height="${embedH}" class="reel-chart-embed"><title>${esc(label)}</title></rect>`;
  }).join('');
  const totalDirect=points.reduce((s,p)=>s+p.direct,0),totalEmbed=points.reduce((s,p)=>s+p.embed,0);
  return `<section class="panel reel-analytics-trends"><div class="section-title"><h2>Sessions over time</h2><div class="button-row reel-chart-range">${RANGES.map(r=>`<button data-trend-range="${r}" class="${trendRange===r?'active':''}" ${trendRange===r?'aria-current="true"':''}>${r} days</button>`).join('')}</div></div>${totalDirect+totalEmbed?`<div class="reel-chart-legend"><span><i class="reel-chart-dot reel-chart-direct"></i>Direct link (${totalDirect})</span><span><i class="reel-chart-dot reel-chart-embed"></i>Embedded (${totalEmbed})</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" class="reel-chart">${bars}</svg>`:'<p class="muted">No sessions in this range yet.</p>'}</section>`;
 }
 function trackRankings(){
  if(!data.tracks.length)return '';
  const row=t=>`<li><span class="reel-analytics-track-title">${esc(t.trackTitle)}</span><span>${t.plays} play${t.plays===1?'':'s'}</span><span>${pct(t.avgRatio)} avg heard</span></li>`;
  const most=data.tracks.slice(0,3);
  const least=data.tracks.length>1?[...data.tracks].sort((a,b)=>a.plays-b.plays || a.avgRatio-b.avgRatio).slice(0,3):[];
  return `<section class="panel"><div class="section-title"><h2>Track performance</h2></div><div class="reel-analytics-rankings"><div><h3>Most replayed</h3><ul class="reel-analytics-tracks">${most.map(row).join('')}</ul></div>${least.length?`<div><h3>Least replayed</h3><ul class="reel-analytics-tracks">${least.map(row).join('')}</ul></div>`:''}</div></section>`;
 }
 function sessionCard(s){
  const open=expanded.has(s.id);
  const trackRows=s.tracks.map(t=>{
   const ratio=t.durationSeconds?Math.min(1,t.maxSeconds/t.durationSeconds):0;
   return `<li><div class="reel-analytics-track-row"><span>${esc(t.trackTitle)}</span><span>${Math.round(ratio*100)}% of ${reelTime(t.durationSeconds)}</span></div><div class="reel-analytics-track-bar"><div style="width:${Math.round(ratio*100)}%"></div></div></li>`;
  }).join('');
  const events=open?`<ol class="reel-analytics-events">${s.events.map(e=>`<li><span class="reel-analytics-event-dot reel-analytics-event-${e.type}" aria-hidden="true"></span><span class="reel-analytics-event-label">${esc(eventLabel(e))}</span><span class="muted">${esc(e.trackTitle)}</span><time>${fmt(e.elapsedSeconds)}</time></li>`).join('')}</ol>`:'';
  return `<article class="panel reel-session-card"><div class="reel-session-head"><div><strong>${esc(clock(s.openedAt))}</strong> <span class="reel-link-badge">${esc(s.linkName)}</span>${s.embed?'<span class="reel-embed-badge">Embed</span>':''}<span class="muted">${esc(locationLabel(s))} · ${esc(describeAgent(s.userAgent))}${s.referrer?` · from ${esc(hostFor(s.referrer))}`:''}</span></div><button data-toggle-session="${esc(s.id)}" ${s.events.length?'':'disabled'}>${open?'Hide events':'View events'} (${s.events.length})</button></div><div class="reel-session-metrics"><div><strong>${fmt(s.activeSeconds)}</strong><span>Active time</span></div><div><strong>${pct(s.completedRatio)}</strong><span>of full reel${data.totalReelSeconds?` (${reelTime(data.totalReelSeconds)})`:''}</span></div></div>${s.tracks.length?`<ul class="reel-analytics-track-list">${trackRows}</ul>`:'<p class="muted">No tracks played.</p>'}${events}</article>`;
 }
 function view(){
  if(loading&&!data)return `<section class="reel-analytics-page">${header('Loading…')}</section>`;
  if(error)return `<section class="reel-analytics-page">${header('')}<div class="project-error" role="alert">${esc(error)}</div></section>`;
  if(!data)return '';
  const stats=`<div class="stats reel-analytics-stats"><div><strong>${data.opens}</strong><span>Sessions</span></div><div><strong>${pct(data.avgCompletedRatio)}</strong><span>Avg. completed</span></div><div><strong>${data.avgSessionSeconds!=null?fmt(data.avgSessionSeconds):'—'}</strong><span>Avg. session</span></div></div>`;
  const body=data.sessions.length?`${trendsSection()}${trackRankings()}<h2 class="reel-analytics-sessions-heading">Every session</h2>${data.sessions.map(sessionCard).join('')}`:'<div class="empty"><h3>No listens yet</h3><p>Analytics appear here once someone opens one of your share links.</p></div>';
  return `<section class="reel-analytics-page">${header('Every time someone opens a share link, broken down session by session.')}${stats}${body}</section>`;
 }
 function bind(){
  document.querySelector('#analytics-back')?.addEventListener('click',()=>onBack?.());
  document.querySelectorAll('[data-toggle-session]').forEach(button=>button.onclick=()=>{const id=button.dataset.toggleSession;expanded.has(id)?expanded.delete(id):expanded.add(id);onChange?.();});
  document.querySelectorAll('[data-trend-range]').forEach(button=>button.onclick=()=>{trendRange=button.dataset.trendRange;onChange?.();});
 }
 return {view,bind,load,reelId:()=>reelId,title:()=>data?.title || ''};
}
