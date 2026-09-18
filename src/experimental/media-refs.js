import {audibleSources} from './routing.js';
export const referencedAssets=session=>[...new Set(session.tracks.flatMap(t=>[t.sampleAssetId,...t.regions.map(r=>r.assetId)]).filter(Boolean))];
export const audibleAssets=session=>[...new Set(audibleSources(session).flatMap(t=>t.kind==='audio'?t.regions.map(r=>r.assetId):t.kind==='midi'&&t.instrument==='sampler'&&t.regions.some(r=>r.notes.length)?[t.sampleAssetId]:[]).filter(Boolean))];
export function remapAssets(session,mapping){for(const track of session.tracks){if(track.sampleAssetId)track.sampleAssetId=mapping.get(track.sampleAssetId);for(const region of track.regions)if(region.assetId)region.assetId=mapping.get(region.assetId);}}
