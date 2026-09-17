import {z} from 'zod';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {put,del} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {runBinary} from './audio-processing.js';
import {signedAudio} from './reel-processing.js';
const fail=message=>Object.assign(new Error(message),{status:400});
export function parseEdit(input){
 const parsed=z.object({start:z.number().finite().min(0),end:z.number().finite().positive().max(3600),fadeIn:z.number().finite().min(0),fadeOut:z.number().finite().min(0),normalize:z.boolean(),targetPeakDb:z.number().finite().min(-60).max(0).optional()}).safeParse(input);
 if(!parsed.success)throw fail('Enter valid times in seconds.');
 const edit=parsed.data,length=edit.end-edit.start;
 if(length<.05||edit.fadeIn+edit.fadeOut>length)throw fail('The snippet must be at least 0.05 seconds. Fades must fit inside it.');
 return edit;
}
export function editFilter(edit,gain=1){
 const filters=[`atrim=start=${edit.start}:end=${edit.end}`,'asetpts=PTS-STARTPTS'];
 if(gain!==1)filters.push(`volume=${gain}`);
 if(edit.fadeIn)filters.push(`afade=t=in:st=0:d=${edit.fadeIn}`);
 if(edit.fadeOut)filters.push(`afade=t=out:st=${edit.end-edit.start-edit.fadeOut}:d=${edit.fadeOut}`);
 return filters.join(',');
}
export async function renderEdit(source,recipe,{sign=signedAudio,store=put}={}){
 const edit=parseEdit(recipe),signal=AbortSignal.timeout(260000),url=await sign(source.pathname);
 const protocols=['-protocol_whitelist','http,https,tls,tcp,crypto','-format_whitelist','mov,matroska,webm,wav,mp3,flac,ogg,aac,aiff,asf','-rw_timeout','20000000'];
 const info=JSON.parse((await runBinary(ffprobe.path,[...protocols,'-v','error','-show_format','-show_streams','-of','json',url],signal)).toString());
 const stream=info.streams.find(s=>s.codec_type==='audio'),duration=Number(info.format.duration);
 if(!stream||!Number.isFinite(duration)||duration>3600.1||edit.end>duration+.01||stream.channels>8)throw fail('Choose an audio file up to 60 minutes with a snippet inside its duration.');
 const dir=await mkdtemp(join(tmpdir(),'cuestamp-edit-'));
 try{
  const input=[...protocols,'-v','error','-nostdin','-threads','1','-i',url,'-map','0:a:0','-vn'];
  let gain=1;
  if(edit.normalize){
   // astats measures every channel without mixing them, avoiding cancellation.
   const stats=join(dir,'peaks.txt');
   await runBinary(ffmpeg,[...input,'-af',`atrim=start=${edit.start}:end=${edit.end},astats=metadata=1:reset=0,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=${stats}`,'-f','null','-'],signal);
   const matches=[...(await readFile(stats,'utf8')).matchAll(/lavfi.astats.Overall.Peak_level=([^\s]+)/g)];
   const peak=Number(matches.at(-1)?.[1]);
   if(Number.isFinite(peak))gain=10**(((edit.targetPeakDb??-1)-peak)/20);
  }
  const path=join(dir,'edited.flac');
  await runBinary(ffmpeg,[...input,'-af',editFilter(edit,gain),'-map_metadata','-1','-c:a','flac','-sample_fmt','s32','-compression_level','5','-fs',String(512*1024*1024+1),path],signal);
  const size=(await stat(path)).size;
  if(size>512*1024*1024)throw fail('Edited audio exceeds 512 MB. Choose a shorter snippet.');
  const blob=await store(`audio-edits/${randomUUID()}/edited.flac`,await readFile(path),{access:'private',contentType:'audio/flac',addRandomSuffix:false,abortSignal:signal});
  return {pathname:blob.pathname,size};
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function saveAudioEdit(repo,userId,input,{render=renderEdit,remove=del}={}){
 const edit=parseEdit(input.edit);
 if(!['replace','copy'].includes(input.mode))throw fail('Choose Save changes or Save as copy.');
 const asset=await repo.get(userId,input.id);
 if(!asset.ready||!asset.content_type.startsWith('audio/'))throw fail('Wait for the audio upload to finish.');
 const source=asset.source_id?await repo.get(userId,asset.source_id):asset;
 const output=await render(source,edit);
 try{return await repo.saveEdit(userId,asset,source,edit,input.mode,output);}
 catch(error){await remove(output.pathname).catch(()=>{});throw error;}
}
