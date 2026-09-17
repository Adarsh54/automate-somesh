// Development-only integration check. Uses synthetic audio and removes its rows/Blobs.
import {neon} from '@neondatabase/serverless';
import {put,del} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {createMediaRepository} from '../server/media.js';
import {createProjectRepository} from '../server/projects.js';
import {createReelRepository} from '../server/reels.js';
import {prepareAudio} from '../server/reel-processing.js';
if(process.env.APP_URL!=='http://127.0.0.1:5190')throw Error('Run only with the documented local development environment.');
const query=neon(process.env.DATABASE_URL),user='reel-smoke-'+randomUUID(),paths=[];
try{
 await query`INSERT INTO app_users(id,email) VALUES(${user},${user+'@example.invalid'})`;
 const wav=Buffer.alloc(80044);wav.write('RIFF');wav.writeUInt32LE(80036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(80000,40);for(let i=0;i<40000;i++)wav.writeInt16LE(Math.round(2500*Math.sin(2*Math.PI*440*i/8000)*Math.sin(i/4000)**2),44+i*2);
 const media=createMediaRepository(query),projects=createProjectRepository(query),reels=createReelRepository(query);
 const asset=await media.reserve(user,{filename:'Synthetic reel & test.wav',size:wav.length});paths.push(asset.pathname);
 await put(asset.pathname,wav,{access:'private',contentType:asset.contentType,addRandomSuffix:false});await media.complete(user,asset.id,{pathname:asset.pathname,size:wav.length,contentType:asset.contentType});
 const audio=await reels.prepare(user,asset.id,prepareAudio);paths.push(audio.pathname);assert.equal(audio.peaks.length,360);
 const id=randomUUID();await projects.save(user,{id,revision:0,data:{type:'reel',title:'Synthetic reel integration test',status:'draft',audioIds:[asset.id]}});
 const publication=await reels.publish(user,{id,revision:1,allowDownloads:true});
 const result=await promisify(execFile)(process.execPath,['scripts/browser-reel-check.cjs'],{env:{...process.env,CUESTAMP_REEL_URL:`${process.env.APP_URL}/reel.html?token=${publication.token}`},timeout:90000});process.stdout.write(result.stdout);
 await reels.revoke(user,id);const response=await fetch(`${process.env.APP_URL}/api/reels?action=public&token=${publication.token}`);assert.equal(response.status,404);
 console.log('PASS live development Neon + private Blob + FFmpeg + public API + browser playback + revocation.');
}finally{
 if(paths.length)await del(paths);
 await query`DELETE FROM app_users WHERE id=${user}`;
 console.log('Removed synthetic test assets and account.');
}
