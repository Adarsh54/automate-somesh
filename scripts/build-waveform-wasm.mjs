import {execFileSync} from 'node:child_process';
execFileSync('npx',['-y','-p','wabt@1.0.39','wat2wasm','wasm/waveform.wat','-o','src/waveform.wasm'],{stdio:'inherit'});
