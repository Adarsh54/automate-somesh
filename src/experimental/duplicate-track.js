// Asset IDs and routing destinations are references; editable child IDs are not.
export function duplicateTrack(source,{id=crypto.randomUUID(),name=(source.name.slice(0,195)+' copy'),includeRegions=true}={}){
 if(typeof includeRegions!=='boolean')throw Error('includeRegions must be true or false.');
 const copy=structuredClone(source),renew=items=>{for(const item of items)item.id=crypto.randomUUID();};
 copy.id=id;copy.name=name;
 renew(copy.effects);for(const effect of copy.effects)renew(effect.automation||[]);renew(copy.automation);
 for(const send of copy.sends)renew(send.automation);
 copy.regions=includeRegions?copy.regions:[];
 renew(copy.regions);
 for(const region of copy.regions){renew(region.notes);renew(region.events);}
 return copy;
}
