// Local-only lossless audio benchmark; never uploads or overwrites the source.
import ffmpeg from 'ffmpeg-static';
import probe from 'ffprobe-static';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const [input,outputDir]=process.argv.slice(2);
if(!input||!outputDir)throw Error('Usage: node scripts/benchmark-flac.mjs source.wav output-directory');
const source=resolve(input),directory=resolve(outputDir),info=JSON.parse(execFileSync(probe.path,['-v','error','-show_streams','-of','json',source],{encoding:'utf8'})),audio=info.streams.find(s=>s.codec_type==='audio');
if(!audio||!['pcm_s16le','pcm_s24le'].includes(audio.codec_name))throw Error('This benchmark only accepts integer 16/24-bit PCM WAV; do not silently quantize floating-point audio.');
await mkdir(directory,{recursive:true});
const run=args=>new Promise((res,rej)=>{const child=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',d=>error+=d);child.on('error',rej);child.on('close',code=>code===0?res():rej(Error(error)));});
const hashPCM=file=>new Promise((res,rej)=>{const h=createHash('sha256'),child=spawn(ffmpeg,['-v','error','-i',file,'-map','0:a:0','-c:a','pcm_s24le','-f','s24le','pipe:1'],{stdio:['ignore','pipe','pipe']});let bytes=0,error='';child.stdout.on('data',d=>{bytes+=d.length;h.update(d);});child.stderr.on('data',d=>error+=d);child.on('error',rej);child.on('close',code=>code===0?res({sha256:h.digest('hex'),bytes}):rej(Error(error)));});
const original=await stat(source),reference=await hashPCM(source),results=[];
for(const level of [0,5,8]){
 const path=join(directory,`audio-level-${level}.flac`),start=performance.now();
 await run(['-v','error','-n','-i',source,'-map','0:a:0','-c:a','flac','-compression_level',String(level),path]);
 const compressionMs=Math.round(performance.now()-start),size=(await stat(path)).size,decoded=await hashPCM(path);
 if(decoded.sha256!==reference.sha256||decoded.bytes!==reference.bytes)throw Error('Decoded audio differs from source!');
 const result={level,path,compressionMs,bytes:size,reductionPercent:Number(((1-size/original.size)*100).toFixed(1)),decodedSamplesMatch:true,estimatedSecondsAt1MBps:Number((compressionMs/1000+size/1e6).toFixed(2))};results.push(result);console.log(JSON.stringify(result));
}
await writeFile(join(directory,'results.json'),JSON.stringify({sourceBytes:original.size,codec:audio.codec_name,sampleRate:audio.sample_rate,channels:audio.channels,duration:audio.duration,reference,results},null,2));
