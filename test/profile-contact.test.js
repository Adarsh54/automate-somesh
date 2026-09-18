import test from 'node:test';
import assert from 'node:assert/strict';
import {applyProfileContact,applyProfileToAllCues} from '../src/profile-contact.js';
test('applying a profile copies contact details into cue sheet production fields',()=>{
 const state={production:{title:'Film',address:'Old',preparedBy:'Old',email:'old@example.com'}};
 const profile={address:'123 Music Lane',preparedBy:'Composer',email:'composer@example.com'};
 applyProfileContact(state,profile);assert.deepEqual(state.production,{title:'Film',...profile});
 state.production.preparedBy='Edited';assert.equal(profile.preparedBy,'Composer');
});
test('legacy profiles preserve existing contacts; intentional blanks clear them',()=>{
 const state={production:{address:'Keep',preparedBy:'Keep',email:'keep@example.com'}};
 applyProfileContact(state,{name:'Legacy'});assert.equal(state.production.address,'Keep');
 applyProfileContact(state,{address:'',preparedBy:'',email:''});assert.deepEqual(state.production,{address:'',preparedBy:'',email:''});
});

test('bulk profile applies independently to every cue, future detections and archived cues',()=>{
 const state={tracks:[{id:'score'},{id:'library',purpose:'library'}],cues:[{id:'a'},{id:'b'}],cueDetailsArchive:[{id:'old'}]};
 const profile={name:'My credits',category:'original',credits:[{role:'Composer',last:'Writer'}]};
 applyProfileToAllCues(state,profile);
 for(const cue of [...state.cues,...state.cueDetailsArchive])assert.deepEqual(cue.credits,profile.credits);
 assert.equal(state.tracks[0].cueProfileName,profile.name);assert.equal(state.tracks[1].cueProfile,undefined);
 state.cues[0].credits[0].last='Edited';assert.equal(state.cues[1].credits[0].last,'Writer');assert.equal(profile.credits[0].last,'Writer');
});
