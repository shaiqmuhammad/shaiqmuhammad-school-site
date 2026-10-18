"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { btn, btnCta, cardCls, field, Head, Modal, ModPage, Tabs, Toast } from "@/components/lms/mods/ModUi";
import { loadContentData } from "@/lib/content";
import { downloadBlob } from "@/lib/exportUtils";
import { modCall, modErr, modPerm, pdfTable, xlsxTable, type Cat, type CurUnit } from "@/lib/lmsMods";
import { loadQuizzesData } from "@/lib/quiz";

const TERMS = ["Term 1", "Term 2", "Term 3"];
const ST: Record<string, [string, string]> = { planned: ["Planned", "مخطط"], in_progress: ["In progress", "قيد التنفيذ"], taught: ["Taught", "تم تدريسه"] };
const STCLS: Record<string, string> = { planned: "bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-white", in_progress: "bg-amber-100 text-amber-900", taught: "bg-emerald-600 text-white" };
const WEEKS = 14;

export function CurriculumPage() { return <ModPage title="Curriculum" perm="cur">{(asAdmin) => <Curriculum asAdmin={asAdmin} />}</ModPage>; }

/** Curriculum Management: subjects › year groups › terms › units, pacing by week, status, links, Excel import/export. */
export function Curriculum({ asAdmin }: { asAdmin: boolean }) {
  const { tr } = useTr();
  const { actor } = useLmsActor();
  const perm = modPerm(actor?.perms, asAdmin, "cur");
  const [items, setItems] = useState<CurUnit[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [cat, setCat] = useState<Cat | null>(null);
  const [links, setLinks] = useState<{ quizzes: { slug: string; title: string }[]; pages: { slug: string; title: string }[] }>({ quizzes: [], pages: [] });
  const [f, setF] = useState({ subject: "", yr: "", term: "", status: "", q: "" });
  const [view, setView] = useState<"units" | "pacing">("units");
  const [edit, setEdit] = useState<Partial<CurUnit> | null>(null);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const note = (m: string, b = false) => { setMsg(m); setBad(b); };
  const load = useCallback(() => { modCall<{ items: CurUnit[]; canEdit: boolean }>("cur-list", {}, asAdmin).then((r) => { setItems(r.items); setCanEdit(r.canEdit); }).catch((e) => { setItems([]); note(modErr(e, tr), true); }); }, [asAdmin, tr]);
  useEffect(() => { load(); modCall<Cat>("catalog", undefined, asAdmin).then(setCat).catch(() => undefined);
    Promise.all([loadQuizzesData().catch(() => null), loadContentData().catch(() => null)]).then(([q, c]) => setLinks({ quizzes: (q?.quizzes || []).map((x) => ({ slug: x.slug, title: x.title })), pages: (c?.pages || []).map((x) => ({ slug: x.slug, title: x.title })) })); }, [load, asAdmin]);
  const subjects = useMemo(() => [...new Set([...(cat?.subjects.map((s) => s.name) || []), ...(items || []).map((i) => i.subject)])], [cat, items]);
  const years = useMemo(() => [...new Set([...(cat?.classes.map((s) => s.name) || []), ...(items || []).map((i) => i.yr)])], [cat, items]);
  const shown = useMemo(() => (items || []).filter((i) => (!f.subject || i.subject === f.subject) && (!f.yr || i.yr === f.yr) && (!f.term || i.term === f.term) && (!f.status || i.status === f.status) && (!f.q || `${i.title} ${i.objectives}`.toLowerCase().includes(f.q.toLowerCase()))), [items, f]);
  const tree = useMemo(() => { const m = new Map<string, Map<string, Map<string, CurUnit[]>>>(); for (const i of shown) { const a = m.get(i.subject) || new Map(); const b = a.get(i.yr) || new Map(); const c = b.get(i.term) || []; c.push(i); b.set(i.term, c); a.set(i.yr, b); m.set(i.subject, a); } return m; }, [shown]);
  const setStatus = async (id: string, status: string) => { try { await modCall("cur-status", { id, status }, asAdmin); load(); } catch (e) { note(modErr(e, tr), true); } };
  const del = async (id: string) => { if (!confirm(tr("Delete this unit?", "حذف هذه الوحدة؟"))) return; try { await modCall("cur-delete", { id }, asAdmin); load(); } catch (e) { note(modErr(e, tr), true); } };
  const qTitle = (s: string) => links.quizzes.find((x) => x.slug === s)?.title || s;
  const pTitle = (s: string) => links.pages.find((x) => x.slug === s)?.title || s;

  const HEAD = ["Subject", "Year", "Term", "Unit / topic", "Week from", "Week to", "Status", "Learning objectives", "Lessons", "Resources", "Assessment", "Lesson page"];
  const rowOf = (u: CurUnit) => [u.subject, u.yr, u.term, u.title, u.wkFrom || "", u.wkTo || "", u.status, u.objectives, u.lessons.map((l) => l.title + (l.note ? ` :: ${l.note}` : "")).join("\n"), u.resources.map((r) => `${r.label} | ${r.url}`).join("\n"), u.quiz, u.page];
  const exportX = () => xlsxTable("Scheme of work", HEAD, shown.map(rowOf), "scheme-of-work.xlsx", [16, 12, 10, 34, 10, 10, 12, 50, 40, 44, 24, 24]);
  const exportP = () => pdfTable({ title: tr("Scheme of work", "المخطط الدراسي"), subtitle: [f.subject, f.yr, f.term].filter(Boolean).join(" · ") || tr("All subjects", "كل المواد"), headers: [tr("Subject", "المادة"), tr("Year", "السنة"), tr("Term", "الفصل"), tr("Unit / topic", "الوحدة"), tr("Weeks", "الأسابيع"), tr("Status", "الحالة"), tr("Objectives", "الأهداف"), tr("Lessons", "الدروس")], rows: shown.map((u) => [u.subject, u.yr, u.term, u.title, u.wkFrom ? `${u.wkFrom}-${u.wkTo}` : "", tr(...ST[u.status] as [string, string]), u.objectives.replace(/\n/g, "; "), u.lessons.map((l) => l.title).join("; ")]), filename: "scheme-of-work.pdf" });
  const template = async () => {
    const ExcelJS = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Scheme of work");
    ws.columns = HEAD.map((h, i) => ({ header: h, key: `c${i}`, width: [16, 12, 10, 34, 10, 10, 12, 50, 40, 44, 24, 24][i] })); ws.getRow(1).font = { bold: true };
    ws.addRow([subjects[0] || "Islamic Studies", years[0] || "Year 2", "Term 1", "Example unit", 1, 3, "planned", "Know the five pillars\nRetell the story", "Lesson 1 :: Introduction\nLesson 2", "Video | https://www.shaiqmuhammad.com/videos", "", ""]);
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
        rows.push({ subject: txt(r, "Subject"), yr: txt(r, "Year"), term: txt(r, "Term"), title, wkFrom: Number(txt(r, "Week from")) || 0, wkTo: Number(txt(r, "Week to")) || 0, status: txt(r, "Status").toLowerCase().replace(/\s+/g, "_") || "planned", objectives: txt(r, "Learning objectives"),
          lessons: txt(r, "Lessons").split("\n").filter(Boolean).map((l) => { const [t, n] = l.split("::"); return { title: t.trim(), note: (n || "").trim() }; }), resources: txt(r, "Resources").split("\n").filter(Boolean).map((l) => { const [a, b] = l.includes("|") ? l.split("|") : ["Link", l]; return { label: a.trim(), url: b.trim() }; }), quiz: txt(r, "Assessment"), page: txt(r, "Lesson page") }); });
      const r = await modCall<{ added: number; updated: number; errors: { row: number; error: string }[] }>("cur-import", { rows }, asAdmin);
      note(tr(`Imported: ${r.added} new, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} skipped (${r.errors.slice(0, 3).map((e) => `row ${e.row}: ${e.error}`).join("; ")})` : ""}.`, `تم الاستيراد: ${r.added} جديد، ${r.updated} محدّث${r.errors.length ? `، ${r.errors.length} متخطى` : ""}.`), r.errors.length > 0 && r.added + r.updated === 0); load();
    } catch (e) { note(modErr(e, tr), true); }
  };

  return (
    <div data-testid="curriculum" className="space-y-1">
      <Head hide={asAdmin} icon="📚" title={tr("Curriculum Management", "إدارة المنهج")} sub={tr("Scheme of work by subject, year group and term: objectives, lessons, resources, pacing and status.", "المخطط الدراسي حسب المادة والسنة والفصل: الأهداف والدروس والمصادر والتوزيع الزمني والحالة.")}>
        {canEdit && perm.edit && <button type="button" className={btnCta} onClick={() => setEdit({ subject: f.subject || subjects[0] || "", yr: f.yr || years[0] || "", term: f.term || "Term 1", status: "planned", lessons: [], resources: [] })} data-testid="cur-new">+ {tr("Add unit", "إضافة وحدة")}</button>}
      </Head>
      {!canEdit && items && <p className="mb-3 rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-900" data-testid="cur-viewonly">{tr("View only — you can read the scheme of work but not change it.", "للعرض فقط — يمكنك قراءة المخطط دون تعديله.")}</p>}
      <Toast msg={msg} bad={bad} />
      <div className={cardCls + " mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6"}>
        <select className={field} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} aria-label={tr("Subject", "المادة")} data-testid="cur-f-subject"><option value="">{tr("All subjects", "كل المواد")}</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={field} value={f.yr} onChange={(e) => setF({ ...f, yr: e.target.value })} aria-label={tr("Year", "السنة")} data-testid="cur-f-year"><option value="">{tr("All years", "كل السنوات")}</option>{years.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={field} value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} aria-label={tr("Term", "الفصل")}><option value="">{tr("All terms", "كل الفصول")}</option>{TERMS.map((s) => <option key={s}>{s}</option>)}</select>
        <select className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={tr("Status", "الحالة")}><option value="">{tr("Any status", "أي حالة")}</option>{Object.keys(ST).map((k) => <option key={k} value={k}>{tr(...ST[k])}</option>)}</select>
        <input className={field + " sm:col-span-2"} placeholder={tr("Search units & objectives…", "ابحث في الوحدات والأهداف…")} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} dir="auto" data-testid="cur-search" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs testId="cur-view" value={view} onChange={setView} items={[["units", tr("Units", "الوحدات")], ["pacing", tr("Pacing by week", "التوزيع الأسبوعي")]]} />
        <span className="flex-1" />
        <button type="button" className={btn} onClick={exportX} disabled={!shown.length} data-testid="cur-xlsx">⬇ Excel</button>
        <button type="button" className={btn} onClick={exportP} disabled={!shown.length} data-testid="cur-pdf">⬇ PDF</button>
        <button type="button" className={btn} onClick={template} data-testid="cur-template">⬇ {tr("Import template", "قالب الاستيراد")}</button>
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
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-60">{t}</p>
                  {view === "pacing" ? (
                    <div className={cardCls + " overflow-x-auto !p-3"} data-testid="cur-pacing">
                      <div className="min-w-[640px]"><div className="grid gap-px text-center text-[10px] opacity-60" style={{ gridTemplateColumns: `10rem repeat(${WEEKS}, 1fr)` }}><span />{Array.from({ length: WEEKS }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
                        {ts.get(t)!.map((u) => <div key={u.id} className="mt-1 grid items-center gap-px" style={{ gridTemplateColumns: `10rem repeat(${WEEKS}, 1fr)` }}><span className="truncate pe-2 text-xs font-semibold" dir="auto">{u.title}</span>{Array.from({ length: WEEKS }, (_, i) => { const w = i + 1; const on = u.wkFrom && w >= u.wkFrom && w <= u.wkTo; return <span key={i} className={`h-5 ${on ? (u.status === "taught" ? "bg-emerald-600" : u.status === "in_progress" ? "bg-amber-500" : "bg-slate-400 dark:bg-slate-500") : "bg-black/5 dark:bg-white/5"} ${on && w === u.wkFrom ? "rounded-s" : ""} ${on && w === u.wkTo ? "rounded-e" : ""}`} />; })}</div>)}</div>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {ts.get(t)!.map((u) => (
                        <article key={u.id} className={cardCls} data-testid="cur-unit">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="min-w-0 flex-1 text-base font-extrabold" dir="auto">{u.title}</h5>
                            {u.wkFrom > 0 && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold dark:bg-white/10">{tr("Wk", "أسبوع")} {u.wkFrom}{u.wkTo > u.wkFrom ? `–${u.wkTo}` : ""}</span>}
                            {canEdit ? <select className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold ${STCLS[u.status]}`} value={u.status} onChange={(e) => setStatus(u.id, e.target.value)} aria-label={tr("Status", "الحالة")} data-testid="cur-status">{Object.keys(ST).map((k) => <option key={k} value={k}>{tr(...ST[k])}</option>)}</select> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STCLS[u.status]}`}>{tr(...ST[u.status])}</span>}
                          </div>
                          {u.objectives && <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm" dir="auto">{u.objectives.split("\n").filter(Boolean).map((o, i) => <li key={i}>{o}</li>)}</ul>}
                          {!!u.lessons.length && <p className="mt-2 text-xs opacity-80"><b>{tr("Lessons", "الدروس")} ({u.lessons.length}):</b> {u.lessons.map((l) => l.title).join(" · ")}</p>}
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                            {u.quiz && <a className="rounded-full bg-sky-100 px-2.5 py-1 font-bold text-sky-900 hover:underline" href={`/assessments/${u.quiz}`}>📝 {qTitle(u.quiz)}</a>}
                            {u.page && <a className="rounded-full bg-violet-100 px-2.5 py-1 font-bold text-violet-900 hover:underline" href={`/lessons/${u.page}`}>📄 {pTitle(u.page)}</a>}
                            {u.resources.map((r, i) => <a key={i} className="rounded-full bg-black/5 px-2.5 py-1 font-bold hover:underline dark:bg-white/10" href={r.url} target="_blank" rel="noreferrer">🔗 {r.label || r.url}</a>)}
                          </div>
                          {canEdit && <div className="mt-3 flex gap-2"><button type="button" className={btn + " !py-1"} onClick={() => setEdit(u)} data-testid="cur-edit">✎ {tr("Edit", "تعديل")}</button><button type="button" className={btn + " !py-1"} onClick={() => del(u.id)} data-testid="cur-del">🗑</button></div>}
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
  const save = async () => { setBusy(true); setErr(""); try { await modCall("cur-save", u, asAdmin); onSaved(); } catch (e) { setErr(modErr(e, tr)); } setBusy(false); };
  const lab = "block text-sm font-bold";
  const lessons = u.lessons || [], res = u.resources || [];
  return (
    <Modal title={u.id ? tr("Edit unit", "تعديل الوحدة") : tr("New unit", "وحدة جديدة")} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={lab}>{tr("Subject", "المادة")}<select className={field + " mt-1"} value={u.subject || ""} onChange={(e) => setU({ ...u, subject: e.target.value })} data-testid="cur-e-subject">{subjects.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={lab}>{tr("Year group", "السنة")}<select className={field + " mt-1"} value={u.yr || ""} onChange={(e) => setU({ ...u, yr: e.target.value })} data-testid="cur-e-year">{years.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={lab}>{tr("Term", "الفصل")}<select className={field + " mt-1"} value={u.term || "Term 1"} onChange={(e) => setU({ ...u, term: e.target.value })}>{TERMS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={lab + " sm:col-span-3"}>{tr("Unit / topic title", "عنوان الوحدة / الموضوع")}<input className={field + " mt-1"} value={u.title || ""} maxLength={160} onChange={(e) => setU({ ...u, title: e.target.value })} dir="auto" data-testid="cur-e-title" /></label>
        <label className={lab}>{tr("Week from", "من أسبوع")}<input type="number" min={0} max={60} className={field + " mt-1"} value={u.wkFrom || ""} onChange={(e) => setU({ ...u, wkFrom: Number(e.target.value), wkTo: Math.max(Number(e.target.value), u.wkTo || 0) })} data-testid="cur-e-wkfrom" /></label>
        <label className={lab}>{tr("Week to", "إلى أسبوع")}<input type="number" min={0} max={60} className={field + " mt-1"} value={u.wkTo || ""} onChange={(e) => setU({ ...u, wkTo: Number(e.target.value) })} data-testid="cur-e-wkto" /></label>
        <label className={lab}>{tr("Status", "الحالة")}<select className={field + " mt-1"} value={u.status || "planned"} onChange={(e) => setU({ ...u, status: e.target.value as CurUnit["status"] })}>{Object.keys(ST).map((k) => <option key={k} value={k}>{tr(...ST[k])}</option>)}</select></label>
        <label className={lab + " sm:col-span-3"}>{tr("Learning objectives (one per line)", "أهداف التعلم (هدف في كل سطر)")}<textarea className={field + " mt-1 min-h-24"} value={u.objectives || ""} onChange={(e) => setU({ ...u, objectives: e.target.value })} dir="auto" data-testid="cur-e-obj" /></label>
        <div className="sm:col-span-3"><p className={lab}>{tr("Lessons", "الدروس")}</p>
          {lessons.map((l, i) => <div key={i} className="mt-1 flex gap-2"><input className={field} value={l.title} placeholder={tr("Lesson title", "عنوان الدرس")} onChange={(e) => setU({ ...u, lessons: lessons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} dir="auto" data-testid="cur-e-lesson" /><button type="button" className={btn} onClick={() => setU({ ...u, lessons: lessons.filter((_, j) => j !== i) })} aria-label="Remove">✕</button></div>)}
          <button type="button" className={btn + " mt-2"} onClick={() => setU({ ...u, lessons: [...lessons, { title: "", note: "" }] })} data-testid="cur-e-addlesson">+ {tr("Add lesson", "إضافة درس")}</button></div>
        <div className="sm:col-span-3"><p className={lab}>{tr("Resources & links", "المصادر والروابط")}</p>
          {res.map((r, i) => <div key={i} className="mt-1 flex gap-2"><input className={field + " basis-1/3"} value={r.label} placeholder={tr("Label", "الاسم")} onChange={(e) => setU({ ...u, resources: res.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} dir="auto" /><input className={field} value={r.url} placeholder="https://…" onChange={(e) => setU({ ...u, resources: res.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} dir="ltr" data-testid="cur-e-url" /><button type="button" className={btn} onClick={() => setU({ ...u, resources: res.filter((_, j) => j !== i) })} aria-label="Remove">✕</button></div>)}
          <button type="button" className={btn + " mt-2"} onClick={() => setU({ ...u, resources: [...res, { label: "", url: "" }] })} data-testid="cur-e-addres">+ {tr("Add link", "إضافة رابط")}</button></div>
        <label className={lab + " sm:col-span-3 md:col-span-1"}>{tr("Linked assessment", "التقييم المرتبط")}<select className={field + " mt-1"} value={u.quiz || ""} onChange={(e) => setU({ ...u, quiz: e.target.value })} data-testid="cur-e-quiz"><option value="">—</option>{links.quizzes.map((q) => <option key={q.slug} value={q.slug}>{q.title}</option>)}</select></label>
        <label className={lab + " sm:col-span-3 md:col-span-2"}>{tr("Linked lesson page", "صفحة الدرس المرتبطة")}<select className={field + " mt-1"} value={u.page || ""} onChange={(e) => setU({ ...u, page: e.target.value })} data-testid="cur-e-page"><option value="">—</option>{links.pages.map((q) => <option key={q.slug} value={q.slug}>{q.title}</option>)}</select></label>
      </div>
      {err && <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-900">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} onClick={onClose}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btnCta} onClick={save} disabled={busy || !u.title?.trim()} data-testid="cur-e-save">{tr("Save unit", "حفظ الوحدة")}</button></div>
    </Modal>
  );
}
