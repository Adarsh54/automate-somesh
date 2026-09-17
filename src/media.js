import { Input, ALL_FORMATS, BlobSource, AudioSampleSink } from "mediabunny";
import { ANALYSIS_RATE, MAX_DURATION } from "./analysis.js";
import { readQuickTimeTimecode } from "./metadata.js";

// Integrate decoded samples into fixed time bins, preserving container timestamps
// (including leading gaps). Stream chunks rather than retaining full-rate movie PCM.
export async function decodeMedia(file, progress = () => {}, signal) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("No audio track was found in this file.");
    if (!(await track.canDecode()))
      throw new Error(
        "This browser cannot decode the audio codec. Try Chrome with MP4/AAC, WebM/Opus, or a PCM WAV audio export.",
      );
    const mediaStart = Math.max(0, await input.getFirstTimestamp());
    const duration = (await input.computeDuration()) - mediaStart;
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION)
      throw new Error("Use a non-empty file no longer than 60 minutes.");
    const video = await input.getPrimaryVideoTrack();
    const frameMetrics = video
      ? await video
          .computeFrameRateMetrics({ targetPacketCount: Infinity })
          .catch(() => null)
      : null;
    const embeddedTimecode = video ? await readQuickTimeTimecode(file) : null;
    const output = new Float32Array(Math.ceil(duration * ANALYSIS_RATE));
    const counts = new Float32Array(output.length);
    const sink = new AudioSampleSink(track);
    let chunks = 0;
    for await (const sample of sink.samples()) {
      try {
        if (signal?.aborted)
          throw new DOMException("Analysis cancelled", "AbortError");
        const channels = sample.numberOfChannels;
        const data = new Float32Array(
          sample.allocationSize({ format: "f32", planeIndex: 0 }) / 4,
        );
        sample.copyTo(data, { format: "f32", planeIndex: 0 });
        // A time-bin box low-pass avoids nearest-neighbor decimation and keeps
        // resampling consistent across AAC/PCM rates and decoder chunk boundaries.
        for (let frame = 0; frame < sample.numberOfFrames; frame++) {
          const at = Math.floor(
            (sample.timestamp - mediaStart + frame / sample.sampleRate) *
              ANALYSIS_RATE +
              1e-7,
          );
          if (at < 0 || at >= output.length) continue;
          let mono = 0;
          for (let c = 0; c < channels; c++) mono += data[frame * channels + c];
          output[at] += mono / channels;
          counts[at]++;
        }
        if (++chunks % 40 === 0)
          progress(
            Math.min(
              100,
              Math.round(
                ((sample.timestamp - mediaStart + sample.duration) / duration) *
                  100,
              ),
            ),
          );
      } finally {
        sample.close();
      }
    }
    for (let i = 0; i < output.length; i++)
      if (counts[i]) output[i] /= counts[i];
    progress(100);
    return {
      samples: output,
      duration,
      codec: track.codec,
      frameMetrics,
      embeddedTimecode,
    };
  } finally {
    input.dispose();
  }
}
