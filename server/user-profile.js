import {neon} from '@neondatabase/serverless';
import {z} from 'zod';
const schema=z.object({name:z.string().trim().min(1).max(120),occupation:z.string().trim().min(1).max(120)});
export function createUserProfileRepository(query){
 return {
  async get(id){
   const [row]=await query`SELECT display_name,occupation,first_name,last_name FROM app_users WHERE id=${id}`;
   if(!row)throw Object.assign(new Error('PROFILE_NOT_FOUND'),{status:404});
   return {name:row.display_name || [row.first_name,row.last_name].filter(Boolean).join(' '),occupation:row.occupation || '',complete:Boolean(row.display_name?.trim() && row.occupation?.trim())};
  },
  async save(id,input){
   const parsed=schema.safeParse(input);
   if(!parsed.success)throw Object.assign(new Error('INVALID_PROFILE'),{status:400});
   const {name,occupation}=parsed.data;
   const rows=await query`UPDATE app_users SET display_name=${name},occupation=${occupation},updated_at=now() WHERE id=${id} RETURNING id`;
   if(!rows.length)throw Object.assign(new Error('PROFILE_NOT_FOUND'),{status:404});
   return {name,occupation,complete:true};
  }
 };
}
export const userProfiles=()=>createUserProfileRepository(neon(process.env.DATABASE_URL));
