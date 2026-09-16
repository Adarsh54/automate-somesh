import {neon} from '@neondatabase/serverless';
import {randomUUID,createHmac} from 'node:crypto';
import {sealData,unsealData} from 'iron-session';
import {cookie,setCookie,settings} from './auth.js';
import {parseMedia} from './media.js';
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export async function analysisOwner(req,res) {
  const password=settings().secret;
  const data=await unsealData(cookie(req,'cuestamp-analysis'),{password,ttl:86400});
  if(typeof data.id==='string' && /^[\da-f-]{36}$/.test(data.id))return data.id;
  const id=randomUUID();
  setCookie(res,'cuestamp-analysis',await sealData({id},{password,ttl:86400}),86400);
  return id;
}
export function clientQuotaKey(req) {
  // Vercel overwrites this header. Never trust a caller-supplied X-Forwarded-For.
  const ip=process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  return createHmac('sha256',settings().secret).update(String(ip || 'unknown')).digest('hex');
}
export function createAnalysisRepository(query) {
  return {
    async quota(key,maximum) {
      const day=new Date().toISOString().slice(0,10);
      const rows=await query`INSERT INTO analysis_limits(key,count,expires_at) VALUES(${day+':'+key},1,now()+interval '2 days')
        ON CONFLICT(key) DO UPDATE SET count=analysis_limits.count+1 WHERE analysis_limits.count<${maximum} RETURNING count`;
      if(!rows.length)throw fail('Daily processing limit reached. Try again tomorrow.',429);
    },
    async reserve(owner,input) {
      const {filename,size,contentType}=parseMedia(input),id=randomUUID(),pathname=`analysis/${id}/source`;
      await query`INSERT INTO analysis_assets(id,owner,pathname,filename,content_type,size) VALUES(${id},${owner},${pathname},${filename},${contentType},${size})`;
      return {id,pathname,filename,size,contentType};
    },
    async get(owner,id) {
      if(typeof id!=='string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/.test(id))throw fail('Analysis file not found. Reattach the file.',404);
      const rows=await query`SELECT * FROM analysis_assets WHERE id=${id} AND owner=${owner} AND expires_at>now()`;
      if(!rows[0])throw fail('Analysis file expired. Reattach the file.',404);
      return rows[0];
    },
    async complete(owner,id,metadata) {
      await query`UPDATE analysis_assets SET metadata=${JSON.stringify(metadata)}::jsonb WHERE id=${id} AND owner=${owner}`;
    },
    async lease(owner) {
      const token=randomUUID();
      const rows=await query`INSERT INTO analysis_leases(owner,token,expires_at) VALUES(${owner},${token},now()+interval '5 minutes')
        ON CONFLICT(owner) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at WHERE analysis_leases.expires_at<now() RETURNING token`;
      if(!rows.length)throw fail('A previous processing request is finishing. Please retry shortly.',409);
      return token;
    },
    async release(owner,token) {await query`DELETE FROM analysis_leases WHERE owner=${owner} AND token=${token}`;},
    async expired() {return query`SELECT id,pathname FROM analysis_assets WHERE expires_at<now() ORDER BY expires_at LIMIT 100`;},
    async remove(id) {await query`DELETE FROM analysis_assets WHERE id=${id} AND expires_at<now()`;},
    async prune() {
      await query`DELETE FROM analysis_limits WHERE expires_at<now()`;
      await query`DELETE FROM analysis_leases WHERE expires_at<now()`;
    },
  };
}
export const analysisRepository=()=>createAnalysisRepository(neon(process.env.DATABASE_URL));
