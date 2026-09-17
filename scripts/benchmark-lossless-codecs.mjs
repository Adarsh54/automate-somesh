// Local benchmark only: no uploads or changes to the source file.
// Requires wavpack in PATH and MONKEY_AUDIO_BIN pointing to the official SDK's mac CLI.
import ffmpeg from 'ffmpeg-static';
import probe from 'ffprobe-static';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,stat,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const [input,output]=process.argv.slice(2),mac=process.env.MONKEY_AUDIO_BIN;
if(!input||!output||!mac)throw Error('Usage: MONKEY_AUDIO_BIN=/path/to/mac node scripts/benchmark-lossless-codecs.mjs input.wav NEW-output-directory');
const source=resolve(input),directory=resolve(output);
await mkdir(directory); // Refuse an existing directory to prevent overwriting previous results.
const info=JSON.parse(execFileSync(probe.path,['-v','error','-show_streams','-of','json',source],{encoding:'utf8'})),audio=info.streams.find(s=>s.codec_type==='audio');
if(!audio||!['pcm_s16le','pcm_s24le'].includes(audio.codec_name))throw Error('Only integer 16/24-bit PCM input is supported by this comparison.');
const run=(bin,args)=>new Promise((resolve,reject)=>{
 const child=spawn(bin,args,{stdio:['ignore','ignore','pipe']}),timer=setTimeout(()=>child.kill('SIGTERM'),180000);let error='';
 child.stderr.on('data',d=>error=(error+d).slice(-4000));child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`${bin} exited ${code}: ${error}`));});
});
const hashPCM=file=>new Promise((resolve,reject)=>{
 const h=createHash('sha256'),child=spawn(ffmpeg,['-v','error','-i',file,'-map','0:a:0','-c:a','pcm_s24le','-f','s24le','pipe:1'],{stdio:['ignore','pipe','pipe']});let bytes=0,error='';
 child.stdout.on('data',d=>{bytes+=d.length;h.update(d);});child.stderr.on('data',d=>error+=d);child.on('error',reject);child.on('close',code=>code===0?resolve({sha256:h.digest('hex'),bytes}):reject(Error(error)));
});
const sourceBytes=(await stat(source)).size,reference=await hashPCM(source),results=[];
const cases=[
 ...[5,8].map(level=>({name:`flac-${level}`,ext:'flac',bin:ffmpeg,args:path=>['-v','error','-n','-i',source,'-map','0:a:0','-c:a','flac','-threads','1','-compression_level',String(level),path]})),
 ...[['normal',[]],['high',['-hh']],['extra',['-hh','-x6']]].map(([name,flags])=>({name:`wavpack-${name}`,ext:'wv',bin:'wavpack',args:path=>['-q','--threads=1',...flags,source,'-o',path]})),
 ...[['normal',2000],['high',3000],['insane',5000]].map(([name,level])=>({name:`ape-${name}`,ext:'ape',bin:mac,args:path=>[source,path,`-c${level}`,'-threads=1']}))
];
for(const c of cases){
 const timings=[];let bytes,path;
 for(let i=0;i<3;i++){
  const candidate=join(directory,`${c.name}-${i}.${c.ext}`),start=performance.now();await run(c.bin,c.args(candidate));timings.push(Math.round(performance.now()-start));
  const size=(await stat(candidate)).size;if(bytes!==undefined&&bytes!==size)throw Error('Non-deterministic output size');bytes=size;
  if(i===0){path=candidate;const decoded=await hashPCM(path);if(decoded.sha256!==reference.sha256||decoded.bytes!==reference.bytes)throw Error(`${c.name}: decoded samples differ!`);}else await unlink(candidate);
 }
 const medianMs=[...timings].sort((a,b)=>a-b)[1],result={name:c.name,bytes,medianMs,timings,decodedSamplesMatch:true,estimatedSecondsAt1MBps:Number((medianMs/1000+bytes/1e6).toFixed(2)),path};results.push(result);console.log(JSON.stringify(result));
 await writeFile(join(directory,'results.json'),JSON.stringify({sourceBytes,codec:audio.codec_name,sampleRate:audio.sample_rate,channels:audio.channels,reference,threads:1,runs:3,results},null,2));
}
