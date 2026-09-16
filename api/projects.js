import {authenticate,requireOrigin,apiError} from "../server/auth.js";
import {listProjects,getProject,saveProject} from "../server/projects.js";
import {readJson,reply} from "../server/http.js";
export default async function handler(req,res) {
  try {
    if(!["GET","POST"].includes(req.method)) {res.setHeader("Allow","GET, POST");return reply(res,405,{error:"METHOD_NOT_ALLOWED"});}
    const session=await authenticate(req,res);
    if(!session) return reply(res,401,{error:"SIGN_IN_REQUIRED"});
    if(req.method==="POST") {
      requireOrigin(req);
      return reply(res,200,{project:await saveProject(session.user.id,await readJson(req))});
    }
    const id=new URL(req.url,"http://localhost").searchParams.get("id");
    return reply(res,200,id?{project:await getProject(session.user.id,id)}:{projects:await listProjects(session.user.id)});
  } catch(error) {return apiError(res,error);}
}
