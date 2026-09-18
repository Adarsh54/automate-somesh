export function applyProfileContact(state, profile) {
 for (const key of ['address', 'preparedBy', 'email']) {
  if (typeof profile[key] === 'string') state.production[key] = profile[key];
 }
}

export function applyProfileToAllCues(state, profile) {
 const details=()=>({category:profile.category,credits:structuredClone(profile.credits)});
 state.sharedCueDetails=details();
 state.tracks.filter(t=>t.purpose!=="library").forEach(t=>{t.cueProfile=details();t.cueProfileName=profile.name;});
 for(const cue of [...state.cues,...(state.cueDetailsArchive ?? [])]){
  Object.assign(cue,details(),{creditProfileName:profile.name});
 }
}
