import {MAX_DURATION} from "../src/analysis.js";
import {encodeBlobUrlPath} from './blob-url.js';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {put,issueSignedToken,presignUrl} from '@vercel/blob';
import {runBinary} from './audio-processing.js';
import {waveformPeaks} from './reels.js';
export async function signedAudio(pathname){
 const validUntil=Date.now()+5*60*1000;
 const token=await issueSignedToken({pathname,operations:['get'],validUntil});
 return encodeBlobUrlPath((await presignUrl(token,{operation:'get',pathname,access:'private',validUntil})).presignedUrl,pathname);
}
export async function prepareAudio(asset,{sign=signedAudio,store=put}={}){
 const signal=AbortSignal.timeout(260000),url=await sign(asset.pathname);
 const input=['-protocol_whitelist','http,https,tls,tcp,crypto','-format_whitelist','mov,matroska,webm,wav,mp3,flac,ogg,aac,aiff,asf','-rw_timeout','20000000'];
 const info=JSON.parse((await runBinary(ffprobe.path,[...input,'-v','error','-show_format','-show_streams','-of','json',url],signal)).toString());
 const duration=Number(info.format.duration);
 if(!info.streams.some(s=>s.codec_type==='audio') || !Number.isFinite(duration) || duration<=0 || duration>MAX_DURATION+.1)throw Object.assign(new Error('Reel tracks must be audio files up to 60 minutes long.'),{status:400});
 const common=[...input,'-v','error','-nostdin','-threads','1','-i',url,'-map','0:a:0','-vn','-t',String(MAX_DURATION)];
 const pcm=await runBinary(ffmpeg,[...common,'-ac','1','-ar','8000','-f','f32le','pipe:1'],signal,39*1024*1024);
 const mp3=await runBinary(ffmpeg,[...common,'-map_metadata','-1','-ac','2','-ar','44100','-c:a','libmp3lame','-b:a','192k','-f','mp3','pipe:1'],signal,30*1024*1024);
 const blob=await store(`reels/${asset.id}/preview.mp3`,mp3,{access:'private',contentType:'audio/mpeg',addRandomSuffix:false,allowOverwrite:true,abortSignal:signal});
 return {pathname:blob.pathname,duration,peaks:waveformPeaks(pcm)};
}
