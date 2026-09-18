export function samplerEnvelope(settings={}){
 const p={attack:settings.sampleAttack??.005,decay:settings.sampleDecay??0,sustain:settings.sampleSustain??1,release:settings.sampleRelease??.02};
 for(const [name,max] of [['attack',10],['decay',10],['sustain',1],['release',30]])if(!Number.isFinite(p[name])||p[name]<0||p[name]>max)throw Error(`Sampler ${name} must be between 0 and ${max}.`);
 return p;
}
export const samplerRelease=track=>track.kind==='midi'&&track.instrument==='sampler'?(track.sampleRelease??.02):0;
export function heldEnvelopeAt(age,p){if(age<0)return 0;if(p.attack>0&&age<p.attack)return age/p.attack;if(p.decay>0&&age<p.attack+p.decay)return 1-(1-p.sustain)*(age-p.attack)/p.decay;return p.sustain;}
export function envelopeAt(age,gate,p){if(age<gate)return heldEnvelopeAt(age,p);if(!p.release||age>=gate+p.release)return 0;return heldEnvelopeAt(gate,p)*(1-(age-gate)/p.release);}
export function scheduleSamplerEnvelope(param,start,age,gate,velocity,p){
 param.setValueAtTime(envelopeAt(age,gate,p)*velocity,start);
 if(p.attack>age&&p.attack<=gate){param.linearRampToValueAtTime(velocity,start+p.attack-age);if(!p.decay)param.setValueAtTime(p.sustain*velocity,start+p.attack-age);}
 if(p.decay&&p.attack+p.decay>age&&p.attack+p.decay<gate)param.linearRampToValueAtTime(p.sustain*velocity,start+p.attack+p.decay-age);
 if(Number.isFinite(gate)){
  if(gate>age){const value=heldEnvelopeAt(gate,p)*velocity,time=start+gate-age;if(gate<p.attack||(p.decay>0&&gate<=p.attack+p.decay))param.linearRampToValueAtTime(value,time);else param.setValueAtTime(value,time);}
  if(gate+p.release>age){const time=start+gate+p.release-age;if(p.release)param.linearRampToValueAtTime(0,time);else param.setValueAtTime(0,time);}
 }
}
