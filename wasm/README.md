# Browser FFT kernel

`fft.c` implements the same Float64 radix-2 transform as the JavaScript fallback. The hot butterfly loops run in WebAssembly; stage-level sin/cos use the same JavaScript Math functions. No unsafe fast-math or precision reduction is enabled. Scratch memory is reused between calls; input/output copy costs are included in benchmarks.

`src/fft.wasm` is a checked-in build artifact so Vercel and normal contributors do not need a C toolchain. To rebuild, install LLVM clang and wasm-ld, then run:

```sh
WASM_CC=/path/to/clang WASM_LD=/path/to/wasm-ld npm run build:wasm
npm test
```

The build uses `--target=wasm32 -O3 -ffp-contract=off -nostdlib` and no third-party C dependencies. Commit the C source and binary together. Tests compare transforms through memory growth/reuse and validate matching parity. Memory is private to each worker, capped at 128 MiB, and needs no SharedArrayBuffer or cross-origin isolation. Normal builds embed the binary inside the inline worker, avoiding stale separate Wasm asset URLs after deployment.

Browser decoding, silence segmentation and matching orchestration stay in JavaScript; movie-matching FFTs use Wasm. If loading/compilation is unavailable, the worker uses the existing JavaScript FFT. Cancelling terminates the entire worker.

## Reproduce measurements

With `npm run dev -- --port 5184` running:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/benchmark-wasm.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/browser-wasm-worker-check.cjs
```

The benchmark runs identical synthetic PCM and three references against a ten-minute movie, alternates engine order, discards one warm-up pair, and reports the median of three measured runs. It includes movie indexing, matching and memory copies; it excludes media decoding and runs in headless Chrome. It checks equal positions and expected match counts.

September 16, 2026 local result: JavaScript 1312 ms, Wasm 1212 ms (1.08x speed, about 8% faster). Wasm initialization took 2 ms. This is one machine and fixture, not a universal performance guarantee. A separate full browser fixture run decoded MP4/AAC and detected five expected placements in 1.8 seconds total. That end-to-end run is not a paired comparison against the old historical measurement.
