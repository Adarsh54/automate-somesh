import {WorkOS} from "@workos-inc/node";
import {sealData, unsealData} from "iron-session";
import {timingSafeEqual} from "node:crypto";

export const authReady = () => Boolean(process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID && process.env.SESSION_SECRET?.length >= 32 && process.env.APP_URL && process.env.DATABASE_URL);
export function settings() {
  if (!authReady()) throw Object.assign(new Error("AUTH_NOT_CONFIGURED"), {status:503});
  const origin = new URL(process.env.APP_URL).origin;
  return {origin, secret:process.env.SESSION_SECRET, secure:origin.startsWith("https://")};
}
export function workos() {
  return new WorkOS({apiKey:process.env.WORKOS_API_KEY, clientId:process.env.WORKOS_CLIENT_ID});
}
export function cookie(req, name) {
  const part=(req.headers.cookie || "").split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="));
  try { return part ? decodeURIComponent(part.slice(name.length+1)) : ""; } catch { return ""; }
}
export function setCookie(res, name, value, age) {
  const existing=res.getHeader("Set-Cookie") || [];
  res.setHeader("Set-Cookie", [...(Array.isArray(existing)?existing:[existing]),
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${settings().secure?"; Secure":""}`]);
}
export function requireOrigin(req) {
  if (req.headers.origin !== settings().origin) throw Object.assign(new Error("FORBIDDEN_ORIGIN"),{status:403});
}
export function equalState(a,b) {
  return typeof a==="string" && typeof b==="string" && a.length>0 && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
export const sealFlow = data => sealData(data,{password:settings().secret,ttl:600});
export const openFlow = value => unsealData(value,{password:settings().secret,ttl:600});
export async function authenticate(req,res,client = workos) {
  settings();
  const data=cookie(req,"cuebook-session");
  if (!data) return null;
  const session=client().userManagement.loadSealedSession({sessionData:data,cookiePassword:settings().secret});
  let result=await session.authenticate();
  if (!result.authenticated) {
    result=await session.refresh();
    if (!result.authenticated) {
      if (result.retryable) throw Object.assign(new Error("AUTH_TEMPORARILY_UNAVAILABLE"),{status:503});
      setCookie(res,"cuebook-session","",0);return null;
    }
    if(result.sealedSession) setCookie(res,"cuebook-session",result.sealedSession,60*60*24*7);
  }
  return {user:result.user,sessionId:result.sessionId};
}
export function apiError(res,error) {
  const status=[400,401,403,404,409,413,415,503].includes(error.status)?error.status:500;
  res.setHeader("Cache-Control","no-store");
  return res.status(status).json({error:status===500?"INTERNAL_ERROR":error.message});
}
