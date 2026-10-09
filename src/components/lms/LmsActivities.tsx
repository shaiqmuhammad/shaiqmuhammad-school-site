"use client";

import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { AdminActivities } from "@/components/AdminActivities";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { lmsApi, lmsSession } from "@/lib/lms";
import { listPublishedQuizzes, loadQuizzesData, type Quiz } from "@/lib/quiz";
import { useI18n } from "@/lib/i18n";

/** Teacher area → Classroom: the activities and assessments the admin allowed this teacher to host (teacher login only). */
export function LmsActivitiesPage() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [perms, setPerms] = useState<string[] | null>(null);
  const [role, setRole] = useState("");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!lmsSession()) { setPerms([]); return; }
    lmsApi.me().then((r) => { setRole(String(r.user.role)); setPerms(r.user.perms || []); }).catch(() => setPerms([]));
    loadQuizzesData().then((d) => setQuizzes(listPublishedQuizzes(d))).catch(() => undefined);
  }, []);
  const acts = (perms || []).filter((p) => p.startsWith("act:")).map((p) => p.slice(4));
  const allActs = acts.includes("*") ? ["wall", "wordcloud", "poll", "survey", "tps", "vote", "wheel", "randomiser"] : acts;
  const hosts = (perms || []).filter((p) => p.startsWith("host:")).map((p) => p.slice(5));
  const myQuizzes = hosts.includes("*") ? quizzes : quizzes.filter((q) => hosts.includes(q.slug));
  return (
    <AssessmentShell title={tr("Classroom", "الصف")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-3 py-6 sm:px-6" data-testid="lms-activities">
        {perms === null ? <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
          : role !== "teacher" ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in with your teacher account.", "سجّل الدخول بحساب المعلم.")} <a className="font-bold underline" href="/lms/login">{tr("Teacher login", "دخول المعلم")}</a></p>
          : !allActs.length && !myQuizzes.length ? <p className="rounded-2xl bg-black/5 px-4 py-3 dark:bg-white/10" data-testid="lms-activities-none">{tr("Your admin hasn't given you access to classroom activities or assessments yet.", "لم يمنحك المسؤول صلاحية الأنشطة الصفية أو التقييمات بعد.")}</p>
          : <>
            {allActs.length > 0 && <section><h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold"><span className="h-5 w-1.5 rounded-full bg-sun" aria-hidden />{tr("Classroom activities", "الأنشطة الصفية")}</h2><AdminActivities allowed={allActs} /></section>}
            {myQuizzes.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold"><span className="h-5 w-1.5 rounded-full bg-sun" aria-hidden />{tr("Host an assessment", "استضافة تقييم")}</h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="lms-host-list">
                  {myQuizzes.map((q) => (
                    <li key={q.slug} className="glass flex items-center gap-3 rounded-2xl p-4">
                      <span className="min-w-0 flex-1"><span className="block truncate font-bold" dir="auto">{q.title}</span><span className="text-xs opacity-70">{q.questions.length} {tr("questions", "سؤالًا")}</span></span>
                      <a className="rounded-full bg-sun px-3 py-1.5 text-sm font-bold text-[#0b1b2b]" href={`/assessments/host?quiz=${encodeURIComponent(q.slug)}`} data-testid="lms-host-go">▶ {tr("Host live", "بث مباشر")}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>}
      </div>
    </AssessmentShell>
  );
}
