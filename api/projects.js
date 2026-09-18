import {authenticate,requireOrigin,apiError} from "../server/auth.js";
import {listProjects,getProject,saveProject,deleteProject,moveProject} from "../server/projects.js";
import {foldersRepository} from "../server/folders.js";
import {reelRepository} from "../server/reels.js";
import {readJson,reply} from "../server/http.js";
export default async function handler(req,res) {
  try {
    if(!["GET","POST","DELETE"].includes(req.method)) {res.setHeader("Allow","GET, POST, DELETE");return reply(res,405,{error:"METHOD_NOT_ALLOWED"});}
    const session=await authenticate(req,res);
    if(!session) return reply(res,401,{error:"SIGN_IN_REQUIRED"});
    const action=new URL(req.url,"http://localhost").searchParams.get("action");
    if(action==="folders") {
      const repo=foldersRepository();
      if(req.method==="GET")return reply(res,200,{folders:await repo.list(session.user.id)});
      requireOrigin(req);
      const body=await readJson(req);
      if(req.method==="DELETE")return reply(res,200,{deleted:await repo.remove(session.user.id,body)});
      return reply(res,200,{folder:await (body.id?repo.rename(session.user.id,body):repo.create(session.user.id,body))});
    }
    if(action==="move") {
      if(req.method!=="POST")return reply(res,405,{error:"METHOD_NOT_ALLOWED"});
      requireOrigin(req);
      return reply(res,200,{project:await moveProject(session.user.id,await readJson(req))});
    }
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
