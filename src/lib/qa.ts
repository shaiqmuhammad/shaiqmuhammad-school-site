"use client";
import { modCall } from "@/lib/lmsMods";
import { downloadBlob, safeFileName } from "@/lib/exportUtils";

/** t336 Progress Check QA client (server: workers/assessment-session/src/qa.ts). */
export type KRule = { r: string; a: number; b: number };
export type Khda = { att: KRule[]; prog: KRule[]; note: string };
export type QaFilters = { pc: string; phase: string; dept: string; subject: string; year: string; section: string; teacher: string };
export type QaRow = { key: string; label: string; year: string; section: string; subject: string; students: number; graded: number; n: Record<string, number>; pct: Record<string, number | null>; rating: string; withTarget: number; onTarget: number; above: number; pExp: number | null; pAbove: number | null; progRating: string; up: number; same: number; down: number; prevGraded: number };
export type QaOvr = { a?: number | null; b?: number | null; note: string; by: string; at: number };
export type QaReportData = { staff: string; date: string; strengths: string; afd: string; actions: string; comment: string; rowNotes: Record<string, string>; ovr: Record<string, QaOvr>; by?: string; at?: number };
export type QaBody = { filters: QaFilters; term: string; khda: Khda; thresholds: [string, string]; rows: QaRow[]; total: (Omit<QaRow, "key" | "label" | "year" | "section" | "subject" | "withTarget" | "onTarget" | "above" | "up" | "same" | "down" | "prevGraded">) | null;
  options: { pcs: number[]; phases: string[]; depts: string[]; subjects: string[]; years: string[]; sections: string[]; teachers: { id: string; name: string }[] }; staff: string; report: QaReportData | null; access: { view: boolean; add: boolean; edit: boolean; dl: boolean; admin: boolean } };
export const qaCall = <T,>(action: string, body: unknown, asAdmin: boolean) => modCall<T>(action, body, asAdmin);
export const rate = (pa: number | null | undefined, pb: number | null | undefined, rules: KRule[]) => (pa == null ? "" : (rules.find((x) => pa >= x.a - 1e-9 && (pb ?? 0) >= x.b - 1e-9) || rules[rules.length - 1]).r);
/** Same look as the tracker summary / sample: up to 5 decimals, no trailing zeros. */
export const fmt = (v: number | null | undefined) => (v == null ? "—" : String(+v.toFixed(5)));
export const RATING_COLOR: Record<string, string> = { Outstanding: "#15803d", "Very good": "#16a34a", Good: "#65a30d", Acceptable: "#ca8a04", Weak: "#ea580c", "Very weak": "#dc2626" };

/** A row with any override applied (calculated values are kept for the "calculated" note). */
export function eff(r: { key?: string; pct: Record<string, number | null> }, th: [string, string], o?: QaOvr) {
  const a = o?.a ?? r.pct[th[0]] ?? null, b = o?.b ?? r.pct[th[1]] ?? null;
  return { a, b, over: !!o && (o.a != null || o.b != null) };
}
/** The threshold table written like the school's PC guidance (e.g. "75%+ | 61%–74% | Very good"). */
export const thrText = (rules: KRule[], th: [string, string]) => rules.map((x, i) => {
  const better = rules.slice(0, i);
  const upA = Math.min(...better.map((y) => y.a).filter((v) => v > x.a), Infinity);
  const rng = (lo: number, up: number) => (up === Infinity ? `${lo}%+` : lo > 0 ? `${lo}%–${up - 1}%` : `Below ${up}%`);
  const A = rng(x.a, upA);
  const upB = Math.min(...better.filter((y) => y.a === x.a).map((y) => y.b).filter((v) => v > x.b), Infinity);
  const B = upA !== Infinity ? "N/A" : rng(x.b, upB);
  return { r: x.r, a: A, b: x.b === 0 && upB === Infinity && upA === Infinity ? "Any" : B, th };
});

const title = (d: QaBody) => `Progress Check ${d.filters.pc} Quality Assurance`;
const subj = (d: QaBody) => d.filters.subject || d.filters.dept || d.rows[0]?.subject || "All subjects";
const fileBase = (d: QaBody) => safeFileName(`PC${d.filters.pc} QA - ${subj(d)}${d.filters.year ? ` - ${d.filters.year}` : ""}${d.filters.section ? ` ${d.filters.section}` : ""}`);
type Tbl = { head: string[]; rows: string[][]; title?: string };
export function sections(d: QaBody, rep: QaReportData) {
  const th = d.thresholds;
  const r = d.rows.map((x) => ({ x, e: eff(x, th, rep.ovr[x.key]) }));
  const multi = new Set(d.rows.map((x) => x.subject)).size > 1;
  const lab = (x: QaRow) => (multi ? `${x.subject} · ${x.label}` : x.label);
  const att: Tbl = { title: "Attainment", head: [d.filters.year ? "Class" : "Year", `% of Children Working ${th[0]}`, `% of Children Working ${th[1]}`, "KHDA rating"],
    rows: [...r.map(({ x, e }) => [lab(x), fmt(e.a) + (e.over ? " *" : ""), fmt(e.b) + (e.over ? " *" : ""), rate(e.a, e.b, d.khda.att)]),
      ...(d.total && d.rows.length > 1 ? [["All", fmt(d.total.pct[th[0]]), fmt(d.total.pct[th[1]]), d.total.rating]] : [])] };
  const prog: Tbl = { title: "Progress", head: [d.filters.year ? "Class" : "Year", "% at / above target (expected)", "% above target (better than expected)", "KHDA rating", d.filters.pc === "1" ? "Students with a target" : `↑ / = / ↓ vs PC${Number(d.filters.pc) - 1}`],
    rows: [...d.rows.map((x) => [lab(x), fmt(x.pExp), fmt(x.pAbove), x.progRating, d.filters.pc === "1" ? `${x.withTarget}/${x.graded}` : `${x.up} / ${x.same} / ${x.down}`]),
      ...(d.total && d.rows.length > 1 ? [["All", fmt(d.total.pExp), fmt(d.total.pAbove), d.total.progRating, ""]] : [])] };
  const counts: Tbl = { title: "Tracker summary (bottom of the Assessment Tracker)", head: [d.filters.year ? "Class" : "Year", th[0], "%", th[1], "%", "Students (graded)"], rows: d.rows.map((x) => [lab(x), String(x.n[th[0]] ?? 0), fmt(x.pct[th[0]]), String(x.n[th[1]] ?? 0), fmt(x.pct[th[1]]), `${x.graded}/${x.students}`]) };
  const thr: Tbl = { title: "KHDA rating thresholds used", head: [th[0], th[1], "Rating"], rows: thrText(d.khda.att, th).reverse().map((t) => [t.a, t.b, t.r]) };
  const ovr = r.filter(({ e }) => e.over).map(({ x }) => { const o = rep.ovr[x.key]; return `* ${lab(x)}: calculated ${fmt(x.pct[th[0]])} / ${fmt(x.pct[th[1]])}, overridden to ${fmt(o.a ?? x.pct[th[0]])} / ${fmt(o.b ?? x.pct[th[1]])} by ${o.by}${o.note ? ` — ${o.note}` : ""}`; });
  const notes = d.rows.filter((x) => rep.rowNotes[x.key]).map((x) => `${lab(x)}: ${rep.rowNotes[x.key]}`);
  const narr: [string, string][] = [["Strengths", rep.strengths], ["Areas for development", rep.afd], ["Actions / next steps", rep.actions], ["Comments", [rep.comment, ...notes].filter(Boolean).join("\n")]];
  return { att, prog, counts, thr, ovr, narr, head: [["Staff member", rep.staff], ["Subject", subj(d)], ["Date", rep.date]] as [string, string][], title: title(d), meta: `${d.term}${d.filters.phase ? ` · ${d.filters.phase}` : ""}${d.filters.year ? ` · ${d.filters.year}` : ""}${d.filters.section ? ` ${d.filters.section}` : ""}` };
}

/* ------------------------------ Word (laid out like the sample: Century Gothic 10, bold title, blue "Year Group Data") ------------------------------ */
export async function qaDocx(d: QaBody, rep: QaReportData) {
  const D = await import("docx"); const S = sections(d, rep);
  const F = "Century Gothic"; const run = (t: string, o: Record<string, unknown> = {}) => new D.TextRun({ text: t, font: F, size: 20, ...o });
  const P = (t: string, o: Record<string, unknown> = {}, po: Record<string, unknown> = {}) => new D.Paragraph({ children: String(t).split("\n").flatMap((l, i) => [...(i ? [new D.TextRun({ break: 1 })] : []), run(l, o)]), ...po });
  const B = { style: D.BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: B, bottom: B, left: B, right: B, insideHorizontal: B, insideVertical: B };
  const cell = (t: string, o: Record<string, unknown> = {}, span = 1, fill?: string) => new D.TableCell({ children: [P(t, o, span > 1 ? { alignment: D.AlignmentType.CENTER } : {})], columnSpan: span, ...(fill ? { shading: { fill, type: D.ShadingType.CLEAR, color: "auto" } } : {}) });
  const table = (t: Tbl, pct = 63) => new D.Table({ width: { size: pct * 50, type: D.WidthType.PERCENTAGE }, borders, rows: [
    ...(t.title ? [new D.TableRow({ height: { value: 493, rule: D.HeightRule.ATLEAST }, children: [cell(t.title, { bold: true }, t.head.length)] })] : []),
    new D.TableRow({ height: { value: 493, rule: D.HeightRule.ATLEAST }, children: t.head.map((h) => cell(h, { bold: true })) }),
    ...t.rows.map((r) => new D.TableRow({ children: r.map((v, i) => cell(v, i === r.length - 1 || /rating/i.test(t.head[i] || "") ? { color: (RATING_COLOR[v] || "000000").replace("#", "") } : {})) }))] });
  const B12 = { style: D.BorderStyle.SINGLE, size: 12, color: "000000" }, B6 = { style: D.BorderStyle.SINGLE, size: 6, color: "000000" };
  const head = new D.Table({ width: { size: 100 * 50, type: D.WidthType.PERCENTAGE }, borders: { top: B12, bottom: B12, left: B12, right: B12, insideHorizontal: B6, insideVertical: B6 }, rows: S.head.map(([k, v]) => new D.TableRow({ children: [new D.TableCell({ width: { size: 1955, type: D.WidthType.DXA }, children: [P(k, { bold: true })] }), new D.TableCell({ children: [P(v || "")] })] })) });
  const blue = (t: string) => P(t, { bold: true, color: "0070C0" }, { spacing: { before: 240, after: 80 } });
  const doc = new D.Document({ creator: "Shaiq Muhammad System", title: S.title, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: [
    P(S.title + " ", { bold: true, font: "Aptos", size: 24 }), P(S.meta, { size: 16, color: "666666" }), head, P(""),
    blue("Year Group Data "), table(S.att), ...(S.ovr.length ? [P(S.ovr.join("\n"), { size: 16, italics: true })] : []),
    blue("Progress"), table(S.prog, 100), blue("Tracker summary"), table({ ...S.counts, title: undefined }, 100),
    blue("KHDA rating thresholds used"), table({ ...S.thr, title: undefined }, 100), P(`Rating = the first row (best first) where both minimums are met. Progress uses the same scale on “% at/above target” and “% above target”.${d.khda.note ? " " + d.khda.note : ""}`, { size: 16 }),
    ...S.narr.flatMap(([k, v]) => [blue(k), P(v || "—")]),
    P(`Calculated from the Assessment Tracker (${d.term}). Generated ${new Date().toLocaleString("en-GB")}${rep.by ? ` · last edited by ${rep.by}` : ""}.`, { size: 14, color: "888888" }, { spacing: { before: 240 } }),
  ] }] });
  downloadBlob(await D.Packer.toBlob(doc), `${fileBase(d)}.docx`);
}

/* ------------------------------ Excel ------------------------------ */
export async function qaXlsx(d: QaBody, rep: QaReportData) {
  const EX = (await import("exceljs")).default; const S = sections(d, rep);
  const wb = new EX.Workbook(); wb.creator = "Shaiq Muhammad System"; const ws = wb.addWorksheet(`PC${d.filters.pc} QA`, { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const font = { name: "Century Gothic", size: 10 }; const thin = { style: "thin" as const }; const box = { top: thin, left: thin, bottom: thin, right: thin };
  ws.columns = [{ width: 24 }, { width: 26 }, { width: 26 }, { width: 18 }, { width: 20 }, { width: 18 }];
  const add = (vals: (string | number)[], o: { bold?: boolean; color?: string; border?: boolean; size?: number } = {}) => { const r = ws.addRow(vals); r.eachCell((c) => { c.font = { ...font, bold: o.bold, size: o.size || 10, color: o.color ? { argb: "FF" + o.color } : undefined }; c.alignment = { wrapText: true, vertical: "top" }; if (o.border) c.border = box; }); return r; };
  add([S.title], { bold: true, size: 12 }); add([S.meta], { color: "666666", size: 8 });
  for (const [k, v] of S.head) { const r = add([k, v], { border: true }); r.getCell(1).font = { ...font, bold: true }; ws.mergeCells(r.number, 2, r.number, 4); }
  add([]);
  const tbl = (t: Tbl, heading?: string) => {
    if (heading) add([heading], { bold: true, color: "0070C0" });
    if (t.title) { const r = add([t.title], { bold: true, border: true }); ws.mergeCells(r.number, 1, r.number, t.head.length); r.getCell(1).alignment = { horizontal: "center" }; }
    add(t.head, { bold: true, border: true });
    for (const row of t.rows) { const r = add(row.map((v, i) => (i > 0 && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v)), { border: true }); row.forEach((v, i) => { if (RATING_COLOR[v]) r.getCell(i + 1).font = { ...font, bold: true, color: { argb: "FF" + RATING_COLOR[v].slice(1) } }; }); }
    add([]);
  };
  tbl(S.att, "Year Group Data"); for (const o of S.ovr) add([o], { size: 8 });
  tbl(S.prog, "Progress"); tbl({ ...S.counts, title: undefined }, "Tracker summary"); tbl({ ...S.thr, title: undefined }, "KHDA rating thresholds used");
  for (const [k, v] of S.narr) { add([k], { bold: true, color: "0070C0" }); const r = add([v || "—"]); ws.mergeCells(r.number, 1, r.number, 6); r.height = Math.max(18, 14 * (String(v || "").split("\n").length + Math.floor(String(v || "").length / 90))); }
  add([`Calculated from the Assessment Tracker (${d.term}). Generated ${new Date().toLocaleString("en-GB")}.`], { size: 8, color: "888888" });
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(d)}.xlsx`);
}

/* ------------------------------ PDF (A4 portrait, same order as the Word file) ------------------------------ */
export async function qaPdf(d: QaBody, rep: QaReportData) {
  const { jsPDF } = await import("jspdf"); const S = sections(d, rep);
  const pdf = new jsPDF({ unit: "pt", format: "a4" }); const W = 595, M = 50; let y = 60;
  const need = (h: number) => { if (y + h > 800) { pdf.addPage(); y = 50; } };
  const text = (t: string, o: { b?: boolean; s?: number; c?: string; x?: number; w?: number } = {}) => { pdf.setFont("helvetica", o.b ? "bold" : "normal"); pdf.setFontSize(o.s || 10); pdf.setTextColor(o.c || "#000000"); const lines = pdf.splitTextToSize(t, o.w || W - 2 * M) as string[]; need(lines.length * (o.s || 10) * 1.3); pdf.text(lines, o.x ?? M, y); y += lines.length * (o.s || 10) * 1.3; };
  const table = (t: Tbl, frac = 0.63) => {
    const n = t.head.length, tw = (W - 2 * M) * frac, cw = tw / n; const rowH = (cells: string[]) => Math.max(18, ...cells.map((c) => (pdf.splitTextToSize(c, cw - 8) as string[]).length * 12 + 6));
    const draw = (cells: string[], bold: boolean, span = false) => { pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(9); const h = span ? 22 : rowH(cells); need(h);
      if (span) { pdf.rect(M, y, tw, h); pdf.setTextColor("#000000"); pdf.text(cells[0], M + tw / 2, y + 14, { align: "center" }); }
      else cells.forEach((c, i) => { pdf.rect(M + i * cw, y, cw, h); pdf.setTextColor(RATING_COLOR[c] || "#000000"); pdf.text(pdf.splitTextToSize(c, cw - 8), M + i * cw + 4, y + 12); });
      y += h; };
    if (t.title) draw([t.title], true, true); draw(t.head, true); for (const r of t.rows) draw(r, false); y += 12;
  };
  text(S.title, { b: true, s: 13 }); text(S.meta, { s: 8, c: "#666666" }); y += 4;
  for (const [k, v] of S.head) { pdf.setLineWidth(0.8); need(20); pdf.rect(M, y, 100, 20); pdf.rect(M + 100, y, W - 2 * M - 100, 20); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor("#000000"); pdf.text(k, M + 4, y + 14); pdf.setFont("helvetica", "normal"); pdf.text(v || "", M + 104, y + 14); y += 20; }
  pdf.setLineWidth(0.5); y += 18;
  text("Year Group Data", { b: true, c: "#0070C0" }); y += 2; table(S.att); for (const o of S.ovr) text(o, { s: 8 });
  text("Progress", { b: true, c: "#0070C0" }); y += 2; table(S.prog, 1);
  text("Tracker summary", { b: true, c: "#0070C0" }); y += 2; table({ ...S.counts, title: undefined }, 1);
  text("KHDA rating thresholds used", { b: true, c: "#0070C0" }); y += 2; table({ ...S.thr, title: undefined }, 0.8);
  for (const [k, v] of S.narr) { text(k, { b: true, c: "#0070C0" }); text(v || "—"); y += 6; }
  text(`Calculated from the Assessment Tracker (${d.term}). Generated ${new Date().toLocaleString("en-GB")}.`, { s: 7, c: "#888888" });
  downloadBlob(pdf.output("blob"), `${fileBase(d)}.pdf`);
}
