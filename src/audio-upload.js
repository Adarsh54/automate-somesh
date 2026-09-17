export const useMultipartUpload=file=>file.size>100_000_000;
// Stop a stalled transfer without leaving its caller permanently busy.
export async function uploadAudioFile(upload,pathname,file,options,{onProgress=()=>{},onController=()=>{},stallMs=120000}={}){
 const controller=new AbortController();let timer,lastLoaded=-1;
 const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new Error('Upload stalled. Check your connection and retry.')),stallMs);};
 onController(controller);reset();
 const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
 try{return await Promise.race([upload(pathname,file,{...options,abortSignal:controller.signal,onUploadProgress:progress=>{if(progress.loaded>lastLoaded){lastLoaded=progress.loaded;reset();}onProgress(progress);}}),aborted]);}
 finally{clearTimeout(timer);onController(null);}
}
