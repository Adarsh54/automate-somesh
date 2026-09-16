import wasmUrl from "./fft.wasm?url&inline";
import {loadWasmFFT} from "./wasm-fft.js";
import { detectRegions, prepareMovie, matchTrack } from "./analysis.js";
let transformPromise;
const loadTransform = () => transformPromise ??= loadWasmFFT(wasmUrl);
self.onmessage = async ({ data }) => {
  try {
    const started = performance.now();
    if (data.mode === "offset") {
      const results = data.tracks.map((t) => ({
        id: t.id,
        matches: detectRegions(t.samples, data.options),
      }));
      self.postMessage({
        type: "done",
        results,
        elapsed: (performance.now() - started) / 1000,
      });
      return;
    }
    self.postMessage({ type: "progress", text: "Indexing movie audio…" });
    const transform = await loadTransform();
    const movie = prepareMovie(data.movie, {transform}),
      results = [];
    data.tracks.forEach((t, index) => {
      const result = matchTrack(movie, t.samples, {
        ...data.options,
        progress: (i, count) =>
          self.postMessage({
            type: "progress",
            text: `Matching ${t.title} · track ${index + 1}/${data.tracks.length} · segment ${i + 1}/${count}`,
          }),
      });
      results.push({ id: t.id, ...result });
    });
    self.postMessage({
      type: "done",
      engine: transform ? "wasm" : "javascript",
      results,
      elapsed: (performance.now() - started) / 1000,
    });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
