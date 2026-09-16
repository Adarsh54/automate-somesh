export const rates = {
  24: { fps: 24, nominal: 24, label: "24 fps" },
  25: { fps: 25, nominal: 25, label: "25 fps" },
  30: { fps: 30, nominal: 30, label: "30 fps" },
  23.976: { fps: 24000 / 1001, nominal: 24, label: "23.976 fps · non-drop" },
  29.97: { fps: 30000 / 1001, nominal: 30, label: "29.97 fps · non-drop" },
  "29.97df": {
    fps: 30000 / 1001,
    nominal: 30,
    drop: 2,
    label: "29.97 fps · drop-frame",
  },
};
export function toFrames(value, rate = "24") {
  const r = rates[rate];
  if (!r || !/^\d{2}:\d{2}:\d{2}[:;]\d{2}$/.test(value || "")) return null;
  const [h, m, s, f] = value.split(/[:;]/).map(Number);
  if (h > 23 || m > 59 || s > 59 || f >= r.nominal) return null;
  if (r.drop && m % 10 !== 0 && s === 0 && f < r.drop) return null;
  if (!r.drop && value.includes(";")) return null;
  return (
    (h * 3600 + m * 60 + s) * r.nominal +
    f -
    (r.drop ? r.drop * (h * 60 + m - Math.floor((h * 60 + m) / 10)) : 0)
  );
}
export function fromFrames(frames, rate = "24") {
  const r = rates[rate];
  if (!r || !Number.isFinite(frames) || frames < 0) return "";
  let n = Math.round(frames);
  if (r.drop) {
    const tenMinutes = 17982,
      minute = 1798;
    const blocks = Math.floor(n / tenMinutes),
      rest = n % tenMinutes;
    n += 18 * blocks + (rest >= 2 ? 2 * Math.floor((rest - 2) / minute) : 0);
  }
  const f = n % r.nominal,
    s = Math.floor(n / r.nominal);
  if (s >= 86400) return "";
  return (
    [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((x) => String(x).padStart(2, "0"))
      .join(":") +
    (r.drop ? ";" : ":") +
    String(f).padStart(2, "0")
  );
}
export function atOffset(start, relativeSeconds, rate = "24") {
  const n = toFrames(start, rate);
  return n === null
    ? ""
    : fromFrames(n + Math.round(relativeSeconds * rates[rate].fps), rate);
}
export function elapsed(start, end, rate = "24") {
  const a = toFrames(start, rate),
    b = toFrames(end, rate);
  return a === null || b === null ? null : (b - a) / rates[rate].fps;
}
// BMI has no frame columns. Preserve the displayed clock, rounding frame labels.
export function bmiClock(value, rate = "24") {
  if (toFrames(value, rate) === null) return null;
  const [h, m, s, f] = value.split(/[:;]/).map(Number);
  return h * 3600 + m * 60 + s + Math.round(f / rates[rate].nominal);
}
