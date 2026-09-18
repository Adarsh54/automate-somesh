export const recordingChannelModes=[['stereo','Stereo / native'],['left','Mono · Input 1 (left)'],['right','Mono · Input 2 (right)']];
export function validateRecordingChannels(mode,available){
 if(!recordingChannelModes.some(([id])=>id===mode))throw Error('Choose stereo, input 1, or input 2.');
 if(mode==='right'&&Number.isFinite(available)&&available<2)throw Error('This input provides only one channel. Choose Input 1 or Stereo / native.');
}
// Channel selection precedes both capture and monitoring; never sum L/R for mono.
export function createRecordingChannels(context,source,mode='stereo'){
 validateRecordingChannels(mode);
 if(mode==='stereo')return {output:source,stop(){}};
 const splitter=context.createChannelSplitter(2),output=context.createGain();let stopped=false;
 output.channelCount=1;output.channelCountMode='explicit';output.channelInterpretation='discrete';
 source.connect(splitter);splitter.connect(output,mode==='left'?0:1);
 return {output,stop(){if(stopped)return;stopped=true;source.disconnect(splitter);splitter.disconnect();output.disconnect();}};
}
