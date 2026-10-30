"use client";
import { LaunchChooser } from "@/components/lms/ClassLaunch";
import { useAssessFilter, useFacets } from "@/components/lms/AssessFilter";

import { TrkLink } from "@/components/tracker/TrkLink";
import { CurChip } from "@/components/lms/mods/CurChip";
import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { lmsApi, lmsSession } from "@/lib/lms";
import { listPublishedQuizzes, loadQuizzesData, type Quiz } from "@/lib/quiz";
import { useI18n } from "@/lib/i18n";
import { AssignForm, AssignedList, loadAnyQuiz } from "@/components/lms/LmsQuiz";
import { HOST_DRAFT_KEY } from "@/lib/groupSession";
import type { Assignment } from "@/lib/lms";
import type { ResultRecord } from "@/lib/resultsRecord";
import { modCall, type CurUnit } from "@/lib/lmsMods";

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
                <p className="text-xs opacity-70">{a.by}{a.due ? ` · ⏰ ${new Date(a.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><CurChip type="quiz" id={a.quiz} /><TrkLink id={a.quiz} student /></div></div>
              <div className="mt-auto">
                {a.mode === "group"
                  ? <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 dark:bg-sky-900/30 dark:text-sky-100" data-testid="lms-assess-group">👩‍🏫 {tr("Led by your teacher — join when your teacher starts (use the code above).", "يقوده معلمك — انضم عندما يبدأ معلمك (استخدم الرمز أعلاه).")}</p>
                  : <a className="inline-block rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b] transition hover:scale-105" href={`/lms/quiz?id=${encodeURIComponent(a.quiz)}`} data-testid="lms-assess-start">▶ {tr("Start", "ابدأ")}</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <MyRecord items={items} name={name} tr={tr} lang={lang} />
    </section>
  );
}

/** t329: the student's record — every assigned / completed assessment with its score, and a report for each attempt (per question + per Success Criterion). */
export function MyRecord({ items, name, tr, lang, child }: { items: Assignment[] | null; name: (a: Assignment) => string; tr: Tr; lang: string; child?: string }) {
  const [res, setRes] = useState<(ResultRecord & { label?: string })[] | null>(null);
  const [units, setUnits] = useState<CurUnit[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    (child ? modCall<{ items: (ResultRecord & { label?: string })[] }>("my-assess", { child }, false) : lmsApi.myAssess()).then((r) => setRes(r.items)).catch(() => setRes([]));
    modCall<{ items: CurUnit[] }>("cur-list", child ? { child } : {}, false).then((r) => setUnits(r.items || [])).catch(() => undefined);
  }, [child]);
  if (!res || !items) return null;
  const done = (q: string) => res.filter((r) => r.quizId === q || r.quizSlug === q);
  const pending = items.filter((a) => !done(a.quiz).length);
  const date = (t: number) => new Date(t).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const scText = (k: string) => { const [u, i] = k.split("#"); const un = units.find((x) => x.id === u); return (lang === "ar" && un?.scAr?.[Number(i)]) || un?.sc?.[Number(i)] || `${tr("Success criterion", "معيار النجاح")} ${Number(i) + 1}`; };
  const pctCls = (p: number) => (p >= 80 ? "bg-emerald-100 text-emerald-900" : p >= 50 ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900");
  return (
    <div className="mt-8 space-y-4" id="my-record" data-testid="my-record">
      <H2>{tr("My assessment record", "سجل تقييماتي")}</H2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass rounded-2xl p-4 text-center"><p className="text-3xl font-extrabold">{items.length}</p><p className="text-xs opacity-70">{tr("Assigned", "مُسندة")}</p></div>
        <div className="glass rounded-2xl p-4 text-center"><p className="text-3xl font-extrabold" data-testid="rec-done">{new Set(res.map((r) => r.quizId || r.quizSlug)).size}</p><p className="text-xs opacity-70">{tr("Completed", "مكتملة")}</p></div>
        <div className="glass rounded-2xl p-4 text-center"><p className="text-3xl font-extrabold">{pending.length}</p><p className="text-xs opacity-70">{tr("Still to do", "متبقية")}</p></div>
      </div>
      {pending.length > 0 && <p className="text-sm" data-testid="rec-pending">⏳ {tr("To do:", "مطلوب:")} {pending.map(name).join(" · ")}</p>}
      {!res.length ? <p className="rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10" data-testid="rec-none">{tr("No completed assessments yet. Your scores and reports will appear here.", "لا توجد تقييمات مكتملة بعد. ستظهر درجاتك وتقاريرك هنا.")}</p> : (
        <ul className="space-y-2">
          {res.map((r) => {
            const sc = new Map<string, { e: number; p: number; n: number }>();
            for (const d of r.details || []) if (d.sc) { const x = sc.get(d.sc) || { e: 0, p: 0, n: 0 }; x.e += d.earned; x.p += d.points; x.n++; sc.set(d.sc, x); }
            return (
              <li key={r.id} className="glass rounded-2xl p-4" data-testid="rec-item">
                <button type="button" className="flex w-full flex-wrap items-center gap-2 text-start" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} data-testid="rec-open">
                  <span className="min-w-0 flex-1 font-bold" dir="auto">{r.quizTitle || r.quizSlug}</span>
                  <span className="text-xs opacity-70">{r.kind === "group" ? tr("Group", "جماعي") : tr("Individual", "فردي")} · {date(r.finishedAt)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-extrabold ${pctCls(r.percentage)}`} data-testid="rec-score">{r.score}/{r.maxScore} · {Math.round(r.percentage)}%</span>
                </button>
                {open === r.id && (
                  <div className="mt-3 space-y-3" data-testid="rec-report">
                    <p className="text-sm">✅ {r.correct} {tr("correct", "صحيحة")} · ❌ {r.wrong} {tr("wrong", "خاطئة")} · ⏭ {r.unanswered} {tr("unanswered", "بلا إجابة")}{r.timeSec ? ` · ⏱ ${Math.round(r.timeSec / 60)} ${tr("min", "د")}` : ""}{r.label ? ` · ${r.label}` : ""}</p>
                    {sc.size > 0 && (
                      <div><p className="mb-1 text-sm font-extrabold">🎯 {tr("Success criteria", "معايير النجاح")}</p>
                        <ul className="space-y-1">{[...sc].map(([k, x]) => { const p = x.p ? Math.round((x.e / x.p) * 100) : 0; return <li key={k} className="flex items-center gap-2 text-sm" data-testid="rec-sc"><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${pctCls(p)}`}>{p}%</span><span dir="auto">{scText(k)}</span></li>; })}</ul></div>
                    )}
                    {(r.details || []).length > 0 && (
                      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-start text-xs opacity-70"><th className="p-1 text-start">#</th><th className="p-1 text-start">{tr("Question", "السؤال")}</th><th className="p-1 text-start">{tr("Your answer", "إجابتك")}</th><th className="p-1 text-start">{tr("Marks", "الدرجة")}</th></tr></thead>
                        <tbody>{r.details!.map((d) => <tr key={d.n} className="border-t border-black/5 align-top" data-testid="rec-q"><td className="p-1">{d.n}</td><td className="p-1" dir="auto">{d.prompt}</td><td className="p-1" dir="auto">{d.isCorrect ? "✅" : d.answered ? "❌" : "⏭"} {d.answer || "—"}</td><td className="p-1 whitespace-nowrap">{d.earned}/{d.points}</td></tr>)}</tbody></table></div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Teacher: own assessments (create/edit/delete), allowed site assessments, assign + host + preview, and what is assigned. */
function TeacherAssess({ quizzes, tr }: { quizzes: Quiz[]; tr: Tr }) {
  const [mine, setMine] = useState<{ id: string; title: string }[]>([]);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const loadMine = () => lmsApi.tquizList().then((r) => setMine(r.items)).catch(() => undefined);
  useEffect(() => { loadMine(); }, []);
  // t312: hosting asks "class / year group" (locked to those students, no names typed) or "random people" (code / QR).
  const [launchFor, setLaunchFor] = useState<{ id: string; title: string } | null>(null);
  const [pending, setPending] = useState<{ ids: string[]; label: string } | null>(null);
  useEffect(() => { try { const v = JSON.parse(sessionStorage.getItem("sm-host-roster") || "null"); if (v && Date.now() - v.at < 30 * 60e3) setPending(v); } catch { /* */ } }, []);
  const prep = async (id: string) => { if (id.startsWith("tq_")) { const q = await loadAnyQuiz(id); if (q) sessionStorage.setItem(HOST_DRAFT_KEY, JSON.stringify({ ...q, active: true })); } };
  const host = async (id: string, title = "") => {
    if (pending) { await prep(id); window.location.assign(`/assessments/host?quiz=${encodeURIComponent(id)}`); return; }
    setLaunchFor({ id, title });
  };
  // t329: filter by class/year, section, subject, topic.
  const facets = useFacets([...mine.map((m) => m.id), ...quizzes.map((q) => q.slug)], quizzes, false);
  const flt = useAssessFilter(facets, tr);
  const mineF = mine.filter((m) => flt.pass(m.id)), quizzesF = quizzes.filter((q) => flt.pass(q.slug));
  const card = (id: string, title: string, own: boolean) => (
    <li key={id} className="glass flex flex-col gap-3 rounded-3xl p-5" data-testid={own ? "tquiz-card" : "lms-assess-card"}>
      <p className="truncate text-lg font-bold" dir="auto">{own ? "✏️ " : ""}{title || tr("Untitled", "بدون عنوان")}</p>
      <div className="flex flex-wrap items-center gap-1.5"><CurChip type="quiz" id={id} /><TrkLink id={id} /></div>
      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-header px-3 py-1.5 text-xs font-bold text-white" onClick={() => setAssignFor(assignFor === id ? null : id)} data-testid="lms-assess-assign">📌 {tr("Assign", "إسناد")}</button>
        <button type="button" className="rounded-full bg-sun px-3 py-1.5 text-xs font-bold text-[#0b1b2b]" onClick={() => host(id, title)} data-testid="lms-assess-host">▶ {tr("Start group session", "بدء جلسة جماعية")}</button>
        <a className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold dark:border-white/20" href={`/lms/quiz?id=${encodeURIComponent(id)}`}>👁 {tr("Preview", "معاينة")}</a>
        {own && <a className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold dark:border-white/20" href={`/lms/quiz-edit?id=${id}`} data-testid="tquiz-edit">✎ {tr("Edit", "تعديل")}</a>}
        {own && <button type="button" className="rounded-full px-3 py-1.5 text-xs text-rose-600" onClick={() => { if (confirm(tr("Delete this assessment?", "حذف هذا التقييم؟"))) lmsApi.tquizDelete(id).then(() => { loadMine(); setRefresh((r) => r + 1); }); }} data-testid="tquiz-delete">🗑 {tr("Delete", "حذف")}</button>}
      </div>
      {assignFor === id && <AssignForm quiz={id} title={title} onDone={() => setRefresh((r) => r + 1)} />}
    </li>
  );
  return (
    <>
      {launchFor && <LaunchChooser type="assess" icon="🧩" title={launchFor.title || tr("Assessment", "تقييم")} quiz={launchFor.id} onClose={() => setLaunchFor(null)} onClass={async (ids, label) => { await prep(launchFor.id); try { sessionStorage.setItem("sm-host-roster", JSON.stringify({ ids, label, at: Date.now() })); } catch { /* */ } window.location.assign(`/assessments/host?quiz=${encodeURIComponent(launchFor.id)}`); }} />}
      {pending && <p className="rounded-2xl bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-900" data-testid="assess-pending">👥 {tr(`Pick an assessment to start with ${pending.label} (${pending.ids.length} students).`, `اختر تقييمًا للبدء مع ${pending.label} (${pending.ids.length} طالبًا).`)} <button type="button" className="underline" onClick={() => { sessionStorage.removeItem("sm-host-roster"); setPending(null); }}>{tr("Cancel", "إلغاء")}</button></p>}
      {flt.ui}
      <section>
        <div className="mb-3 flex items-center gap-2"><H2>{tr("My assessments", "تقييماتي")}</H2><span className="flex-1" /><a href="/lms/quiz-edit" className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] transition hover:scale-105" data-testid="tquiz-new">＋ {tr("New assessment", "تقييم جديد")}</a></div>
        {!mineF.length ? <p className="rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">✨ {tr("Create your own assessment with pictures and tap-to-answer questions.", "أنشئ تقييمك الخاص بالصور والأسئلة باللمس.")}</p>
          : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mineF.map((m) => card(m.id, m.title, true))}</ul>}
      </section>
      <section>
        <H2>{tr("School assessments you can use", "تقييمات المدرسة المتاحة لك")}</H2>
        {!quizzesF.length ? <p className="rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10" data-testid="lms-assess-none">{flt.active ? tr("No assessments match these filters.", "لا توجد تقييمات تطابق هذه المرشحات.") : tr("Your admin hasn't allowed you to host any school assessments yet.", "لم يسمح لك المسؤول باستخدام تقييمات المدرسة بعد.")}</p>
          : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="lms-assess-list">{quizzesF.map((q) => card(q.slug, q.title, false))}</ul>}
      </section>
      <section><H2>{tr("Assigned", "المُسندة")}</H2><AssignedList refresh={refresh} /></section>
    </>
  );
}
