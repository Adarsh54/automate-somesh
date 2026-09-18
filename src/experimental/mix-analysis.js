import {offsetMasterGain} from './master-gain.js';
import {z} from 'zod';
import {sessionDuration} from './audio-engine.js';
const db=z.number().finite().min(-1000).max(1000).nullable();
const stereo=z.object({correlation:z.number().finite().min(-1).max(1).nullable(),midRmsDb:db,sideRmsDb:db}).strict();
const channel=z.object({peakDb:db,rmsDb:db,peakFrame:z.number().int().nonnegative().nullable(),overSamples:z.number().int().nonnegative()}).strict();
export const mixAnalysisSchema=z.object({sessionId:z.string().min(1).max(100),revision:z.number().int().nonnegative(),measuredAt:z.number().int().nonnegative(),sampleRate:z.union([z.literal(44100),z.literal(48000),z.literal(96000)]),frames:z.number().int().positive().max(57600000),channels:z.array(channel).length(2),stereo:stereo.optional()}).strict();
export function validateMixAnalysis(value,session,now=Date.now()){
 if(value===undefined)return undefined;const result=mixAnalysisSchema.parse(value);
 if(result.frames>600*result.sampleRate||result.sessionId!==session.id||result.revision!==session.revision||result.measuredAt>now+5000||result.frames!==Math.ceil(sessionDuration(session)*result.sampleRate))throw Error('Mix analysis does not match the current session. Analyze the mix again.');
 for(const c of result.channels){if(c.overSamples>result.frames||(c.peakFrame!==null&&c.peakFrame>=result.frames)||(c.rmsDb??-Infinity)>(c.peakDb??-Infinity)+1e-6||(c.peakDb===null)!==(c.rmsDb===null)||(c.peakDb===null)!==(c.peakFrame===null)||((c.peakDb??-Infinity)>0)!==(c.overSamples>0))throw Error('Invalid mix analysis channel.');}
 if(result.stereo){const power=db=>db===null?0:10**(db/10),[left,right]=result.channels.map(c=>power(c.rmsDb)),mid=power(result.stereo.midRmsDb),side=power(result.stereo.sideRmsDb),total=(left+right)/2;
  if(Math.abs(mid+side-total)>Math.max(total,1e-100)*1e-6||((left===0||right===0)!==(result.stereo.correlation===null)))throw Error('Invalid stereo analysis.');
  if(left&&right&&Math.abs((mid-side)-result.stereo.correlation*Math.sqrt(left*right))>Math.max(total,1e-100)*1e-6)throw Error('Inconsistent stereo correlation.');
 }
 return result;
}
export function currentMixAnalysis(value,session){try{return validateMixAnalysis(value,session);}catch{return undefined;}}
export function mixAnalysisView(value,session,busy,targetPeakDb=-1){
 const fresh=currentMixAnalysis(value,session),format=v=>v===null?'Silence':v.toFixed(2)+' dBFS';
 const peak=value?Math.max(...value.channels.map(c=>c.peakDb??-Infinity)):-Infinity,rms=value?10*Math.log10(value.channels.reduce((sum,c)=>sum+(c.rmsDb===null?0:10**(c.rmsDb/10)),0)/2):-Infinity;
 return `<section class="daw-mix-analysis"><div class="section-title"><h3>Mix analysis</h3><button data-analyze-mix ${busy?'disabled':''}>${value?'Analyze again':'Analyze mix'}</button></div>${value?`<p class="muted">${fresh?'Full stereo render':'Out of date — analyze again after edits'} · ${(value.frames/value.sampleRate).toFixed(2)} s · ${value.sampleRate/1000} kHz</p><div class="daw-analysis-values"><div><span>Sample peak</span><strong>${format(Number.isFinite(peak)?peak:null)}</strong></div><div><span>Average level · RMS</span><strong>${format(Number.isFinite(rms)?rms:null)}</strong></div><div><span>Samples over 0 dBFS</span><strong>${value.channels.reduce((sum,c)=>sum+c.overSamples,0)}</strong></div></div><div class="daw-analysis-channels">${value.channels.map((c,i)=>`<p>${i?'Right':'Left'} · Peak ${format(c.peakDb)} · RMS ${format(c.rmsDb)}</p>`).join('')}</div>${stereoAnalysisView(value.stereo)}<button data-analysis-peak ${!fresh||!Number.isFinite(peak)?'disabled':''}>Go to loudest sample</button>${peakNormalizationView(session,value,busy,targetPeakDb)}`:'<p class="muted">Measure the full mix, including effects and automation, before exporting.</p>'}<small>Measures every rendered sample. RMS is average signal level, not LUFS. Sample peaks do not measure inter-sample true peaks. Analysis respects mute and solo and excludes the metronome.</small></section>`;
}

export function peakNormalizationPlan(session,analysis,targetPeakDb){
 if(!analysis)throw Error('Analyze the mix before setting a peak target.');validateMixAnalysis(analysis,session);
 if(!Number.isFinite(targetPeakDb)||targetPeakDb<-60||targetPeakDb>0)throw Error('Enter a sample-peak target between −60 and 0 dBFS.');
 const peakDb=Math.max(...analysis.channels.map(c=>c.peakDb??-Infinity));if(!Number.isFinite(peakDb))throw Error('A silent mix has no peak to normalize.');
 const deltaDb=targetPeakDb-peakDb;offsetMasterGain(session,deltaDb);
 return {peakDb,targetPeakDb,deltaDb,commands:[{op:'master.gain.offset',target:session.id,values:{deltaDb}}]};
}
function normalizationPreview(session,analysis,target){try{const plan=peakNormalizationPlan(session,analysis,target),changed=Math.abs(plan.deltaDb)>=.001;return {plan,changed,text:changed?`${plan.deltaDb>=0?'+':''}${plan.deltaDb.toFixed(2)} dB on master volume and its automation. The mix will be analyzed again afterward.`:'The measured sample peak already matches this target.'};}catch(error){return {changed:false,text:error.message};}}
function peakNormalizationView(session,analysis,busy,target){const preview=normalizationPreview(session,analysis,target),escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');return `<form data-peak-normalize><label>Target sample peak · dBFS<input name="peak" type="number" min="-60" max="0" step="any" value="${Number.isFinite(target)?target:''}" required></label><button ${busy||!preview.changed?'disabled':''}>Apply peak target</button></form><output data-normalize-preview>${escape(preview.text)}</output>`;}
export function bindPeakNormalization(root,{session,analysis,target,onTarget,apply,guard,busy}){
 const form=root.querySelector('[data-peak-normalize]');if(!form)return;
 const update=()=>{target=form.elements.peak.value===''?NaN:Number(form.elements.peak.value);onTarget(target);const preview=normalizationPreview(session,analysis,target);root.querySelector('[data-normalize-preview]').textContent=preview.text;form.querySelector('button').disabled=busy||!preview.changed;return preview;};
 form.oninput=update;form.onsubmit=guard(async event=>{event.preventDefault();const preview=update();if(busy||!preview.changed)return;await apply(preview.plan);});
}

function stereoAnalysisView(value){if(!value)return '';const db=value=>value===null?'Silence':value.toFixed(2)+' dBFS',correlation=value.correlation;return `<div class="daw-analysis-values"><div><span>Stereo correlation</span><strong>${correlation===null?'Not defined':(correlation>=0?'+':'')+correlation.toFixed(3)}</strong>${correlation===null?'':`<meter min="-1" max="1" low="0" high="0" optimum="1" value="${correlation}" aria-label="Full-mix stereo correlation"></meter>`}</div><div><span>Mono average · RMS</span><strong>${db(value.midRmsDb)}</strong></div><div><span>Stereo difference · RMS</span><strong>${db(value.sideRmsDb)}</strong></div></div><p class="muted">Correlation compares left and right over the full render: +1 means matching shapes, 0 means no overall correlation, and negative values indicate possible cancellation in mono. It is undefined when either channel is silent. A full-mix average can hide brief problems. Mono average is (L + R) / 2; stereo difference is (L − R) / 2.</p>`;}
