import {neon} from '@neondatabase/serverless';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {mediaType,MAX_MEDIA_BYTES} from '../src/media-policy.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function parseMedia(input) {
  const result=z.object({filename:z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f]+$/),size:z.number().int().positive().max(MAX_MEDIA_BYTES)}).safeParse(input);
  if(!result.success || !mediaType(result.data.filename)) throw fail('INVALID_MEDIA');
  return {...result.data,contentType:mediaType(result.data.filename)};
}
export function mediaIds(data) {return [...new Set([...Object.values(data.media?.tracks || {}),...(data.media?.movie?[data.media.movie]:[])])];}
export function createMediaRepository(query) {
  return {
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
    async validate(userId,data) {
      const ids=mediaIds(data);
      if(!ids.length)return;
      const rows=await query`SELECT id FROM media_assets WHERE user_id=${userId} AND ready=true AND id=ANY(${ids}::uuid[])`;
      if(rows.length!==ids.length)throw fail('MEDIA_NOT_READY');
    },
  };
}
export const mediaRepository=()=>createMediaRepository(neon(process.env.DATABASE_URL));
