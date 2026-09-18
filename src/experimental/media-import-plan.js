import {applyCommands} from './session.js';
export function mediaDestination(session,trackId,kind='audio'){
 if(!['audio','video'].includes(kind))throw Error('Choose an audio or movie destination.');
 if(trackId===undefined){if(session.tracks.length>=128)throw Error('The session already has 128 tracks.');return null;}
 const destination=session.tracks.find(t=>t.id===trackId);
 if(!destination||destination.kind!==kind)throw Error(`Choose an existing ${kind} track or a new track.`);
 if(destination.regions.length>=1000)throw Error('This track already has 1,000 regions. Choose another track.');
 return destination;
}
export function mediaImportPlan(session,{trackId,kind='audio',assetId,name,start,duration}){
 const destination=mediaDestination(session,trackId,kind),id=destination?.id||crypto.randomUUID(),regionId=crypto.randomUUID(),commands=[];
 if(!destination)commands.push({op:'track.add',values:{id,name:name.replace(/\.[^.]+$/,'').slice(0,200),kind}});
 commands.push({op:'region.add',target:id,values:{id:regionId,name:name.slice(0,200),assetId,start,duration}});
 // Validate before storing new media. Execution still revalidates against current state.
 applyCommands(session,commands);
 return {commands,trackId:id,regionId};
}
