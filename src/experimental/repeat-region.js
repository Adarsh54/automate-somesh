export function repeatRegion(region,{count,interval=region.duration},existingCount){
 if(!Number.isInteger(count)||count<1||count>100)throw Error('Choose between 1 and 100 additional copies.');
 if(!Number.isFinite(interval)||interval<=0||interval>86400)throw Error('Repeat spacing must be positive and no more than 86,400 seconds.');
 if(existingCount+count>1000)throw Error('Repeating would exceed the 1,000-region track limit.');
 if(region.start+count*interval>86400)throw Error('Repeated region starts must stay within 86,400 seconds.');
 return Array.from({length:count},(_,i)=>({...structuredClone(region),id:crypto.randomUUID(),start:region.start+(i+1)*interval,notes:region.notes.map(n=>({...n,id:crypto.randomUUID()})),events:region.events.map(e=>({...e,id:crypto.randomUUID()}))}));
}
