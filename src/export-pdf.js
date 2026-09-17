import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {effectiveCue} from './cue-details.js';
import {duration} from './model.js';
export async function exportPdf(production,tracks,cues,shared) {
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const response=await fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`);
  if(!response.ok)throw new Error('PDF font could not be loaded. Please retry.');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  doc.addFileToVFS('NotoSans.ttf',btoa(binary));doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');
  doc.setFontSize(18);
  const title=doc.splitTextToSize(production.title || 'Music cue sheet',265);doc.text(title,14,18);
  const top=20+title.length*7;
  autoTable(doc,{startY:top,theme:'plain',styles:{font:'NotoSans',fontStyle:'normal',fontSize:9},body:[
    ['Episode',production.episode || '', 'Company',production.company || ''],
    ['Prepared by',production.preparedBy || '', 'Email',production.email || ''],
    ['Frame rate',production.rate, 'Production duration',production.duration || 'Unknown'],
  ]});
  const body=cues.map((raw,i)=>{const cue=effectiveCue(raw,shared),track=tracks.find(t=>t.id===cue.trackId);return [i+1,cue.title || track?.title || '',cue.start,cue.end,duration(cue,production.rate).toFixed(3),cue.usage,cue.category,(cue.credits || []).map(c=>`${c.role}: ${c.role==='Composer'?[c.first,c.last].filter(Boolean).join(' '):c.name}\n${c.pro || ''} · IPI ${c.ipi || '—'} · ${c.share}%`).join('\n\n')];});
  autoTable(doc,{startY:doc.lastAutoTable.finalY+8,margin:{top:14,bottom:20},head:[['#','Cue','Start','End','Seconds','Usage','Category','Contributors']],body,styles:{font:'NotoSans',fontStyle:'normal',fontSize:8,cellPadding:3,overflow:'linebreak'},headStyles:{fillColor:[30,45,38],fontStyle:'normal'},columnStyles:{0:{cellWidth:10},1:{cellWidth:43},2:{cellWidth:28},3:{cellWidth:28},4:{cellWidth:20},5:{cellWidth:17},6:{cellWidth:23},7:{cellWidth:100}},rowPageBreak:'avoid'});
  for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setFontSize(8);doc.setTextColor(90);doc.text('Cuestamp · Review before submission. PDF summary; use Excel for the BMI template.',14,200);doc.text(`${page} / ${doc.getNumberOfPages()}`,282,200,{align:'right'});}
  return doc.output('blob');
}
