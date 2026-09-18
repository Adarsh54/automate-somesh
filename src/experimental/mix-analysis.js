import {z} from 'zod';
import {sessionDuration} from './audio-engine.js';
const db=z.number().finite().min(-1000).max(1000).nullable();
const channel=z.object({peakDb:db,rmsDb:db,peakFrame:z.number().int().nonnegative().nullable(),overSamples:z.number().int().nonnegative()}).strict();
export const mixAnalysisSchema=z.object({sessionId:z.string().min(1).max(100),revision:z.number().int().nonnegative(),measuredAt:z.number().int().nonnegative(),sampleRate:z.union([z.literal(44100),z.literal(48000),z.literal(96000)]),frames:z.number().int().positive().max(57600000),channels:z.array(channel).length(2)}).strict();
export function validateMixAnalysis(value,session,now=Date.now()){
 if(value===undefined)return undefined;const result=mixAnalysisSchema.parse(value);
 if(result.frames>600*result.sampleRate||result.sessionId!==session.id||result.revision!==session.revision||result.measuredAt>now+5000||result.frames!==Math.ceil(sessionDuration(session)*result.sampleRate))throw Error('Mix analysis does not match the current session. Analyze the mix again.');
 for(const c of result.channels){if(c.overSamples>result.frames||(c.peakFrame!==null&&c.peakFrame>=result.frames)||(c.rmsDb??-Infinity)>(c.peakDb??-Infinity)+1e-6||(c.peakDb===null)!==(c.rmsDb===null)||(c.peakDb===null)!==(c.peakFrame===null)||((c.peakDb??-Infinity)>0)!==(c.overSamples>0))throw Error('Invalid mix analysis channel.');}
 return result;
}
export function currentMixAnalysis(value,session){try{return validateMixAnalysis(value,session);}catch{return undefined;}}
export function mixAnalysisView(value,session,busy){
 const fresh=currentMixAnalysis(value,session),format=v=>v===null?'Silence':v.toFixed(2)+' dBFS';
 const peak=value?Math.max(...value.channels.map(c=>c.peakDb??-Infinity)):-Infinity,rms=value?10*Math.log10(value.channels.reduce((sum,c)=>sum+(c.rmsDb===null?0:10**(c.rmsDb/10)),0)/2):-Infinity;
 return `<section class="daw-mix-analysis"><div class="section-title"><h3>Mix analysis</h3><button data-analyze-mix ${busy?'disabled':''}>${value?'Analyze again':'Analyze mix'}</button></div>${value?`<p class="muted">${fresh?'Full stereo render':'Out of date — analyze again after edits'} · ${(value.frames/value.sampleRate).toFixed(2)} s · ${value.sampleRate/1000} kHz</p><div class="daw-analysis-values"><div><span>Sample peak</span><strong>${format(Number.isFinite(peak)?peak:null)}</strong></div><div><span>Average level · RMS</span><strong>${format(Number.isFinite(rms)?rms:null)}</strong></div><div><span>Samples over 0 dBFS</span><strong>${value.channels.reduce((sum,c)=>sum+c.overSamples,0)}</strong></div></div><div class="daw-analysis-channels">${value.channels.map((c,i)=>`<p>${i?'Right':'Left'} · Peak ${format(c.peakDb)} · RMS ${format(c.rmsDb)}</p>`).join('')}</div><button data-analysis-peak ${!fresh||!Number.isFinite(peak)?'disabled':''}>Go to loudest sample</button>`:'<p class="muted">Measure the full mix, including effects and automation, before exporting.</p>'}<small>Measures every rendered sample. RMS is average signal level, not LUFS. Sample peaks do not measure inter-sample true peaks. Analysis respects mute and solo and excludes the metronome.</small></section>`;
}
