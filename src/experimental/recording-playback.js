import {scheduleSession} from './audio-engine.js';
export function scheduleRecordingPlayback(context,session,buffers,position,captureTime){
 if(!session?.recordWithPlayback)return {stop(){}};
 // This output graph is separate from the microphone capture worklet.
 // Recordings are linear takes; the transport's cycle setting does not repeat them.
 return scheduleSession(context,session,buffers,position,{baseTime:captureTime});
}
