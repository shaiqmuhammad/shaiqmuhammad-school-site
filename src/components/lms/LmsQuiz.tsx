"use client";

import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { AdminQuestionEditor } from "@/components/AdminQuestionEditor";
import { QuizPlayer } from "@/components/QuizPlayer";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { lmsApi, lmsErrorText, type Assignment, type Catalog, type MsgContact } from "@/lib/lms";
import { defaultCertificate, emptyQuestion, loadQuizzesData, normalizeQuiz, type Quiz } from "@/lib/quiz";
import { useTr } from "@/components/lms/useLms";

const qp = (k: string) => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get(k) || "");
const inputCls = "w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";

/** Load a site assessment (by slug) or a teacher-made one (tq_…) from the LMS. */
export async function loadAnyQuiz(id: string, asAdmin = false): Promise<Quiz | null> {
  if (id.startsWith("tq_")) return normalizeQuiz((await lmsApi.tquizGet(id, asAdmin)).quiz as Partial<Quiz>);
  const d = await loadQuizzesData();
  return d.quizzes.find((q) => q.slug === id) || null;
}

/** /lms/quiz?id=…: plays an assessment inside the LMS (exit/back return to /lms/assessments). */
export function LmsQuizPage() {
  const { tr } = useTr();
  const [quiz, setQuiz] = useState<Quiz | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => { loadAnyQuiz(qp("id")).then(setQuiz).catch((e) => { setErr(lmsErrorText(e, tr)); setQuiz(null); }); }, [tr]);
  if (quiz) return <QuizPlayer quiz={{ ...quiz, active: true, visible: true }} initialTemplate={defaultCertificate} initialResults={[]} />;
  return (
    <AssessmentShell title={tr("Assessment", "التقييم")} exitHref="/lms/assessments" toolbar={<LmsStaffToolbar />}>
      <p className="m-auto p-10 text-center opacity-80">{quiz === undefined ? tr("Loading…", "جارٍ التحميل…") : err || tr("This assessment isn't available to you.", "هذا التقييم غير متاح لك.")}</p>
    </AssessmentShell>
  );
}

/** Teacher (or admin) assessment editor: same question editor as admin, no-typing types, 5-minute default, picture. */
export function LmsQuizEditPage() {
  const { tr } = useTr();
  const asAdmin = qp("admin") === "1";
  const [q, setQ] = useState<Quiz | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const id = qp("id");
    if (id) loadAnyQuiz(id, asAdmin).then((x) => setQ(x)).catch((e) => setStatus(lmsErrorText(e, tr)));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- new blank assessment once on mount
    else setQ(normalizeQuiz({ id: "", slug: "", title: "", description: "", timeLimitMinutes: 5, active: true, visible: false, showAnswers: true, questions: [emptyQuestion("multiple_choice")] }));
  }, [asAdmin, tr]);
  const save = async () => {
    if (!q?.title.trim()) { setStatus(tr("Add a title first.", "أضف عنوانًا أولًا.")); return; }
    try { const r = await lmsApi.tquizSave({ ...q, updatedAt: new Date().toISOString() }, asAdmin); setQ({ ...q, id: r.id, slug: r.id }); setStatus(tr("Saved ✓", "تم الحفظ ✓")); history.replaceState(null, "", `?id=${r.id}${asAdmin ? "&admin=1" : ""}`); } catch (e) { setStatus(lmsErrorText(e, tr)); }
  };
  const pic = (f: File) => { const r = new FileReader(); r.onload = () => q && setQ({ ...q, cardImage: String(r.result) }); r.readAsDataURL(f); };
  return (
    <AssessmentShell title={tr("Edit assessment", "تعديل التقييم")} exitHref={asAdmin ? "/admin#quizzes" : "/lms/assessments"} wide toolbar={asAdmin ? undefined : <LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-3 py-6 sm:px-6" data-testid="tquiz-editor">
        {!q ? <p className="opacity-70">{status || tr("Loading…", "جارٍ التحميل…")}</p> : <>
          <div className="glass grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-semibold">{tr("Title", "العنوان")}<input className={inputCls + " mt-1"} value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} data-testid="tquiz-title" /></label>
            <label className="sm:col-span-2 text-sm font-semibold">{tr("Description", "الوصف")}<textarea className={inputCls + " mt-1"} rows={2} value={q.description} onChange={(e) => setQ({ ...q, description: e.target.value })} /></label>
            <label className="text-sm font-semibold">{tr("Time limit (minutes)", "المدة (دقائق)")}<input type="number" min={0} max={180} className={inputCls + " mt-1"} value={q.timeLimitMinutes} onChange={(e) => setQ({ ...q, timeLimitMinutes: Math.max(0, Number(e.target.value) || 0) })} /></label>
            <div className="text-sm font-semibold">{tr("Picture", "الصورة")}
              <div className="mt-1 flex items-center gap-3">{q.cardImage && <img src={q.cardImage} alt="" className="h-12 w-16 rounded-lg object-cover" />}<label className="cursor-pointer rounded-full border border-black/10 px-3 py-1.5 text-xs dark:border-white/15">⬆ {tr("Upload", "رفع")}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pic(e.target.files[0])} /></label></div>
            </div>
          </div>
          {q.questions.map((qq, i) => (
            <div key={qq.id || i} className="glass rounded-3xl p-4">
              <AdminQuestionEditor q={qq} idx={i} setStatus={setStatus} onChange={(n) => setQ({ ...q, questions: q.questions.map((x, j) => (j === i ? n : x)) })} onRemove={() => setQ({ ...q, questions: q.questions.filter((_, j) => j !== i) })} onMoveUp={i ? () => { const n = [...q.questions]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setQ({ ...q, questions: n }); } : undefined} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/15" onClick={() => setQ({ ...q, questions: [...q.questions, emptyQuestion("multiple_choice")] })} data-testid="tquiz-add-q">＋ {tr("Add question", "إضافة سؤال")}</button>
            <span className="flex-1" />
            <span className="text-sm">{status}</span>
            <button type="button" className="rounded-full bg-sun px-5 py-2 text-sm font-bold text-[#0b1b2b]" onClick={save} data-testid="tquiz-save">{tr("Save", "حفظ")}</button>
          </div>
        </>}
      </div>
    </AssessmentShell>
  );
}

/** Assign an assessment to a class/section or chosen students, individual or teacher-led group, optional due date. */
export function AssignForm({ quiz, title, asAdmin = false, onDone }: { quiz: string; title: string; asAdmin?: boolean; onDone: () => void }) {
  const { tr } = useTr();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [people, setPeople] = useState<MsgContact[]>([]);
  const [f, setF] = useState({ mode: "individual" as "individual" | "group", cls: "", section: "", students: [] as string[], due: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => { lmsApi.catalog(asAdmin).then(setCat).catch(() => undefined); lmsApi.msgContacts(asAdmin).then((r) => setPeople(r.items.filter((x) => x.role === "student"))).catch(() => undefined); }, [asAdmin]);
  const submit = async () => {
    try { const r = await lmsApi.assessAssign({ quiz, title, mode: f.mode, cls: f.cls, section: f.section, students: f.students, due: f.due ? new Date(f.due + "T23:59:00").getTime() : null }, asAdmin); setMsg(tr(`Assigned to ${r.sent} students ✓`, `أُسند إلى ${r.sent} طالبًا ✓`)); onDone(); } catch (e) { setMsg(lmsErrorText(e, tr)); }
  };
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-black/15 p-3 text-sm dark:border-white/20" data-testid="assign-form">
      <div className="flex flex-wrap gap-2">
        {(["individual", "group"] as const).map((m) => <button key={m} type="button" aria-pressed={f.mode === m} onClick={() => setF({ ...f, mode: m })} className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ring-black/10 ${f.mode === m ? "bg-sun text-[#0b1b2b]" : ""}`} data-testid={`assign-mode-${m}`}>{m === "individual" ? tr("Individual (students start it)", "فردي (يبدأه الطالب)") : tr("Group (led by teacher)", "جماعي (يقوده المعلم)")}</button>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={inputCls} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value, section: "" })} data-testid="assign-class"><option value="">{tr("Class…", "الصف…")}</option>{(cat?.classes || []).map((c) => <option key={c.name}>{c.name}</option>)}</select>
        <select className={inputCls} value={f.section} disabled={!f.cls} onChange={(e) => setF({ ...f, section: e.target.value })}><option value="">{tr("All sections", "كل الشعب")}</option>{(cat?.sections || []).filter((s) => s.cls === f.cls).map((s) => <option key={s.name}>{s.name}</option>)}</select>
        <label className="flex items-center gap-2">{tr("Due", "الموعد")}<input type="date" className={inputCls} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
      </div>
      <details><summary className="cursor-pointer text-xs opacity-70">{tr("…or pick individual students", "…أو اختر طلابًا محددين")} {f.students.length ? `(${f.students.length})` : ""}</summary>
        <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">{people.map((p) => <button key={p.id} type="button" aria-pressed={f.students.includes(p.id)} onClick={() => setF({ ...f, students: f.students.includes(p.id) ? f.students.filter((x) => x !== p.id) : [...f.students, p.id] })} className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10 ${f.students.includes(p.id) ? "bg-sun text-[#0b1b2b]" : ""}`}>{p.name}</button>)}</div>
      </details>
      <div className="flex items-center gap-2"><button type="button" disabled={!f.cls && !f.students.length} className="rounded-full bg-header px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={submit} data-testid="assign-submit">{tr("Assign", "إسناد")}</button><span className="text-xs">{msg}</span></div>
    </div>
  );
}

/** Assignments the teacher made (admin: all), with unassign. */
export function AssignedList({ asAdmin = false, refresh = 0 }: { asAdmin?: boolean; refresh?: number }) {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<Assignment[]>([]);
  const load = () => lmsApi.assessList(asAdmin).then((r) => setItems(r.items)).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [asAdmin, refresh]);
  if (!items.length) return <p className="rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">📋 {tr("Nothing assigned yet.", "لم يُسند شيء بعد.")}</p>;
  return (
    <ul className="space-y-2" data-testid="assigned-list">
      {items.map((a) => (
        <li key={a.id} className="glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 text-sm" data-testid="assigned-item">
          <b dir="auto">{a.title || a.quiz}</b>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${a.mode === "group" ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-900"}`}>{a.mode === "group" ? tr("Group", "جماعي") : tr("Individual", "فردي")}</span>
          <span className="opacity-70">{a.students.length ? tr(`${a.students.length} students`, `${a.students.length} طلاب`) : `${a.cls}${a.section ? " · " + a.section : ""}`}</span>
          {a.due && <span className="opacity-70">⏰ {new Date(a.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}</span>}
          <span className="flex-1" />
          {asAdmin && <span className="text-xs opacity-60">{a.by}</span>}
          <button type="button" className="text-xs text-rose-600" onClick={() => lmsApi.assessUnassign(a.id, asAdmin).then(load)} data-testid="assigned-remove">{tr("Unassign", "إلغاء الإسناد")}</button>
        </li>
      ))}
    </ul>
  );
}

/** Admin (Assessments tab): assign any school assessment, see and manage every teacher-made one, and all assignments. */
export function LmsAssessAdmin({ quizzes }: { quizzes: Quiz[] }) {
  const { tr } = useTr();
  const [teacherQ, setTeacherQ] = useState<{ id: string; title: string; ownerName: string }[]>([]);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const load = () => lmsApi.tquizList(true).then((r) => setTeacherQ(r.items)).catch(() => undefined);
  useEffect(() => { load(); }, []);
  const row = (id: string, title: string, extra?: React.ReactNode) => (
    <li key={id} className="rounded-2xl bg-black/[0.03] px-3 py-2 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2 text-sm"><b className="min-w-0 flex-1 truncate" dir="auto">{title}</b>{extra}
        <button type="button" className="rounded-full bg-header px-3 py-1 text-xs font-bold text-white" onClick={() => setAssignFor(assignFor === id ? null : id)} data-testid="admin-assess-assign">📌 {tr("Assign", "إسناد")}</button></div>
      {assignFor === id && <div className="mt-2"><AssignForm quiz={id} title={title} asAdmin onDone={() => setRefresh((r) => r + 1)} /></div>}
    </li>
  );
  return (
    <section className="glass space-y-4 rounded-3xl p-5" data-testid="admin-lms-assess">
      <h3 className="text-lg font-extrabold">🎓 {tr("Assign to students (LMS)", "الإسناد للطلاب (المنصة)")}</h3>
      <details><summary className="cursor-pointer text-sm font-semibold">{tr("School assessments", "تقييمات المدرسة")} ({quizzes.length})</summary><ul className="mt-2 space-y-1.5">{quizzes.map((q) => row(q.slug, q.title))}</ul></details>
      <details open><summary className="cursor-pointer text-sm font-semibold">{tr("Teacher-made assessments", "تقييمات المعلمين")} ({teacherQ.length})</summary>
        <ul className="mt-2 space-y-1.5">{teacherQ.map((q) => row(q.id, q.title, <><span className="text-xs opacity-60">{q.ownerName}</span><a className="text-xs underline" href={`/lms/quiz-edit?id=${q.id}&admin=1`}>{tr("Edit", "تعديل")}</a><button type="button" className="text-xs text-rose-600" onClick={() => { if (confirm(tr("Delete this assessment?", "حذف هذا التقييم؟"))) lmsApi.tquizDelete(q.id, true).then(load); }}>{tr("Delete", "حذف")}</button></>))}{!teacherQ.length && <li className="text-sm opacity-60">{tr("None yet.", "لا يوجد بعد.")}</li>}</ul></details>
      <div><p className="mb-2 text-sm font-semibold">{tr("All assignments", "كل الإسنادات")}</p><AssignedList asAdmin refresh={refresh} /></div>
    </section>
  );
}
