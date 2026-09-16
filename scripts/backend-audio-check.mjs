// Real native-decoder regression using generated fixtures; no cloud credentials.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,readFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import assert from 'node:assert/strict';
import {decodeAudio} from '../server/audio-processing.js';
import {analyzeAudio} from '../server/analyze.js';
const fixtures=resolve(process.env.FIXTURES || '/tmp/cuestamp-fixtures');
const server=createServer(async(req,res)=>{
 try {
  const path=resolve(fixtures,basename(req.url)),{size}=await stat(path),range=/bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
  res.writeHead(range?206:200,{'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
  createReadStream(path,{start,end}).pipe(res);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const decode=async name=>{
 const result=await decodeAudio(`http://127.0.0.1:${server.address().port}/${name}`,(await stat(resolve(fixtures,name))).size,AbortSignal.timeout(260000));
 return {...result,samples:new Float32Array(result.pcm.buffer.slice(result.pcm.byteOffset,result.pcm.byteOffset+result.pcm.length))};
};
try {
 const expected=JSON.parse(await readFile(resolve(fixtures,'expected.json'))),started=performance.now();
 const movie=await decode('movie.mp4');
 assert.ok(Math.abs(movie.metadata.duration-expected.duration)<.1);
 for(const name of ['cue-a','cue-b','unmatched']) {
  const track=await decode(name+'.wav');
  const result=await analyzeAudio({mode:'movie',movie:movie.samples,track:track.samples,options:{threshold:.45}},AbortSignal.timeout(260000));
  const wanted=expected[name] || [];
  assert.equal(result.matches.length,wanted.length,name);
  result.matches.forEach((m,i)=>{assert.ok(Math.abs(m.start-wanted[i][0])<.2,`${name} start ${m.start}`);assert.ok(Math.abs(m.end-wanted[i][1])<.2,`${name} end ${m.end}`);});
 }
 const score=await decode('score.wav');
 const regions=await analyzeAudio({mode:'offset',track:score.samples,options:{thresholdDb:-100,gap:3,minimum:.5}},AbortSignal.timeout(260000));
 assert.equal(regions.matches.length,2);
 for(const [i,m] of regions.matches.entries()){assert.ok(Math.abs(m.start-expected.score[i][0])<.2);assert.ok(Math.abs(m.end-expected.score[i][1])<.2);}
 for(const name of ['movie-tc.mov','movie-df.mov','movie-vfr.mp4','movie25.mov']) {
  const {metadata}=await decode(name);
  if(name==='movie-tc.mov')assert.equal(metadata.embeddedTimecode.timecode,'00:59:55:00');
  if(name==='movie-df.mov')assert.equal(metadata.embeddedTimecode.rate,'29.97df');
  if(name==='movie-vfr.mp4')assert.equal(metadata.frameMetrics.frameRateIsConstant,false);
  if(name==='movie25.mov'){assert.equal(metadata.frameMetrics.frameRateIsConstant,true);assert.ok(Math.abs(metadata.frameMetrics.underlyingFrameRate-25)<.005);}
 }
 console.log(`Native backend fixtures passed in ${((performance.now()-started)/1000).toFixed(1)}s: 10-minute movie, five placements, unrelated rejection, silence, VFR and embedded timecode.`);
}finally{server.closeAllConnections();server.close();}
