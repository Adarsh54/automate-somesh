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
