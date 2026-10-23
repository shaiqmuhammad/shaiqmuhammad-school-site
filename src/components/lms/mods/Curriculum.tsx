"use client";

import { useI18n } from "@/lib/i18n";
import { DlGate } from "@/components/lms/DlGate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { btn, btnCta, cardCls, field, Head, Modal, ModPage, Tabs, Toast } from "@/components/lms/mods/ModUi";
import { loadContentData } from "@/lib/content";
import { downloadBlob } from "@/lib/exportUtils";
import { modCall, modErr, modPerm, pdfTable, xlsxTable, type Cat, type CurLink, type CurUnit } from "@/lib/lmsMods";
import { loadQuizzesData } from "@/lib/quiz";
import { StdEditor, StdView } from "@/components/tracker/StdFields";
import { domainName, parseStdCell } from "@/lib/standards";

const TERMS = ["Term 1", "Term 2", "Term 3"];
const ST: Record<string, [string, string]> = { planned: ["Planned", "مخطط"], in_progress: ["In progress", "قيد التنفيذ"], taught: ["Taught", "تم تدريسه"] };
const STCLS: Record<string, string> = { planned: "bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-white", in_progress: "bg-amber-100 text-amber-900", taught: "bg-emerald-600 text-white" };
const WEEKS = 14;

export function CurriculumPage() {
  const { actor, ready } = useLmsActor();
  const { tr } = useTr();
  if (ready && actor?.role === "student") {
    return (
      <AssessmentShell title={tr("Curriculum", "المنهج")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
        <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6"><Curriculum asAdmin={false} student /></div>
      </AssessmentShell>
    );
  }
  return <ModPage title="Curriculum" perm="cur">{(asAdmin) => <Curriculum asAdmin={asAdmin} />}</ModPage>;
}

/** Linked homework / assessment buttons, per role. Students only ever receive what is assigned to them. */
function LinkRow({ u, student, tr, qTitle }: { u: CurUnit; student: boolean; tr: (en: string, ar: string) => string; qTitle: (s: string) => string }) {
  const { lang } = useI18n();
  const ls = u.links || [];
  // Site assessments open on their own page; teacher-made ones (tq_…) open inside the LMS.
  const qHref = (id: string) => (id.startsWith("tq_") ? `/lms/quiz?id=${encodeURIComponent(id)}` : `/assessments/${encodeURIComponent(id)}`);
  if (!ls.length) return null;
  return (
    <div className="mt-2 space-y-1" data-testid="cur-links">
      {ls.map((l) => (
        <div key={`${l.t}:${l.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] px-2.5 py-1.5 text-xs dark:bg-white/5" data-testid="cur-link">
          <span aria-hidden>{l.t === "hw" ? "📝" : "🧪"}</span>
          <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">{(lang === "ar" && l.titleAr) || l.title || (l.t === "quiz" ? qTitle(l.id) : "") || l.id}</span>
          {!student && l.t === "quiz" && l.pub === false && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900" data-testid="cur-link-hidden">{tr("Hidden from students", "مخفي عن الطلاب")}</span>}
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase dark:bg-white/10">{l.t === "hw" ? tr("Homework", "واجب") : tr("Assessment", "تقييم")}</span>
          {l.t === "hw"
            ? <a className="rounded-full bg-[var(--cta)] px-3 py-1 font-extrabold text-[var(--cta-foreground)]" href={`/lms/homework?id=${encodeURIComponent(l.id)}`} data-testid="cur-link-open">{student ? tr("Open", "افتح") : tr("Open", "افتح")}</a>
            : student && l.mode === "group"
              ? <span className="rounded-full bg-sky-100 px-2.5 py-1 font-bold text-sky-900">{tr("Led by your teacher", "بقيادة معلمك")}</span>
              : <a className="rounded-full bg-[var(--cta)] px-3 py-1 font-extrabold text-[var(--cta-foreground)]" href={qHref(l.id)} data-testid="cur-link-open">{student ? tr("Start", "ابدأ") : tr("Open", "افتح")}</a>}
        </div>
      ))}
    </div>
  );
}

/** Curriculum Management: subjects › year groups › terms › units, pacing by week, status, links, Excel import/export. */
export function Curriculum({ asAdmin, student = false }: { asAdmin: boolean; student?: boolean }) {
  const { tr } = useTr();
  const { lang } = useI18n();
  const { actor } = useLmsActor();
  const perm = modPerm(actor?.perms, asAdmin, "cur");
  const [items, setItems] = useState<CurUnit[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [year, setYear] = useState("");
  const focus = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("unit") || "";
  const [cat, setCat] = useState<Cat | null>(null);
  const [links, setLinks] = useState<{ quizzes: { slug: string; title: string }[]; pages: { slug: string; title: string }[] }>({ quizzes: [], pages: [] });
  const [f, setF] = useState({ subject: "", yr: "", term: "", status: "", q: "" });
  const [view, setView] = useState<"units" | "pacing">("units");
  const [edit, setEdit] = useState<Partial<CurUnit> | null>(null);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const note = (m: string, b = false) => { setMsg(m); setBad(b); };
  const load = useCallback(() => { modCall<{ items: CurUnit[]; canEdit: boolean; canDelete?: boolean; year?: string }>("cur-list", {}, asAdmin).then((r) => { setItems(r.items); setCanEdit(r.canEdit); setCanDelete(!!r.canDelete); setYear(r.year || ""); }).catch((e) => { setItems([]); note(modErr(e, tr), true); }); }, [asAdmin, tr]);
  useEffect(() => { load(); if (!student) modCall<Cat>("catalog", undefined, asAdmin).then(setCat).catch(() => undefined);
    Promise.all([loadQuizzesData().catch(() => null), loadContentData().catch(() => null)]).then(([q, c]) => setLinks({ quizzes: (q?.quizzes || []).map((x) => ({ slug: x.slug, title: x.title })), pages: (c?.pages || []).map((x) => ({ slug: x.slug, title: x.title })) })); }, [load, asAdmin, student]);
  useEffect(() => { if (focus && items) setTimeout(() => document.getElementById(`u-${focus}`)?.scrollIntoView({ block: "center" }), 150); }, [focus, items]);
  const subjects = useMemo(() => [...new Set([...(cat?.subjects.map((s) => s.name) || []), ...(items || []).map((i) => i.subject)])], [cat, items]);
  const years = useMemo(() => [...new Set([...(cat?.classes.map((s) => s.name) || []), ...(items || []).map((i) => i.yr)])], [cat, items]);
  const shown = useMemo(() => (items || []).filter((i) => (!f.subject || i.subject === f.subject) && (!f.yr || i.yr === f.yr) && (!f.term || i.term === f.term) && (!f.status || i.status === f.status) && (!f.q || `${i.title} ${i.objectives}`.toLowerCase().includes(f.q.toLowerCase()))), [items, f]);
  const tree = useMemo(() => { const m = new Map<string, Map<string, Map<string, CurUnit[]>>>(); for (const i of shown) { const a = m.get(i.subject) || new Map(); const b = a.get(i.yr) || new Map(); const c = b.get(i.term) || []; c.push(i); b.set(i.term, c); a.set(i.yr, b); m.set(i.subject, a); } return m; }, [shown]);
  const setStatus = async (id: string, status: string) => { try { await modCall("cur-status", { id, status }, asAdmin); load(); } catch (e) { note(modErr(e, tr), true); } };
  const del = async (id: string) => { if (!confirm(tr("Delete this unit?", "حذف هذه الوحدة؟"))) return; try { await modCall("cur-delete", { id }, asAdmin); load(); } catch (e) { note(modErr(e, tr), true); } };
  const qTitle = (s: string) => links.quizzes.find((x) => x.slug === s)?.title || "";
  const pTitle = (s: string) => links.pages.find((x) => x.slug === s)?.title || s;

  const HEAD = ["Subject", "Year", "Term", "Unit / topic", "Week from", "Week to", "Status", "Learning objectives", "Success criteria", "Standards", "Main skill", "Lessons", "Resources", "Assessment", "Lesson page", "Notes", "Links"];
  const WIDTHS = [16, 12, 10, 34, 10, 10, 12, 50, 50, 40, 44, 24, 24, 50, 40];
  const rowOf = (u: CurUnit) => [u.subject, u.yr, u.term, u.title, u.wkFrom || "", u.wkTo || "", u.status, u.objectives, (u.sc || []).join("\n"), (u.std?.codes || []).join("\n"), u.std?.skill ? `${u.std.skill}. ${domainName(u.std.skill, "en")} / ${domainName(u.std.skill, "ar")}` : "", u.lessons.map((l) => l.title + (l.note ? ` :: ${l.note}` : "")).join("\n"), u.resources.map((r) => `${r.label} | ${r.url}`).join("\n"), u.quiz, u.page, u.notes || "", (u.links || []).map((l) => `${l.t}:${l.id}${l.title ? ` | ${l.title}` : ""}`).join("\n")];
  const exportX = () => xlsxTable("Scheme of work", HEAD, shown.map(rowOf), "scheme-of-work.xlsx", WIDTHS);
  const exportP = () => pdfTable({ title: tr("Scheme of work", "المخطط الدراسي"), subtitle: [f.subject, f.yr, f.term].filter(Boolean).join(" · ") || tr("All subjects", "كل المواد"), headers: [tr("Subject", "المادة"), tr("Year", "السنة"), tr("Term", "الفصل"), tr("Unit / topic", "الوحدة"), tr("Weeks", "الأسابيع"), tr("Status", "الحالة"), tr("Objectives", "الأهداف"), tr("Lessons", "الدروس")], rows: shown.map((u) => [u.subject, u.yr, u.term, u.title, u.wkFrom ? `${u.wkFrom}-${u.wkTo}` : "", tr(...ST[u.status] as [string, string]), u.objectives.replace(/\n/g, "; "), u.lessons.map((l) => l.title).join("; ")]), filename: "scheme-of-work.pdf" });
  const template = async () => {
    const ExcelJS = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Scheme of work");
    ws.columns = HEAD.map((h, i) => ({ header: h, key: `c${i}`, width: WIDTHS[i] })); ws.getRow(1).font = { bold: true };
    ws.addRow([subjects[0] || "Islamic Studies", years[0] || "Year 2", "Term 1", "Example unit", 1, 3, "planned", "Know the five pillars\nRetell the story", "I can name the five pillars.\nI can explain one pillar.", "Lesson 1 :: Introduction\nLesson 2", "Video | https://www.shaiqmuhammad.com/videos", "", "", "Key vocabulary: …", ""]);
    downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "scheme-of-work-template.xlsx");
  };
  const importX = async (fl: File) => {
    try {
      const ExcelJS = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await fl.arrayBuffer());
      const ws = wb.worksheets[0]; const head = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? "").trim().toLowerCase());
      const col = (n: string) => head.findIndex((h) => h === n.toLowerCase()) + 1;
      const txt = (r: ReturnType<typeof ws.getRow>, n: string) => { const c = col(n); const v = c ? r.getCell(c).value : ""; return v && typeof v === "object" && "text" in (v as object) ? String((v as { text: string }).text) : String(v ?? "").trim(); };
      const rows: Record<string, unknown>[] = [];
      ws.eachRow((r, i) => { if (i === 1) return; const title = txt(r, "Unit / topic"); if (!title) return;
        rows.push({ subject: txt(r, "Subject"), yr: txt(r, "Year"), term: txt(r, "Term"), title, wkFrom: Number(txt(r, "Week from")) || 0, wkTo: Number(txt(r, "Week to")) || 0, status: txt(r, "Status").toLowerCase().replace(/\s+/g, "_") || "planned", objectives: txt(r, "Learning objectives"), sc: col("Success criteria") ? txt(r, "Success criteria").split("\n").map((x) => x.trim()).filter(Boolean) : undefined, std: col("Standards") || col("Main skill") ? parseStdCell(txt(r, "Standards"), txt(r, "Main skill")) : undefined,
          lessons: txt(r, "Lessons").split("\n").filter(Boolean).map((l) => { const [t, n] = l.split("::"); return { title: t.trim(), note: (n || "").trim() }; }), resources: txt(r, "Resources").split("\n").filter(Boolean).map((l) => { const [a, b] = l.includes("|") ? l.split("|") : ["Link", l]; return { label: a.trim(), url: b.trim() }; }), quiz: txt(r, "Assessment"), page: txt(r, "Lesson page"), notes: col("Notes") ? txt(r, "Notes") : undefined, links: col("Links") ? txt(r, "Links").split("\n").map((l) => l.split("|")[0].trim()).filter((l) => /^(hw|quiz):/.test(l)).map((l) => ({ t: l.slice(0, l.indexOf(":")), id: l.slice(l.indexOf(":") + 1).trim() })) : undefined }); });
      const r = await modCall<{ added: number; updated: number; errors: { row: number; error: string }[] }>("cur-import", { rows }, asAdmin);
      note(tr(`Imported: ${r.added} new, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} skipped (${r.errors.slice(0, 3).map((e) => `row ${e.row}: ${e.error}`).join("; ")})` : ""}.`, `تم الاستيراد: ${r.added} جديد، ${r.updated} محدّث${r.errors.length ? `، ${r.errors.length} متخطى` : ""}.`), r.errors.length > 0 && r.added + r.updated === 0); load();
    } catch (e) { note(modErr(e, tr), true); }
  };

  return (
    <div data-testid="curriculum" className="space-y-1">
      <Head hide={asAdmin || student} icon="📚" title={tr("Curriculum Management", "إدارة المنهج")} sub={tr("Scheme of work by subject, year group and term: objectives, lessons, resources, pacing and status.", "المخطط الدراسي حسب المادة والسنة والفصل: الأهداف والدروس والمصادر والتوزيع الزمني والحالة.")}>
        {!student && canEdit && perm.edit && <button type="button" className={btnCta} onClick={() => setEdit({ subject: f.subject || subjects[0] || "", yr: f.yr || years[0] || "", term: f.term || "Term 1", status: "planned", lessons: [], resources: [] })} data-testid="cur-new">+ {tr("Add unit", "إضافة وحدة")}</button>}
      </Head>
      {student && <p className="mb-3 text-2xl font-extrabold">📚 {tr("My curriculum", "منهجي")} <span className="text-base font-bold opacity-60">· {year}</span></p>}
      {!student && !canEdit && items && <p className="mb-3 rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-900" data-testid="cur-viewonly">{tr("View only — you can read the scheme of work but not change it.", "للعرض فقط — يمكنك قراءة المخطط دون تعديله.")}</p>}
      <Toast msg={msg} bad={bad} />
      <div className={cardCls + (student ? " mb-4 grid gap-2 sm:grid-cols-3" : " mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6")}>
        <select className={field} hidden={false} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} aria-label={tr("Subject", "المادة")} data-testid="cur-f-subject"><option value="">{tr("All subjects", "كل المواد")}</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={field} hidden={student} style={student ? { display: "none" } : undefined} value={f.yr} onChange={(e) => setF({ ...f, yr: e.target.value })} aria-label={tr("Year", "السنة")} data-testid="cur-f-year"><option value="">{tr("All years", "كل السنوات")}</option>{years.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={field} value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} aria-label={tr("Term", "الفصل")}><option value="">{tr("All terms", "كل الفصول")}</option>{TERMS.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={tr("Status", "الحالة")}><option value="">{tr("Any status", "أي حالة")}</option>{Object.keys(ST).map((k) => <option key={k} value={k}>{tr(...ST[k])}</option>)}</select>
        <input className={field + (student ? "" : " sm:col-span-2")} placeholder={tr("Search units & objectives…", "ابحث في الوحدات والأهداف…")} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} dir="auto" data-testid="cur-search" />
      </div>
      {items && <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label={tr("Terms", "الفصول")} data-testid="cur-terms">{(["", ...TERMS] as string[]).map((t) => { const inT = (items || []).filter((i) => (!f.subject || i.subject === f.subject) && (!f.yr || i.yr === f.yr) && (!t || i.term === t)); const on = f.term === t; return <button key={t || "all"} type="button" role="tab" aria-selected={on} aria-pressed={on} data-testid="cur-term-tab" onClick={() => setF({ ...f, term: t })} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${on ? "border-transparent bg-header text-sun" : "border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/10"}`}>{t ? tr(t, t.replace("Term", "الفصل")) : tr("All terms", "كل الفصول")} <span className="text-xs opacity-70">({inT.length} · {inT.reduce((n, i) => n + (i.sc?.length || 0), 0)} SC)</span></button>; })}</div>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs testId="cur-view" value={view} onChange={setView} items={[["units", tr("Units", "الوحدات")], ["pacing", tr("Pacing by week", "التوزيع الأسبوعي")]]} />
        <span className="flex-1" />
        {!student && <><DlGate kind="export"><button type="button" className={btn} onClick={exportX} disabled={!shown.length} data-testid="cur-xlsx">⬇ Excel</button>
        <button type="button" className={btn} onClick={exportP} disabled={!shown.length} data-testid="cur-pdf">⬇ PDF</button></DlGate>
        <button type="button" className={btn} onClick={template} data-testid="cur-template">⬇ {tr("Import template", "قالب الاستيراد")}</button></>}
        {canEdit && <><button type="button" className={btn} onClick={() => file.current?.click()} data-testid="cur-import">⬆ {tr("Import Excel", "استيراد Excel")}</button><input ref={file} type="file" accept=".xlsx" hidden data-testid="cur-import-file" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void importX(fl); e.target.value = ""; }} /></>}
      </div>
      {items === null ? <p className="py-10 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p> : !shown.length ? <p className={cardCls + " text-center opacity-70"} data-testid="cur-empty">{tr("No units yet.", "لا وحدات بعد.")}</p> : [...tree.entries()].map(([subject, ys]) => (
        <section key={subject} className="mb-6" data-testid="cur-subject">
          <h3 className="mb-2 text-xl font-extrabold">{subject}</h3>
          {[...ys.entries()].map(([yr, ts]) => (
            <div key={yr} className="mb-4 ms-2 border-s-4 border-[var(--cta)] ps-3 sm:ms-4">
              <h4 className="mb-2 text-base font-bold opacity-80">{yr}</h4>
              {TERMS.filter((t) => ts.has(t)).concat([...ts.keys()].filter((t) => !TERMS.includes(t))).map((t) => (
                <div key={t} className="mb-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-60" data-testid="cur-term-head">{t} <span className="normal-case opacity-80">· {ts.get(t)!.length} {tr("units", "وحدات")} · {ts.get(t)!.reduce((n, u) => n + (u.sc?.length || 0), 0)} {tr("success criteria", "معايير نجاح")}</span></p>
                  {view === "pacing" ? (
                    <div className={cardCls + " overflow-x-auto !p-3"} data-testid="cur-pacing">
                      <div className="min-w-[640px]"><div className="grid gap-px text-center text-[10px] opacity-60" style={{ gridTemplateColumns: `10rem repeat(${WEEKS}, 1fr)` }}><span />{Array.from({ length: WEEKS }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
                        {ts.get(t)!.map((u) => <div key={u.id} className="mt-1 grid items-center gap-px" style={{ gridTemplateColumns: `10rem repeat(${WEEKS}, 1fr)` }}><span className="truncate pe-2 text-xs font-semibold" dir="auto">{(lang === "ar" && u.titleAr) || u.title}</span>{Array.from({ length: WEEKS }, (_, i) => { const w = i + 1; const on = u.wkFrom && w >= u.wkFrom && w <= u.wkTo; return <span key={i} className={`h-5 ${on ? (u.status === "taught" ? "bg-emerald-600" : u.status === "in_progress" ? "bg-amber-500" : "bg-slate-400 dark:bg-slate-500") : "bg-black/5 dark:bg-white/5"} ${on && w === u.wkFrom ? "rounded-s" : ""} ${on && w === u.wkTo ? "rounded-e" : ""}`} />; })}</div>)}</div>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {ts.get(t)!.map((u) => (
                        <article key={u.id} id={`u-${u.id}`} className={cardCls + (focus === u.id ? " ring-2 ring-[var(--cta)]" : "")} data-testid="cur-unit">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="min-w-0 flex-1 text-base font-extrabold" dir="auto">{(lang === "ar" && u.titleAr) || u.title}</h5>
                            {u.wkFrom > 0 && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold dark:bg-white/10">{tr("Wk", "أسبوع")} {u.wkFrom}{u.wkTo > u.wkFrom ? `–${u.wkTo}` : ""}</span>}
                            {canEdit && !student ? <select className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold ${STCLS[u.status]}`} value={u.status} onChange={(e) => setStatus(u.id, e.target.value)} aria-label={tr("Status", "الحالة")} data-testid="cur-status">{Object.keys(ST).map((k) => <option key={k} value={k}>{tr(...ST[k])}</option>)}</select> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STCLS[u.status]}`}>{tr(...ST[u.status])}</span>}
                          </div>
                          {u.objectives && <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm" dir="auto">{u.objectives.split("\n").filter(Boolean).map((o, i) => <li key={i}>{o}</li>)}</ul>}
                          {!!u.sc?.length && <details className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-900/20" data-testid="cur-sc" open={student || undefined}><summary className="cursor-pointer text-xs font-extrabold text-emerald-900 dark:text-emerald-200">✅ {tr(`Success criteria (${u.sc.length})`, `معايير النجاح (${u.sc.length})`)}</summary><ol className="mt-1 list-decimal space-y-0.5 ps-5" dir="auto">{u.sc.map((x, i) => <li key={i} data-testid="cur-sc-item">{(lang === "ar" && u.scAr?.[i]?.trim()) || x}</li>)}</ol></details>}
                          <StdView std={u.std} />
                          {!!u.lessons.length && <p className="mt-2 text-xs opacity-80"><b>{tr("Lessons", "الدروس")} ({u.lessons.length}):</b> {u.lessons.map((l) => l.title).join(" · ")}</p>}
                          {u.notes && <details className="mt-2 text-xs"><summary className="cursor-pointer font-bold opacity-70">{tr("Vocabulary & assessment ideas", "المفردات وأفكار التقييم")}</summary><p className="mt-1 whitespace-pre-line opacity-80" dir="auto">{u.notes}</p></details>}
                          <LinkRow u={u} student={student} tr={tr} qTitle={qTitle} />
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                            {u.page && <a className="rounded-full bg-violet-100 px-2.5 py-1 font-bold text-violet-900 hover:underline" href={`/lessons/${u.page}`}>📄 {pTitle(u.page)}</a>}
                            {u.resources.map((r, i) => <a key={i} className="rounded-full bg-black/5 px-2.5 py-1 font-bold hover:underline dark:bg-white/10" href={r.url} target="_blank" rel="noreferrer">🔗 {r.label || r.url}</a>)}
                          </div>
                          {(canEdit || canDelete) && <div className="mt-3 flex gap-2">{canEdit && <button type="button" className={btn + " !py-1"} onClick={() => setEdit(u)} data-testid="cur-edit">✎ {tr("Edit", "تعديل")}</button>}{canDelete && <button type="button" className={btn + " !py-1"} onClick={() => del(u.id)} data-testid="cur-del">🗑</button>}</div>}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
      {edit && <UnitEditor init={edit} subjects={subjects} years={years} links={links} asAdmin={asAdmin} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); note(tr("Saved.", "تم الحفظ.")); load(); }} />}
    </div>
  );
}

function UnitEditor({ init, subjects, years, links, asAdmin, onClose, onSaved }: { init: Partial<CurUnit>; subjects: string[]; years: string[]; links: { quizzes: { slug: string; title: string }[]; pages: { slug: string; title: string }[] }; asAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const { tr } = useTr();
  const [u, setU] = useState<Partial<CurUnit>>({ lessons: [], resources: [], ...init });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<{ hw: { id: string; title: string; cls: string; section: string }[]; quizzes: { id: string; title: string }[] }>({ hw: [], quizzes: [] });
  useEffect(() => { modCall<{ homework: typeof opts.hw; quizzes: typeof opts.quizzes }>("cur-link-options", {}, asAdmin).then((r) => setOpts({ hw: r.homework || [], quizzes: r.quizzes || [] })).catch(() => undefined); }, [asAdmin]);
  const lk: CurLink[] = u.links || [];
  const quizOpts = useMemo(() => { const m = new Map<string, string>(); for (const q of links.quizzes) m.set(q.slug, q.title); for (const q of opts.quizzes) if (q.title || !m.has(q.id)) m.set(q.id, q.title || m.get(q.id) || q.id); return [...m].map(([id, title]) => ({ id, title })); }, [links.quizzes, opts.quizzes]);
  const titleOf = (l: CurLink) => (l.t === "hw" ? opts.hw.find((x) => x.id === l.id)?.title : quizOpts.find((x) => x.id === l.id)?.title) || l.id;
  const save = async () => { setBusy(true); setErr(""); try { await modCall("cur-save", { ...u, sc: (u.sc || []).map((x) => x.trim()).filter(Boolean), scAr: (u.scAr || []).map((x) => x.trim()), links: lk.map((l) => ({ t: l.t, id: l.id })) }, asAdmin); onSaved(); } catch (e) { setErr(modErr(e, tr)); } setBusy(false); };
  const lab = "block text-sm font-bold";
  const lessons = u.lessons || [], res = u.resources || [];
  return (
    <Modal title={u.id ? tr("Edit unit", "تعديل الوحدة") : tr("New unit", "وحدة جديدة")} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={lab}>{tr("Subject", "المادة")}<select className={field + " mt-1"} value={u.subject || ""} onChange={(e) => setU({ ...u, subject: e.target.value })} data-testid="cur-e-subject">{subjects.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={lab}>{tr("Year group", "السنة")}<select className={field + " mt-1"} value={u.yr || ""} onChange={(e) => setU({ ...u, yr: e.target.value })} data-testid="cur-e-year">{years.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={lab}>{tr("Term", "الفصل")}<select className={field + " mt-1"} value={u.term || "Term 1"} onChange={(e) => setU({ ...u, term: e.target.value })}>{TERMS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={lab + " sm:col-span-3"}>{tr("Unit / topic title", "عنوان الوحدة / الموضوع")}<input className={field + " mt-1"} value={u.title || ""} maxLength={160} onChange={(e) => setU({ ...u, title: e.target.value })} dir="auto" data-testid="cur-e-title" /></label>
        <label className={lab + " sm:col-span-3"}>{tr("Arabic title", "العنوان بالعربية")}<input className={field + " mt-1"} value={u.titleAr || ""} maxLength={200} onChange={(e) => setU({ ...u, titleAr: e.target.value })} dir="rtl" data-testid="cur-e-title-ar" /></label>
        <label className={lab}>{tr("Week from", "من أسبوع")}<input type="number" min={0} max={60} className={field + " mt-1"} value={u.wkFrom || ""} onChange={(e) => setU({ ...u, wkFrom: Number(e.target.value), wkTo: Math.max(Number(e.target.value), u.wkTo || 0) })} data-testid="cur-e-wkfrom" /></label>
        <label className={lab}>{tr("Week to", "إلى أسبوع")}<input type="number" min={0} max={60} className={field + " mt-1"} value={u.wkTo || ""} onChange={(e) => setU({ ...u, wkTo: Number(e.target.value) })} data-testid="cur-e-wkto" /></label>
        <label className={lab}>{tr("Status", "الحالة")}<select className={field + " mt-1"} value={u.status || "planned"} onChange={(e) => setU({ ...u, status: e.target.value as CurUnit["status"] })}>{Object.keys(ST).map((k) => <option key={k} value={k}>{tr(...ST[k])}</option>)}</select></label>
        <label className={lab + " sm:col-span-3"}>{tr("Learning objectives (one per line)", "أهداف التعلم (هدف في كل سطر)")}<textarea className={field + " mt-1 min-h-24"} value={u.objectives || ""} onChange={(e) => setU({ ...u, objectives: e.target.value })} dir="auto" data-testid="cur-e-obj" /></label>
        <label className={lab + " sm:col-span-3"}>{tr("Success criteria (one per line — used by the assessment tracker)", "معايير النجاح (معيار في كل سطر — تُستخدم في متتبع التقييم)")}<textarea className={field + " mt-1 min-h-24"} value={(u.sc || []).join("\n")} onChange={(e) => setU({ ...u, sc: e.target.value.split("\n") })} dir="auto" placeholder={tr("e.g. Recite Surah Al-Fatiha correctly.", "مثال: يتلو سورة الفاتحة تلاوة صحيحة.")} data-testid="cur-e-sc" /></label>
        <label className={lab + " sm:col-span-3"}>{tr("Success criteria in Arabic (same order, one per line — English is shown when a line is empty)", "معايير النجاح بالعربية (بنفس الترتيب، معيار في كل سطر — تظهر الإنجليزية إذا كان السطر فارغًا)")}<textarea className={field + " mt-1 min-h-24"} value={(u.scAr || []).join("\n")} onChange={(e) => setU({ ...u, scAr: e.target.value.split("\n") })} dir="rtl" data-testid="cur-e-sc-ar" /></label>
        <StdEditor yr={u.yr || ""} value={u.std} onChange={(std) => setU({ ...u, std })} />
        <div className="sm:col-span-3"><p className={lab}>{tr("Lessons", "الدروس")}</p>
          {lessons.map((l, i) => <div key={i} className="mt-1 flex gap-2"><input className={field} value={l.title} placeholder={tr("Lesson title", "عنوان الدرس")} onChange={(e) => setU({ ...u, lessons: lessons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} dir="auto" data-testid="cur-e-lesson" /><button type="button" className={btn} onClick={() => setU({ ...u, lessons: lessons.filter((_, j) => j !== i) })} aria-label="Remove">✕</button></div>)}
          <button type="button" className={btn + " mt-2"} onClick={() => setU({ ...u, lessons: [...lessons, { title: "", note: "" }] })} data-testid="cur-e-addlesson">+ {tr("Add lesson", "إضافة درس")}</button></div>
        <div className="sm:col-span-3"><p className={lab}>{tr("Resources & links", "المصادر والروابط")}</p>
          {res.map((r, i) => <div key={i} className="mt-1 flex gap-2"><input className={field + " basis-1/3"} value={r.label} placeholder={tr("Label", "الاسم")} onChange={(e) => setU({ ...u, resources: res.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} dir="auto" /><input className={field} value={r.url} placeholder="https://…" onChange={(e) => setU({ ...u, resources: res.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} dir="ltr" data-testid="cur-e-url" /><button type="button" className={btn} onClick={() => setU({ ...u, resources: res.filter((_, j) => j !== i) })} aria-label="Remove">✕</button></div>)}
          <button type="button" className={btn + " mt-2"} onClick={() => setU({ ...u, resources: [...res, { label: "", url: "" }] })} data-testid="cur-e-addres">+ {tr("Add link", "إضافة رابط")}</button></div>
        <div className="sm:col-span-3" data-testid="cur-e-links"><p className={lab}>{tr("Linked homework & assessments", "الواجبات والتقييمات المرتبطة")}</p>
          {lk.map((l) => <div key={`${l.t}:${l.id}`} className="mt-1 flex items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-1.5 text-sm dark:bg-white/10" data-testid="cur-e-link"><span aria-hidden>{l.t === "hw" ? "📝" : "🧪"}</span><span className="min-w-0 flex-1 truncate" dir="auto">{l.title || titleOf(l)}</span><button type="button" className={btn + " !py-0.5"} onClick={() => setU({ ...u, links: lk.filter((x) => !(x.t === l.t && x.id === l.id)) })} aria-label="Remove">✕</button></div>)}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select className={field} value="" onChange={(e) => { const o = opts.hw.find((x) => x.id === e.target.value); if (o) setU({ ...u, links: [...lk.filter((x) => !(x.t === "hw" && x.id === o.id)), { t: "hw", id: o.id, title: o.title }] }); }} data-testid="cur-e-addhw"><option value="">+ {tr("Add homework…", "إضافة واجب…")}</option>{opts.hw.filter((o) => !lk.some((x) => x.t === "hw" && x.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.title}{o.cls ? ` · ${o.cls}${o.section ? " " + o.section : ""}` : ""}</option>)}</select>
            {!lk.some((x) => x.t === "quiz") && <select className={field} value="" onChange={(e) => { const o = quizOpts.find((x) => x.id === e.target.value); if (o) setU({ ...u, links: [...lk.filter((x) => !(x.t === "quiz" && x.id === o.id)), { t: "quiz", id: o.id, title: o.title }] }); }} data-testid="cur-e-addquiz"><option value="">+ {tr("Add assessment…", "إضافة تقييم…")}</option>{quizOpts.filter((o) => !lk.some((x) => x.t === "quiz" && x.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>}
          </div></div>
        <label className={lab + " sm:col-span-3"}>{tr("Notes (vocabulary, assessment ideas)", "ملاحظات (مفردات، أفكار للتقييم)")}<textarea className={field + " mt-1 min-h-16"} value={u.notes || ""} onChange={(e) => setU({ ...u, notes: e.target.value })} dir="auto" data-testid="cur-e-notes" /></label>
        <label className={lab + " sm:col-span-3"}>{tr("Linked lesson page", "صفحة الدرس المرتبطة")}<select className={field + " mt-1"} value={u.page || ""} onChange={(e) => setU({ ...u, page: e.target.value })} data-testid="cur-e-page"><option value="">—</option>{links.pages.map((q) => <option key={q.slug} value={q.slug}>{q.title}</option>)}</select></label>
      </div>
      {err && <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-900">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} onClick={onClose}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btnCta} onClick={save} disabled={busy || !u.title?.trim()} data-testid="cur-e-save">{tr("Save unit", "حفظ الوحدة")}</button></div>
    </Modal>
  );
}
