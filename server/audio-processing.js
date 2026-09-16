import {execFile} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {readQuickTimeTimecode} from '../src/metadata.js';
import {ANALYSIS_RATE,MAX_DURATION} from '../src/analysis.js';

// No shell, playlists, local files or arbitrary URLs: input is one signed Blob URL.
const protocols=['-protocol_whitelist','http,https,tls,tcp,crypto','-format_whitelist','mov,matroska,webm,wav,mp3,flac,ogg,aac,aiff,asf','-rw_timeout','20000000'];
export function runBinary(binary,args,signal,maxBuffer=32*1024*1024) {
  return new Promise((resolve,reject)=>execFile(binary,args,{encoding:'buffer',maxBuffer,timeout:240000,killSignal:'SIGKILL',signal},(error,stdout)=>{
    if(error)return reject(Object.assign(new Error(signal?.aborted?'Processing timed out. Retry with a shorter file.':'Could not decode this media. Try a WAV or MP4 export.'),{status:400}));
    resolve(stdout);
  }));
}
export function frameMetrics(timestamps) {
  const pts=timestamps.split('\n').filter(s=>s.trim() && s.split(',')[0]!=='N/A').map(s=>Number(s.split(',')[0])).filter(Number.isFinite).sort((a,b)=>a-b);
  const deltas=pts.slice(1).map((p,i)=>p-pts[i]).filter(d=>d>0);
  if(!deltas.length)return null;
  const sorted=[...deltas].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  return {frameRateIsConstant:deltas.every(d=>Math.abs(d-median)<0.0001),underlyingFrameRate:1/median};
}
export async function decodeAudio(url,size,signal) {
  const info=JSON.parse((await runBinary(ffprobe.path,[...protocols,'-v','error','-show_streams','-show_format','-of','json',url],signal)).toString());
  const audio=info.streams.find(s=>s.codec_type==='audio'),video=info.streams.find(s=>s.codec_type==='video');
  if(!audio)throw Object.assign(new Error('This file has no audio track.'),{status:400});
  const duration=Number(info.format.duration);
  if(!Number.isFinite(duration) || duration<=0 || duration>MAX_DURATION+.1)throw Object.assign(new Error('Use media up to 20 minutes long.'),{status:400});
  const start=Math.max(0,Number(info.format.start_time)||0);
  // Preserve audio's position relative to the first media timestamp, including a delayed audio track.
  const channels=Number(audio.channels);
  if(!Number.isInteger(channels) || channels<1 || channels>64)throw Object.assign(new Error("Unsupported audio channel count."),{status:400});
  const mono=Array.from({length:channels},(_,i)=>`${1/channels}*c${i}`).join("+");
  const pcm=await runBinary(ffmpeg,[...protocols,'-v','error','-nostdin','-threads','1','-copyts','-i',url,'-map','0:a:0','-vn','-t',String(MAX_DURATION),'-af',`asetpts=PTS-${start}/TB,pan=mono|c0=${mono},aresample=${ANALYSIS_RATE}:async=1:first_pts=0,apad`, '-t',String(duration),'-ac','1','-ar',String(ANALYSIS_RATE),'-f','f32le','pipe:1'],signal,Math.ceil((MAX_DURATION+1)*ANALYSIS_RATE*4));
  let metrics=null;
  if(video)metrics=frameMetrics((await runBinary(ffprobe.path,[...protocols,'-v','error','-select_streams','v:0','-show_entries','packet=pts_time','-of','csv=p=0',url],signal)).toString());
  const file={size,slice(begin,end){return {async arrayBuffer(){
    const response=await fetch(url,{headers:{Range:`bytes=${begin}-${Math.min(end,size)-1}`},signal});
    if(response.status!==206)throw Error('Range request required');
    const buffer=await response.arrayBuffer();
    if(buffer.byteLength>end-begin)throw Error('Invalid range');
    return buffer;
  }};}};
  return {pcm,metadata:{duration,codec:audio.codec_name,frameMetrics:metrics,embeddedTimecode:await readQuickTimeTimecode(file)}};
}
