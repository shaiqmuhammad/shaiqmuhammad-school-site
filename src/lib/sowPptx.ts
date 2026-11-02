"use client";
/**
 * t406: Scheme-of-work bulk-upload format (PPTX). One table per slide:
 *   header row (faculty · term/half · year group · domains), weeks row, then
 *   Topic title · Intent/objective · Key knowledge & skills · Assessment opportunities · Key vocabulary.
 * Arabic layout (Islamic A) runs right-to-left (labels in the right column); English layout (Islamic B) left-to-right.
 */
export type SowLang = "ar" | "en";
export type SowUnit = { term: string; wk: number; title: string; intent: string; know: string; assess: string; vocab: string; sc?: string[]; skill?: string; codes?: string[] };
/** SC + main skill ride in the assessment cell after a marker line, so the PPTX stays re-uploadable. */
const SC_MARK = /\n?(?:Main skill|المهارة الرئيسة)\s*:/;
export function assessWithSc(u: SowUnit, ar: boolean) {
  if (!u.sc?.length && !u.skill) return u.assess;
  const head = `${ar ? "المهارة الرئيسة" : "Main skill"}: ${u.skill || "—"}${u.codes?.length ? ` (${u.codes.join(", ")})` : ""}`;
  return [u.assess, head, ar ? "معايير النجاح:" : "Success criteria:", ...(u.sc || []).map((x) => `• ${x}`)].filter(Boolean).join("\n");
}
export function splitAssess(cell: string): { assess: string; sc: string[] } {
  const m = SC_MARK.exec(cell); if (!m) return { assess: cell, sc: [] };
  const rest = cell.slice(m.index).split("\n");
  return { assess: cell.slice(0, m.index).trim(), sc: rest.filter((l) => /^\s*[•\-]\s*/.test(l)).map((l) => l.replace(/^\s*[•\-]\s*/, "").trim()).filter(Boolean) };
}
export type SowFile = { lang: SowLang; yearLabel: string; yr: string; units: SowUnit[] };

const AR_TERM: Record<string, string> = { "الأول": "Term 1", "الثاني": "Term 2", "الثالث": "Term 3" };
const AR_YEARS: [string, string][] = [["الروضة الأولى", "FS1"], ["الروضة الثانية", "FS2"], ["الصف الأول", "Year 1"], ["الصف الثاني", "Year 2"], ["الصف الثالث", "Year 3"], ["الصف الرابع", "Year 4"], ["الصف الخامس", "Year 5"], ["الصف السادس", "Year 6"], ["الصف السابع", "Year 7"], ["الصف الثامن", "Year 8"], ["الصف التاسع", "Year 9"], ["الصف العاشر", "Year 10"], ["الصف الحادي عشر", "Year 11"], ["الصف الثاني عشر", "Year 12"]];
const strip = (s: string) => s.replace(/[\u064B-\u0652\u0670]/g, "").trim();
/** Year group in the school's naming from the label in the file ("الصف الأول", "Year 4", "FS2"). */
export function yrFromLabel(label: string): string {
  const l = strip(label);
  const ar = [...AR_YEARS].sort((a, b) => b[0].length - a[0].length).find(([k]) => l.includes(k));
  if (ar) return ar[1];
  const m = /(FS\s*\d|Year\s*\d+|KG\s*\d)/i.exec(label);
  if (!m) return "";
  const v = m[1].replace(/\s+/g, " ");
  if (/^KG/i.test(v)) return v.endsWith("1") ? "FS2" : "Year 1";
  return v.replace(/^fs/i, "FS").replace(/^year/i, "Year").replace("FS ", "FS");
}
export function yearLabelAr(yr: string) { return AR_YEARS.find(([, v]) => v === yr)?.[0] || yr; }

type Cell = Element;
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const cellText = (c: Cell) => [...c.getElementsByTagNameNS(NS_A, "p")].map((p) => [...p.getElementsByTagNameNS(NS_A, "t")].map((t) => t.textContent || "").join("")).join("\n").trim();
const tableRows = (doc: Document) => { const tbl = doc.getElementsByTagNameNS(NS_A, "tbl")[0]; return tbl ? [...tbl.getElementsByTagNameNS(NS_A, "tr")].map((r) => [...r.children].filter((x) => x.localName === "tc") as Cell[]) : []; };

async function slides(buf: ArrayBuffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(/(\d+)\.xml/.exec(a)![1]) - Number(/(\d+)\.xml/.exec(b)![1]));
  return { zip, names };
}

/** Reads a filled SOW PPTX (either layout). */
export async function parseSowPptx(buf: ArrayBuffer): Promise<SowFile> {
  const { zip, names } = await slides(buf);
  const units: SowUnit[] = [];
  let lang: SowLang = "en", yearLabel = "";
  for (const n of names) {
    const doc = new DOMParser().parseFromString(await zip.file(n)!.async("string"), "application/xml");
    let R = tableRows(doc).map((r) => r.map(cellText));
    if (R.length < 7) continue;
    const ar = R[1].some((x) => x.includes("الأسبوع"));
    if (ar) lang = "ar";
    const head = R[0].join(" ");
    const term = ar ? AR_TERM[/الفصل\s+(?:الدراسي\s+)?(\S+)/.exec(strip(head))?.[1] || ""] || "" : /Term\s*(\d)/i.exec(head)?.[0].replace(/\s+/, " ") || "";
    const yc = R[0].find((x) => /Year Group|الصف الدراسي/.test(x)) || "";
    const yl = yc.split("\n").slice(1).join(" ").trim();
    if (yl && !yearLabel) yearLabel = yl;
    if (ar) R = R.map((r) => [...r].reverse());
    for (let c = 1; c < R[1].length; c++) {
      const wk = Number(/\d+/.exec(R[1][c] || "")?.[0] || 0), title = (R[2][c] || "").replace(/\s*\n\s*/g, " ").trim();
      if (!wk || !title || /^[-\s]+$/.test(title) || !term) continue;
      const sa = splitAssess(R[5][c] || ""); units.push({ term, wk, title, intent: R[3][c] || "", know: R[4][c] || "", assess: sa.assess, vocab: R[6][c] || "", sc: sa.sc });
    }
  }
  return { lang, yearLabel, yr: yrFromLabel(yearLabel), units };
}

function setCell(doc: Document, c: Cell, text: string) {
  const ps = [...c.getElementsByTagNameNS(NS_A, "p")];
  const first = ps[0];
  if (!first) return;
  const runTpl = first.getElementsByTagNameNS(NS_A, "r")[0];
  ps.slice(1).forEach((p) => p.parentNode?.removeChild(p));
  const lines = text ? text.split("\n") : [""];
  const mk = (line: string) => {
    const p = first.cloneNode(false) as Element;
    const ppr = first.getElementsByTagNameNS(NS_A, "pPr")[0];
    if (ppr) p.appendChild(ppr.cloneNode(true));
    if (line) {
      const r = runTpl ? (runTpl.cloneNode(true) as Element) : doc.createElementNS(NS_A, "a:r");
      let t = r.getElementsByTagNameNS(NS_A, "t")[0];
      if (!t) { t = doc.createElementNS(NS_A, "a:t"); r.appendChild(t); }
      t.textContent = line;
      p.appendChild(r);
    }
    const end = first.getElementsByTagNameNS(NS_A, "endParaRPr")[0];
    if (end) p.appendChild(end.cloneNode(true));
    return p;
  };
  const parent = first.parentNode!;
  lines.forEach((l) => parent.insertBefore(mk(l), first));
  parent.removeChild(first);
}

/** Fills the blank template (same layout as the upload format, no logo) — re-uploadable. */
export async function buildSowPptx(lang: SowLang, yr: string, units: SowUnit[]): Promise<Blob> {
  const tpl = await (await sowTemplateBlob(lang)).arrayBuffer();
  const { zip, names } = await slides(tpl);
  const ser = new XMLSerializer();
  const terms = ["Term 1", "Term 2", "Term 3"];
  for (const n of names) {
    const xml = await zip.file(n)!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const rows = tableRows(doc);
    if (rows.length < 7) continue;
    const head = rows[0].map(cellText).join(" ");
    const term = lang === "ar" ? AR_TERM[/الفصل\s+(?:الدراسي\s+)?(\S+)/.exec(strip(head))?.[1] || ""] : /Term\s*(\d)/i.exec(head)?.[0].replace(/\s+/, " ");
    if (!term || !terms.includes(term)) continue;
    const yc = rows[0].find((c) => /Year Group|الصف الدراسي/.test(cellText(c)));
    if (yc) setCell(doc, yc, `${lang === "ar" ? "الصف الدراسي" : "Year Group"}\n${lang === "ar" ? yearLabelAr(yr) : yr}`);
    rows[1].forEach((wc, ci) => {
      const wk = Number(/\d+/.exec(cellText(wc))?.[0] || 0);
      if (!wk) return;
      const u = units.find((x) => x.term === term && x.wk === wk);
      if (!u) return;
      [u.title, u.intent, u.know, assessWithSc(u, lang === "ar"), u.vocab].forEach((v, k) => { const c = rows[2 + k]?.[ci]; if (c) setCell(doc, c, v); });
    });
    zip.file(n, ser.serializeToString(doc));
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

/** The blank template as a Blob (lazy-loaded so the curriculum page stays light). */
export async function sowTemplateBlob(lang: SowLang): Promise<Blob> {
  const m = await import("@/lib/sowTemplates");
  const bin = atob(lang === "ar" ? m.SOW_TPL_AR : m.SOW_TPL_EN);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}
