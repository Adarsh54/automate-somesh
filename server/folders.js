import {neon} from "@neondatabase/serverless";
import {z} from "zod";
const sql=()=>neon(process.env.DATABASE_URL);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const name=z.string().trim().min(1).max(120);
export function createFoldersRepository(query) {
  return {
    async list(userId) {
      return query`SELECT id,name,created_at FROM folders WHERE user_id=${userId} ORDER BY name ASC`;
    },
    async create(userId,input) {
      const parsed=name.safeParse(input?.name);
      if(!parsed.success)throw fail("INVALID_FOLDER");
      const rows=await query`INSERT INTO folders(id,user_id,name) VALUES(${crypto.randomUUID()},${userId},${parsed.data}) RETURNING id,name,created_at`;
      return rows[0];
    },
    async rename(userId,input) {
      const parsed=z.object({id:z.uuid(),name}).safeParse(input);
      if(!parsed.success)throw fail("INVALID_FOLDER");
      const rows=await query`UPDATE folders SET name=${parsed.data.name},updated_at=now() WHERE id=${parsed.data.id} AND user_id=${userId} RETURNING id,name,created_at`;
      if(!rows[0])throw fail("NOT_FOUND",404);
      return rows[0];
    },
    async remove(userId,input) {
      const parsed=z.object({id:z.uuid()}).safeParse(input);
      if(!parsed.success)throw fail("INVALID_FOLDER");
      // Projects keep their folder_id column, but ON DELETE SET NULL on that FK drops the
      // reference automatically, so a deleted folder never orphans or removes a project.
      const rows=await query`DELETE FROM folders WHERE id=${parsed.data.id} AND user_id=${userId} RETURNING id`;
      if(!rows[0])throw fail("NOT_FOUND",404);
      return rows[0];
    },
  };
}
export const foldersRepository = () => createFoldersRepository(sql());
