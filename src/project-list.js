export function filterProjects(projects,type='all',sort='created-desc'){
 const [field,direction]=sort.split('-'),key=field==='updated'?'updated_at':'created_at',factor=direction==='asc'?1:-1;
 return projects.filter(p=>type==='all'||(p.type||'cue')===type).sort((a,b)=>factor*((Date.parse(a[key])||0)-(Date.parse(b[key])||0))||a.id.localeCompare(b.id));
}
export function projectDates(project,esc){
 const date=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?`<time datetime="${d.toISOString()}">${esc(d.toLocaleString())}</time>`:'Unknown';};
 return `Created ${date(project.created_at)} · Updated ${date(project.updated_at)}`;
}
