import {upload} from '@vercel/blob/client';
import {MAX_MEDIA_BYTES,mediaType} from './media-policy.js';
export function createCloudMedia({state,workflow,persist,request,uploadFile=upload}) {
  const uploaded=new WeakMap();
  async function prepare(snapshot,report) {
    if(workflow.busy || workflow.restoring)throw new Error('Wait for media loading or analysis to finish, then save again.');
    const files=new Map(workflow.files);
    snapshot.media ??= {tracks:{}};
    const entries=snapshot.tracks.map(t=>({key:t.id,id:snapshot.media.tracks[t.id]}));
    if(snapshot.movieMetadata || workflow.files.has('movie'))entries.push({key:'movie',id:snapshot.media.movie});
    for(const entry of entries) {
      if(entry.id)continue;
      const file=files.get(entry.key);
      if(!file)throw new Error('Reattach the missing audio or video before saving it to your account. Your draft is kept.');
      if(!mediaType(file.name) || file.size>MAX_MEDIA_BYTES)throw new Error('Use a supported audio/video file smaller than 2 GB.');
      let asset=uploaded.get(file);
      if(!asset) {
        report(`Uploading ${file.name}…`);
        asset=(await request('/api/media?action=reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,size:file.size})})).asset;
        await uploadFile(asset.pathname,file,{access:'private',handleUploadUrl:'/api/media',clientPayload:asset.id,contentType:asset.contentType,multipart:true,onUploadProgress:({percentage})=>report(`Uploading ${file.name} · ${Math.round(percentage)}%`)});
        // Keep a completed upload across a failed finalize/save, so retry doesn't upload it again.
        uploaded.set(file,asset);
      }
      await request('/api/media?action=complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:asset.id})});
      if(entry.key==='movie')snapshot.media.movie=asset.id;else snapshot.media.tracks[entry.key]=asset.id;
      if(workflow.files.get(entry.key)===file && (entry.key==='movie' || state.tracks.some(t=>t.id===entry.key))) {
        state.media ??= {tracks:{}};
        if(entry.key==='movie')state.media.movie=asset.id;else state.media.tracks[entry.key]=asset.id;
        persist();
      }
    }
    report('Saving project…');
  }
  async function restore(report) {
    if(workflow.busy)throw new Error('Wait for analysis to finish, then restore media.');
    const entries=state.tracks.filter(t=>state.media?.tracks?.[t.id] && !workflow.files.has(t.id)).map(t=>({id:state.media.tracks[t.id],track:t}));
    if(state.media?.movie && !workflow.files.has('movie'))entries.push({id:state.media.movie,movie:true});
    workflow.restoring=true;
    const failures=[];
    try {
      for(const entry of entries) {
        try {
          const media=await request('/api/media?id='+encodeURIComponent(entry.id));
          report(`Restoring ${media.filename}…`);
          const response=await fetch(media.url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15*60*1000)});
          if(!response.ok)throw new Error('Download failed');
          const blob=await response.blob();
          if(blob.size!==media.size)throw new Error('Incomplete download');
          const file=new File([blob],media.filename,{type:media.contentType});
          if(!await workflow.load(file,entry.track || null,Boolean(entry.movie),true))throw new Error('Could not decode file');
        } catch {failures.push(entry.track?.filename || 'movie');}
      }
    } finally {workflow.restoring=false;}
    if(failures.length)throw new Error(`Could not restore ${failures.join(', ')}. Retry Restore media or reattach the files. Your cues are kept.`);
    report(entries.length?'Media restored.':'Attached media is ready.');
  }
  return {prepare,restore};
}
