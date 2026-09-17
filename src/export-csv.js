import {effectiveCue} from './cue-details.js';
import {duration} from './model.js';
// Quoting alone does not prevent spreadsheet formula execution.
const cell=value=>{let text=String(value ?? '');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
export function cueSheetCsv(production,tracks,cues,shared) {
  const rows=[['Production','Episode','Company','Prepared by','Email','Frame rate','Cue','Title','Source file','Start','End','Duration seconds','Usage','Category','Role','Contributor','PRO','IPI','Share percent']];
  cues.forEach((raw,index)=>{
    const cue=effectiveCue(raw,shared),track=tracks.find(t=>t.id===cue.trackId);
    for(const credit of cue.credits?.length?cue.credits:[{}])rows.push([production.title,production.episode,production.company,production.preparedBy,production.email,production.rate,index+1,cue.title || track?.title,track?.filename,cue.start,cue.end,duration(cue,production.rate),cue.usage,cue.category,credit.role,credit.role==='Composer'?[credit.first,credit.last].filter(Boolean).join(' '):credit.name,credit.pro,credit.ipi,credit.share]);
  });
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
