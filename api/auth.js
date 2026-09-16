import {authReady,settings,workos,cookie,setCookie,requireOrigin,equalState,sealFlow,openFlow,authenticate,apiError} from "../server/auth.js";
import {reply,allowMethod} from "../server/http.js";
import {upsertUser} from "../server/projects.js";
const redirect=(res,url)=>{res.statusCode=303;res.setHeader("Location",url);res.end();};
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  const url=new URL(req.url,"http://localhost"), action=url.searchParams.get("action") || "me";
  try {
    if(action==="me") {
      if(!allowMethod(req,res,"GET")) return;
      if(!authReady()) return reply(res,200,{configured:false,user:null});
      const session=await authenticate(req,res);
      return reply(res,200,{configured:true,user:session?{id:session.user.id,email:session.user.email,firstName:session.user.firstName}:null});
    }
    settings();
    if(action==="login" || action==="signup") {
      if(!allowMethod(req,res,"GET")) return;
      const flow=await workos().userManagement.getAuthorizationUrlWithPKCE({provider:"authkit",screenHint:action==="signup"?"sign-up":"sign-in",redirectUri:settings().origin+"/api/auth?action=callback"});
      setCookie(res,"cuestamp-auth-flow",await sealFlow({state:flow.state,codeVerifier:flow.codeVerifier}),600);
      return redirect(res,flow.url);
    }
    if(action==="callback") {
      if(!allowMethod(req,res,"GET")) return;
      const flow=await openFlow(cookie(req,"cuestamp-auth-flow"));
      setCookie(res,"cuestamp-auth-flow","",0);
      if(!equalState(flow.state,url.searchParams.get("state")) || !flow.codeVerifier || !url.searchParams.get("code"))
        return redirect(res,settings().origin+"/?authError=1");
      try {
        const result=await workos().userManagement.authenticateWithCode({
          code:url.searchParams.get("code"),codeVerifier:flow.codeVerifier,
          session:{sealSession:true,cookiePassword:settings().secret},
        });
        await upsertUser(result.user);
        setCookie(res,"cuestamp-session",result.sealedSession,60*60*24*7);
        return redirect(res,settings().origin+"/");
      } catch { return redirect(res,settings().origin+"/?authError=1"); }
    }
    if(action==="logout") {
      if(!allowMethod(req,res,"POST")) return;
      requireOrigin(req);
      const session=await authenticate(req,res);
      // Revoke provider session, not just the browser cookie.
      if(session) await workos().userManagement.revokeSession({sessionId:session.sessionId});
      setCookie(res,"cuestamp-session","",0);
      return reply(res,200,{ok:true});
    }
    return reply(res,404,{error:"NOT_FOUND"});
  } catch(error) {return apiError(res,error);}
}
