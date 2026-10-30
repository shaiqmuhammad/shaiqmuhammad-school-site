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
export const RATING_COLOR: Record<string, string> = { Outstanding: "#15803d", "Very Good": "#16a34a", Good: "#65a30d", Acceptable: "#ca8a04", Weak: "#ea580c", "Very weak": "#dc2626" };

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
    rows: r.map(({ x, e }) => [lab(x), fmt(e.a) + (e.over ? " *" : ""), fmt(e.b) + (e.over ? " *" : ""), rate(e.a, e.b, d.khda.att)]) };
  const prog: Tbl = { title: "Progress", head: [d.filters.year ? "Class" : "Year", "% at / above target (expected)", "% above target (better than expected)", "KHDA rating", d.filters.pc === "1" ? "Students with a target" : `Up / same / down vs PC${Number(d.filters.pc) - 1}`],
    rows: [...d.rows.map((x) => [lab(x), fmt(x.pExp), fmt(x.pAbove), x.progRating, d.filters.pc === "1" ? `${x.withTarget}/${x.graded}` : `${x.up} / ${x.same} / ${x.down}`]),
      ...(d.total && d.rows.length > 1 ? [["All", fmt(d.total.pExp), fmt(d.total.pAbove), d.total.progRating, ""]] : [])] };
  const counts: Tbl = { title: "Tracker summary (bottom of the Assessment Tracker)", head: [d.filters.year ? "Class" : "Year", th[0], "%", th[1], "%", "Students (graded)"], rows: d.rows.map((x) => [lab(x), String(x.n[th[0]] ?? 0), fmt(x.pct[th[0]]), String(x.n[th[1]] ?? 0), fmt(x.pct[th[1]]), `${x.graded}/${x.students}`]) };
  const thr: Tbl = { title: "KHDA rating thresholds used", head: [th[0], th[1], "Rating"], rows: thrText(d.khda.att, th).reverse().map((t) => [t.a, t.b, t.r]) };
  const ovr = r.filter(({ e }) => e.over).map(({ x }) => { const o = rep.ovr[x.key]; return `* ${lab(x)}: calculated ${fmt(x.pct[th[0]])} / ${fmt(x.pct[th[1]])}, overridden to ${fmt(o.a ?? x.pct[th[0]])} / ${fmt(o.b ?? x.pct[th[1]])} by ${o.by}${o.note ? ` — ${o.note}` : ""}`; });
  const notes = d.rows.filter((x) => rep.rowNotes[x.key]).map((x) => `${lab(x)}: ${rep.rowNotes[x.key]}`);
  const narr: [string, string][] = [["Strengths", rep.strengths], ["Areas for development", rep.afd], ["Actions / next steps", rep.actions], ["Comments", [rep.comment, ...notes].filter(Boolean).join("\n")]];
  return { att, prog, counts, thr, ovr, narr, head: [["Staff member", rep.staff], ["Subject", subj(d)], ["Date", rep.date]] as [string, string][], title: title(d), meta: `${d.term}${d.filters.phase ? ` · ${d.filters.phase}` : ""}${d.filters.year ? ` · ${d.filters.year}` : ""}${d.filters.section ? ` ${d.filters.section}` : ""}` };
}

/* Downloads = the school sample exactly: title, Staff/Subject/Date table, blue "Year Group Data", the Attainment table
   (Year | % 4+ | % 5+ | KHDA rating) in black, then the guidance thresholds table. No charts or extra colours.
   Teacher narrative is added as plain text only when it has been written. */
const narrOf = (S: ReturnType<typeof sections>) => S.narr.filter(([, v]) => v && v.trim());

export async function qaDocx(d: QaBody, rep: QaReportData) {
  const D = await import("docx"); const S = sections(d, rep);
  const F = "Century Gothic"; const run = (t: string, o: Record<string, unknown> = {}) => new D.TextRun({ text: t, font: F, size: 20, ...o });
  const P = (t: string, o: Record<string, unknown> = {}, po: Record<string, unknown> = {}) => new D.Paragraph({ children: String(t).split("\n").flatMap((l, i) => [...(i ? [new D.TextRun({ break: 1 })] : []), run(l, o)]), ...po });
  const B = { style: D.BorderStyle.SINGLE, size: 4, color: "auto" };
  const borders = { top: B, bottom: B, left: B, right: B, insideHorizontal: B, insideVertical: B };
  const cell = (t: string, o: Record<string, unknown> = {}, span = 1) => new D.TableCell({ children: [P(t, { color: "000000", ...o }, span > 1 ? { alignment: D.AlignmentType.CENTER } : {})], columnSpan: span });
  const table = (t: Tbl) => new D.Table({ width: { size: 3144, type: D.WidthType.PERCENTAGE }, borders, rows: [
    ...(t.title ? [new D.TableRow({ height: { value: 493, rule: D.HeightRule.ATLEAST }, children: [cell(t.title, { bold: true }, t.head.length)] })] : []),
    new D.TableRow({ height: { value: 493, rule: D.HeightRule.ATLEAST }, children: t.head.map((h) => cell(h, { bold: true })) }),
    ...t.rows.map((r) => new D.TableRow({ children: r.map((v) => cell(v)) }))] });
  const B12 = { style: D.BorderStyle.SINGLE, size: 12, color: "auto" }, B6 = { style: D.BorderStyle.SINGLE, size: 6, color: "auto" };
  const head = new D.Table({ borders: { top: B12, bottom: B12, left: B12, right: B12, insideHorizontal: B6, insideVertical: B6 }, columnWidths: [1955, 7040], rows: S.head.map(([k, v]) => new D.TableRow({ children: [new D.TableCell({ width: { size: 1955, type: D.WidthType.DXA }, children: [P(k, { bold: true })] }), new D.TableCell({ width: { size: 7040, type: D.WidthType.DXA }, children: [P(v || "")] })] })) });
  const blue = (t: string) => P(t, { bold: true, color: "0070C0" });
  const thr = new D.Table({ width: { size: 5000, type: D.WidthType.PERCENTAGE }, borders, rows: [S.thr.head, ...S.thr.rows].map((r) => new D.TableRow({ children: r.map((v) => cell(v)) })) });
  const doc = new D.Document({ creator: "Shaiq Muhammad System", title: S.title, sections: [{ properties: { page: { size: { width: 11906, height: 16838 } } }, children: [
    new D.Paragraph({ children: [new D.TextRun({ text: S.title + " ", bold: true })] }), head, P(""),
    blue("Year Group Data "), table(S.att), ...(S.ovr.length ? [P(S.ovr.join("\n"), { size: 16 })] : []), P(""),
    thr, ...narrOf(S).flatMap(([k, v]) => [P(""), P(k, { bold: true }), P(v)]),
  ] }] });
  downloadBlob(await D.Packer.toBlob(doc), `${fileBase(d)}.docx`);
}

export async function qaXlsx(d: QaBody, rep: QaReportData) {
  const EX = (await import("exceljs")).default; const S = sections(d, rep);
  const wb = new EX.Workbook(); wb.creator = "Shaiq Muhammad System"; const ws = wb.addWorksheet(`PC${d.filters.pc} QA`, { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const font = { name: "Century Gothic", size: 10 }; const thin = { style: "thin" as const }; const box = { top: thin, left: thin, bottom: thin, right: thin };
  ws.columns = [{ width: 18 }, { width: 26 }, { width: 26 }, { width: 18 }];
  const add = (vals: (string | number)[], o: { bold?: boolean; color?: string; border?: boolean; size?: number } = {}) => { const r = ws.addRow(vals); r.eachCell((c) => { c.font = { ...font, bold: o.bold, size: o.size || 10, color: o.color ? { argb: "FF" + o.color } : undefined }; c.alignment = { wrapText: true, vertical: "top" }; if (o.border) c.border = box; }); return r; };
  add([S.title], { bold: true, size: 11 });
  for (const [k, v] of S.head) { const r = add([k, v], { border: true }); r.getCell(1).font = { ...font, bold: true }; ws.mergeCells(r.number, 2, r.number, 4); }
  add([]); add(["Year Group Data"], { bold: true, color: "0070C0" });
  { const r = add([S.att.title || ""], { bold: true, border: true }); ws.mergeCells(r.number, 1, r.number, 4); r.getCell(1).alignment = { horizontal: "center" }; }
  add(S.att.head, { bold: true, border: true });
  for (const row of S.att.rows) add(row.map((v, i) => (i > 0 && /^\d+(\.\d+)?$/.test(v) ? Number(v) : i === 0 && /^\d+$/.test(v) ? Number(v) : v)), { border: true });
  for (const o of S.ovr) add([o], { size: 8 });
  add([]); add(S.thr.head, { border: true }); for (const r of S.thr.rows) add(r, { border: true });
  for (const [k, v] of narrOf(S)) { add([]); add([k], { bold: true }); const r = add([v]); ws.mergeCells(r.number, 1, r.number, 4); r.height = Math.max(18, 14 * (v.split("\n").length + Math.floor(v.length / 80))); }
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(d)}.xlsx`);
}

export async function qaPdf(d: QaBody, rep: QaReportData) {
  const { jsPDF } = await import("jspdf"); const S = sections(d, rep);
  const pdf = new jsPDF({ unit: "pt", format: "a4" }); const W = 595, M = 72; let y = 72;
  pdf.setTextColor("#000000"); pdf.setDrawColor("#000000");
  const need = (h: number) => { if (y + h > 790) { pdf.addPage(); y = 60; } };
  const text = (t: string, o: { b?: boolean; s?: number; c?: string } = {}) => { pdf.setFont("helvetica", o.b ? "bold" : "normal"); pdf.setFontSize(o.s || 10); pdf.setTextColor(o.c || "#000000"); const lines = pdf.splitTextToSize(t, W - 2 * M) as string[]; need(lines.length * (o.s || 10) * 1.3); pdf.text(lines, M, y); y += lines.length * (o.s || 10) * 1.3; };
  const table = (t: Tbl, tw: number) => {
    const n = t.head.length, cw = tw / n; const rowH = (cells: string[]) => Math.max(18, ...cells.map((c) => (pdf.splitTextToSize(c, cw - 8) as string[]).length * 12 + 6));
    const draw = (cells: string[], bold: boolean, span = false) => { pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(10); pdf.setTextColor("#000000"); const h = span ? 24 : rowH(cells); need(h);
      if (span) { pdf.rect(M, y, tw, h); pdf.text(cells[0], M + tw / 2, y + 15, { align: "center" }); }
      else cells.forEach((c, i) => { pdf.rect(M + i * cw, y, cw, h); pdf.text(pdf.splitTextToSize(c, cw - 8), M + i * cw + 4, y + 12); });
      y += h; };
    pdf.setLineWidth(0.5); if (t.title) draw([t.title], true, true); draw(t.head, true); for (const r of t.rows) draw(r, false); y += 14;
  };
  text(S.title + " ", { b: true, s: 11 }); y += 4;
  pdf.setLineWidth(1.2); const kw = 95, tw = W - 2 * M;
  for (const [k, v] of S.head) { need(22); pdf.rect(M, y, kw, 22); pdf.rect(M + kw, y, tw - kw, 22); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text(k, M + 4, y + 15); pdf.setFont("helvetica", "normal"); pdf.text(v || "", M + kw + 4, y + 15); y += 22; }
  y += 24; text("Year Group Data", { b: true, c: "#0070C0" }); y += 2;
  table(S.att, tw * 0.63); for (const o of S.ovr) text(o, { s: 8 });
  y += 6; table({ ...S.thr, title: undefined }, tw);
  for (const [k, v] of narrOf(S)) { y += 4; text(k, { b: true }); text(v); }
  downloadBlob(pdf.output("blob"), `${fileBase(d)}.pdf`);
}
