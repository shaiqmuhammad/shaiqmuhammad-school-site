"use client";
/** t406: Scheme-of-work tools — bulk upload (PPTX, Arabic or English layout), blank templates, filled PPTX + Excel downloads, weekly SOW grid. */
import { useRef, useState } from "react";
import { btn, btnCta, cardCls, field, Modal } from "@/components/lms/mods/ModUi";
import { ARABIC_SUBJECTS, useTr } from "@/components/lms/useLms";
import { downloadBlob } from "@/lib/exportUtils";
import { dlGrant } from "@/lib/dl";
import { modCall, modErr, type CurUnit } from "@/lib/lmsMods";
import { domainName } from "@/lib/standards";
import { buildSowPptx, parseSowPptx, sowTemplateBlob, yearLabelAr, type SowFile, type SowLang, type SowUnit } from "@/lib/sowPptx";

const TERMS = ["Term 1", "Term 2", "Term 3"];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const splitList = (s: string, ar: boolean) => s.trim().replace(/\.$/, "").split(ar ? /[،,]\s*/ : /,\s*/).map((x) => x.trim()).map((x) => (ar ? x.replace(/^و[\u064B-\u0652]*(?=\S)/, "") : x.replace(/^and\s+/i, ""))).filter(Boolean).map((x) => (ar ? x : x[0].toUpperCase() + x.slice(1)));
const noteLine = (notes: string, key: RegExp) => lines(notes).find((l) => key.test(l))?.replace(key, "").trim() || "";

/** One curriculum unit in the SOW shape, in the chosen language (the stored SOW cells win; older units fall back to objectives / notes). */
export function unitToSow(u: CurUnit, lang: SowLang): SowUnit {
  const s = (u.sow || {}) as Record<string, string>;
  const ar = lang === "ar";
  const obj = lines((ar && u.objectivesAr) || u.objectives || "");
  return {
    term: u.term, wk: u.wkFrom || 0,
    title: (ar && u.titleAr) || u.title,
    intent: obj[0] || "",
    know: (ar ? s.knowAr : s.know) || obj.slice(1).join(ar ? "، " : ", "),
    assess: (ar ? s.assessAr : s.assess) || (ar ? "" : noteLine(u.notes || "", /^Assessment opportunities:\s*/i)),
    vocab: (ar ? s.vocabAr : s.vocab) || (ar ? "" : noteLine(u.notes || "", /^Key vocabulary:\s*/i)),
    sc: (ar && u.scAr?.length ? u.scAr : u.sc) || [],
    skill: u.std?.skill ? `${u.std.skill}. ${domainName(u.std.skill, ar ? "ar" : "en")}` : "",
    codes: u.std?.codes || [],
  };
}

/** Rows for cur-import from a parsed SOW file. Arabic fills the Arabic side of the shared (Islamic B) unit; English the English side. */
export function sowRows(file: SowFile, yr: string, subject: string) {
  const ar = file.lang === "ar";
  return file.units.map((u) => {
    const objectives = [u.intent.trim(), ...splitList(u.know, ar)].filter(Boolean).join("\n");
    const scx = u.sc?.length ? (ar ? { scAr: u.sc } : { sc: u.sc }) : {};
    return ar
      ? { ...scx, source: "sow", subject, yr, term: u.term, wkFrom: u.wk, wkTo: u.wk, title: u.title, keepTitle: true, titleAr: u.title, objectivesAr: objectives, sow: { knowAr: u.know, assessAr: u.assess, vocabAr: u.vocab } }
      : { ...scx, source: "sow", subject, yr, term: u.term, wkFrom: u.wk, wkTo: u.wk, title: u.title, objectives, notes: `Key vocabulary: ${u.vocab}\nAssessment opportunities: ${u.assess}`, sow: { know: u.know, assess: u.assess, vocab: u.vocab } };
  });
}

async function sowXlsx(lang: SowLang, subject: string, yr: string, term: string, rows: SowUnit[]) {
  if (!(await dlGrant("export"))) return;
  const ExcelJS = (await import("exceljs")).default;
  const ar = lang === "ar";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ar ? "المخطط الدراسي" : "Scheme of work", { views: [{ state: "frozen", ySplit: 3, rightToLeft: ar }] });
  const H = ar ? ["الفصل", "الأسبوع", "عنوان الموضوع", "الهدف التعليمي", "المعارف والمهارات الأساسية", "فرص التقييم", "المفردات الأساسية", "المهارة الرئيسة", "المعايير", "معايير النجاح"] : ["Term", "Week", "Topic title", "Curriculum intent", "Key knowledge and skills", "Key assessment opportunities", "Key vocabulary", "Main skill", "Standards", "Success criteria"];
  ws.columns = [10, 9, 30, 46, 46, 40, 34, 26, 22, 50].map((width) => ({ width }));
  ws.mergeCells(1, 1, 1, H.length);
  const t = ws.getCell(1, 1);
  t.value = `${ar ? "المخطط الدراسي" : "Scheme of work"} · ${subject} · ${ar ? yearLabelAr(yr) : yr}${term ? ` · ${ar ? term.replace("Term", "الفصل") : term}` : ""}`;
  t.font = { bold: true, size: 15, color: { argb: "FFF5C542" } }; t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A57" } }; t.alignment = { vertical: "middle", horizontal: ar ? "right" : "left" };
  ws.getRow(1).height = 28;
  const hr = ws.getRow(3); hr.values = H; hr.height = 22;
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24507A" } }; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
  const band: Record<string, string> = { "Term 1": "FFEAF4FF", "Term 2": "FFFFF7E0", "Term 3": "FFEAF8EF" };
  rows.forEach((u) => {
    const r = ws.addRow([ar ? u.term.replace("Term", "الفصل") : u.term, u.wk, u.title, u.intent, u.know, u.assess, u.vocab, u.skill || "", (u.codes || []).join("\n"), (u.sc || []).map((x) => `• ${x}`).join("\n")]);
    r.eachCell({ includeEmpty: true }, (c, k) => { c.alignment = { vertical: "top", wrapText: true, horizontal: k <= 2 ? "center" : ar ? "right" : "left" }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: band[u.term] || "FFFFFFFF" } }; c.border = { top: { style: "thin", color: { argb: "FFD0D7E2" } }, bottom: { style: "thin", color: { argb: "FFD0D7E2" } }, left: { style: "thin", color: { argb: "FFD0D7E2" } }, right: { style: "thin", color: { argb: "FFD0D7E2" } } }; });
    r.getCell(3).font = { bold: true, color: { argb: "FF1B3A57" } };
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: H.length } };
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `sow-${subject}-${yr}${term ? `-${term}` : ""}.xlsx`.replace(/\s+/g, "-"));
}

/** Toolbar card on the curriculum page. */
export function SowTools({ items, subjects, years, f, asAdmin, canImport, canDownload, reload, note }: { items: CurUnit[]; subjects: string[]; years: string[]; f: { subject: string; yr: string; term: string }; asAdmin: boolean; canImport: boolean; canDownload: boolean; reload: () => void; note: (m: string, bad?: boolean) => void }) {
  const { tr } = useTr();
  const [dl, setDl] = useState({ subject: f.subject || "Islamic B", yr: f.yr || "", term: f.term });
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<(SowFile & { subject: string; yrSel: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const lang: SowLang = ARABIC_SUBJECTS.includes(dl.subject) ? "ar" : "en";
  const pick = () => items.filter((u) => u.subject === (dl.subject === "Islamic A" ? "Islamic B" : dl.subject) && u.yr === dl.yr && (!dl.term || u.term === dl.term)).sort((a, b) => TERMS.indexOf(a.term) - TERMS.indexOf(b.term) || a.wkFrom - b.wkFrom).map((u) => unitToSow(u, lang));
  const needYr = !dl.yr;
  const pptx = async () => { if (!(await dlGrant("export"))) return; downloadBlob(await buildSowPptx(lang, dl.yr, pick()), `sow-${dl.subject}-${dl.yr}${dl.term ? `-${dl.term}` : ""}.pptx`.replace(/\s+/g, "-")); };
  const template = async (l: SowLang) => { const b = await sowTemplateBlob(l); downloadBlob(b, l === "ar" ? "sow-template-arabic.pptx" : "sow-template-english.pptx"); };
  const read = async (fl: File) => {
    try { const p = await parseSowPptx(await fl.arrayBuffer()); if (!p.units.length) { note(tr("No topics found in this file.", "لم يتم العثور على موضوعات في هذا الملف."), true); return; } setPending({ ...p, subject: p.lang === "ar" ? "Islamic A" : "Islamic B", yrSel: p.yr || f.yr }); }
    catch { note(tr("Couldn't read this PPTX. Use the bulk-upload template.", "تعذرت قراءة الملف. استخدم قالب الرفع."), true); }
  };
  const doImport = async () => {
    if (!pending?.yrSel) return;
    setBusy(true);
    try {
      const r = await modCall<{ added: number; updated: number; errors: { row: number; error: string }[] }>("cur-import", { source: "sow", rows: sowRows(pending, pending.yrSel, "Islamic B") }, asAdmin);
      note(tr(`SOW imported: ${r.added} new, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} skipped` : ""}.`, `تم استيراد المخطط: ${r.added} جديد، ${r.updated} محدّث${r.errors.length ? `، ${r.errors.length} متخطى` : ""}.`), r.added + r.updated === 0);
      setPending(null); reload();
    } catch (e) { note(modErr(e, tr), true); }
    setBusy(false);
  };
  if (!canDownload && !canImport) return null;
  return (
    <section className={cardCls + " mb-4 space-y-3"} data-testid="sow-tools">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-base font-extrabold">🗂️ {tr("Scheme of work (SOW) — bulk upload & download", "المخطط الدراسي — الرفع والتنزيل")}</p>
        <button type="button" className={btn} onClick={() => template("ar")} data-testid="sow-tpl-ar">⬇ {tr("Blank template (Arabic · Islamic A)", "قالب فارغ (عربي · التربية الإسلامية A)")}</button>
        <button type="button" className={btn} onClick={() => template("en")} data-testid="sow-tpl-en">⬇ {tr("Blank template (English · Islamic B)", "قالب فارغ (إنجليزي · التربية الإسلامية B)")}</button>
        {canImport && <><button type="button" className={btnCta} onClick={() => fileRef.current?.click()} data-testid="sow-upload">⬆ {tr("Upload SOW (PPTX)", "رفع المخطط (PPTX)")}</button><input ref={fileRef} type="file" accept=".pptx" hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) read(x); }} /></>}
      </div>
      {canDownload && (
        <div className="grid gap-2 sm:grid-cols-5" data-testid="sow-download">
          <select className={field} value={dl.subject} onChange={(e) => setDl({ ...dl, subject: e.target.value })} aria-label={tr("Subject", "المادة")} data-testid="sow-dl-subject">{["Islamic A", "Islamic B", ...subjects.filter((s) => !["Islamic A", "Islamic B"].includes(s))].map((s) => <option key={s}>{s}</option>)}</select>
          <select className={field} value={dl.yr} onChange={(e) => setDl({ ...dl, yr: e.target.value })} aria-label={tr("Year group", "السنة")} data-testid="sow-dl-year"><option value="">{tr("Year group…", "السنة…")}</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <select className={field} value={dl.term} onChange={(e) => setDl({ ...dl, term: e.target.value })} aria-label={tr("Term", "الفصل")} data-testid="sow-dl-term"><option value="">{tr("All terms", "كل الفصول")}</option>{TERMS.map((t) => <option key={t}>{t}</option>)}</select>
          <button type="button" className={btn} disabled={needYr} onClick={pptx} data-testid="sow-dl-pptx">⬇ PPTX {lang === "ar" ? "(عربي)" : "(English)"}</button>
          <button type="button" className={btn} disabled={needYr} onClick={() => sowXlsx(lang, dl.subject, dl.yr, dl.term, pick())} data-testid="sow-dl-xlsx">⬇ Excel</button>
        </div>
      )}
      {pending && (
        <Modal title={tr("Import scheme of work", "استيراد المخطط الدراسي")} onClose={() => setPending(null)}>
          <div className="space-y-3 text-sm" data-testid="sow-preview">
            <p><b>{pending.lang === "ar" ? tr("Arabic layout (Islamic A)", "التنسيق العربي (التربية الإسلامية A)") : tr("English layout (Islamic B)", "التنسيق الإنجليزي (التربية الإسلامية B)")}</b> · {pending.units.length} {tr("topics", "موضوعات")} · {tr("Year in file", "السنة في الملف")}: <span dir="auto">{pending.yearLabel || "—"}</span></p>
            <label className="block font-bold">{tr("Year group", "السنة")}<select className={field + " mt-1"} value={pending.yrSel} onChange={(e) => setPending({ ...pending, yrSel: e.target.value })} data-testid="sow-imp-year"><option value="">…</option>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-xl bg-black/[0.03] p-2 dark:bg-white/5" dir="auto">{pending.units.map((u, i) => <li key={i}><b>{u.term} · {tr("Wk", "أسبوع")} {u.wk}</b> — {u.title}</li>)}</ul>
            <p className="text-xs opacity-70">{pending.lang === "ar" ? tr("Arabic fills the Arabic side of the shared Islamic B units (matched by term + week); English titles are kept.", "يملأ العربي الجانب العربي لوحدات التربية الإسلامية B المشتركة (حسب الفصل والأسبوع) مع الإبقاء على العناوين الإنجليزية.") : tr("Units are matched by term + week; status, lessons, links and success criteria are kept.", "تتم المطابقة حسب الفصل والأسبوع مع الإبقاء على الحالة والدروس والروابط ومعايير النجاح.")}</p>
            <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={() => setPending(null)}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btnCta} disabled={busy || !pending.yrSel} onClick={doImport} data-testid="sow-imp-go">{busy ? "…" : tr("Import", "استيراد")}</button></div>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** Weekly SOW grid (the PPT layout on screen): one card per week, grouped by term. */
export function SowGrid({ units, lang }: { units: CurUnit[]; lang: SowLang }) {
  const { tr } = useTr();
  const ar = lang === "ar";
  const L = ar ? ["الهدف التعليمي", "المعارف والمهارات", "فرص التقييم", "المفردات", "المهارة الرئيسة", "معايير النجاح"] : ["Intent", "Knowledge & skills", "Assessment", "Vocabulary", "Main skill", "Success criteria"];
  const COL = ["#0284c7", "#d97706", "#059669"];
  return (
    <div className="space-y-5" data-testid="sow-grid" dir={ar ? "rtl" : "ltr"}>
      {TERMS.map((t, ti) => {
        const us = units.filter((u) => u.term === t).sort((a, b) => a.wkFrom - b.wkFrom);
        if (!us.length) return null;
        return (
          <section key={t}>
            <h4 className="mb-2 inline-flex items-center gap-2 rounded-full px-4 py-1 text-sm font-extrabold text-white" style={{ background: COL[ti] }}>{ar ? t.replace("Term", "الفصل") : t} · {us.length} {tr("topics", "موضوعات")}</h4>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {us.map((u) => { const s = unitToSow(u, lang); return (
                <article key={u.id} className={cardCls + " !p-0 overflow-hidden"} data-testid="sow-card">
                  <div className="flex items-center gap-2 px-4 py-2 text-white" style={{ background: `linear-gradient(135deg, #1b3a57, ${COL[ti]})` }}>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold">{ar ? "الأسبوع" : "Week"} {u.wkFrom}</span>
                    <p className="min-w-0 flex-1 truncate font-extrabold text-white" dir="auto">{s.title}</p>
                  </div>
                  <dl className="space-y-1.5 px-4 py-3 text-sm">
                    {[s.intent, s.know, s.assess, s.vocab, s.skill, (s.sc || []).map((x) => `• ${x}`).join("\n")].map((v, k) => v ? <div key={k}><dt className="text-[11px] font-extrabold uppercase tracking-wide opacity-60">{L[k]}</dt><dd dir="auto" className="whitespace-pre-line">{v}</dd></div> : null)}
                  </dl>
                </article>
              ); })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
