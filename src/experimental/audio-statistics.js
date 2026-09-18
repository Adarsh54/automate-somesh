export function audioStatistics(channels){
 if(channels.length!==2||!channels[0]?.length||channels[0].length!==channels[1]?.length)throw Error('Analysis requires equal-length stereo channels.');
 return channels.map(samples=>{let peak=0,peakFrame=null,energy=0,overSamples=0;for(let i=0;i<samples.length;i++){const sample=samples[i];if(!Number.isFinite(sample))throw Error('The mix contains non-finite audio samples. Check effect levels.');const level=Math.abs(sample);if(level>peak){peak=level;peakFrame=i;}energy+=sample*sample;if(level>1)overSamples++;}return {peakDb:peak?20*Math.log10(peak):null,rmsDb:energy?10*Math.log10(energy/samples.length):null,peakFrame,overSamples};});
}
