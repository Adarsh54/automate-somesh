export function audioUploadStatus({text,percentage,filename},canCancel,cancelAttribute,esc){
 return `<div class="audio-upload-status" data-audio-upload-status><div class="audio-upload-info"><div class="audio-upload-heading"><span class="audio-upload-filename" title="${esc(filename)}">${esc(filename)}</span><span class="audio-upload-percent" data-upload-percent>${percentage===null?'':`${percentage}%`}</span></div><progress max="100" ${percentage===null?'':`value="${percentage}"`} aria-label="Audio upload progress"></progress><span class="audio-upload-caption" role="status" data-audio-upload-progress>${esc(text)}</span></div>${canCancel?`<button class="audio-upload-cancel" ${cancelAttribute} aria-label="Cancel upload">Cancel</button>`:''}</div>`;
}

export function updateAudioUploadStatus({text,percentage,filename}){
 const rows=document.querySelectorAll('[data-audio-upload-status]');
 for(const row of rows){
  row.querySelector('[data-audio-upload-progress]').textContent=text;
  const label=row.querySelector('.audio-upload-filename');label.textContent=filename;label.title=filename;
  row.querySelector('[data-upload-percent]').textContent=percentage===null?'':`${percentage}%`;
  const bar=row.querySelector('progress');if(percentage===null)bar.removeAttribute('value');else bar.value=percentage;
 }
 return rows.length>0;
}
