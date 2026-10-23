"use client";

import { downloadBlob } from "@/lib/exportUtils";
import { modCall } from "@/lib/lmsMods";

/** Assessment Tracker client (server: workers/assessment-session/src/tracker.ts). Platform: Shaiq Muhammad System. */
export const TRK_KEYS = ["view", "edit", "effort", "xlsx", "pdf", "isams"] as const;
export type TrkKey = (typeof TRK_KEYS)[number];
export type TrkAccess = Record<TrkKey, boolean>;
export type ASys = {
  id: string; name: string; version: string; active: boolean; scope: { phase: string; years: string[]; subject: string };
  scale: { v: number; label: string }[]; key: string; cut: [number, number, number]; quran: { red: string; yellow: string; green: string }; quranPattern: string;
  bands: number[]; capTarget: boolean; capExempt: string[]; scaled: [number, number, number][]; effort: string[]; effortMap?: Record<string, string>; targetList: string[]; attainList: string[]; thresholds: number[];
  access: TrkAccess; targetRules: Record<string, { mode: "profile" | "fixed" | "teacher"; value?: string }>; isDefault: boolean; resub: "latest" | "best" | "first"; untagged: boolean; updated?: number; by?: string;
};
export type TCell = { v: number | null; src: "quiz" | "quiz-all" | "quran" | "override" | ""; auto: number | null; autoSrc: string; by?: string; at?: number; note?: string };
export type TStudent = { id: string; name: string; first: string; last: string; target: string; targetSrc: string; targetMode?: "profile" | "fixed" | "teacher"; isamsId: string };
export type TUnit = { id: string; title: string; titleAr?: string; scAr?: string[]; term: string; wk: number; sc: string[]; quizzes?: string[]; std?: { codes: string[]; skill: number } };
export type TResult = { id: string; avg: number | null; calc: number | null; grade: number | null; override: { by: string; at: number } | null; effort: string; effortManual?: boolean; effortAuto?: string; n: number };
export type TGrid = { sys: ASys; cls: string; term: string; subject?: string; students: TStudent[]; units: TUnit[]; cells: Record<string, TCell>; results: TResult[]; access: TrkAccess; ops?: { add: boolean; edit: boolean; delete: boolean } };
export const TERMS = ["Term 1", "Term 2", "Term 3"];

let admin = false;
export const setTrackerAdmin = (v: boolean) => { admin = v; };
export const trk = <T,>(action: string, body: unknown) => modCall<T>(action, body, admin);

export const cellKey = (s: string, u: string, i: number) => `${s}|${u}|${i}`;
/** Same rule as the tracker workbook: AVERAGE of filled SC cells, banded, capped at Target−1 (if on). */
export const capsFor = (sys: ASys, cls: string) => sys.capTarget && !(sys.capExempt || []).includes(cls);
export function gradeOf(avg: number | null, target: string, sys: ASys, cls = ""): number | null {
  if (avg == null) return null;
  let g = sys.bands.findIndex((b) => avg <= b + 1e-9) + 1;
  if (g <= 0) g = 7;
  const t = Number(target);
  if (capsFor(sys, cls) && target && Number.isFinite(t)) g = Math.min(g, t - 1);
  return g;
}
export function recalc(g: TGrid): TResult[] {
  return g.students.map((s) => {
    const vals: number[] = [];
    for (const u of g.units) u.sc.forEach((_, i) => { const v = g.cells[cellKey(s.id, u.id, i)]?.v; if (v != null) vals.push(v); });
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const prev = g.results.find((r) => r.id === s.id);
    const calc = gradeOf(avg, s.target, g.sys, g.cls);
    return { id: s.id, avg, calc, grade: prev?.override ? prev.grade : calc, override: prev?.override || null, effort: prev?.effort || "", n: vals.length };
  });
}
/** Bottom-right summary of the workbook: count and % of students at each threshold (4+, 5+ …), students = graded. */
export function summary(results: TResult[], thresholds: number[]) {
  const graded = results.filter((r) => r.grade != null);
  return { students: graded.length, rows: thresholds.map((t) => { const n = graded.filter((r) => (r.grade as number) >= t).length; return { label: `${t}+`, n, pct: graded.length ? (n / graded.length) * 100 : null }; }) };
}

/* ---------------------------------- Excel (identical to the department tracker files) ---------------------------------- */
const colName = (n: number) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const THIN = { style: "thin" as const };
const B4 = { left: THIN, right: THIN, top: THIN, bottom: THIN };
const AN = (o: Record<string, unknown> = {}) => ({ name: "Aptos Narrow", size: 11, ...o });
const FILL = (rgb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: rgb } });
/** The banded MIN(IF(AND…)) formula exactly as in the tracker, generated from the system bands. */
export function gradeFormula(avgCell: string, targetCell: string, sys: ASys, cls = "") {
  const b = sys.bands, lo = [0, ...b.slice(0, 6)], sp = (n: number) => " ".repeat(4 * n);
  const lines = b.map((hi, i) => `${sp(i)}IF(AND(${avgCell}${i ? `>${lo[i]}` : ">=0"}, ${avgCell}<=${hi}), ${i + 1},${i === 6 ? ' "Out of range")' : ""}`);
  const closes = [5, 4, 3, 2, 1, 0].map((n) => `${sp(n)})`);
  const core = [...lines, ...closes].join("\n");
  return capsFor(sys, cls) ? `MIN(${core},${targetCell}-1)` : core;
}
export async function exportXlsx(g: TGrid, fileName: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(g.cls.replace(/^Year /, "Y"));
  ws.properties.defaultRowHeight = 14.4;
  ws.getColumn(1).width = 65.109375;
  const N = g.students.length, lastC = colName(N); // B..lastC
  const r1 = ws.getRow(1); r1.getCell(1).value = "Student Target"; r1.getCell(1).font = AN({ bold: true }); r1.getCell(1).alignment = { horizontal: "center" };
  const r2 = ws.getRow(2); r2.getCell(1).value = "Objective"; r2.getCell(1).font = AN({ bold: true }); r2.getCell(1).alignment = { horizontal: "center" }; r2.getCell(1).border = B4;
  for (let j = 0; j <= N; j++) { const c = r1.getCell(j + 1); c.fill = FILL("FFFFC000"); c.border = B4; if (j) { c.font = AN(); const t = g.students[j - 1].target; c.value = t && Number.isFinite(Number(t)) ? Number(t) : t || null; } }
  g.students.forEach((s, j) => { const c = r2.getCell(j + 2); c.value = s.first || s.name.split(" ")[0]; c.font = AN(); });
  let r = 3; const scRows: number[] = [];
  for (const u of g.units) {
    const tr = ws.getRow(r); tr.getCell(1).value = u.title; tr.getCell(1).font = AN({ bold: true }); tr.getCell(1).alignment = { wrapText: true };
    for (let j = 0; j <= N; j++) { const c = tr.getCell(j + 1); c.fill = FILL("FF00B0F0"); c.border = j ? B4 : { left: THIN, right: THIN, top: THIN }; }
    r++;
    u.sc.forEach((t, i) => {
      const row = ws.getRow(r); row.height = 15.6; scRows.push(r);
      const a = row.getCell(1); a.value = t; a.font = { name: "Arial Narrow", size: 12, color: { argb: "FF000000" } }; a.border = B4;
      g.students.forEach((s, j) => { const c = row.getCell(j + 2); const v = g.cells[cellKey(s.id, u.id, i)]?.v; c.value = v ?? null; c.font = AN(); c.border = B4; });
      r++;
    });
    r++; // blank row between topics, as in the department files
  }
  const first = 4, last = Math.max(first, r - 2);
  const avgR = r + 1, grR = r + 2;
  const ar = ws.getRow(avgR), gr = ws.getRow(grR);
  ar.getCell(1).value = "Average"; ar.getCell(1).font = AN({ bold: true }); ar.getCell(1).alignment = { horizontal: "center" }; ar.getCell(1).border = B4;
  gr.getCell(1).value = "Attainment Grade"; gr.getCell(1).font = AN({ bold: true }); gr.getCell(1).alignment = { horizontal: "center" }; gr.getCell(1).border = B4; gr.getCell(1).fill = FILL("FFFFC000");
  g.students.forEach((s, j) => {
    const col = colName(j + 1); const res = g.results.find((x) => x.id === s.id);
    const ac = ar.getCell(j + 2); ac.value = { formula: `AVERAGE(${col}${first}:${col}${last})`, result: res?.avg ?? undefined } as never; ac.font = AN(); ac.border = B4;
    const gc = gr.getCell(j + 2); gc.font = AN(); gc.border = B4; gc.fill = FILL("FFFFC000");
    // A teacher override is written as a value (like the hand-typed grade in the department file); otherwise the live formula.
    gc.value = res?.override ? res.grade : ({ formula: gradeFormula(`${col}${avgR}`, `${col}1`, g.sys, g.cls), result: res?.grade ?? undefined } as never);
  });
  // 0–3 whole-number validation on every SC cell.
  for (const sr of scRows) for (let j = 0; j < N; j++) ws.getCell(`${colName(j + 1)}${sr}`).dataValidation = { type: "whole", operator: "between", allowBlank: true, showInputMessage: true, showErrorMessage: true, formulae: [0, 3] };
  // Key text (merged block under the grid) and the threshold summary at AA/AB.
  const keyR = grR + 1; ws.mergeCells(`A${keyR}:A${keyR + 24}`); const k = ws.getCell(`A${keyR}`); k.value = g.sys.key; k.font = AN({ size: 12 }); k.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  const endC = colName(Math.max(30, N)); const cnt = `B${grR}:${endC}${grR}`;
  let sr = grR + 2; let studentsRow = 0;
  g.sys.thresholds.forEach((t, i) => {
    ws.getCell(`AA${sr}`).value = `${t}+`; ws.getCell(`AB${sr}`).value = { formula: `COUNTIF(${cnt},">=${t}")` } as never; ws.getCell(`AB${sr}`).alignment = { vertical: "middle" };
    ws.getCell(`AA${sr + 1}`).value = "%";
    if (i === 0) { studentsRow = sr + 2; ws.getCell(`AA${studentsRow}`).value = "Students"; ws.getCell(`AB${studentsRow}`).value = { formula: `COUNTIF(${cnt},">=0")` } as never; ws.getCell(`AB${studentsRow}`).alignment = { vertical: "middle" }; }
    ws.getCell(`AB${sr + 1}`).value = { formula: `AB${sr}/AB${studentsRow}*100` } as never;
    for (const c of [`AA${sr}`, `AA${sr + 1}`, `AB${sr + 1}`, `AA${studentsRow}`]) ws.getCell(c).font = AN();
    for (const c of [`AB${sr}`, `AB${studentsRow}`]) ws.getCell(c).font = { name: "Aptos", size: 11 };
    sr += i === 0 ? 4 : 3;
  });
  void lastC;
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

/* ---------------------------------- PDF (picture of the on-site grid, same colours) ---------------------------------- */
export async function exportPdf(el: HTMLElement, title: string, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", windowWidth: el.scrollWidth, width: el.scrollWidth, height: el.scrollHeight });
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297 - 16, H = 210 - 22;
  const ratio = W / canvas.width; const pageH = Math.floor(H / ratio);
  for (let y = 0, p = 0; y < canvas.height; y += pageH, p++) {
    const part = document.createElement("canvas"); part.width = canvas.width; part.height = Math.min(pageH, canvas.height - y);
    part.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
    if (p) pdf.addPage();
    pdf.setFontSize(10); pdf.text(`${title} — page ${p + 1}`, 8, 8);
    pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", 8, 12, W, part.height * ratio);
  }
  pdf.save(fileName);
}

/* ---------------------------------- iSAMS report file (fill the uploaded template, everything else untouched) ---------------------------------- */
type IsamsStudent = { id: string; first: string; last: string; name: string; isamsId: string; target: string; effort: string; grade: number | null };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
function cellXml(ref: string, style: string, v: string) { return `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`; }
function setCell(xml: string, ref: string, v: string): string {
  const row = ref.replace(/^[A-Z]+/, "");
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (m) { const s = /\ss="(\d+)"/.exec(m[1])?.[1] || ""; return xml.replace(m[0], cellXml(ref, s, v)); }
  const rr = new RegExp(`<row r="${row}"[^>]*?(/>|>[\\s\\S]*?</row>)`).exec(xml);
  if (!rr) return xml;
  const colIdx = (r: string) => r.replace(/\d+/g, "").split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  if (rr[1] === "/>") return xml.replace(rr[0], rr[0].replace("/>", `>${cellXml(ref, "", v)}</row>`));
  const cells = [...rr[0].matchAll(/<c r="([A-Z]+\d+)"/g)];
  const after = cells.find((c) => colIdx(c[1]) > colIdx(ref));
  const ins = after ? rr[0].replace(`<c r="${after[1]}"`, `${cellXml(ref, "", v)}<c r="${after[1]}"`) : rr[0].replace("</row>", `${cellXml(ref, "", v)}</row>`);
  return xml.replace(rr[0], ins);
}
/** Empties one cell but keeps its style (and so its formatting / validation look). */
function clearCell(xml: string, ref: string): string {
  const m = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`).exec(xml);
  if (!m) return xml;
  const st = /\ss="(\d+)"/.exec(m[1])?.[1];
  return xml.replace(m[0], `<c r="${ref}"${st ? ` s="${st}"` : ""}/>`);
}
/** t290: replaces a sheet's pupil rows (hr+1 ..) with the given roster, cloning the first pupil row's cell styles; header/hidden rows untouched. */
function rebuildRows(xml: string, hr: number, roster: IsamsStudent[], head: Record<string, string>): string {
  const rowRe = (r: number) => new RegExp(`<row r="${r}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`);
  const proto = rowRe(hr + 1).exec(xml)?.[0]; if (!proto) return xml;
  let last = hr; while (rowRe(last + 1).test(xml)) last++;
  for (let r = hr + 1; r <= last; r++) xml = xml.replace(rowRe(r), "");
  const cells = [...proto.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)].map((m) => ({ col: m[1], s: /\ss="(\d+)"/.exec(m[2])?.[1] || "" }));
  const open = /^<row [^>]*?>/.exec(proto)![0].replace(/\/>$/, ">");
  const val = (col: string, st: IsamsStudent, house: string) => col === "A" ? st.isamsId : col === (head.Surname || "D") ? st.last || st.name : col === (head.Forename || "E") ? st.first : col === (head.House || "F") ? house : "";
  const house = /<c r="F\d+"[^>]*>[\s\S]*?<\/c>/.test(proto) ? "Primary" : "";
  const rows = roster.map((st, i) => { const r = hr + 1 + i; return open.replace(/r="\d+"/, `r="${r}"`) + cells.map((c) => { const v = val(c.col, st, house); return v ? cellXml(`${c.col}${r}`, c.s, v) : `<c r="${c.col}${r}"${c.s ? ` s="${c.s}"` : ""}/>`; }).join("") + "</row>"; }).join("");
  const anchor = rowRe(hr).exec(xml)![0];
  xml = xml.replace(anchor, anchor + rows);
  const end = hr + roster.length;
  if (end > last) xml = xml.replace(/sqref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g, (m, c1, r1, c2, r2) => Number(r2) === last ? `sqref="${c1}${r1}:${c2}${end}"` : m).replace(/<dimension ref="([A-Z]+\d+):([A-Z]+)\d+"\/>/, (m, a, c) => `<dimension ref="${a}:${c}${end}"/>`);
  return xml;
}
/** t295 (provisional FS2 file): keep the first year sheet as "FS2 …", drop the other year sheets, keep everything else as it is. */
async function fs2FromMain(zip: import("jszip")) {
  const rd = async (f: string) => (await zip.file(f)?.async("string")) || "";
  let wb = await rd("xl/workbook.xml"), rels = await rd("xl/_rels/workbook.xml.rels"), ct = await rd("[Content_Types].xml"), app = await rd("docProps/app.xml");
  const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)];
  const years = sheets.filter((m) => /^\d+\s/.test(m[1]));
  if (!years.length) return;
  const keep = years[0], drop = years.slice(1);
  for (const m of drop) {
    const tgt = new RegExp(`<Relationship [^>]*Id="${m[2]}"[^>]*\\/>`).exec(rels)?.[0] || "";
    const file = /Target="([^"]+)"/.exec(tgt)?.[1] || "";
    const path = file.startsWith("/") ? file.slice(1) : `xl/${file}`;
    wb = wb.replace(m[0], ""); rels = rels.replace(tgt, ""); ct = ct.replace(new RegExp(`<Override [^>]*PartName="/${path}"[^>]*\\/>`), "");
    if (file) zip.remove(path);
    app = app.replace(`<vt:lpstr>${m[1]}</vt:lpstr>`, "");
  }
  const n = drop.length;
  app = app.replace(/(<vt:lpstr>Worksheets<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)(\d+)/, (_, a, b) => a + (Number(b) - n)).replace(/(<TitlesOfParts><vt:vector size=")(\d+)/, (_, a, b) => a + (Number(b) - n));
  wb = wb.replace(/activeTab="\d+"/, `activeTab="${sheets.indexOf(keep)}"`);
  const fsName = keep[1].replace(/^\d+ \d+ /, "FS2 ");
  wb = wb.split(`name="${keep[1]}"`).join(`name="${fsName}"`); app = app.split(`<vt:lpstr>${keep[1]}</vt:lpstr>`).join(`<vt:lpstr>${fsName}</vt:lpstr>`);
  zip.file("xl/workbook.xml", wb); zip.file("xl/_rels/workbook.xml.rels", rels); zip.file("[Content_Types].xml", ct); zip.file("docProps/app.xml", app);
  // Labels: "1 1 Isl B … T280" -> "FS2 Isl B … T280" and the sheet's "1 Isl B" -> "FS2 Isl B" (cell text); the Information list keeps only the FS2 line.
  let ss = await rd("xl/sharedStrings.xml");
  ss = ss.replace(/<t([^>]*)>1 1 /g, "<t$1>FS2 ").replace(/<t([^>]*)>1 Isl /g, "<t$1>FS2 Isl ");
  zip.file("xl/sharedStrings.xml", ss);
  const info = sheets.find((m) => /^information$/i.test(m[1]));
  if (info) {
    const tgt = new RegExp(`Id="${info[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] || new RegExp(`Target="([^"]+)"[^>]*Id="${info[2]}"`).exec(rels)?.[1];
    const path = tgt ? (tgt.startsWith("/") ? tgt.slice(1) : `xl/${tgt}`) : "";
    if (path) { let x = await rd(path); const strs = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
      for (const c of [...x.matchAll(/<c r="(A\d+)"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/g)]) if (/^[2-9] [2-9] /.test(strs[Number(c[2])] || "")) x = clearCell(x, c[1]);
      zip.file(path, x); }
  }
}
export async function fillIsams(b64: string, classes: { cls: string; students: IsamsStudent[] }[], fileName: string, opts: { roster?: boolean; relabel?: [string, string][]; fs2?: { provisional: boolean } | null } = {}) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  // t291: subject label swap (cell text + sheet tab names), same-length so nothing else moves.
  for (const f of ["xl/sharedStrings.xml", "xl/workbook.xml", "docProps/app.xml"]) {
    const zf = zip.file(f); if (!zf || !opts.relabel?.length) continue;
    let t = await zf.async("string"); for (const [a, b] of opts.relabel) t = t.split(a).join(b); zip.file(f, t);
  }
  if (opts.fs2?.provisional) await fs2FromMain(zip);
  const ssXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) || "";
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  const wbXml = (await zip.file("xl/workbook.xml")!.async("string"));
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")!.async("string"));
  const report: { sheet: string; year: string; matched: number; unmatched: string[]; learnedIds: { id: string; schoolId: string }[] } [] = [];
  for (const sm of wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = sm[1].replace(/&amp;/g, "&"), yrNum = opts.fs2 ? (/^(information|isams information|sheet\d+)$/i.test(name) ? "" : "FS2") : /^(\d+)\s/.exec(name)?.[1];
    if (!yrNum) continue;
    const target = new RegExp(`Id="${sm[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] || new RegExp(`Target="([^"]+)"[^>]*Id="${sm[2]}"`).exec(rels)?.[1];
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    let xml = await zip.file(path)!.async("string");
    const val = (ref: string) => { const m = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(xml); if (!m) return ""; const t = /\st="(\w+)"/.exec(m[1])?.[1]; const inner = m[2] || ""; if (t === "s") return shared[Number(/<v>(\d+)<\/v>/.exec(inner)?.[1])] ?? ""; if (t === "inlineStr") return [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""); return /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ""; };
    const yr = yrNum === "FS2" ? "FS2" : `Year ${yrNum}`;
    const cl = classes.find((c) => c.cls === yr);
    const rep = { sheet: name, year: yr, matched: 0, unmatched: [] as string[], learnedIds: [] as { id: string; schoolId: string }[] };
    // Header row: the one whose column A is "SchoolID"; pupils follow until column A is empty.
    let hr = 0; for (let r = 1; r < 40; r++) if (val(`A${r}`) === "SchoolID") { hr = r; break; }
    if (!hr) continue;
    const head: Record<string, string> = {}; for (const col of "ABCDEFGHIJKLMNOP") head[val(`${col}${hr}`).trim()] = col;
    const cT = head["Target Grade"], cE = head["Effort Grade"], cA = head["Attainment Grade"];
    if (opts.roster || opts.fs2?.provisional) {
      const roster = [...(cl?.students || [])].sort((x, y) => (x.last || x.name).localeCompare(y.last || y.name, "en", { sensitivity: "base" }) || x.first.localeCompare(y.first, "en", { sensitivity: "base" }));
      xml = rebuildRows(xml, hr, roster, head);
    }
    for (let r = hr + 1; r < hr + 400; r++) {
      const sid = val(`A${r}`).trim();
      const sur = val(`${head.Surname || "D"}${r}`), fore = val(`${head.Forename || "E"}${r}`);
      // t295: a pupil without an iSAMS SchoolID (e.g. new FS2 pupils) is still a row; stop only at a fully empty row.
      if (!sid && !sur.trim() && !fore.trim()) break;
      const st = cl?.students.find((s) => s.isamsId && s.isamsId === sid) || cl?.students.find((s) => norm(`${s.first} ${s.last}`) === norm(`${fore} ${sur}`) || norm(s.name) === norm(`${fore} ${sur}`) || (norm(s.last || s.name) === norm(sur) && norm(s.first) === norm(fore)));
      if (!st) { rep.unmatched.push(`${fore} ${sur}`); continue; }
      rep.matched++; if (sid && st.isamsId !== sid) rep.learnedIds.push({ id: st.id, schoolId: sid });
      // Every matched pupil gets the tracker's values; a value the tracker doesn't have is left blank (never the template's old value).
      if (yr === "FS2" && !st.target) st.target = "7"; // t295: FS2 Target is 7
      if (cT) xml = st.target ? setCell(xml, `${cT}${r}`, st.target) : clearCell(xml, `${cT}${r}`);
      if (cE) xml = st.effort ? setCell(xml, `${cE}${r}`, st.effort) : clearCell(xml, `${cE}${r}`);
      if (cA) xml = st.grade != null ? setCell(xml, `${cA}${r}`, String(st.grade)) : clearCell(xml, `${cA}${r}`);
    }
    zip.file(path, xml);
    report.push(rep);
  }
  const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(out, fileName);
  return report;
}
export const fileToB64 = async (f: File) => { const b = new Uint8Array(await f.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** t294: which choices a tracker dropdown offers under the Add / Edit / Delete switches (server enforces the same). */
export function opRule(g: TGrid, had: boolean, tr: (en: string, ar: string) => string) {
  const o = g.ops || { add: true, edit: true, delete: true };
  const dis = had ? !o.edit && !o.delete : !o.add;
  return {
    dis, vals: had ? o.edit : o.add, revert: had && o.delete, blank: o.delete && (had ? o.edit : o.add),
    tip: dis ? (had ? tr("You aren't allowed to edit or delete this grade.", "لا يُسمح لك بتعديل هذه الدرجة أو حذفها.") : tr("You aren't allowed to add grades.", "لا يُسمح لك بإضافة درجات.")) : "",
  };
}
