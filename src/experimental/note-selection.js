export function selectedMidiNotes(region,{noteId,noteIds}={}){
 if(noteId!==undefined&&noteIds!==undefined)throw Error('Choose noteId or noteIds, not both.');
 if(noteId===undefined&&noteIds===undefined)return region.notes;
 if(noteIds!==undefined&&(typeof noteIds!=='string'||noteIds.length>2020000))throw Error('Invalid note selection.');
 const ids=noteIds===undefined?[noteId]:noteIds.split(',');
 if(!ids.length||ids.length>20000||ids.some(id=>!id)||new Set(ids).size!==ids.length)throw Error('Note selection must contain distinct note IDs.');
 const byId=new Map(region.notes.map(n=>[n.id,n]));
 if(ids.some(id=>!byId.has(id)))throw Error('Selected note does not belong to this region.');
 return ids.map(id=>byId.get(id));
}
export function pianoSelection(region,selected,settings){
 if(settings.selectionRegion!==region.id){settings.selectionRegion=region.id;settings.selectedIds=selected?[selected]:[];}
 const valid=new Set(region.notes.map(n=>n.id));settings.selectedIds=(settings.selectedIds||[]).filter(id=>valid.has(id));
 return settings.selectedIds;
}
