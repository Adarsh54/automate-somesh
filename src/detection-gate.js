import {scoreOffset} from './score-offset.js';
export function detectionKey(state) {
 return JSON.stringify({rate:state.production.rate,offset:scoreOffset(state),threshold:Number(state.thresholdDb),gap:Number(state.silenceGap),tracks:state.tracks.filter(t=>t.purpose!=='library').map(t=>({id:t.id,filename:t.filename,duration:t.duration,offset:t.offset}))});
}
export function detectionReady(state) {
 return state.tracks.some(t=>t.purpose!=='library') && state.analysisReport?.detectionKey===detectionKey(state);
}
