// Account-scoped local drafts are separate from project documents and revisions.
// Bound storage to the ten most recently edited sessions.
export function createInstructionDrafts(storage,key){
 const entries=new Map();let version=0,saved=true;
 try{const raw=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(raw))for(const item of raw.slice(-10))if(Array.isArray(item)&&typeof item[0]==='string'&&item[0].length<=100&&typeof item[1]==='string'&&item[1].length<=6000)entries.set(item[0],{text:item[1],version:++version});}catch{saved=false;}
 const persist=()=>{try{storage.setItem(key,JSON.stringify([...entries].map(([id,draft])=>[id,draft.text])));saved=true;}catch{saved=false;}};
 return {
  get:id=>entries.get(id)?.text||'',
  get saved(){return saved;},
  set(id,text){const draft={text:String(text).slice(0,6000),version:++version};entries.delete(id);entries.set(id,draft);while(entries.size>10)entries.delete(entries.keys().next().value);persist();},
  begin(id){return {id,version:entries.get(id)?.version,text:entries.get(id)?.text||''};},
  finish(ticket,clear){if(clear&&entries.get(ticket.id)?.version===ticket.version){entries.delete(ticket.id);persist();}},
 };
}
