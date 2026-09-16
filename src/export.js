import JSZip from 'jszip';
import {seconds,duration} from './model.js';
export async function exportWorkbook(production,tracks,cues) {
 const response=await fetch(`${import.meta.env.BASE_URL}bmi-cue-sheet-template.xlsx`); if(!response.ok) throw new Error('BMI template could not be loaded');
 const zip=await JSZip.loadAsync(await response.arrayBuffer());
 const doc=new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'),'application/xml');
 const ns=doc.documentElement.namespaceURI; const el=n=>doc.createElementNS(ns,n);
 function set(ref,value) {let cell=doc.querySelector(`c[r="${ref}"]`); if(!cell) {const row=doc.querySelector(`row[r="${ref.match(/\d+/)[0]}"]`); cell=el('c');cell.setAttribute('r',ref);row.append(cell);} while(cell.firstChild)cell.firstChild.remove(); cell.removeAttribute('t'); if(value===''||value===null||value===undefined)return; if(typeof value==='number'){const v=el('v');v.textContent=value;cell.append(v);}else{cell.setAttribute('t','inlineStr');const is=el('is'),t=el('t');t.textContent=String(value);is.append(t);cell.append(is);} }
 // Replace calculated sequence/duration cells with explicit values, including empty rows.
 for(let row=20;row<=999;row++)for(const col of ['A','J','K'])set(`${col}${row}`,null);
 const p=production; const show=seconds(p.duration);
 const fields={A1:p.title,A2:'Music Cue Sheet — review draft',D4:p.classification,D5:new Date().toISOString().slice(0,10),D8:p.airdate,D9:p.category,D10:p.version,D11:p.network,D13:show===null?null:Math.floor(show/60),F13:show===null?null:show%60,N4:p.title,N5:p.aka,N6:p.episode,N7:p.episodeAka,N8:p.episodeNumber,N9:p.productionNumber,N11:p.company,N12:p.address,N13:p.preparedBy,N14:p.email};
 for(const [ref,v] of Object.entries(fields))set(ref,v);
 let row=20,total=0;
 cues.forEach((cue,index)=>{const track=tracks.find(t=>t.id===cue.trackId),d=duration(cue);total+=d;track.credits.forEach((credit,i)=>{if(row>999)throw new Error('Template limit: 980 credit rows. Split the cue sheet.');if(i===0){set(`A${row}`,index+1);set(`B${row}`,track.title);set(`C${row}`,cue.usage);for(const [start,cols]of [[cue.start,['D','E','F']],[cue.end,['G','H','I']]])start.split(':').map(Number).forEach((v,j)=>set(`${cols[j]}${row}`,v));set(`J${row}`,Math.floor(d/60));set(`K${row}`,d%60);}set(`L${row}`,credit.role);set(`M${row}`,credit.role==='Composer'?credit.first:'');set(`N${row}`,credit.role==='Composer'?credit.last:'');set(`O${row}`,credit.role==='Publisher'?credit.name:'');set(`P${row}`,credit.ipi);set(`Q${row}`,credit.pro);set(`R${row}`,Number(credit.share)/100);row++;});});
 set('D14',Math.floor(total/60));set('F14',total%60);
 for(const [ref,v]of Object.entries({E14:'min.',G14:'sec.',H14:'(cue durations)'}))set(ref,v);
 zip.file('xl/worksheets/sheet1.xml',new XMLSerializer().serializeToString(doc));
 zip.remove('xl/calcChain.xml');
 for(const path of ['[Content_Types].xml','xl/_rels/workbook.xml.rels']){let xml=await zip.file(path).async('string');xml=xml.replace(/<(?:Override|Relationship)\b[^>]*(?:calcChain)[^>]*\/>/g,'');zip.file(path,xml);}
 return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
