import test from 'node:test';import assert from 'node:assert/strict';import {shortcutAction} from '../src/experimental/shortcuts.js';
const key=(key,extra={})=>shortcutAction({key,...extra});
test('workspace shortcuts map transport/editing keys while preserving browser modifier combinations',()=>{
 assert.equal(key(' '),'play');assert.equal(key('Home'),'stop');assert.equal(key('S'),'split');assert.equal(key('d'),'duplicate');assert.equal(key('Delete'),'delete');assert.equal(key('Backspace'),'delete');
 assert.equal(key('z',{metaKey:true}),'undo');assert.equal(key('z',{ctrlKey:true}),'undo');assert.equal(key('Z',{metaKey:true,shiftKey:true}),'redo');assert.equal(key('y',{ctrlKey:true}),'redo');
 for(const value of ['t','s','d','r','w','a'])assert.equal(key(value,{ctrlKey:true}),null);assert.equal(key('y',{metaKey:true}),null);assert.equal(key('Enter'),null);assert.equal(key('ArrowLeft'),null);
});
test('composition, native editor handling and altered plain keys never become workspace edits',()=>{
 for(const extra of [{defaultPrevented:true},{isComposing:true},{keyCode:229},{altKey:true},{shiftKey:true}])assert.equal(key('Delete',extra),null);
 assert.equal(key('z',{ctrlKey:true,altKey:true}),null);assert.equal(key(' ',{shiftKey:true}),null);
});
