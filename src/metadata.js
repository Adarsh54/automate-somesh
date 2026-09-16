import { rates, fromFrames } from "./timecode.js";

export function supportedRate(value, drop = false) {
  if (!Number.isFinite(value)) return null;
  if (drop)
    return Math.abs(value - rates["29.97df"].fps) < 0.02 ? "29.97df" : null;
  return (
    Object.keys(rates)
      .filter((k) => !rates[k].drop)
      .find((k) => Math.abs(rates[k].fps - value) < 0.005) || null
  );
}

// Only unambiguous, single-sample QuickTime tmcd tracks are supported. Skip
// fragmented/discontinuous/edited timecode instead of mistaking PTS for film TC.
// Specification: developer.apple.com/documentation/quicktime-file-format/timecode_sample_description
export async function readQuickTimeTimecode(file) {
  try {
    let position = 0,
      moov;
    for (let count = 0; position + 8 <= file.size && count < 10000; count++) {
      const header = new DataView(
        await file.slice(position, position + 16).arrayBuffer(),
      );
      let size = header.getUint32(0),
        head = 8;
      const type = String.fromCharCode(...new Uint8Array(header.buffer, 4, 4));
      if (size === 1) {
        size = Number(header.getBigUint64(8));
        head = 16;
      }
      if (size === 0) size = file.size - position;
      if (
        !Number.isSafeInteger(size) ||
        size < head ||
        position + size > file.size
      )
        return null;
      if (type === "moov") {
        if (size > 32 * 1024 * 1024) return null;
        moov = new DataView(
          await file.slice(position + head, position + size).arrayBuffer(),
        );
        break;
      }
      position += size;
    }
    if (!moov) return null;
    function boxes(start, end) {
      const result = [];
      while (start + 8 <= end) {
        let size = moov.getUint32(start),
          head = 8;
        const type = String.fromCharCode(
          ...new Uint8Array(moov.buffer, start + 4, 4),
        );
        if (size === 1) {
          if (start + 16 > end) break;
          size = Number(moov.getBigUint64(start + 8));
          head = 16;
        }
        if (size === 0) size = end - start;
        if (size < head || start + size > end) break;
        result.push({ type, start: start + head, end: start + size });
        start += size;
      }
      return result;
    }
    const child = (box, type) =>
      box && boxes(box.start, box.end).find((b) => b.type === type);
    const found = [];
    for (const trak of boxes(0, moov.byteLength).filter(
      (b) => b.type === "trak",
    )) {
      const mdia = child(trak, "mdia"),
        handler = child(mdia, "hdlr");
      if (
        !handler ||
        handler.start + 12 > handler.end ||
        String.fromCharCode(
          ...new Uint8Array(moov.buffer, handler.start + 8, 4),
        ) !== "tmcd"
      )
        continue;
      const edit = child(child(trak, "edts"), "elst");
      if (edit) {
        // Permit only a single unshifted, normal-speed edit.
        if (
          moov.getUint8(edit.start) !== 0 ||
          moov.getUint32(edit.start + 4) !== 1 ||
          moov.getInt32(edit.start + 12) !== 0 ||
          moov.getInt16(edit.start + 16) !== 1 ||
          moov.getInt16(edit.start + 18) !== 0
        )
          continue;
      }
      const table = child(child(mdia, "minf"), "stbl"),
        description = child(table, "stsd"),
        sizes = child(table, "stsz"),
        chunks = child(table, "stco") || child(table, "co64"),
        mapping = child(table, "stsc");
      if (
        !description ||
        !sizes ||
        !chunks ||
        !mapping ||
        moov.getUint32(description.start + 4) !== 1 ||
        moov.getUint32(sizes.start + 8) !== 1 ||
        moov.getUint32(chunks.start + 4) !== 1 ||
        moov.getUint32(mapping.start + 4) !== 1 ||
        moov.getUint32(mapping.start + 8) !== 1 ||
        moov.getUint32(mapping.start + 12) !== 1 ||
        moov.getUint32(mapping.start + 16) !== 1
      )
        continue;
      const entry = description.start + 8;
      if (
        entry + 34 > description.end ||
        String.fromCharCode(...new Uint8Array(moov.buffer, entry + 4, 4)) !==
          "tmcd" ||
        moov.getUint16(entry + 14) !== 1
      )
        continue;
      const flags = moov.getUint32(entry + 20),
        scale = moov.getUint32(entry + 24),
        frameDuration = moov.getUint32(entry + 28),
        nominal = moov.getUint8(entry + 32);
      if (flags & 8 || !frameDuration) continue; // Counter format is not editorial timecode.
      const rate = supportedRate(scale / frameDuration, Boolean(flags & 1));
      if (!rate || rates[rate].nominal !== nominal) continue;
      const sampleSize =
        moov.getUint32(sizes.start + 4) || moov.getUint32(sizes.start + 12);
      if (sampleSize !== 4) continue;
      const offset =
        chunks.type === "co64"
          ? Number(moov.getBigUint64(chunks.start + 8))
          : moov.getUint32(chunks.start + 8);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > file.size)
        continue;
      const frames = new DataView(
        await file.slice(offset, offset + 4).arrayBuffer(),
      ).getInt32(0);
      const timecode = fromFrames(frames, rate);
      if (timecode)
        found.push({ timecode, rate, source: "Embedded QuickTime timecode" });
    }
    return found.length === 1 ? found[0] : null;
  } catch {
    return null;
  }
}

export function inferredMovieTiming(metrics, embedded) {
  if (embedded)
    return {
      rate: embedded.rate,
      origin: embedded.timecode,
      originSource: embedded.source,
      rateSource: "Embedded timecode rate",
      variable: false,
    };
  const detected = metrics?.frameRateIsConstant
    ? supportedRate(metrics.underlyingFrameRate)
    : null;
  return {
    rate: detected || "24",
    origin: "00:00:00:00",
    originSource: "File-relative zero — assumed, not embedded film timecode",
    rateSource: detected
      ? "Detected from video frame timestamps"
      : metrics && !metrics.frameRateIsConstant
        ? "Variable frame rate — using a 24 fps timecode grid; choose your project rate"
        : "No supported video rate found — using 24 fps; edit if needed",
    variable: Boolean(metrics && !metrics.frameRateIsConstant),
  };
}
