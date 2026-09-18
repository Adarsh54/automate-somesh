import {SessionHistory} from './session.js';
export function readDeviceBackup(storage,key){
 const raw=storage.getItem(key+':backup');
 if(!raw)throw Error('No session backup is available for this account on this device.');
 if(raw.length>10*1024*1024)throw Error('The local backup exceeds the session size limit.');
 let session;try{session=new SessionHistory(JSON.parse(raw)).session;}catch{throw Error('The local backup could not be read. Download it to keep a copy before starting another session.');}
 return {raw,session};
}
export function recoverDeviceBackup(storage,key,current,expectedRaw){
 const backup=readDeviceBackup(storage,key);
 if(backup.raw!==expectedRaw)throw Error('The backup changed. Review it again before restoring.');
 const next=new SessionHistory({...backup.session,id:crypto.randomUUID(),revision:0,title:(backup.session.title+' (recovered)').slice(0,200)});
 const previous=JSON.stringify(new SessionHistory(current).session),serialized=JSON.stringify(next.session);
 // Synchronous localStorage writes: keep the current session as the next backup.
 // If the main write fails (e.g. quota), restore the prior backup before surfacing it.
 storage.setItem(key+':backup',previous);
 try{storage.setItem(key,serialized);}catch(error){storage.setItem(key+':backup',backup.raw);throw error;}
 return next;
}
