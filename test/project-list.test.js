import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProjects,projectDates,folderCounts} from '../src/project-list.js';
test('project filters combine type and full timestamp ordering without mutating the list',()=>{
 const projects=[{id:'a',type:'reel',created_at:'2026-09-16T10:00:00Z',updated_at:'2026-09-16T13:00:00Z'},{id:'b',type:'cue',created_at:'2026-09-16T11:00:00Z',updated_at:'2026-09-16T14:00:00Z'},{id:'c',type:'reel',created_at:'2026-09-16T10:01:00Z',updated_at:'2026-09-16T12:00:00Z'}];
 assert.deepEqual(filterProjects(projects,'reel').map(p=>p.id),['c','a']);
 assert.deepEqual(filterProjects(projects,'reel','updated-desc').map(p=>p.id),['a','c']);
 assert.deepEqual(filterProjects(projects,'all','created-asc').map(p=>p.id),['a','c','b']);
 assert.deepEqual(filterProjects(projects,'cue','updated-asc').map(p=>p.id),['b']);
 assert.deepEqual(projects.map(p=>p.id),['a','b','c']);
 assert.match(projectDates(projects[0],s=>s),/datetime="2026-09-16T10:00:00.000Z"/);
});
test('project search and folder filters narrow the list independently of type/sort, case-insensitively',()=>{
 const projects=[
  {id:'a',title:'Midnight Reel',type:'reel',folderId:'f1',created_at:'2026-09-16T10:00:00Z',updated_at:'2026-09-16T10:00:00Z'},
  {id:'b',title:'Client Cue Sheet',type:'cue',folderId:'f2',created_at:'2026-09-16T11:00:00Z',updated_at:'2026-09-16T11:00:00Z'},
  {id:'c',title:'Unfiled Reel',type:'reel',folderId:null,created_at:'2026-09-16T12:00:00Z',updated_at:'2026-09-16T12:00:00Z'},
 ];
 assert.deepEqual(filterProjects(projects,'all','created-desc',{query:'reel'}).map(p=>p.id),['c','a']);
 assert.deepEqual(filterProjects(projects,'all','created-desc',{query:'MIDNIGHT'}).map(p=>p.id),['a']);
 assert.deepEqual(filterProjects(projects,'all','created-desc',{folderId:'f1'}).map(p=>p.id),['a']);
 assert.deepEqual(filterProjects(projects,'all','created-desc',{folderId:'none'}).map(p=>p.id),['c']);
 assert.deepEqual(filterProjects(projects,'all','created-desc',{folderId:'f2',query:'client'}).map(p=>p.id),['b']);
 assert.deepEqual(filterProjects(projects,'all','created-desc',{folderId:'f2',query:'reel'}).map(p=>p.id),[]);
});
test('folderCounts tallies projects per folder and separately counts unfiled projects',()=>{
 const folders=[{id:'f1',name:'A'},{id:'f2',name:'B'}];
 const projects=[{id:'a',folderId:'f1'},{id:'b',folderId:'f1'},{id:'c',folderId:'f2'},{id:'d',folderId:null},{id:'e',folderId:'stale-deleted-folder'}];
 const {counts,unfiled}=folderCounts(projects,folders);
 assert.equal(counts.get('f1'),2);
 assert.equal(counts.get('f2'),1);
 assert.equal(unfiled,2);
});
