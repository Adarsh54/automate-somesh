import {authenticate,requireOrigin,apiError} from "../server/auth.js";
import {listProjects,getProject,saveProject,deleteProject} from "../server/projects.js";
import {reelRepository} from "../server/reels.js";
import {readJson,reply} from "../server/http.js";
export default async function handler(req,res) {
  try {
    if(!["GET","POST","DELETE"].includes(req.method)) {res.setHeader("Allow","GET, POST, DELETE");return reply(res,405,{error:"METHOD_NOT_ALLOWED"});}
    const session=await authenticate(req,res);
    if(!session) return reply(res,401,{error:"SIGN_IN_REQUIRED"});
    if(req.method==="DELETE") {
      requireOrigin(req);
      return reply(res,200,{deleted:await deleteProject(session.user.id,await readJson(req))});
    }
    if(req.method==="POST") {
      requireOrigin(req);
      return reply(res,200,{project:await saveProject(session.user.id,await readJson(req))});
    }
    const id=new URL(req.url,"http://localhost").searchParams.get("id");
    if(id)return reply(res,200,{project:await getProject(session.user.id,id)});
    const projects=await listProjects(session.user.id);
    const published=new Set((await reelRepository().listPublished(session.user.id)).map(row=>row.project_id));
    return reply(res,200,{projects:projects.map(project=>({...project,published:published.has(project.id)}))});
  } catch(error) {return apiError(res,error);}
}
