"use client";

import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { lmsApi, lmsSession } from "@/lib/lms";
import { listPublishedQuizzes, loadQuizzesData, type Quiz } from "@/lib/quiz";
import { useI18n } from "@/lib/i18n";
import { AssignForm, AssignedList, loadAnyQuiz } from "@/components/lms/LmsQuiz";
import { HOST_DRAFT_KEY } from "@/lib/groupSession";
import type { Assignment } from "@/lib/lms";

/** /lms/assessments: assessments inside the LMS layout. Students: start on their own + join a live code. Teachers: host the ones the admin allowed. */
export function LmsAssessmentsPage() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [me, setMe] = useState<{ role: string; perms: string[] } | null | undefined>(undefined);
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!lmsSession()) { setMe(null); return; }
    lmsApi.me().then((r) => setMe({ role: String(r.user.role), perms: r.user.perms || [] })).catch(() => setMe(null));
    loadQuizzesData().then((d) => setQuizzes(listPublishedQuizzes(d))).catch(() => setQuizzes([]));
  }, []);
  const teacher = me?.role === "teacher";
  const hosts = (me?.perms || []).filter((p) => p.startsWith("host:")).map((p) => p.slice(5));
  const list = (quizzes || []).filter((q) => (teacher ? hosts.includes("*") || hosts.includes(q.slug) : q.active));
  return (
    <AssessmentShell title={tr("Assessments", "التقييمات")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-3 py-6 sm:px-6" data-testid="lms-assessments">
        {me === undefined ? <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
          : me === null ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in first.", "سجّل الدخول أولًا.")} <a className="font-bold underline" href="/lms/login">{tr("Student / Teacher login", "دخول الطالب / المعلم")}</a></p>
          : <>
            {!teacher && (
              <form className="relative overflow-hidden rounded-3xl bg-header px-6 py-6 text-white" onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c) window.location.href = `/assessments/join?code=${encodeURIComponent(c)}`; }} data-testid="lms-join-form">
                <p className="text-xl font-extrabold !text-white">🔑 {tr("Join a live class assessment", "انضم إلى تقييم صفي مباشر")}</p>
                <p className="mt-1 text-sm text-white/75">{tr("Type the code your teacher shows on the board.", "اكتب الرمز الذي يعرضه معلمك على السبورة.")}</p>
                <div className="mt-4 flex max-w-md gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} placeholder="ABC123" className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-center font-mono text-lg font-bold uppercase tracking-widest text-[#0b1b2b] outline-none focus:ring-4 focus:ring-sun/50" aria-label={tr("Join code", "رمز الانضمام")} data-testid="lms-join-code" />
                  <button type="submit" className="rounded-full bg-sun px-5 font-bold text-[#0b1b2b]">{tr("Join", "انضم")}</button>
                </div>
              </form>
            )}
            {teacher ? <TeacherAssess quizzes={list} tr={tr} /> : <StudentAssigned quizzes={quizzes || []} tr={tr} lang={lang} />}
          </>}
      </div>
    </AssessmentShell>
  );
}

type Tr = (en: string, ar: string) => string;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold"><span className="h-5 w-1.5 rounded-full bg-sun" aria-hidden />{children}</h2>;

/** Student: only assessments assigned by a teacher/admin. Individual → Start; group → led by the teacher (join with code). */
function StudentAssigned({ quizzes, tr, lang }: { quizzes: Quiz[]; tr: Tr; lang: string }) {
  const [items, setItems] = useState<Assignment[] | null>(null);
  useEffect(() => { lmsApi.assessList().then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  const name = (a: Assignment) => a.title || quizzes.find((q) => q.slug === a.quiz)?.title || a.quiz;
  return (
    <section>
      <H2>{tr("Assigned to you", "المُسندة إليك")}</H2>
      {items === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !items.length ? (
        <div className="glass rounded-3xl p-8 text-center" data-testid="lms-assess-none"><div className="text-5xl">🌱</div><p className="mt-2 font-bold">{tr("No assessments yet", "لا توجد تقييمات بعد")}</p><p className="text-sm opacity-70">{tr("Your teacher will assign them here.", "سيُسندها معلمك هنا.")}</p></div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="lms-assess-list">
          {items.map((a) => (
            <li key={a.id} className="glass flex flex-col gap-3 rounded-3xl p-5" data-testid="lms-assess-card" data-mode={a.mode}>
              <div className="min-w-0"><p className="truncate text-lg font-bold" dir="auto">{name(a)}</p>
                <p className="text-xs opacity-70">{a.by}{a.due ? ` · ⏰ ${new Date(a.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}</p></div>
              <div className="mt-auto">
                {a.mode === "group"
                  ? <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 dark:bg-sky-900/30 dark:text-sky-100" data-testid="lms-assess-group">👩‍🏫 {tr("Led by your teacher — join when your teacher starts (use the code above).", "يقوده معلمك — انضم عندما يبدأ معلمك (استخدم الرمز أعلاه).")}</p>
                  : <a className="inline-block rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b] transition hover:scale-105" href={`/lms/quiz?id=${encodeURIComponent(a.quiz)}`} data-testid="lms-assess-start">▶ {tr("Start", "ابدأ")}</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Teacher: own assessments (create/edit/delete), allowed site assessments, assign + host + preview, and what is assigned. */
function TeacherAssess({ quizzes, tr }: { quizzes: Quiz[]; tr: Tr }) {
  const [mine, setMine] = useState<{ id: string; title: string }[]>([]);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const loadMine = () => lmsApi.tquizList().then((r) => setMine(r.items)).catch(() => undefined);
  useEffect(() => { loadMine(); }, []);
  const host = async (id: string) => {
    if (id.startsWith("tq_")) { const q = await loadAnyQuiz(id); if (q) sessionStorage.setItem(HOST_DRAFT_KEY, JSON.stringify({ ...q, active: true })); }
    window.location.assign(`/assessments/host?quiz=${encodeURIComponent(id)}`);
  };
  const card = (id: string, title: string, own: boolean) => (
    <li key={id} className="glass flex flex-col gap-3 rounded-3xl p-5" data-testid={own ? "tquiz-card" : "lms-assess-card"}>
      <p className="truncate text-lg font-bold" dir="auto">{own ? "✏️ " : ""}{title || tr("Untitled", "بدون عنوان")}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-header px-3 py-1.5 text-xs font-bold text-white" onClick={() => setAssignFor(assignFor === id ? null : id)} data-testid="lms-assess-assign">📌 {tr("Assign", "إسناد")}</button>
        <button type="button" className="rounded-full bg-sun px-3 py-1.5 text-xs font-bold text-[#0b1b2b]" onClick={() => host(id)} data-testid="lms-assess-host">▶ {tr("Start group session", "بدء جلسة جماعية")}</button>
        <a className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold dark:border-white/20" href={`/lms/quiz?id=${encodeURIComponent(id)}`}>👁 {tr("Preview", "معاينة")}</a>
        {own && <a className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold dark:border-white/20" href={`/lms/quiz-edit?id=${id}`} data-testid="tquiz-edit">✎ {tr("Edit", "تعديل")}</a>}
        {own && <button type="button" className="rounded-full px-3 py-1.5 text-xs text-rose-600" onClick={() => { if (confirm(tr("Delete this assessment?", "حذف هذا التقييم؟"))) lmsApi.tquizDelete(id).then(() => { loadMine(); setRefresh((r) => r + 1); }); }} data-testid="tquiz-delete">🗑 {tr("Delete", "حذف")}</button>}
      </div>
      {assignFor === id && <AssignForm quiz={id} title={title} onDone={() => setRefresh((r) => r + 1)} />}
    </li>
  );
  return (
    <>
      <section>
        <div className="mb-3 flex items-center gap-2"><H2>{tr("My assessments", "تقييماتي")}</H2><span className="flex-1" /><a href="/lms/quiz-edit" className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] transition hover:scale-105" data-testid="tquiz-new">＋ {tr("New assessment", "تقييم جديد")}</a></div>
        {!mine.length ? <p className="rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">✨ {tr("Create your own assessment with pictures and tap-to-answer questions.", "أنشئ تقييمك الخاص بالصور والأسئلة باللمس.")}</p>
          : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mine.map((m) => card(m.id, m.title, true))}</ul>}
      </section>
      <section>
        <H2>{tr("School assessments you can use", "تقييمات المدرسة المتاحة لك")}</H2>
        {!quizzes.length ? <p className="rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10" data-testid="lms-assess-none">{tr("Your admin hasn't allowed you to host any school assessments yet.", "لم يسمح لك المسؤول باستخدام تقييمات المدرسة بعد.")}</p>
          : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="lms-assess-list">{quizzes.map((q) => card(q.slug, q.title, false))}</ul>}
      </section>
      <section><H2>{tr("Assigned", "المُسندة")}</H2><AssignedList refresh={refresh} /></section>
    </>
  );
}
