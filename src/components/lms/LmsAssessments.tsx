"use client";

import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { lmsApi, lmsSession } from "@/lib/lms";
import { listPublishedQuizzes, loadQuizzesData, type Quiz } from "@/lib/quiz";
import { useI18n } from "@/lib/i18n";

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
  const card = "glass flex flex-col gap-3 rounded-3xl p-5";
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
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold"><span className="h-5 w-1.5 rounded-full bg-sun" aria-hidden />{teacher ? tr("Assessments you can host", "التقييمات التي يمكنك استضافتها") : tr("Practise on your own", "تدرّب بنفسك")}</h2>
              {quizzes === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
                : !list.length ? <p className="rounded-2xl bg-black/5 px-4 py-3 dark:bg-white/10" data-testid="lms-assess-none">{teacher ? tr("Your admin hasn't allowed you to host any assessments yet.", "لم يسمح لك المسؤول باستضافة أي تقييم بعد.") : tr("No assessments are open right now.", "لا توجد تقييمات متاحة الآن.")}</p>
                : (
                  <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="lms-assess-list">
                    {list.map((q) => (
                      <li key={q.slug} className={card} data-testid="lms-assess-card">
                        <div className="min-w-0"><p className="truncate text-lg font-bold" dir="auto">{q.title}</p><p className="text-xs opacity-70">{q.questions.length} {tr("questions", "سؤالًا")}{q.timeLimitMinutes ? ` · ${q.timeLimitMinutes} ${tr("min", "د")}` : ""}</p></div>
                        <div className="mt-auto flex flex-wrap gap-2">
                          {teacher ? <>
                            <a className="rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b]" href={`/assessments/host?quiz=${encodeURIComponent(q.slug)}`} data-testid="lms-assess-host">▶ {tr("Start group session", "بدء جلسة جماعية")}</a>
                            <a className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-semibold dark:border-white/20" href={`/assessments/${q.slug}`} target="_blank" rel="noopener">👁 {tr("Preview", "معاينة")}</a>
                          </> : <a className="rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b]" href={`/assessments/${q.slug}`} data-testid="lms-assess-start">▶ {tr("Start", "ابدأ")}</a>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          </>}
      </div>
    </AssessmentShell>
  );
}
