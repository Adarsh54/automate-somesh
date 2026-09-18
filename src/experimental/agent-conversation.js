import {z} from 'zod';
const scalar=z.union([z.string().max(300),z.number().finite(),z.boolean(),z.null()]);
const fields=z.record(z.string().max(100),scalar).refine(v=>Object.keys(v).length<=40);
const change=z.object({id:z.string().min(1).max(100),entity:z.string().max(30),before:fields.nullable(),after:fields.nullable()}).strict();
export const conversationTurnSchema=z.object({sessionId:z.string().min(1).max(100),revisionBefore:z.number().int().nonnegative(),revisionAfter:z.number().int().nonnegative(),instruction:z.string().max(6000),summary:z.string().max(2000),outcome:z.enum(['applied','replied','failed','discarded','canceled']),changes:z.array(change).max(20),truncated:z.boolean()}).strict();
export const conversationSchema=z.array(conversationTurnSchema).max(8).refine(v=>JSON.stringify(v).length<=24000,'Recent conversation is too large.');
export function validateConversation(conversation,session){conversationSchema.parse(conversation);for(const turn of conversation)if(turn.sessionId!==session.id||turn.revisionBefore>turn.revisionAfter||turn.revisionAfter>session.revision)throw Error('Conversation does not match the current session revision.');}
function entities(session){
 const result=new Map(),add=(entity,item,qualifier='')=>{const values={};for(const [key,value]of Object.entries(item))if(!['id','revision'].includes(key)&&(value===null||['string','number','boolean'].includes(typeof value)))values[key]=value;result.set(entity+':'+item.id+':'+qualifier,{id:item.id,entity,values});};
 const effects=(items,ownerId)=>{for(const [chainIndex,e]of (items||[]).entries()){add('effect',{...e,ownerId,chainIndex});for(const p of e.automation||[])add('effect automation',p);}};
 add('session',session);effects(session.masterEffects,session.id);for(const p of session.masterAutomation||[])add('master automation',p);for(const m of session.markers||[])add('marker',m);
 for(const [listIndex,t]of session.tracks.entries()){add('track',{...t,listIndex});effects(t.effects,t.id);for(const p of t.automation||[])add('track automation',p);for(const s of t.sends||[]){add('send',{...s,id:t.id},s.busId);for(const p of s.automation||[])add('send automation',p);}for(const r of t.regions){add('region',{...r,ownerId:t.id});for(const n of r.notes)add('note',n);for(const e of r.events||[])add('MIDI event',e);}}
 return result;
}
export function conversationTurn({before,after,instruction,summary,outcome}){
 const turn={sessionId:before.id,revisionBefore:before.revision,revisionAfter:after.revision,instruction:instruction.slice(0,6000),summary:summary.slice(0,2000),outcome,changes:[],truncated:false};
 if(outcome==='applied'){
  const previous=entities(before),next=entities(after);
  for(const id of new Set([...previous.keys(),...next.keys()])){const a=previous.get(id),b=next.get(id),keys=new Set([...Object.keys(a?.values||{}),...Object.keys(b?.values||{})]);const changed=[...keys].filter(k=>a?.values[k]!==b?.values[k]);if(!changed.length&&a&&b)continue;if(turn.changes.length===20){turn.truncated=true;break;}
   const select=entry=>entry?Object.fromEntries(changed.map(k=>{const value=entry.values[k]??null;if(typeof value==='string'&&value.length>300)turn.truncated=true;return [k,typeof value==='string'?value.slice(0,300):value];})):null;
   if((b||a).entity==='send'&&!changed.includes('busId'))changed.push('busId');turn.changes.push({id:(b||a).id,entity:(b||a).entity,before:select(a),after:select(b)});
  }
 }
 while(JSON.stringify(turn).length>12000){turn.truncated=true;if(turn.changes.length)turn.changes.pop();else if(turn.instruction.length>300)turn.instruction=turn.instruction.slice(0,Math.floor(turn.instruction.length/2));else turn.summary=turn.summary.slice(0,Math.floor(turn.summary.length/2));}
 return conversationTurnSchema.parse(turn);
}
export function appendConversation(conversation,turn){conversation.push(turn);while(conversation.length>8||JSON.stringify(conversation).length>24000)conversation.shift();}
