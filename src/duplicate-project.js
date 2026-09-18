export function duplicateProject(project, projects = []) {
 const data = structuredClone(project.data);
 const base = (data.type === 'reel' ? data.title : data.production.title)?.trim() || 'Untitled project';
 const titles = new Set(projects.map(p => p.title));
 let index = 1, title;
 do {
  const suffix = index === 1 ? ' (copy)' : ` (copy ${index})`;
  title = base.slice(0, 300 - suffix.length) + suffix;
  index++;
 } while (titles.has(title));
 if (data.type === 'reel') data.title = title;
 else data.production.title = title;
 data.status = 'draft';
 return {id: crypto.randomUUID(), revision: 0, data};
}
