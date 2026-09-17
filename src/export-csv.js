import {effectiveCue} from './cue-details.js';
import {duration,seconds} from './model.js';
import {bmiClock} from './timecode.js';
// Quoting alone does not prevent spreadsheet formula execution.
const cell=value=>{let text=String(value ?? '');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
export function cueSheetCsv(p,tracks,cues,shared) {
 const rows=[];
 const add=(values=[])=>rows.push(Array.from({length:17},(_,i)=>values[i] ?? ''));
 const metadata=(left,value,right,rightValue)=>{const row=[];row[1]=left;row[3]=value;row[11]=right;row[13]=rightValue;add(row);};
 const durationText=n=>n==null?'':`${Math.floor(n/60)} min. ${Math.round(n%60)} sec.`;
 add([[p.title,p.episode].filter(Boolean).join(', ')]);add(['Music Cue Sheet']);add();
 metadata('Cue Sheet Classification:',p.classification,'Program (series, film, etc.) Title:',p.title);
 metadata('Date Prepared:',new Date().toLocaleDateString('en-US'),'Program Title AKA(s):',p.aka);
 metadata('','','Episode Title:',p.episode);
 metadata('','','Episode Title AKA(s):',p.episodeAka);
 metadata('Initial Airdate:',p.airdate,'Episode Number:',p.episodeNumber);
 metadata('Category:',p.category,'Production Number:',p.productionNumber);
 metadata('Version:',p.version,'','');
 metadata('Network/Source:',p.network,'Production Company:',p.company);
 metadata('','','Mailing Address:',p.address);
 metadata('Program/Show Duration:',durationText(seconds(p.duration)),'Cue Sheet Preparer:',p.preparedBy);
 metadata('Total Music Duration:',durationText(cues.reduce((n,c)=>n+Math.round(duration(c,p.rate)||0),0)),'Email Address:',p.email);
 add();add(['Usage Codes: BI = Background Instrumental | BV = Background Vocal | VI = Visual Instrumental | VV = Visual Vocal | MT = Main Title Theme | ET = End Title Theme | Logo']);
 add(['Seq. #','Cue Title (Song/Track Name)','Usage','Time In (optional)','','','Time Out (optional)','','','Duration','','','Composer/Writer First (and Middle) Name','Composer/Writer Last Name','Publisher Name','PRO Affiliation','% Shares']);
 add(['','','','h','mm','ss','h','mm','ss','min.','sec.']);
 const clock=value=>{const n=bmiClock(value,p.rate);return n==null?['','','']:[Math.floor(n/3600),String(Math.floor(n%3600/60)).padStart(2,'0'),String(n%60).padStart(2,'0')];};
 cues.forEach((raw,index)=>{
  const cue=effectiveCue(raw,shared),track=tracks.find(t=>t.id===cue.trackId),d=Math.round(duration(cue,p.rate)||0);
  const credits=[...(cue.credits?.length?cue.credits:[{}])].sort((a,b)=>(a.role==='Publisher')-(b.role==='Publisher'));
  credits.forEach((credit,i)=>add([
   i?'':index+1,i?'':cue.title || track?.title,i?'':cue.usage,...(i?['','','']:clock(cue.start)),...(i?['','','']:clock(cue.end)),i?'':Math.floor(d/60),i?'':String(d%60).padStart(2,'0'),
   credit.role,credit.role==='Publisher'?'':credit.first,credit.role==='Publisher'?'':credit.last,credit.role==='Publisher'?credit.name:'',credit.pro,credit.share==null || credit.share===''?'':`${Number(credit.share).toFixed(2)}%`
  ]));
 });
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
