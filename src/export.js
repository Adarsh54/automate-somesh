import {effectiveCue} from "./cue-details.js";
import JSZip from "jszip";
import { seconds, duration } from "./model.js";
import { bmiClock, rates } from "./timecode.js";
export async function exportWorkbook(production, tracks, cues, shared) {
  if (shared) cues = cues.map(cue => effectiveCue(cue, shared));
  const response = await fetch(
    `${import.meta.env.BASE_URL}bmi-cue-sheet-template.xlsx`,
  );
  if (!response.ok) throw new Error("BMI template could not be loaded");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const doc = new DOMParser().parseFromString(
    await zip.file("xl/worksheets/sheet1.xml").async("string"),
    "application/xml",
  );
  const ns = doc.documentElement.namespaceURI;
  const el = (n) => doc.createElementNS(ns, n);
  function set(ref, value) {
    let cell = doc.querySelector(`c[r="${ref}"]`);
    if (!cell) {
      const row = doc.querySelector(`row[r="${ref.match(/\d+/)[0]}"]`);
      cell = el("c");
      cell.setAttribute("r", ref);
      row.append(cell);
    }
    while (cell.firstChild) cell.firstChild.remove();
    cell.removeAttribute("t");
    if (value === "" || value === null || value === undefined) return;
    if (typeof value === "number") {
      const v = el("v");
      v.textContent = value;
      cell.append(v);
    } else {
      cell.setAttribute("t", "inlineStr");
      const is = el("is"),
        t = el("t");
      t.textContent = String(value);
      is.append(t);
      cell.append(is);
    }
  }
  // Replace calculated sequence/duration cells with explicit values, including empty rows.
  for (let row = 20; row <= 999; row++)
    for (const col of ["A", "J", "K"]) set(`${col}${row}`, null);
  const p = production;
  const show = seconds(p.duration);
  const fields = {
    A1: [p.title, p.episode].filter(Boolean).join(", "),
    A2: "Music Cue Sheet",
    D4: p.classification,
    D5: new Date().toISOString().slice(0, 10),
    D8: p.airdate,
    D9: p.category,
    D10: p.version,
    D11: p.network,
    D13: show === null ? null : Math.floor(show / 60),
    F13: show === null ? null : show % 60,
    N4: p.title,
    N5: p.aka,
    N6: p.episode,
    N7: p.episodeAka,
    N8: p.episodeNumber,
    N9: p.productionNumber,
    N11: p.company,
    N12: p.address,
    N13: p.preparedBy,
    N14: p.email,
  };
  for (const [ref, v] of Object.entries(fields)) set(ref, v);
  let row = 20,
    total = 0;
  cues.forEach((cue, index) => {
    const track = tracks.find((t) => t.id === cue.trackId),
      d = Math.round(duration(cue, p.rate));
    total += d;
    (cue.credits ?? track.credits).forEach((credit, i) => {
      if (row > 999)
        throw new Error(
          "Template limit: 980 credit rows. Split the cue sheet.",
        );
      if (i === 0) {
        set(`A${row}`, index + 1);
        set(`B${row}`, cue.title || track.title);
        set(`C${row}`, cue.usage);
        for (const [start, cols] of [
          [cue.start, ["D", "E", "F"]],
          [cue.end, ["G", "H", "I"]],
        ]) {
          const clock = bmiClock(start, p.rate);
          [
            Math.floor(clock / 3600),
            Math.floor((clock % 3600) / 60),
            clock % 60,
          ].forEach((v, j) => set(`${cols[j]}${row}`, v));
        }
        set(`J${row}`, Math.floor(d / 60));
        set(`K${row}`, d % 60);
      }
      set(`L${row}`, credit.role);
      set(`M${row}`, credit.role === "Composer" ? credit.first : "");
      set(`N${row}`, credit.role === "Composer" ? credit.last : "");
      set(`O${row}`, credit.role === "Publisher" ? credit.name : "");
      set(`P${row}`, credit.ipi);
      set(`Q${row}`, credit.pro);
      set(`R${row}`, Number(credit.share) / 100);
      row++;
    });
  });
  set("D14", Math.floor(total / 60));
  set("F14", total % 60);
  for (const [ref, v] of Object.entries({
    E14: "min.",
    G14: "sec.",
    H14: "(cue durations)",
  }))
    set(ref, v);
  zip.file(
    "xl/worksheets/sheet1.xml",
    new XMLSerializer().serializeToString(doc),
  );
  zip.remove("xl/calcChain.xml");
  for (const path of ["[Content_Types].xml", "xl/_rels/workbook.xml.rels"]) {
    let xml = await zip.file(path).async("string");
    xml = xml.replace(
      /<(?:Override|Relationship)\b[^>]*(?:calcChain)[^>]*\/>/g,
      "",
    );
    zip.file(path, xml);
  }
  // Keep frame-accurate data alongside the unchanged BMI column structure.
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
  const rows = [
    ["Frame-accurate cue timings — BMI Template tab rounds to whole seconds"],
    ["Production start", p.startTimecode, "Frame rate", rates[p.rate].label],
    [
      "Cue",
      "Title",
      "Film in",
      "Film out",
      "Duration (seconds)",
      "Method",
      "File start timecode",
      "Detected file in (s)",
      "Detected file out (s)",
      "Similarity (not probability)",
      "Reviewed",
      "Cue provenance",
    ],
    ...cues.map((c, i) => [
      i + 1,
      c.title || tracks.find((t) => t.id === c.trackId).title,
      c.start,
      c.end,
      duration(c, p.rate),
      c.method || "manual",
      c.fileOffset || "",
      c.relativeStart ?? "",
      c.relativeEnd ?? "",
      c.score ?? "",
      c.reviewed ? "Yes" : "No",
      ({original: "Original work", sourced: "Sourced music"})[c.category] || "Unspecified",
    ]),
  ];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="12" width="27" customWidth="1"/></cols><sheetData>${rows.map((values, i) => `<row r="${i + 1}">${values.map((v, j) => (typeof v === "number" ? `<c r="${String.fromCharCode(65 + j)}${i + 1}"><v>${v}</v></c>` : `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${escape(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  zip.file("xl/worksheets/sheet3.xml", sheet);
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  zip.file(
    "xl/workbook.xml",
    workbookXml.replace(
      "</sheets>",
      '<sheet name="Frame timings" sheetId="3" r:id="rIdCuestampFrames"/></sheets>',
    ),
  );
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  zip.file(
    "xl/_rels/workbook.xml.rels",
    rels.replace(
      "</Relationships>",
      '<Relationship Id="rIdCuestampFrames" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>',
    ),
  );
  const types = await zip.file("[Content_Types].xml").async("string");
  zip.file(
    "[Content_Types].xml",
    types.replace(
      "</Types>",
      '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
  );
  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
