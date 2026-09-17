import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {createMediaRepository} from "./media.js";
import {validateProject} from "./services/validate-project.js";
import {rates} from "../src/timecode.js";
const sql=()=>neon(process.env.DATABASE_URL);
export async function upsertUser(user) {
  await sql()`INSERT INTO app_users(id,email,first_name,last_name) VALUES(${user.id},${user.email},${user.firstName||null},${user.lastName||null})
    ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,updated_at=now()`;
}
const identifier=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const text=z.string().max(10000);
const credit=z.object({id:identifier.optional(),role:z.enum(["Composer","Publisher"]),first:text.default(""),last:text.default(""),name:text.default(""),pro:text.default(""),ipi:text.default(""),share:z.union([z.string(),z.number().finite()])});
const cue=z.object({id:identifier,trackId:identifier,title:text.optional(),start:text.optional(),end:text.optional(),usage:text.optional(),credits:z.array(credit).max(100).optional(),category:z.enum(["original","sourced","unknown"]).optional()}).passthrough();
const stateSchema=z.object({
  type:z.literal("cue").optional(),
  production:z.object({title:text,rate:z.enum(Object.keys(rates))}).catchall(text),
  tracks:z.array(z.object({id:identifier,title:text,filename:text,offset:text}).passthrough()).max(500),
  cues:z.array(cue).max(2000),
  sharedCueDetails:z.object({category:z.enum(["original","sourced","unknown"]),credits:z.array(credit).max(100)}),
  mode:z.enum(["movie","offset","manual"]),movieOffset:text,scoreOffset:text.optional(),
  silenceGap:z.number().min(0).max(10),thresholdDb:z.number().min(-100).max(-10),matchThreshold:z.number().min(0).max(1),
  cueDetailsVersion:z.number().optional(),cueDetailsArchive:z.array(cue).max(2000).optional(),
  movieMetadata:z.json().optional(),movieOverrides:z.json().optional(),movieProfiles:z.json().optional(),
  movieOriginEdited:z.boolean().optional(),movieRateEdited:z.boolean().optional(),rateEdited:z.boolean().optional(),
  analysisReport:z.json().optional(),
  status:z.enum(["draft","completed"]).optional(),
  media:z.object({tracks:z.record(identifier,z.uuid()),movie:z.uuid().optional()}).optional(),
});
const requestSchema=z.object({id:z.uuid(),revision:z.number().int().nonnegative(),data:z.union([stateSchema,z.object({type:z.literal("reel"),title:z.string().trim().min(1).max(300),status:z.literal("draft"),audioIds:z.array(z.uuid()).max(500),trackTitles:z.record(z.uuid(),z.string().max(300)).optional(),trackColors:z.record(z.uuid(),z.string().regex(/^#[0-9a-f]{6}$/i)).optional(),appearance:z.object({accent:z.string().regex(/^#[0-9a-f]{6}$/i),theme:z.enum(['dark','light']),description:z.string().max(1000)}).optional(),profile:z.object({name:z.string().max(120),email:z.union([z.email(),z.literal('')]),occupation:z.string().max(120),bio:z.string().max(2000)}).optional(),resumeId:z.uuid().optional(),resumeName:z.string().max(255).optional()})])});
export function parseProject(input) {
  const result=requestSchema.safeParse(input);
  if(!result.success) throw Object.assign(new Error("INVALID_PROJECT"),{status:400});
  if(result.data.data.type==="reel"){if(new Set(result.data.data.audioIds).size!==result.data.data.audioIds.length)throw Object.assign(new Error("INVALID_PROJECT"),{status:400});return result.data;}
  const ids=result.data.data.tracks.map(t=>t.id);
  if(new Set(ids).size!==ids.length || result.data.data.cues.some(c=>!ids.includes(c.trackId)) || Object.keys(result.data.data.media?.tracks || {}).some(id=>!ids.includes(id)))
    throw Object.assign(new Error("INVALID_PROJECT"),{status:400});
  if(result.data.data.status==="completed" && !validateProject(result.data.data).body.valid)
    throw Object.assign(new Error("PROJECT_NOT_READY"),{status:400});
  return result.data;
}
export function createProjectRepository(query) {
  return {
    async list(userId) {
      return query`SELECT id,title,revision,created_at,updated_at,COALESCE(data->>'status','draft') AS status,COALESCE(data->>'type','cue') AS type FROM projects WHERE user_id=${userId} ORDER BY updated_at DESC`;
    },
    async get(userId,id) {
      if(!z.uuid().safeParse(id).success) throw Object.assign(new Error("NOT_FOUND"),{status:404});
      const rows=await query`SELECT id,title,data,revision,created_at,updated_at FROM projects WHERE id=${id} AND user_id=${userId}`;
      if(!rows[0]) throw Object.assign(new Error("NOT_FOUND"),{status:404});
      return rows[0];
    },
    async deleteReel(userId,input) {
      const parsed=z.object({id:z.uuid(),revision:z.number().int().positive()}).safeParse(input);
      if(!parsed.success)throw Object.assign(new Error("INVALID_PROJECT"),{status:400});
      const {id,revision}=parsed.data;
      const rows=await query`DELETE FROM projects WHERE id=${id} AND user_id=${userId} AND revision=${revision} AND data->>'type'='reel' RETURNING id`;
      if(!rows[0])throw Object.assign(new Error("PROJECT_CONFLICT"),{status:409});
      return rows[0];
    },
    async save(userId,input) {
      const {id,revision,data}=parseProject(input), title=data.type==="reel"?data.title:data.production.title.trim() || "Untitled production";
      await createMediaRepository(query).validate(userId,data);
      const rows=revision===0
        ? await query`INSERT INTO projects(id,user_id,title,data) VALUES(${id},${userId},${title},${JSON.stringify(data)}::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id,title,revision,created_at,updated_at,COALESCE(data->>'status','draft') AS status,COALESCE(data->>'type','cue') AS type`
        : await query`UPDATE projects SET title=${title},data=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_at=now() WHERE id=${id} AND user_id=${userId} AND revision=${revision} AND COALESCE(data->>'type','cue')=${data.type || "cue"} RETURNING id,title,revision,created_at,updated_at,COALESCE(data->>'status','draft') AS status,COALESCE(data->>'type','cue') AS type`;
      if(!rows[0]) throw Object.assign(new Error("PROJECT_CONFLICT"),{status:409});
      return rows[0];
    },
  };
}
export const listProjects = userId => createProjectRepository(sql()).list(userId);
export const getProject = (userId,id) => createProjectRepository(sql()).get(userId,id);
export const saveProject = (userId,input) => createProjectRepository(sql()).save(userId,input);

export const deleteReel = (userId,input) => createProjectRepository(sql()).deleteReel(userId,input);
