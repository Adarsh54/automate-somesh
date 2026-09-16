export const usages = {
  BI: "Background instrumental",
  BV: "Background vocal",
  VI: "Visual instrumental",
  VV: "Visual vocal",
  MT: "Main title theme",
  ET: "End title theme",
  Logo: "Logo",
};
export function seconds(value) {
  if (!/^\d{2,}:\d{2}:\d{2}$/.test(value || "")) return null;
  const [h, m, s] = value.split(":").map(Number);
  return m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
}
export function time(value) {
  if (!Number.isFinite(value)) return "—";
  const s = Math.floor(value);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
}
import { elapsed, rates, toFrames } from "./timecode.js";
export function duration(cue, rate = "24") {
  if (cue.start?.length === 8 && cue.end?.length === 8) {
    const a = seconds(cue.start),
      b = seconds(cue.end);
    return a !== null && b !== null && b > a ? b - a : null;
  }
  const d = elapsed(cue.start, cue.end, rate);
  return d !== null && d > 0 ? d : null;
}
export function creditIssues(track) {
  const issues = [];
  for (const role of ["Composer", "Publisher"]) {
    const people = track.credits.filter((p) => p.role === role);
    if (!people.length) issues.push(`Add ${role.toLowerCase()} credits`);
    else {
      if (
        people.some(
          (p) =>
            !(role === "Publisher" ? p.name : p.last).trim() ||
            !p.pro.trim() ||
            p.share === "" ||
            !Number.isFinite(Number(p.share)) ||
            Number(p.share) < 0 ||
            Number(p.share) > 100,
        )
      )
        issues.push(`Complete ${role.toLowerCase()} names, PROs and shares`);
      if (
        Math.abs(people.reduce((n, p) => n + Number(p.share || 0), 0) - 100) >
        0.01
      )
        issues.push(`${role} shares must total 100%`);
    }
  }
  return issues;
}
export function cueIssues(cue, track, production) {
  const issues = [],
    rate = production.rate || "24";
  if (!(cue.title || track?.title || "").trim())
    issues.push("Cue title missing");
  if (!usages[cue.usage]) issues.push("Choose usage");
  if (duration(cue, rate) === null)
    issues.push("Enter valid film in/out timecodes, with out after in");
  const show = seconds(production.duration),
    origin = production.startTimecode || null;
  const start = !origin
    ? null
    : cue.start?.length === 8
      ? seconds(cue.start)
      : elapsed(origin, cue.start, rate);
  const end = !origin
    ? null
    : cue.end?.length === 8
      ? seconds(cue.end)
      : elapsed(origin, cue.end, rate);
  if (start !== null && start < 0)
    issues.push("Cue starts before the production start");
  if (show !== null && end !== null && end > show + 1 / rates[rate].fps)
    issues.push("Cue ends after the production");
  if (cue.method && cue.method !== "manual" && !cue.reviewed)
    issues.push("Review detected timing");
  if (cue.staleSource)
    issues.push("Movie reattached or replaced; rerun matching");
  if (cue.method === "offset" && toFrames(track?.offset, rate) === null)
    issues.push("Correct this audio file’s starting film timecode");
  return [...issues, ...(track ? creditIssues(track) : ["Track missing"])];
}
