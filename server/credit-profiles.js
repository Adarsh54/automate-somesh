import {neon} from '@neondatabase/serverless';
import {z} from 'zod';
const text=z.string().max(200),identifier=z.string().min(1).max(100).regex(/^[\w-]+$/);
const schema=z.object({id:identifier,name:z.string().trim().min(1).max(120),category:z.enum(['unknown','original','sourced']),address:z.string().max(1000).optional(),preparedBy:z.string().max(200).optional(),email:z.union([z.email().max(254),z.literal('')]).optional(),credits:z.array(z.object({id:identifier.optional(),role:z.enum(['Composer','Publisher']),first:text.optional(),last:text.optional(),name:text.optional(),pro:text.optional(),ipi:text.optional(),share:z.union([z.string().max(30),z.number().finite().min(0).max(100)])})).max(100),revision:z.number().int().nonnegative().default(0)});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const unpack=row=>({...row.data,id:row.id,name:row.name,revision:row.revision});
export function createCreditProfilesRepository(sql){return {
 async list(user){return (await sql`SELECT id,name,data,revision FROM credit_profiles WHERE user_id=${user} ORDER BY updated_at DESC`).map(unpack);},
 async save(user,input,{importOnly=false}={}){
  const parsed=schema.safeParse(input);if(!parsed.success)throw fail('INVALID_CREDIT_PROFILE');
  const {revision,...data}=parsed.data;
  const rows=importOnly || revision===0
   ? await sql`INSERT INTO credit_profiles(user_id,id,name,data) VALUES(${user},${data.id},${data.name},${JSON.stringify(data)}::jsonb) ON CONFLICT(user_id,id) DO NOTHING RETURNING id,name,data,revision`
   : await sql`UPDATE credit_profiles SET name=${data.name},data=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_at=now() WHERE user_id=${user} AND id=${data.id} AND revision=${revision} RETURNING id,name,data,revision`;
  if(!rows.length && !importOnly)throw fail('CREDIT_PROFILE_CONFLICT',409);
  return rows[0]?unpack(rows[0]):null;
 },
 async remove(user,input){if(!identifier.safeParse(input.id).success || !Number.isInteger(input.revision))throw fail('INVALID_CREDIT_PROFILE');const rows=await sql`DELETE FROM credit_profiles WHERE user_id=${user} AND id=${input.id} AND revision=${input.revision} RETURNING id`;if(!rows.length)throw fail('CREDIT_PROFILE_CONFLICT',409);}
};}
export const creditProfilesRepository=()=>createCreditProfilesRepository(neon(process.env.DATABASE_URL));
