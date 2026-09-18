export function recordingTiming(session,now,sampleRate){
 const countInSeconds=(session?.countInBars??0)*(session?.meter??4)*60/(session?.tempo??120);
 const clickTime=Math.ceil((now+.025)*sampleRate)/sampleRate;
 const startFrame=Math.ceil((clickTime+countInSeconds)*sampleRate);
 return {clickTime,startFrame,captureTime:startFrame/sampleRate,countInSeconds};
}
