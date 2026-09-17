// Audio samples remain lossless; FLAC does not preserve WAV container metadata.
export async function prepareLosslessUpload(file,{signal,onProgress=()=>{}}={}){
 signal?.throwIfAborted();
 if(!/\.wav$/i.test(file.name)||file.size<1024*1024)return file;
 return new Promise((resolve,reject)=>{
  let worker,timer;
  const finish=(result,error)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(result);};
  const abort=()=>finish(null,signal.reason);
  try{
   worker=new Worker(new URL('./lossless-upload.worker.js',import.meta.url),{type:'module'});
   signal?.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>finish(file),120000);
   worker.onerror=()=>finish(file);
   worker.onmessage=({data})=>{
    if(!data.done){onProgress(data.percentage);return;}
    const blob=data.blob;
    finish(blob&&blob.size<file.size*.95?new File([blob],file.name.replace(/\.wav$/i,'.flac'),{type:'audio/flac',lastModified:file.lastModified}):file);
   };
   onProgress(0);worker.postMessage(file);
  }catch{finish(file);}
 });
}
