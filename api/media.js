import {handleUpload} from '@vercel/blob/client';
import {head,issueSignedToken,presignUrl} from '@vercel/blob';
import {authenticate,requireOrigin,apiError} from '../server/auth.js';
import {readJson,reply} from '../server/http.js';
import {mediaRepository} from '../server/media.js';
export function createMediaHandler({auth=authenticate,repository=mediaRepository,uploadHandler=handleUpload,stat=head,sign=issueSignedToken,presign=presignUrl}={}) {
  return async function handler(req,res) {
    try {
      if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(res,405,{error:'METHOD_NOT_ALLOWED'});}
      const session=await auth(req,res);
      if(!session)return reply(res,401,{error:'SIGN_IN_REQUIRED'});
      const repo=repository(),url=new URL(req.url,'http://localhost');
      if(req.method==='GET') {
        const asset=await repo.get(session.user.id,url.searchParams.get('id'));
        if(!asset.ready)return reply(res,409,{error:'MEDIA_NOT_READY'});
        const validUntil=Date.now()+5*60*1000;
        const token=await sign({pathname:asset.pathname,operations:['get'],validUntil});
        const {presignedUrl}=await presign(token,{operation:'get',pathname:asset.pathname,access:'private',validUntil});
        return reply(res,200,{url:presignedUrl,filename:asset.filename,contentType:asset.content_type,size:Number(asset.size)});
      }
      requireOrigin(req);
      const body=await readJson(req);
      if(url.searchParams.get('action')==='reserve')return reply(res,200,{asset:await repo.reserve(session.user.id,body)});
      if(url.searchParams.get('action')==='complete') {
        const asset=await repo.get(session.user.id,body.id);
        return reply(res,200,{asset:await repo.complete(session.user.id,asset.id,await stat(asset.pathname))});
      }
      if(body.type!=='blob.generate-client-token')return reply(res,400,{error:'INVALID_UPLOAD_REQUEST'});
      const result=await uploadHandler({request:req,body,onBeforeGenerateToken:async(pathname,payload)=>{
        const asset=await repo.get(session.user.id,payload);
        if(asset.ready || asset.pathname!==pathname)throw Object.assign(new Error('INVALID_UPLOAD_TARGET'),{status:400});
        return {allowedContentTypes:[asset.content_type],maximumSizeInBytes:Number(asset.size),validUntil:Date.now()+60*60*1000,addRandomSuffix:false,allowOverwrite:false};
      }});
      return reply(res,200,result);
    } catch(error){return apiError(res,error);}
  };
}
export default createMediaHandler();
