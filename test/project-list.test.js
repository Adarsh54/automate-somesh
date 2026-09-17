import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProjects,projectDates} from '../src/project-list.js';
test('project filters combine type and full timestamp ordering without mutating the list',()=>{
 const projects=[{id:'a',type:'reel',created_at:'2026-09-16T10:00:00Z',updated_at:'2026-09-16T13:00:00Z'},{id:'b',type:'cue',created_at:'2026-09-16T11:00:00Z',updated_at:'2026-09-16T14:00:00Z'},{id:'c',type:'reel',created_at:'2026-09-16T10:01:00Z',updated_at:'2026-09-16T12:00:00Z'}];
 assert.deepEqual(filterProjects(projects,'reel').map(p=>p.id),['c','a']);
 assert.deepEqual(filterProjects(projects,'reel','updated-desc').map(p=>p.id),['a','c']);
 assert.deepEqual(filterProjects(projects,'all','created-asc').map(p=>p.id),['a','c','b']);
 assert.deepEqual(filterProjects(projects,'cue','updated-asc').map(p=>p.id),['b']);
 assert.deepEqual(projects.map(p=>p.id),['a','b','c']);
 assert.match(projectDates(projects[0],s=>s),/datetime="2026-09-16T10:00:00.000Z"/);
});
