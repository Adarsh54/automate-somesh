import JSZip from 'jszip';
import {sessionSchema,applyCommands} from './session.js';
const LIMIT=512*1024*1024,DOCUMENT_LIMIT=10*1024*1024;
function validate(document){const parsed=sessionSchema.parse(document);applyCommands(parsed,[{op:'session.set',values:{}}]);return parsed;}
const assetIds=session=>[...new Set(session.tracks.flatMap(t=>t.regions.map(r=>r.assetId).filter(Boolean)))];
export async function exportArchive(document,files){
 const session=validate(document),zip=new JSZip(),assets=[];let bytes=0;
 for(const [index,id]of assetIds(session).entries()){
  const file=files.get(id);if(!file)throw Error('A source file is missing. Restore it before exporting this project.');
  bytes+=file.size;if(bytes>LIMIT)throw Error('Portable projects currently support up to 512 MB of source media.');
  const path=`media/${index}`;assets.push({id,path,name:file.name||'media',type:file.type||'',lastModified:file.lastModified||0});zip.file(path,await file.arrayBuffer());
 }
 const manifest=JSON.stringify({format:'cuestamp-daw',version:1,session,assets});if(new TextEncoder().encode(manifest).length>DOCUMENT_LIMIT)throw Error('Project document is too large.');
 zip.file('project.json',manifest);return zip.generateAsync({type:'blob',compression:'STORE'});
}
// Limit decompressed bytes while streaming; never trust ZIP size metadata.
function readEntry(entry,limit){return new Promise((resolve,reject)=>{let length=0,failed=false;const chunks=[],stream=entry.internalStream('uint8array');stream.on('data',chunk=>{if(failed)return;length+=chunk.length;if(length>limit){failed=true;stream.pause();reject(Error('Project archive exceeds its size limit.'));return;}chunks.push(chunk);}).on('error',reject).on('end',()=>{if(failed)return;const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}resolve(result);}).resume();});}
export async function importArchive(data){
 if(data.byteLength>LIMIT+DOCUMENT_LIMIT+1024*1024)throw Error('Project archive is too large.');
 const zip=await JSZip.loadAsync(data),manifest=zip.file('project.json');if(!manifest)throw Error('This is not a Cuestamp project archive.');
 const value=JSON.parse(new TextDecoder().decode(await readEntry(manifest,DOCUMENT_LIMIT)));
 if(value.format!=='cuestamp-daw'||value.version!==1||!Array.isArray(value.assets))throw Error('Unsupported project archive.');
 const session=validate(value.session),ids=assetIds(session),records=[],mapping=new Map();let remaining=LIMIT;
 if(value.assets.length!==ids.length)throw Error('Project media manifest does not match the session.');
 for(const asset of value.assets){
  if(!asset||!ids.includes(asset.id)||mapping.has(asset.id)||typeof asset.path!=='string'||!/^media\/\d+$/.test(asset.path)||typeof asset.name!=='string'||asset.name.length>500||typeof asset.type!=='string'||asset.type.length>200)throw Error('Invalid project media manifest.');
  const entry=zip.file(asset.path);if(!entry)throw Error('Project archive is missing a source file.');
  const bytes=await readEntry(entry,remaining);remaining-=bytes.length;
  const id=crypto.randomUUID();mapping.set(asset.id,id);records.push({id,file:new File([bytes],asset.name,{type:asset.type,lastModified:Number.isFinite(asset.lastModified)?asset.lastModified:0})});
 }
 for(const track of session.tracks)for(const region of track.regions)if(region.assetId)region.assetId=mapping.get(region.assetId);
 session.id=crypto.randomUUID();session.revision=0;return {session,records};
}
