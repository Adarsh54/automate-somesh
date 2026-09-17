export function filterProjects(projects,type='all',sort='created-desc'){
 const [field,direction]=sort.split('-'),key=field==='updated'?'updated_at':'created_at',factor=direction==='asc'?1:-1;
 return projects.filter(p=>type==='all'||(p.type||'cue')===type).sort((a,b)=>factor*((Date.parse(a[key])||0)-(Date.parse(b[key])||0))||a.id.localeCompare(b.id));
}
export function projectDates(project,esc){
 const date=(label,value)=>{
  const d=new Date(value),valid=Number.isFinite(d.getTime());
  const day=valid?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Not available';
  const clock=valid?d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'';
  const exact=valid?d.toLocaleString(undefined,{timeZoneName:'short'}):'';
  return `<div class="project-date"><dt>${label}</dt><dd>${valid?`<time datetime="${d.toISOString()}" title="${esc(exact)}"><span class="project-date-day">${esc(day)}</span><span class="project-date-clock">${esc(clock)}</span></time>`:esc(day)}</dd></div>`;
 };
 return `<dl class="project-dates">${date('Created',project.created_at)}${date('Updated',project.updated_at)}</dl>`;
}
