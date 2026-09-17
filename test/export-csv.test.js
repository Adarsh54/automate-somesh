import test from 'node:test';
import assert from 'node:assert/strict';
import {cueSheetCsv} from '../src/export-csv.js';
test('CSV escapes text, neutralizes formulas and preserves individual credits and frame timings',()=>{
 const csv=cueSheetCsv({title:'=BAD()',rate:'24'},[{id:'t',filename:'a.wav'}],[{trackId:'t',title:'A, "B"\nC',start:'00:00:01:12',end:'00:00:02:00',usage:'BI',credits:[{role:'Composer',first:'Éva',last:'Writer',pro:'BMI',share:100}]}],{credits:[{role:'Composer',last:'Wrong',share:100}]});
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=BAD()"'));assert.ok(csv.includes('"A, ""B""\nC"'));assert.ok(csv.includes('"00:00:01:12"'));assert.ok(csv.includes('"0.5"'));assert.ok(csv.includes('Éva Writer'));assert.ok(!csv.includes('Wrong'));
});
