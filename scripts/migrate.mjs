import {readFile} from "node:fs/promises";
import {neon} from "@neondatabase/serverless";
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql=neon(process.env.DATABASE_URL);
const statements=(await readFile(new URL("../migrations/001_users_projects.sql",import.meta.url),"utf8")).split(";").map(s=>s.trim()).filter(Boolean);
await sql.transaction(statements.map(statement=>sql.query(statement)));
console.log("Applied users/projects migration");
