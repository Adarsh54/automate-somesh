import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {effectiveCue} from './cue-details.js';
import {duration, seconds} from './model.js';
import {bmiClock} from './timecode.js';

export async function exportPdf(production,tracks,cues,shared) {
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const response=await fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`);
  if(!response.ok)throw new Error('PDF font could not be loaded. Please retry.');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  doc.addFileToVFS('NotoSans.ttf',btoa(binary));doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');
  const p=production;
  doc.setFontSize(14);
  const title=doc.splitTextToSize([p.title,p.episode].filter(Boolean).join(', ') || 'Music Cue Sheet',277);
  doc.text(title,148.5,9,{align:'center'});
  const headingY=12+title.length*6;
  doc.setFontSize(11);doc.text('Music Cue Sheet',148.5,headingY,{align:'center'});
  const top=headingY+10;
  const musicSeconds=cues.reduce((sum,c)=>sum+Math.round(duration(c,p.rate) || 0),0);
  const durationLabel=n=>n==null?'':`${Math.floor(n/60)} min.     ${Math.round(n%60)} sec.`;
  function details(rows,x,width,labelWidth) {
    autoTable(doc,{startY:top,margin:{left:x},tableWidth:width,theme:'plain',body:rows,
      styles:{font:'NotoSans',fontStyle:'normal',fontSize:7.5,cellPadding:{top:1,bottom:1,left:1,right:1},minCellHeight:4.8},
      columnStyles:{0:{cellWidth:labelWidth,halign:'right'},1:{cellWidth:width-labelWidth}},
      didDrawCell:data=>{if(data.column.index===1 && data.row.raw[0]){doc.setDrawColor(0);doc.setLineWidth(.12);doc.line(data.cell.x,data.cell.y+data.cell.height,data.cell.x+data.cell.width,data.cell.y+data.cell.height);}}
    });
    return doc.lastAutoTable.finalY;
  }
  const left=details([
    ['Cue Sheet Classification:',p.classification || ''],['Date Prepared:',new Date().toLocaleDateString('en-US')],['',''],
    ['Initial Airdate:',p.airdate || ''],['Category:',p.category || ''],['Version:',p.version || ''],['Network/Source:',p.network || ''],['',''],
    ['Program/Show Duration:',durationLabel(seconds(p.duration))],['Total Music Duration:',durationLabel(musicSeconds)]
  ],8,101,60);
  const right=details([
    ['Program (series, film, etc.) Title:',p.title || ''],['Program Title AKA(s):',p.aka || ''],['Episode Title:',p.episode || ''],['Episode Title AKA(s):',p.episodeAka || ''],['Episode Number:',p.episodeNumber || ''],['Production Number:',p.productionNumber || ''],['',''],
    ['Production Company:',p.company || ''],['Mailing Address:',p.address || ''],['Cue Sheet Preparer:',p.preparedBy || ''],['Email Address:',p.email || '']
  ],132,157,54);
  const legendY=Math.max(left,right)+8;
  doc.setFontSize(6.5);doc.text('Usage Codes: BI = Background Instrumental | BV = Background Vocal | VI = Visual Instrumental | VV = Visual Vocal | MT = Main Title Theme | ET = End Title Theme | Logo',148.5,legendY,{align:'center'});
  const clock=value=>{const n=bmiClock(value,p.rate);return n==null?'':`${Math.floor(n/3600)}  ${String(Math.floor(n%3600/60)).padStart(2,'0')}  ${String(n%60).padStart(2,'0')}`;};
  const body=[];
  cues.forEach((raw,index)=>{
    const cue=effectiveCue(raw,shared),track=tracks.find(t=>t.id===cue.trackId);
    const credits=[...(cue.credits || [])].sort((a,b)=>(a.role==='Publisher')-(b.role==='Publisher'));
    if(!credits.length)credits.push({});
    credits.forEach((credit,i)=>{
      const d=Math.round(duration(cue,p.rate) || 0),publisher=credit.role==='Publisher';
      body.push([i?'':index+1,i?'':cue.title || track?.title || '',i?'':cue.usage,i?'':clock(cue.start),i?'':clock(cue.end),i?'':`${Math.floor(d/60)}  ${String(d%60).padStart(2,'0')}`,credit.role || '',publisher?'':credit.first || '',publisher?'':credit.last || '',publisher?credit.name || '':'',credit.pro || '',credit.share==null || credit.share===''?'':`${Number(credit.share).toFixed(2)}%`]);
    });
  });
  const widths=[9,48,10,19,19,16,16,40,40,40,16,16];
  autoTable(doc,{startY:legendY+3,margin:{left:4,right:4,top:10,bottom:10},tableWidth:289,
    theme:'grid',head:[['Seq. #','Cue Title\n(Song/Track Name)','Usage','(optional)\nTime In\nh  mm  ss','(optional)\nTime Out\nh  mm  ss','Duration\nmin. sec.','','Composer/Writer\nFirst (and Middle) Name','Composer/Writer\nLast Name','Publisher\nName','PRO\nAffiliation','%\nShares']],body,
    styles:{font:'NotoSans',fontStyle:'normal',fontSize:6.5,cellPadding:1,lineWidth:.1,lineColor:[205,205,205],textColor:0,overflow:'linebreak'},
    headStyles:{fillColor:[217,217,217],textColor:0,halign:'center',valign:'bottom'},
    columnStyles:Object.fromEntries(widths.map((width,i)=>[i,{cellWidth:width,...(i===0?{fillColor:[217,217,217],halign:'right'}:{}),...(i===11?{halign:'right'}:{})}])),
    rowPageBreak:'avoid',
    didDrawCell:data=>{
      if(data.section!=='body')return;
      const publisher=data.row.raw[6]==='Publisher';
      const hatched=publisher?[7,8].includes(data.column.index):data.column.index===9;
      if(hatched){
        const {x,y,width:w,height:h}=data.cell;doc.setDrawColor(85);doc.setLineWidth(.08);
        for(let offset=1;offset<w+h;offset+=.8){const ax=x+Math.max(0,offset-h),ay=y+Math.min(h,offset),bx=x+Math.min(w,offset),by=y+Math.max(0,offset-w);doc.line(ax,ay,bx,by);}
      }
      if(data.row.raw[0]){doc.setDrawColor(0);doc.setLineWidth(.18);doc.line(data.cell.x,data.cell.y,data.cell.x+data.cell.width,data.cell.y);}
    }
  });
  return doc.output('blob');
}
