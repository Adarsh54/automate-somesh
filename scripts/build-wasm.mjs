import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Use LLVM clang + wasm-ld. Override their paths with WASM_CC / WASM_LD.
const temporary=mkdtempSync(join(tmpdir(),'cuestamp-wasm-'));
try {
 const object=join(temporary,'fft.o');
 execFileSync(process.env.WASM_CC || 'clang',['--target=wasm32','-O3','-ffp-contract=off','-nostdlib','-c','wasm/fft.c','-o',object],{stdio:'inherit'});
 execFileSync(process.env.WASM_LD || 'wasm-ld',[object,'-o','src/fft.wasm','--no-entry','--export=fft','--export=__heap_base','--export-memory','--initial-memory=131072','--max-memory=134217728','--strip-all'],{stdio:'inherit'});
 console.log('Built src/fft.wasm');
}finally{rmSync(temporary,{recursive:true,force:true});}
