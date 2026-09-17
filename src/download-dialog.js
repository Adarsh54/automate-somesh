export function showDownloadDialog({title, saved, download}) {
  document.querySelector('.download-dialog')?.close();
  const dialog=document.createElement('dialog');
  dialog.className='resume-workspace download-dialog';
  dialog.setAttribute('aria-labelledby','download-heading');
  dialog.innerHTML=`<div class="completion-mark" aria-hidden="true">✓</div><h2 id="download-heading">Your cue sheet is ready</h2><p data-title></p><p class="muted">${saved?'Completed and saved to Projects.':'Ready to download. This copy has not been saved to Projects.'}</p><label for="download-format">Download format</label><select id="download-format"><option value="xlsx">Excel (.xlsx) — BMI template</option><option value="csv">CSV (.csv) — spreadsheet data</option><option value="sheets">Google Sheets — import workbook</option><option value="pdf">PDF (.pdf) — printable cue sheet</option></select><p class="muted" data-format-help>Uses BMI’s Excel template with a separate frame timings worksheet.</p><p role="status" data-download-status></p><p data-sheets-import hidden>In Google Sheets, choose File → Import → Upload and select the downloaded workbook. <a href="https://docs.google.com/spreadsheets/" target="_blank" rel="noopener noreferrer">Open Google Sheets ↗</a></p><div class="button-row"><button class="primary" data-download>↓ Download cue sheet</button>${saved?'<button data-projects>View Projects</button>':''}<button data-close>Close</button></div>`;
  dialog.querySelector('[data-title]').textContent=title;
  const select=dialog.querySelector('select'),button=dialog.querySelector('[data-download]');
  select.onchange=()=>{dialog.querySelector('[data-format-help]').textContent=select.value==='xlsx'?'Uses BMI’s Excel template with a separate frame timings worksheet.':select.value==='sheets'?'Download the formatted workbook, then import it into Google Sheets.':select.value==='csv'?'Uses the cue sheet header and separate rows for each contributor.':'A printable summary of production details, cue timings and contributor credits.';};
  button.onclick=async()=>{
    button.disabled=true;select.disabled=true;button.textContent='Preparing download…';
    const status=dialog.querySelector('[data-download-status]');status.textContent='';
    dialog.querySelector('[data-sheets-import]').hidden=true;
    try {await download(select.value==='sheets'?'xlsx':select.value);dialog.querySelector('[data-sheets-import]').hidden=select.value!=='sheets';status.textContent=select.value==='sheets'?'Workbook downloaded. Import it into Google Sheets using the steps below.':'Downloaded. You can choose another format.';}
    catch(error){status.textContent=`Download failed: ${error.message}`;}
    finally {button.disabled=false;select.disabled=false;button.textContent='↓ Download cue sheet';}
  };
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  const projects=dialog.querySelector('[data-projects]');if(projects)projects.onclick=()=>{dialog.close();location.hash='#/projects';};
  dialog.addEventListener('close',()=>dialog.remove());
  document.body.append(dialog);dialog.showModal();button.focus();
}
