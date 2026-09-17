# Upload investigation — September 16, 2026

## Findings

Small, completed browser uploads from the development machine:

| Destination / mode | Payload | Total time | Effective throughput |
| --- | --- | --- | --- |
| Vercel Blob, progress enabled | 6 MB | 6.627 s | 7.24 Mbps |
| Vercel Blob, progress disabled | 6 MB | 5.559 s | 8.63 Mbps |
| Cloudflare speed-test upload endpoint | 6 MB | 4.519 s | 10.62 Mbps |

An earlier pair of Vercel tests took 5.710 and 5.726 seconds respectively.
These are short end-to-end samples, not an ISP line-rate measurement.

Chrome used HTTP/2 to `vercel.com/api/blob`. Both instrumented Vercel
uploads succeeded with attempt 0 and HTTP 200. No SDK retries or HTTP 429s
were observed. Request body transmission took 5.395 and 4.281 seconds;
response headers arrived a further 1.118 and 1.250 seconds later.
Both development and production Blob stores are in `iad1` (Virginia).
Requests reached the Vercel `sfo1` edge. Region distance may contribute to
latency, but these tests do not quantify its effect on throughput.

The independent endpoint also delivered only about 10.6 Mbps. This supports
limited upload capacity on the common local/network path as the main current
constraint, with extra latency on the Vercel path. It does not isolate Wi-Fi,
ISP shaping, other traffic, or routing, nor prove a fixed 10 Mbps line limit.
At 10.6 Mbps, transferring 190 MB alone takes about 143 seconds.

## Correction to the large parallel tests

The 6-request and 19-request runs were canceled before completion at the
user's request. Their progress percentages are not valid completed-throughput
measurements. The installed Blob SDK uses streaming fetch in Chrome and its
progress callback counts bytes handed to the request stream. Those bytes may
still be buffered locally. Do not use the canceled runs to claim that 19
connections is definitively slower, or that saturation was measured.

The app already sends large uploads directly to Vercel Blob, using six
concurrent parts above 100 MB. Audio bytes do not pass through the app's
Vercel Function. WASM waveform generation is separate from uploading.

## Reproducing diagnostics

Use the documented development environment, not production credentials:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright \
PLAYWRIGHT_EXECUTABLE=/path/to/chromium \
node --env-file=.env.local scripts/diagnose-upload.mjs
```

This uploads two synthetic 6 MB objects, captures protocol/timing/retry
information, deletes the objects, and writes `/tmp/cuestamp-upload-diagnostics.json`.
It does not print credentials. The independent control was a 6 MB random
Blob POST to Cloudflare's documented `https://speed.cloudflare.com/__up`
endpoint, with a 30-second deadline, from the same browser and machine.

The larger `scripts/benchmark-upload-concurrency.mjs` requires an explicit
`BENCH_CONCURRENCY` comma-separated list. Each entry transfers 190 MB and
should only be run when a large transfer is intended. Completed results go
to `/tmp/cuestamp-upload-concurrency.json`.

## Next useful experiment

Use the same small completed test on Ethernet or another network, with other
uploads paused. Compare the independent endpoint and Blob again. If only
Blob remains slow, test a separate nearby-region store before migrating any
user media. Do not increase concurrency or move production storage based on
the canceled runs.

Sources: [Vercel Blob regions](https://vercel.com/docs/vercel-blob),
[Cloudflare speed-test API](https://github.com/cloudflare/speedtest/blob/main/README.md).

## Follow-up: competing traffic and browser versus Node

With no synthetic upload running, two macOS per-process network samples
showed Apple's `identityservicesd` sending 1.138 MB over 4 seconds and
2.799 MB over 10 seconds (about 2.2 Mbps). A separate socket-level sample
confirmed 482 KB over 2 seconds to a public IPv4 destination on `en0`,
not local-device traffic. Other processes contributed little in those idle
samples. The service was left running; no network settings were changed.
This is measurable competing upload traffic, but not proof it is the sole
cause of the slow upload.

Sequential 3 MB uploads, using scoped client tokens and the same Vercel
Blob endpoint:

| Mode | First sample | Second sample |
| --- | ---: | ---: |
| Browser with progress | 3.987 s / 6.02 Mbps | 3.134 s / 7.66 Mbps |
| Node SDK | 2.796 s / 8.58 Mbps | 2.921 s / 8.22 Mbps |
| Browser without progress | 2.328 s / 10.31 Mbps | 2.850 s / 8.42 Mbps |

There is no order-of-magnitude browser-only penalty. Progress-enabled runs
were slower in this small comparison, but the earlier 6 MB runs were nearly
identical, so these samples do not isolate progress handling as a cause.
The common network path, competing background traffic, and storage response
latency remain better-supported constraints than frontend processing.

Reproduce the 18 MB total comparison with the same Playwright environment:

```sh
node --env-file=.env.local scripts/compare-upload-transports.mjs
```

Each request has a 30-second deadline; test objects are deleted. Results are
written to `/tmp/cuestamp-upload-transports.json`. Raw process/socket samples
were kept locally under `/tmp`, not committed. No app transport settings
were changed as a result of this investigation.

## San Francisco store comparison

Created private test store `cuestamp-media-sfo-test` (`store_9303b4iBNELTvEld`)
in `sfo1`. Its separate `SFO_BENCH_READ_WRITE_TOKEN` is connected only to the
project's development environment. The app still uses the existing Virginia
store and `BLOB_READ_WRITE_TOKEN`; no user media was migrated.

Uploaded the identical synthetic 3 MB Blob from one browser, sequentially
in order SFO, IAD, IAD, SFO, SFO, IAD. All six uploads completed and their
objects were deleted.

| Region | Upload times | Mean | Median |
| --- | --- | --- | --- |
| San Francisco (`sfo1`) | 2.800, 1.892, 3.462 s | 2.718 s | 2.800 s |
| Virginia (`iad1`) | 2.950, 2.963, 3.530 s | 3.148 s | 2.963 s |

SFO's mean was about 14% lower, but its median was only about 6% lower,
and sample ranges overlap. Three short samples per region do not establish
a reliable percentage improvement or predict large multipart throughput.
This test does not support migrating production solely for a major speedup.

Reproduce with `scripts/compare-blob-regions.mjs`, loading the development
environment and separate SFO credential. The script transfers 18 MB total,
uses a 30-second per-upload deadline, deletes test objects, and writes
`/tmp/cuestamp-region-comparison.json`. Browser/module paths use the same
Playwright environment variables as the other diagnostics.

## Lossless FLAC benchmark on the actual 190 MB WAV

The selected source was 190,115,616 bytes, stereo 24-bit integer PCM at
48 kHz, with 31,644,608 frames (659.263 seconds). The original was untouched;
all output stayed local, with no additional media uploads.

| Encoder | Compression time | FLAC size |
| --- | ---: | ---: |
| Native FFmpeg, level 0 | 0.771 s | 42,390,882 bytes |
| Native FFmpeg, level 5 | 0.868 s | 39,725,318 bytes |
| Native FFmpeg, level 8 | 1.115 s | 39,695,778 bytes |
| Browser WASM libflacjs 5.6.0, level 5, verification enabled | 1.544 s including worker startup | 39,870,996 bytes |

Browser compression reduced transferred size by approximately 79%. It ran
in a Web Worker with chunked integer PCM parsing; the main-thread 10 ms
heartbeat fired 154 times during processing. Native and browser FLAC outputs
were independently decoded with FFmpeg to 24-bit PCM. Both the full decoded
byte count and SHA-256 matched the source audio exactly. No sample-rate,
channel-count, or bit-depth conversion was applied.

At an assumed sustained 1 MB/s, the original would take about 190 seconds;
browser compression plus FLAC upload would take about 41 seconds. This is
an estimate, not a new measured network transfer. Results depend on the
recording; do not extrapolate this compression ratio to all audio.

This verifies exact audio samples, not preservation of every WAV metadata
chunk or the original WAV container bytes. The benchmark rejects float WAVs
and unsupported bit depths rather than silently quantizing them.

Automatic lossless compression is now enabled in the shared audio-library
upload pipeline (reels, cues, and Audio Files). WAV files of at least 1 MiB
with integer 16-bit or 24-bit PCM are encoded in a cancellable WASM worker.
The app uploads FLAC only when it saves at least 5%; other encodings, float
WAV, encoder failures, and timeouts use the original. Guest files stay local.

The original remains in IndexedDB for local playback. A separate `uploadFiles`
store caches the prepared FLAC until upload completion, so retrying after a
reload uses the same bytes and reservation. Existing WAV reservations continue
using WAV. Compression preserves audio samples, not WAV metadata chunks.
The pinned npm runtime is bundled by Vite; no CDN or new environment variable
is required. Its license ships at `/licenses/libflacjs.txt`.

Regression check: run `scripts/browser-lossless-upload-check.cjs` with the
Playwright environment variables below and Vite running on port 5190. It tests
PCM equality, cancellation, unsupported/incompressible fallback, original
local playback and persisted retry. To also test a real file against the
production worker, run `npm run build`, start preview on port 5192, and pass
the WAV path as an argument.

The original standalone benchmark scripts remain available:

```sh
node scripts/benchmark-flac.mjs input.wav /tmp/flac-benchmark
npm install --prefix /tmp/flac-runtime libflacjs@5.6.0 --no-audit --no-fund
FLAC_BENCH_RUNTIME=/tmp/flac-runtime/node_modules/libflacjs \
PLAYWRIGHT_MODULE=/path/to/playwright \
PLAYWRIGHT_EXECUTABLE=/path/to/chromium \
node scripts/benchmark-browser-flac.mjs input.wav /tmp/flac-benchmark
```

The browser script serves only the benchmark runtime on an ephemeral
loopback port; it never sends source audio to an external service. Its
output should be independently decoded and compared before adoption.

## Alternative lossless codec benchmark

`scripts/benchmark-lossless-codecs.mjs` compares native FLAC, WavPack, and
Monkey's Audio on the same integer PCM WAV. It runs each setting three times,
uses one codec thread, reports the median wall time, and independently
FFmpeg-decodes each setting's first output to compare full PCM byte count and
SHA-256 against the source. No source audio is uploaded. It requires a new
output directory and never overwrites the input.

Install WavPack with Homebrew (`brew install wavpack`). Build the official
[Monkey's Audio SDK](https://www.monkeysaudio.com/developers.html) locally with
CMake in Release mode, then point `MONKEY_AUDIO_BIN` at its `mac` executable:

```sh
MONKEY_AUDIO_BIN=/path/to/build/mac \
node scripts/benchmark-lossless-codecs.mjs input.wav /tmp/new-codec-results
```

These are native benchmarks, not browser/WASM timing predictions. WavPack
and APE may preserve additional WAV metadata; this comparison uses actual
output file sizes, without stripping metadata to improve their scores.

### Measured results: 190,115,616-byte music WAV

Apple M5 Pro; WavPack 5.9.0; official Monkey's Audio SDK 13.26 (Release);
FFmpeg 6.0 FLAC encoder. Stereo 48 kHz, 24-bit PCM, approximately 11 minutes.
All eight outputs passed independent PCM SHA-256 and byte-count verification.
Sizes below are decimal MB; time is the median of three runs.

| Setting | Size (MB) | Encode (seconds) | Encode + upload at 1 MB/s (estimated seconds) |
| --- | ---: | ---: | ---: |
| flac-5 | 39.73 | 0.86 | 40.59 |
| flac-8 | 39.70 | 1.11 | 40.80 |
| wavpack-normal | 40.55 | 0.84 | 41.39 |
| wavpack-high | 40.01 | 1.60 | 41.61 |
| wavpack-extra | 39.33 | 67.81 | 107.15 |
| ape-normal | 45.45 | 0.98 | 46.44 |
| ape-high | 45.27 | 1.09 | 46.36 |
| ape-insane | 44.30 | 7.83 | 52.13 |

Conclusion for this recording: keep FLAC level 5. WavPack `-hh -x6` saves
only about 0.39 MB versus FLAC 5, while adding approximately 67 seconds of
native encoding. Even the strongest tested Monkey's Audio setting is larger.
Other recordings can produce different results. These measurements do not
change the production codec or establish browser performance for alternatives.
