// App-styled confirmations with keyboard support and inline action errors.
export function confirmDialog({title, message, confirmLabel='Continue', cancelLabel='Cancel', onConfirm, secondaryLabel}) {
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.className='resume-workspace confirm-dialog';
    const id=`confirm-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby',id);
    dialog.innerHTML=`<h2></h2><p data-message></p><p role="alert" data-error></p><div class="button-row"><button data-cancel></button>${secondaryLabel?'<button data-secondary></button>':''}<button class="primary" data-confirm></button></div>`;
    dialog.querySelector('h2').id=id;
    dialog.querySelector('h2').textContent=title;
    dialog.querySelector('[data-message]').textContent=message;
    const confirm=dialog.querySelector('[data-confirm]'),cancel=dialog.querySelector('[data-cancel]');
    confirm.textContent=confirmLabel;cancel.textContent=cancelLabel;
    let result=false,busy=false;
    cancel.onclick=()=>dialog.close();
    const secondary=dialog.querySelector('[data-secondary]');
    if(secondary){secondary.textContent=secondaryLabel;secondary.onclick=()=>{result=true;dialog.close();};}
    confirm.onclick=async()=>{
      if(busy)return;
      busy=true;
      dialog.querySelectorAll('button').forEach(button=>button.disabled=true);
      dialog.querySelector('[data-error]').textContent='';confirm.textContent='Working…';
      try{await onConfirm?.();result=true;dialog.close();}
      catch(error){dialog.querySelector('[data-error]').textContent=error.message || 'Please try again.';}
      finally{busy=false;confirm.textContent=confirmLabel;dialog.querySelectorAll('button').forEach(button=>button.disabled=false);}
    };
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});
    document.body.append(dialog);dialog.showModal();cancel.focus();
  });
}
