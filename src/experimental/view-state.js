// Keep native UI state through full workspace renders. Project data is never stored here.
function key(element,root){
 if(element.id)return '#'+CSS.escape(element.id);
 const parts=[];let node=element;
 while(node&&node!==root){const siblings=node.parentElement?Array.from(node.parentElement.children).filter(n=>n.tagName===node.tagName):[node];parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node)+1})`);node=node.parentElement;}
 return parts.join(' > ');
}
export function captureViewState(root,{drafts=false,editor=false}={}){
 const log=root.querySelector('.daw-agent-log'),logState=log?{top:log.scrollTop,bottom:log.scrollHeight-log.clientHeight-log.scrollTop<8}:null;
 const details=Array.from(root.querySelectorAll('details')).map(el=>({selector:key(el,root),label:el.querySelector('summary')?.textContent,open:el.open}));
 const scrolls=editor?Array.from(root.querySelectorAll('.daw-scroll,.daw-note-scroll,.daw-note-grid,.daw-controller-scroll')).map(el=>({selector:key(el,root),top:el.scrollTop,left:el.scrollLeft})):[];
 const fields=drafts?Array.from(root.querySelectorAll('input:not([type=file]),select,textarea')).map(el=>({selector:key(el,root),tag:el.tagName,name:el.name,value:el.value,checked:el.checked,options:el.tagName==='SELECT'?el.innerHTML:null})):[];
 const chordPreview=drafts?root.querySelector('[data-chord-preview]')?.textContent:null;
 const active=root.contains(document.activeElement)?document.activeElement:null,focus=drafts&&active?{selector:key(active,root),start:active.selectionStart,end:active.selectionEnd}:null;
 return ()=>{
  for(const saved of details){const el=root.querySelector(saved.selector);if(el?.tagName==='DETAILS'&&el.querySelector('summary')?.textContent===saved.label)el.open=saved.open;}
  for(const saved of fields){const el=root.querySelector(saved.selector);if(el?.tagName!==saved.tag||el.name!==saved.name)continue;if(saved.options!==null)el.innerHTML=saved.options;el.value=saved.value;if(typeof saved.checked==='boolean')el.checked=saved.checked;}
  if(chordPreview!==null&&root.querySelector('[data-chord-preview]'))root.querySelector('[data-chord-preview]').textContent=chordPreview;
  for(const saved of scrolls){const el=root.querySelector(saved.selector);if(el){el.scrollTop=saved.top;el.scrollLeft=saved.left;}}
  if(focus){const el=root.querySelector(focus.selector);if(el&&!el.disabled){el.focus({preventScroll:true});if(typeof focus.start==='number'&&el.setSelectionRange)try{el.setSelectionRange(focus.start,focus.end);}catch{}}}
  const nextLog=root.querySelector('.daw-agent-log');if(nextLog)nextLog.scrollTop=!logState||logState.bottom?nextLog.scrollHeight:logState.top;
 };
}
