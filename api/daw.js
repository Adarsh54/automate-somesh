import {authenticate,requireOrigin,apiError} from '../server/auth.js';
import {readJson,reply} from '../server/http.js';
import {agentConfigured,planDawEdit} from '../server/daw-agent.js';
export function createDawHandler({auth=authenticate,plan=planDawEdit,configured=agentConfigured}={}){return async(req,res)=>{try{
 if(req.method==='GET')return reply(res,200,{configured:configured()});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return reply(res,405,{error:'METHOD_NOT_ALLOWED'});}
 if(!await auth(req,res))return reply(res,401,{error:'Sign in to use the agent.'});requireOrigin(req);
 return reply(res,200,await plan(await readJson(req)));
 }catch(error){if(error.name==='ZodError')return reply(res,400,{error:'Invalid session or command. No edits applied.'});return apiError(res,error);}};}
export default createDawHandler();
