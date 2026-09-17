import {neon} from '@neondatabase/serverless';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {mediaType,MAX_MEDIA_BYTES} from '../src/media-policy.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function parseMedia(input) {
  const result=z.object({filename:z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f]+$/),size:z.number().int().positive().max(MAX_MEDIA_BYTES)}).safeParse(input);
  const pdf=result.success&&/\.pdf$/i.test(result.data.filename)&&result.data.size<=10*1024*1024;
  if(!result.success || (!pdf&&!mediaType(result.data.filename))) throw fail('INVALID_MEDIA');
  return {...result.data,contentType:pdf?'application/pdf':mediaType(result.data.filename)};
}
export function mediaIds(data) {return [...new Set([...(data.type==='reel'?[...data.audioIds,...(data.resumeId?[data.resumeId]:[])]:[]),...Object.values(data.media?.tracks || {}),...(data.media?.movie?[data.media.movie]:[])])];}
export function createMediaRepository(query) {
  return {
    async listAudio(userId) {
      return query`SELECT id,filename,content_type,size,created_at,source_id,parent_id,edit_recipe,superseded_by FROM media_assets WHERE user_id=${userId} AND ready=true AND content_type LIKE 'audio/%' ORDER BY created_at DESC`;
    },
    async reserve(userId,input) {
      const {filename,size,contentType}=parseMedia(input),id=randomUUID(),pathname=`media/${id}/${encodeURIComponent(filename)}`;
      await query`INSERT INTO media_assets(id,user_id,pathname,filename,content_type,size) VALUES(${id},${userId},${pathname},${filename},${contentType},${size})`;
      return {id,pathname,filename,contentType,size};
    },
    async get(userId,id) {
      if(!z.uuid().safeParse(id).success) throw fail('NOT_FOUND',404);
      const rows=await query`SELECT * FROM media_assets WHERE id=${id} AND user_id=${userId}`;
      if(!rows[0]) throw fail('NOT_FOUND',404);
      return rows[0];
    },
    async complete(userId,id,blob) {
      const asset=await this.get(userId,id);
      if(blob.pathname!==asset.pathname || Number(blob.size)!==Number(asset.size) || blob.contentType.split(';')[0]!==asset.content_type)
        throw fail('MEDIA_UPLOAD_MISMATCH');
      await query`UPDATE media_assets SET ready=true WHERE id=${id} AND user_id=${userId}`;
      return {id:asset.id};
    },
    async saveEdit(userId,asset,source,edit,mode,output) {
      const id=randomUUID(),filename=asset.filename.replace(/\.[^.]+$/,'').replace(/ — reel$/,'')+' — reel.flac';
      // One statement keeps replacement and insertion atomic. Existing projects keep immutable audio IDs.
      const rows=await query`WITH target AS (SELECT * FROM media_assets WHERE id=${asset.id} AND user_id=${userId} FOR UPDATE), inserted AS (
        INSERT INTO media_assets(id,user_id,pathname,filename,content_type,size,ready,source_id,parent_id,edit_recipe)
        SELECT ${id},${userId},${output.pathname},${filename},'audio/flac',${output.size},true,${source.id},${asset.id},${JSON.stringify(edit)}::jsonb
        FROM target WHERE ${mode}='copy' OR superseded_by IS NULL
        RETURNING *
      ), replaced AS (UPDATE media_assets SET superseded_by=${id} WHERE id=${asset.id} AND user_id=${userId} AND ${mode}='replace' AND EXISTS(SELECT 1 FROM inserted) RETURNING id)
      SELECT id,filename,size,source_id,parent_id,edit_recipe FROM inserted`;
      if(!rows[0])throw fail('This audio was edited elsewhere. Refresh your library.',409);
      return rows[0];
    },
    async validate(userId,data) {
      const ids=mediaIds(data);
      if(!ids.length)return;
      const rows=await query`SELECT id FROM media_assets WHERE user_id=${userId} AND ready=true AND id=ANY(${ids}::uuid[])`;
      if(rows.length!==ids.length)throw fail('MEDIA_NOT_READY');
      if(data.type==='reel'){
        if(data.resumeId){const resume=await this.get(userId,data.resumeId);if(resume.content_type!=='application/pdf'||Number(resume.size)>10*1024*1024)throw fail('INVALID_RESUME');}
        const audio=await query`SELECT id FROM media_assets WHERE user_id=${userId} AND ready=true AND content_type LIKE 'audio/%' AND id=ANY(${data.audioIds}::uuid[])`;
        if(audio.length!==data.audioIds.length)throw fail('INVALID_REEL_AUDIO');
      }
    },
  };
}
export const mediaRepository=()=>createMediaRepository(neon(process.env.DATABASE_URL));
