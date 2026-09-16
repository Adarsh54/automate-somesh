import {readFile,readdir} from "node:fs/promises";
import {neon} from "@neondatabase/serverless";
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql=neon(process.env.DATABASE_URL);
const dir=new URL('../migrations/',import.meta.url);
for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) {
  const statements=(await readFile(new URL(file,dir),'utf8')).split(';').map(s=>s.trim()).filter(Boolean);
  await sql.transaction(statements.map(statement=>sql.query(statement)));
  console.log(`Applied ${file}`);
}
