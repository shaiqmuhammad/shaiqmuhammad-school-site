"use client";
import { applyPref, MenuEditor, useUiPrefs } from "@/components/lms/MenuPrefs";
import { TodayLessons } from "@/components/lms/Timetable";


import { DlGate } from "@/components/lms/DlGate";
import { LiveActivityBanner } from "@/components/lms/LiveActivity";
import { AnnFeed } from "@/components/lms/Messages";
import { CriteriaChart, TrackerEntries } from "@/components/lms/QuranScores";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashCarousel, useUnreadMsgs, type Widget } from "@/components/lms/DashWidgets";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { Certificates, Leaderboard, LeaderboardSetting, ProgressCard, RevisionList } from "@/components/lms/Progress";
import { Avatar } from "@/components/lms/Avatar";
import { QuranHomework } from "@/components/lms/mods/QuranHomework";
import { CorrectedList } from "@/components/lms/mods/CorrectedHomework";
import { qhwPerm } from "@/lib/lmsMods";
import { exportAllHomeworkZip } from "@/components/lms/lmsFiles";
import { STATUS_STYLE, card, smallBtn, statusLabel, useLmsActor, useTr, GRADE_STYLE, gradeLabel } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSignOut, quranChapters, type Chapter, type QuranData } from "@/lib/lms";

type Dash = Awaited<ReturnType<typeof lmsApi.dashboard>>;

/** Student dashboard (homework + Quran tracker) or teacher/admin dashboard (assign + review). */
export function NeedLogin({ adminElsewhere }: { adminElsewhere: boolean }) {
  const { tr } = useTr();
  return (
    <AssessmentShell title={tr("Student / Teacher area", "منطقة الطلاب والمعلمين")} exitHref="/">
      <div className="mx-auto max-w-lg flex-1 space-y-3 p-8 text-center" data-testid="lms-need-login">
        <p className={card}>
          {tr("Please sign in with your student or teacher username and PIN.", "سجّل الدخول باسم المستخدم والرقم السري للطالب أو المعلم.")}{" "}
          <a className="font-bold underline" href={`/lms/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/lms")}`} data-testid="lms-need-login-link">{tr("Student / Teacher login", "دخول الطلاب والمعلمين")}</a>
        </p>
        {adminElsewhere && (
          <p className="text-sm opacity-80">
            {tr("You're signed in as Admin on this device — admin tools are in", "أنت مسجّل كمدير على هذا الجهاز — أدوات الإدارة في")} <a className="font-bold underline" href="/admin#lmshw">{tr("Admin → Homework", "الإدارة ← الواجبات")}</a>.
          </p>
        )}
      </div>
    </AssessmentShell>
  );
}

/** `only="homework"`: the separate Homework page (/lms/homework/) — just the homework list (and, for teachers, New homework). */
export function LmsDashboard({ only }: { only?: "homework" } = {}) {
  const hwOnly = only === "homework";
  const { tr, lang } = useTr();
  const router = useRouter();
  const { actor, asAdmin, ready, adminElsewhere } = useLmsActor();
  const [dash, setDash] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  // t302: teacher Homeworks hub tabs (Quran / General / Assigned / Corrected with Quran|General sub-tabs).
  const [hubTab, setHubTab] = useState<"quran" | "general" | "assigned" | "corrected">("general");
  const [corrSub, setCorrSub] = useState<"quran" | "general">("quran");
  useEffect(() => { const h = window.location.hash.replace("#", ""); if (h === "quran" || h === "general" || h === "assigned" || h === "corrected") setHubTab(h); }, []);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    lmsApi
      .dashboard(asAdmin)
      .then(setDash)
      .catch((e) => {
        if ((e as { status?: number }).status === 401) {
          lmsSignOut();
          router.push("/lms/login");
        } else setErr(lmsErrorText(e, tr));
      });
  }, [asAdmin, router, tr]);

  useEffect(() => {
    if (!ready) return;
    if (!actor) return;
    if (actor.role === "parent") { router.replace("/lms/family"); return; }
    load();
    quranChapters().then(setChapters);
  }, [ready, actor, load, router]);

  const surahName = (n: number) => chapters.find((c) => c.id === n)?.[lang === "ar" ? "name_arabic" : "name_simple"] || `${tr("Surah", "سورة")} ${n}`;
  const staff = actor?.role === "teacher" || actor?.role === "admin";
  const qOk = actor?.role === "teacher" && qhwPerm(actor?.perms).show && qhwPerm(actor?.perms).view;
  useEffect(() => {
    if (!actor) return;
    const want = `${staff ? tr("Teacher Dashboard", "لوحة المعلم") : tr("Student Dashboard", "لوحة الطالب")} | Shaiq Muhammad`;
    const apply = () => { if (document.title !== want) document.title = want; };
    apply();
    // Next re-applies the static route title after hydration/language switch; keep ours.
    const el = document.querySelector("title");
    const mo = new MutationObserver(apply);
    if (el) mo.observe(el, { childList: true, characterData: true, subtree: true });
    const t = setTimeout(apply, 1500);
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [actor, staff, tr]);
  const unread = useUnreadMsgs();
  const { prefs: uiPrefs, save: saveUi } = useUiPrefs();
  const [editTiles, setEditTiles] = useState(false);
  const canAssign = actor?.role === "admin" || actor?.perms.includes("assign");

  const QUICK: string[][] = (staff ? [["/lms/timetable", "⏰", "Timetable", "الجدول", "from-lime-100 to-lime-200"], ["/lms/classes", "🧑‍🏫", "My classes", "صفوفي", "from-sky-100 to-sky-200"], ["/lms/homework", "📚", "Homeworks", "الواجبات", "from-amber-100 to-amber-200"], ["/lms/attendance", "📋", "Attendance", "الحضور", "from-emerald-100 to-emerald-200"], ["/lms/activities", "🎡", "Activities", "الأنشطة", "from-violet-100 to-violet-200"], ["/lms/assessments", "🧩", "Assessments", "التقييمات", "from-rose-100 to-rose-200"], ["/lms/messages", "💬", "Messages", "الرسائل", "from-cyan-100 to-cyan-200"]] : [["/lms/timetable", "⏰", "Timetable", "الجدول", "from-lime-100 to-lime-200"], ["/lms/homework", "✏️", "Homework", "الواجبات", "from-amber-100 to-amber-200"], ["/lms/assessments", "🧩", "Assessments", "التقييمات", "from-rose-100 to-rose-200"], ["/lms/library", "📚", "Libraries", "المكتبات", "from-emerald-100 to-emerald-200"], ["/lms#tracker", "📖", "Quran Tracker", "متابعة الحفظ", "from-sky-100 to-sky-200"], ["/lms/messages", "💬", "Messages", "الرسائل", "from-cyan-100 to-cyan-200"], ["/lms/account", "🦸", "My character", "شخصيتي", "from-violet-100 to-violet-200"]]);
  if (ready && !actor) return <NeedLogin adminElsewhere={adminElsewhere} />;

  return (
    <AssessmentShell
      title={hwOnly ? tr("Homework", "الواجبات") : staff ? tr("Teacher Dashboard", "لوحة المعلم") : tr("Student Dashboard", "لوحة الطالب")}
      exitHref={hwOnly ? "/lms" : "/"}
      wide
      toolbar={actor ? <LmsStaffToolbar /> : undefined}
    >
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 py-5 sm:px-6" data-testid="lms-dashboard">
        {actor && !hwOnly && actor.role !== "parent" && <TodayLessons />}
        {actor && !hwOnly && (
          // t303: big friendly shortcuts for students and teachers.
          <>
          <nav className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7" aria-label={tr("Shortcuts", "اختصارات")} data-testid="lms-quick">
            {applyPref(QUICK.map(([href, ic, en, ar, tone]) => ({ id: href, href, ic, en, ar, tone })), uiPrefs.tiles).map(({ href, ic, en, ar, tone }) => (
              <a key={href} href={href} className={`flex flex-col items-center gap-1 rounded-3xl bg-gradient-to-br ${tone} px-2 py-3 text-center text-xs font-extrabold text-[#1b2f44] shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md sm:text-sm dark:opacity-90`} data-testid="lms-quick-item"><span className="text-3xl sm:text-4xl" aria-hidden>{ic}</span>{tr(en, ar)}</a>
            ))}
          </nav>
          <div className="-mt-3 flex justify-end"><button type="button" className="rounded-full px-3 py-1 text-xs font-bold opacity-70 hover:opacity-100" onClick={() => setEditTiles(true)} data-testid="tiles-edit">✏️ {tr("Edit shortcuts", "تعديل الاختصارات")}</button></div>
          {editTiles && <MenuEditor title={tr("Edit shortcuts", "تعديل الاختصارات")} items={QUICK.map(([href, ic, en, ar]) => ({ id: href, label: tr(en, ar), icon: ic }))} pref={uiPrefs.tiles} onSave={(p) => saveUi("tiles", p)} onClose={() => setEditTiles(false)} tr={tr} />}
          </>
        )}
        {!staff && actor && !hwOnly && <LiveActivityBanner />}
        {dash && !hwOnly && <AnnFeed />}
        {dash && !hwOnly && <DashCarousel items={((staff ? [
          { icon: "📝", title: tr("To review", "للمراجعة"), value: dash.homework.reduce((n, h) => n + (Number((h.counts as Record<string, number> | undefined)?.submitted) || 0), 0), sub: tr("submissions waiting", "تسليمات بانتظارك"), href: "/lms/homework", tone: "coral" },
          { icon: "📚", title: tr("Homework", "الواجبات"), value: dash.homework.length, sub: tr("active", "نشطة"), href: "/lms/homework", tone: "sun" },
          { icon: "🏫", title: tr("My classes", "صفوفي"), value: (dash.classes || []).length, sub: tr("classes & groups", "صفوف ومجموعات"), href: "/lms/classes", tone: "teal" },
          { icon: "🎒", title: tr("Students", "الطلاب"), value: (dash.students || []).length, sub: tr("in my groups", "في مجموعاتي"), href: "/lms/classes", tone: "navy" },
          { icon: "💬", title: tr("Messages", "الرسائل"), value: unread, sub: tr("unread", "غير مقروءة"), href: "/lms/messages", tone: "sky", badge: unread },
          { icon: "🧱", title: tr("Class Wall", "جدار الصف"), sub: tr("share with your class", "شارك مع صفك"), href: "/lms/wall", tone: "mint" },
        ] : [
          { icon: "✏️", title: tr("Today's homework", "واجب اليوم"), value: dash.homework.filter((h) => !h.locked && (!h.sub || h.sub.status === "draft" || h.sub.status === "returned")).length, sub: dash.homework.find((h) => !h.sub || h.sub.status === "draft")?.title || tr("All done! 🎉", "أنجزت كل شيء! 🎉"), href: "/lms/homework", tone: "sun" },
          { icon: "🏆", title: tr("My points", "نقاطي"), value: dash.progress ? `${dash.progress.stars} ⭐` : "—", sub: dash.progress ? tr(`${dash.progress.streak}-day streak 🔥`, `${dash.progress.streak} أيام متتالية 🔥`) : "", href: "/lms/homework", tone: "coral" },
          { icon: "📖", title: tr("Quran progress", "تقدم القرآن"), value: (dash.tracker || []).length, sub: tr("surahs tracked", "سور في المتابعة"), href: "/lms#tracker", tone: "navy" },
          { icon: "✅", title: tr("Passed", "مُجتاز"), value: dash.homework.filter((h) => h.sub?.status === "approved").length, sub: tr("homework approved", "واجبات معتمدة"), href: "/lms/homework", tone: "teal" },
          { icon: "💬", title: tr("Messages", "الرسائل"), value: unread, sub: tr("unread", "غير مقروءة"), href: "/lms/messages", tone: "sky", badge: unread },
          { icon: "🧱", title: tr("Class Wall", "جدار الصف"), sub: tr("see what's new", "شاهد الجديد"), href: "/lms/wall", tone: "mint" },
        ]) as Widget[]).filter((w) => !(staff && ((w.href === "/lms/wall" && actor?.perms?.includes("hide:wall")) || (w.href === "/lms/messages" && actor?.perms?.includes("hide:messaging")) || (w.href === "/lms#homework" && actor?.perms?.includes("hide:homework"))))) } />}
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
        {!dash ? (
          <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : !staff ? (
          <>
            {dash.progress && !hwOnly && <ProgressCard p={dash.progress} />}
            {!hwOnly && <RevisionList tracker={dash.tracker || []} onChange={(t) => setDash({ ...dash, tracker: t })} />}
            <section id="homework" className="scroll-mt-28">
              <h2 className="mb-3 text-xl font-bold">{tr("Homework", "الواجبات")}</h2>
              {dash.homework.length === 0 && <p className={card + " opacity-80"}>{tr("No homework yet — enjoy your day!", "لا توجد واجبات بعد — استمتع بيومك!")}</p>}
              <ul className="grid gap-3 sm:grid-cols-2">
                {dash.homework.map((h) => {
                  const st = h.sub?.status || "none";
                  const q = h.data as QuranData;
                  return (
                    <li key={h.id}>
                      <a href={`/lms/homework?id=${h.id}`} className={card + " block transition hover:-translate-y-0.5 hover:shadow-lg"} data-testid="lms-hw-card">
                        <div className="flex items-start gap-3">
                          <span className="text-3xl" aria-hidden>{h.kind === "quran" ? "📖" : "📝"}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-bold" dir="auto">{h.title}</p>
                            {h.kind === "quran" && <p className="text-sm opacity-80">{surahName(q.surah)} · {q.from}–{q.to}</p>}
                            {h.due && <p className="text-sm opacity-70">{tr("Due", "التسليم")} {new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")} {h.late && <span className="ms-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800" data-testid="lms-hw-late">⏰ {h.sub?.submittedAt ? tr("Handed in late", "سُلّم متأخرًا") : tr("Overdue", "متأخر")}</span>}</p>}
                          </div>
                          {h.locked ? <span className="shrink-0 rounded-full bg-black/10 px-2.5 py-1 text-xs font-bold dark:bg-white/15" data-testid="lms-hw-locked">🔒 {tr("Locked", "مقفل")}</span> : h.sub?.grade ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_STYLE[h.sub.grade]}`} data-testid="lms-hw-grade">{h.sub.grade === "red" ? tr("Practise again", "تدرّب مجددًا") : gradeLabel(h.sub.grade, tr)}</span> : <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[st]}`} data-testid="lms-hw-status">{statusLabel(st, tr)}</span>}
                        </div>
                        {h.sub?.liked && <p className="mt-2 text-sm">❤️ {tr("Your teacher liked this", "أعجب معلمك بهذا")}</p>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
            {!hwOnly && <><section id="tracker" className={card + " scroll-mt-28"}>
              <h2 className="text-xl font-bold">📈 {tr("My Quran tracker", "متابعة حفظي")}</h2>
              {(dash.tracker || []).length === 0 ? (
                <p className="mt-2 opacity-70">{tr("Approved Quran homework will appear here.", "سيظهر هنا واجب القرآن المقبول.")}</p>
              ) : (
                <div className="mt-3 space-y-3"><TrackerEntries rows={dash.tracker!} surahName={surahName} /><CriteriaChart rows={dash.tracker!} /></div>
              )}
            </section>
            <Certificates tracker={dash.tracker || []} student={actor?.name || ""} />
            {dash.leaderboard && <Leaderboard />}</>}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {canAssign && !creating && <button type="button" className={primaryBtn} onClick={() => setCreating(true)} data-testid="lms-new-hw">+ {tr("New homework", "واجب جديد")}</button>}
              <DlGate kind="export"><button
                type="button"
                className={smallBtn}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await exportAllHomeworkZip(asAdmin).catch((e) => setErr(lmsErrorText(e, tr)));
                  setBusy(false);
                }}
                data-testid="lms-export-zip"
              >
                ⬇ {busy ? "…" : tr("Export all homework (ZIP)", "تصدير كل الواجبات (ZIP)")}
              </button></DlGate>
              <span className="text-sm opacity-70">{(dash.classes || []).map((c) => `${c.cls || "—"}: ${c.students}`).join(" · ")}</span>
            </div>
            {!hwOnly && <div className={card + " py-3"}><LeaderboardSetting /></div>}
            {creating && (
              <HomeworkEditor classes={dash.classes || []} students={dash.students || []} catalog={dash.catalog} scope={dash.scope} asAdmin={asAdmin} kinds={(dash as { quran?: { add: boolean } }).quran && !(dash as { quran?: { add: boolean } }).quran!.add ? ["general"] : ["quran", "general"]} onCancel={() => setCreating(false)} onSaved={(id) => router.push(`/lms/homework?id=${id}`)} />
            )}
            {hwOnly && staff ? (
              <section id="homework" className="scroll-mt-28 space-y-4" data-testid="hw-hub">
                <div className="flex flex-wrap gap-2" role="tablist" data-testid="hw-hub-tabs">
                  {([["quran", "📖", "Quran", "القرآن"], ["general", "📝", "General", "عام"], ["assigned", "📋", "Assigned Homework", "الواجبات المسندة"], ["corrected", "✅", "Corrected Homework", "الواجبات المصحَّحة"]] as const).filter(([id]) => id !== "quran" || qOk).map(([id, ic, en, ar]) => (
                    <button key={id} type="button" role="tab" aria-selected={hubTab === id} onClick={() => setHubTab(id)} className={`rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition ${hubTab === id ? "bg-header text-white" : "bg-white text-[#1b2f44] hover:bg-sun/50 dark:bg-white/10 dark:text-white"}`} data-testid={`hw-tab-${id}`}>{ic} {tr(en, ar)}</button>
                  ))}
                </div>
                {hubTab === "quran" && qOk ? <QuranHomework /> : hubTab === "corrected" ? (
                  <div className="space-y-3">
                    <div className="flex gap-2" role="tablist" data-testid="corr-sub-tabs">
                      {qOk && <button type="button" role="tab" aria-selected={corrSub === "quran"} onClick={() => setCorrSub("quran")} className={`rounded-full px-3 py-1.5 text-sm font-bold ${corrSub === "quran" ? "bg-sun text-[#0b1b2b]" : "bg-black/5 dark:bg-white/10"}`} data-testid="corr-sub-quran">📖 {tr("Quran", "القرآن")}</button>}
                      <button type="button" role="tab" aria-selected={corrSub === "general" || !qOk} onClick={() => setCorrSub("general")} className={`rounded-full px-3 py-1.5 text-sm font-bold ${corrSub === "general" || !qOk ? "bg-sun text-[#0b1b2b]" : "bg-black/5 dark:bg-white/10"}`} data-testid="corr-sub-general">📝 {tr("General", "عام")}</button>
                    </div>
                    {corrSub === "quran" && qOk ? <CorrectedList asAdmin={false} /> : (() => { const rows = dash.homework.filter((h) => h.kind !== "quran" && ((h.counts || {}).approved || 0) > 0); return rows.length ? (<>
              <ul className="space-y-2">
                {rows.map((h) => {
                  const c = h.counts || {};
                  const q = h.data as QuranData;
                  return (
                    <li key={h.id}>
                      <a href={`/lms/homework?id=${h.id}`} className={card + " flex flex-wrap items-center gap-3 hover:shadow-lg"} data-testid="lms-hw-row">
                        <span className="text-2xl" aria-hidden>{h.kind === "quran" ? "📖" : "📝"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold" dir="auto">{h.title}</span>
                          <span className="block text-sm opacity-75">
                            {h.kind === "quran" ? `${surahName(q.surah)} ${q.from}–${q.to} · ` : ""}
                            {h.students.length ? tr(`${h.students.length} students`, `${h.students.length} طلاب`) : [h.cls, h.section].filter(Boolean).join(" · ") || tr("All students", "كل الطلاب")}
                            {h.due ? ` · ${tr("due", "التسليم")} ${new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-1 text-xs font-bold">
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.submitted}`} data-testid="lms-count-submitted">{Math.max(0, (c.submitted || 0) - (c.waiting || 0))} {tr("to review", "للمراجعة")}</span>
                          {(c.waiting || 0) > 0 && <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900" data-testid="lms-count-waiting">💬 {c.waiting} {tr("waiting for student", "بانتظار الطالب")}</span>}
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.approved}`}>{c.approved || 0} ✓</span>
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.none}`}>{h.assigned ?? 0} {tr("assigned", "مُسند")}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
                    </>) : <p className={card + " opacity-80"} data-testid="corr-general-empty">{tr("No corrected general homework yet.", "لا توجد واجبات عامة مصحّحة بعد.")}</p>; })()}
                  </div>
                ) : (() => {
                  const open2 = (h: (typeof dash.homework)[number]) => { const c = h.counts || {}; return !((c.waiting || 0) > 0 && (c.submitted || 0) - (c.waiting || 0) <= 0); };
                  const rows = dash.homework.filter((h) => hubTab === "assigned" || (h.kind !== "quran" && open2(h)));
                  return (<>
                    {hubTab === "general" && <p className="text-sm opacity-70" data-testid="hw-hub-note">{tr("Homework you have commented on moves to “Assigned Homework” until the student responds.", "الواجب الذي علّقت عليه ينتقل إلى «الواجبات المسندة» حتى يرد الطالب.")}</p>}
                    {rows.length === 0 && <p className={card + " opacity-80"} data-testid="hw-hub-empty">{tr("Nothing here right now.", "لا شيء هنا الآن.")}</p>}
              <ul className="space-y-2">
                {rows.map((h) => {
                  const c = h.counts || {};
                  const q = h.data as QuranData;
                  return (
                    <li key={h.id}>
                      <a href={`/lms/homework?id=${h.id}`} className={card + " flex flex-wrap items-center gap-3 hover:shadow-lg"} data-testid="lms-hw-row">
                        <span className="text-2xl" aria-hidden>{h.kind === "quran" ? "📖" : "📝"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold" dir="auto">{h.title}</span>
                          <span className="block text-sm opacity-75">
                            {h.kind === "quran" ? `${surahName(q.surah)} ${q.from}–${q.to} · ` : ""}
                            {h.students.length ? tr(`${h.students.length} students`, `${h.students.length} طلاب`) : [h.cls, h.section].filter(Boolean).join(" · ") || tr("All students", "كل الطلاب")}
                            {h.due ? ` · ${tr("due", "التسليم")} ${new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-1 text-xs font-bold">
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.submitted}`} data-testid="lms-count-submitted">{Math.max(0, (c.submitted || 0) - (c.waiting || 0))} {tr("to review", "للمراجعة")}</span>
                          {(c.waiting || 0) > 0 && <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900" data-testid="lms-count-waiting">💬 {c.waiting} {tr("waiting for student", "بانتظار الطالب")}</span>}
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.approved}`}>{c.approved || 0} ✓</span>
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.none}`}>{h.assigned ?? 0} {tr("assigned", "مُسند")}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
                  </>);
                })()}
              </section>
            ) : (
            <section id="homework" className="scroll-mt-28">
              <h2 className="mb-3 text-xl font-bold">{tr("Homework", "الواجبات")} ({dash.homework.length})</h2>
              {dash.homework.length === 0 && <p className={card + " opacity-80"}>{tr("No homework yet.", "لا توجد واجبات بعد.")}</p>}
              {(() => { const rows = dash.homework; return (
              <ul className="space-y-2">
                {rows.map((h) => {
                  const c = h.counts || {};
                  const q = h.data as QuranData;
                  return (
                    <li key={h.id}>
                      <a href={`/lms/homework?id=${h.id}`} className={card + " flex flex-wrap items-center gap-3 hover:shadow-lg"} data-testid="lms-hw-row">
                        <span className="text-2xl" aria-hidden>{h.kind === "quran" ? "📖" : "📝"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold" dir="auto">{h.title}</span>
                          <span className="block text-sm opacity-75">
                            {h.kind === "quran" ? `${surahName(q.surah)} ${q.from}–${q.to} · ` : ""}
                            {h.students.length ? tr(`${h.students.length} students`, `${h.students.length} طلاب`) : [h.cls, h.section].filter(Boolean).join(" · ") || tr("All students", "كل الطلاب")}
                            {h.due ? ` · ${tr("due", "التسليم")} ${new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-1 text-xs font-bold">
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.submitted}`} data-testid="lms-count-submitted">{Math.max(0, (c.submitted || 0) - (c.waiting || 0))} {tr("to review", "للمراجعة")}</span>
                          {(c.waiting || 0) > 0 && <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900" data-testid="lms-count-waiting">💬 {c.waiting} {tr("waiting for student", "بانتظار الطالب")}</span>}
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.approved}`}>{c.approved || 0} ✓</span>
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.none}`}>{h.assigned ?? 0} {tr("assigned", "مُسند")}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
              ); })()}
            </section>
            )}
          </>
        )}
      </div>
    </AssessmentShell>
  );
}
