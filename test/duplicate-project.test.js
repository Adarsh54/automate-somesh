import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateProject} from '../src/duplicate-project.js';
test('cue copy gets independent project identity while preserving timings, credits and media',()=>{
 const source={id:'original',revision:4,data:{production:{title:'Film'},status:'completed',tracks:[{id:'track'}],cues:[{trackId:'track',start:'01:00:00:00',credits:[{name:'Writer'}]}],media:{tracks:{track:'asset'}}}};
 const copy=duplicateProject(source,[{title:'Film (copy)'}]);
 assert.notEqual(copy.id,source.id);assert.equal(copy.revision,0);assert.equal(copy.data.production.title,'Film (copy 2)');assert.equal(copy.data.status,'draft');
 assert.deepEqual(copy.data.media,source.data.media);assert.deepEqual(copy.data.cues,source.data.cues);
 copy.data.cues[0].credits[0].name='Other';assert.equal(source.data.cues[0].credits[0].name,'Writer');assert.equal(source.data.status,'completed');
});
test('reel copy keeps playlist and presentation but does not copy publication metadata',()=>{
 const source={id:'original',revision:3,published:true,token:'private-token',data:{type:'reel',title:'A'.repeat(300),status:'draft',audioIds:['asset'],profile:{name:'Composer'},appearance:{theme:'dark'}}};
 const copy=duplicateProject(source);
 assert.equal(copy.data.title.length,300);assert(copy.data.title.endsWith(' (copy)'));assert.deepEqual(copy.data.audioIds,['asset']);assert.deepEqual(copy.data.profile,source.data.profile);assert.equal(copy.token,undefined);assert.equal(copy.published,undefined);
});
