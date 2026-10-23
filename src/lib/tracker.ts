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
export type TGrid = { sys: ASys; cls: string; term: string; subject?: string; students: TStudent[]; units: TUnit[]; cells: Record<string, TCell>; results: TResult[]; access: TrkAccess };
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
export async function fillIsams(b64: string, classes: { cls: string; students: IsamsStudent[] }[], fileName: string) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const ssXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) || "";
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  const wbXml = (await zip.file("xl/workbook.xml")!.async("string"));
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")!.async("string"));
  const report: { sheet: string; year: string; matched: number; unmatched: string[]; learnedIds: { id: string; schoolId: string }[] } [] = [];
  for (const sm of wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = sm[1].replace(/&amp;/g, "&"), yrNum = /^(\d+)\s/.exec(name)?.[1];
    if (!yrNum) continue;
    const target = new RegExp(`Id="${sm[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] || new RegExp(`Target="([^"]+)"[^>]*Id="${sm[2]}"`).exec(rels)?.[1];
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    let xml = await zip.file(path)!.async("string");
    const val = (ref: string) => { const m = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(xml); if (!m) return ""; const t = /\st="(\w+)"/.exec(m[1])?.[1]; const inner = m[2] || ""; if (t === "s") return shared[Number(/<v>(\d+)<\/v>/.exec(inner)?.[1])] ?? ""; if (t === "inlineStr") return [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""); return /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ""; };
    const cl = classes.find((c) => c.cls === `Year ${yrNum}`);
    const rep = { sheet: name, year: `Year ${yrNum}`, matched: 0, unmatched: [] as string[], learnedIds: [] as { id: string; schoolId: string }[] };
    // Header row: the one whose column A is "SchoolID"; pupils follow until column A is empty.
    let hr = 0; for (let r = 1; r < 40; r++) if (val(`A${r}`) === "SchoolID") { hr = r; break; }
    if (!hr) continue;
    const head: Record<string, string> = {}; for (const col of "ABCDEFGHIJKLMNOP") head[val(`${col}${hr}`).trim()] = col;
    const cT = head["Target Grade"], cE = head["Effort Grade"], cA = head["Attainment Grade"];
    for (let r = hr + 1; r < hr + 400; r++) {
      const sid = val(`A${r}`).trim(); if (!sid) break;
      const sur = val(`${head.Surname || "D"}${r}`), fore = val(`${head.Forename || "E"}${r}`);
      const st = cl?.students.find((s) => s.isamsId && s.isamsId === sid) || cl?.students.find((s) => norm(`${s.first} ${s.last}`) === norm(`${fore} ${sur}`) || norm(s.name) === norm(`${fore} ${sur}`));
      if (!st) { rep.unmatched.push(`${fore} ${sur}`); continue; }
      rep.matched++; if (st.isamsId !== sid) rep.learnedIds.push({ id: st.id, schoolId: sid });
      // Every matched pupil gets the tracker's values; a value the tracker doesn't have is left blank (never the template's old value).
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
