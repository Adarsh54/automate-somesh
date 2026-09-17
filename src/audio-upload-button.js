// Use the standard app button; the native file input stays out of the layout.
export function audioUploadButton({id,disabled=false,attributes=''}) {
 return `<button type="button" class="primary collection-create" data-audio-upload-trigger="${id}" ${disabled?'disabled':''}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></svg>Upload audio</button><input hidden id="${id}" type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.aif,.aiff,.flac,.ogg,.opus" multiple ${attributes} ${disabled?'disabled':''}>`;
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-audio-upload-trigger]');
 if(button && !button.disabled)document.getElementById(button.dataset.audioUploadTrigger)?.click();
});
