export function shortcutAction(event){
 if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey)return null;
 const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;
 if(mod){if(key==='z')return event.shiftKey?'redo':'undo';if(key==='y'&&event.ctrlKey&&!event.metaKey&&!event.shiftKey)return 'redo';return null;}
 if(event.shiftKey)return null;
 return {' ':'play',home:'stop',s:'split',d:'duplicate',delete:'delete',backspace:'delete'}[key]||null;
}
export function shortcutsView(enabled=true){return `<details class="daw-shortcuts"><summary>Keyboard shortcuts</summary><label class="daw-shortcuts-toggle"><input type="checkbox" data-shortcuts-enabled ${enabled?'checked':''}>Enable workspace shortcuts</label><dl><dt>Space</dt><dd>Play / pause</dd><dt>Home</dt><dd>Stop and return to start</dd><dt>⌘ / Ctrl Z</dt><dd>Undo</dd><dt>⌘ / Ctrl Shift Z</dt><dd>Redo (also Ctrl Y)</dd><dt>S</dt><dd>Split selected region at playhead</dd><dt>D</dt><dd>Duplicate selected region or piano-roll notes</dd><dt>Delete / Backspace</dt><dd>Delete selected region or piano-roll notes</dd></dl><p class="muted">Click the arrangement or piano roll to choose the editing area. S applies in the arrangement or region inspector. Text fields and focused buttons keep their normal keys. Shortcuts pause during recording, loading and dialogs.</p></details>`;}
export function bindWorkspaceShortcuts(root,{buttonFor,blocked}){
 const doc=root.ownerDocument;let active=true,area=null,pointerDown=false;
 const activate=event=>{
  if(event.target===doc.body)return;
  active=root.contains(event.target);
  if(active)area=event.target.closest('.daw-piano')?'piano':event.target.closest('.daw-arrangement,.daw-inspector')?'arrangement':null;
  else area=null;
 };
 const pointer=event=>{activate(event);pointerDown=true;},release=()=>{pointerDown=false;};
 const keydown=event=>{
  const action=shortcutAction(event);if(!action||!root.isConnected||!active||pointerDown||blocked()||doc.querySelector('dialog[open],[aria-modal=true]'))return;
  const path=event.composedPath();
  if(path.some(node=>node.matches?.('input,textarea,select,[role=textbox],[role=combobox],[role=slider],[role=spinbutton]')||node.isContentEditable))return;
  // Preserve native Space activation and local editor handlers. No document-level
  // deletion may take over a focused automation point, menu, or unrelated button.
  const control=path.find(node=>node.matches?.('button,a,summary,[role=button],[role=menuitem]'));
  if(control&&(action==='play'||(['split','duplicate','delete'].includes(action)&&!control.matches('[data-region],[data-track],[data-note]'))))return;
  if(['split','duplicate','delete'].includes(action)&&(!area||(action==='split'&&area!=='arrangement')))return;
  const button=buttonFor(action,area);if(!button||button.disabled)return;
  event.preventDefault();if(!event.repeat)button.click();
 };
 doc.addEventListener('pointerdown',pointer,true);doc.addEventListener('pointerup',release,true);doc.addEventListener('pointercancel',release,true);doc.addEventListener('focusin',activate,true);doc.addEventListener('keydown',keydown);
 const blur=()=>{pointerDown=false;};doc.defaultView.addEventListener('blur',blur);
 return ()=>{doc.removeEventListener('pointerdown',pointer,true);doc.removeEventListener('pointerup',release,true);doc.removeEventListener('pointercancel',release,true);doc.removeEventListener('focusin',activate,true);doc.removeEventListener('keydown',keydown);doc.defaultView.removeEventListener('blur',blur);};
}
