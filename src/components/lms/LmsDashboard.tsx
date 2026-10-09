"use client";


import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { Certificates, Leaderboard, LeaderboardSetting, ProgressCard, RevisionList } from "@/components/lms/Progress";
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

export function LmsDashboard() {
  const { tr, lang } = useTr();
  const router = useRouter();
  const { actor, asAdmin, ready, adminElsewhere } = useLmsActor();
  const [dash, setDash] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
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
    load();
    quranChapters().then(setChapters);
  }, [ready, actor, load, router]);

  const surahName = (n: number) => chapters.find((c) => c.id === n)?.[lang === "ar" ? "name_arabic" : "name_simple"] || `${tr("Surah", "سورة")} ${n}`;
  const staff = actor?.role === "teacher" || actor?.role === "admin";
  const canAssign = actor?.role === "admin" || actor?.perms.includes("assign");

  if (ready && !actor) return <NeedLogin adminElsewhere={adminElsewhere} />;

  return (
    <AssessmentShell
      title={staff ? tr("Teacher dashboard", "لوحة المعلم") : tr("My homework", "واجباتي")}
      exitHref="/"
      wide
      toolbar={actor ? <LmsStaffToolbar /> : undefined}
    >
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 py-5 sm:px-6" data-testid="lms-dashboard">
        {actor && (
          <div className="relative overflow-hidden rounded-3xl bg-header px-6 py-6 text-white shadow-[0_18px_40px_-24px_rgba(10,25,40,0.8)]">
            <div aria-hidden className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-sun/30 blur-2xl" />
            <p className="relative text-2xl font-extrabold !text-white sm:text-3xl" data-testid="lms-hello">{tr("Assalamu alaikum", "السلام عليكم")}, <span dir="auto">{actor.name}</span> 👋</p>
            <p className="relative mt-1 text-sm text-white/75">{staff ? tr("Here is your class at a glance.", "هذه نظرة سريعة على صفك.") : tr("Keep going — every verse counts.", "استمر — كل آية لها أجر.")}</p>
          </div>
        )}
        {dash && <DashStats items={staff ? [
          { label: tr("Students", "الطلاب"), value: (dash.students || []).length, icon: "🎒" },
          { label: tr("Classes", "الصفوف"), value: (dash.classes || []).length, icon: "🏫" },
          { label: tr("Homework", "الواجبات"), value: dash.homework.length, icon: "📚" },
          { label: tr("To review", "للمراجعة"), value: dash.homework.reduce((n, h) => n + (Number((h.counts as Record<string, number> | undefined)?.submitted) || 0), 0), icon: "📝", hot: true },
        ] : [
          { label: tr("Homework", "الواجبات"), value: dash.homework.length, icon: "📚" },
          { label: tr("To do", "للإنجاز"), value: dash.homework.filter((h) => !h.locked && (!h.sub || h.sub.status === "draft" || h.sub.status === "returned")).length, icon: "✏️", hot: true },
          { label: tr("Passed", "مُجتاز"), value: dash.homework.filter((h) => h.sub?.status === "approved").length, icon: "✅" },
          { label: tr("Surahs tracked", "سور في المتابعة"), value: (dash.tracker || []).length, icon: "📖" },
        ]} />}
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
        {!dash ? (
          <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : !staff ? (
          <>
            {dash.progress && <ProgressCard p={dash.progress} />}
            <RevisionList tracker={dash.tracker || []} onChange={(t) => setDash({ ...dash, tracker: t })} />
            <section>
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
            <section className={card}>
              <h2 className="text-xl font-bold">📈 {tr("My Quran tracker", "متابعة حفظي")}</h2>
              {(dash.tracker || []).length === 0 ? (
                <p className="mt-2 opacity-70">{tr("Approved Quran homework will appear here.", "سيظهر هنا واجب القرآن المقبول.")}</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2" data-testid="lms-tracker">
                  {dash.tracker!.map((t, i) => (
                    <li key={i} className={`rounded-2xl px-3 py-2 text-sm font-semibold ${GRADE_STYLE[t.grade || "green"]}`} title={gradeLabel(t.grade || "green", tr)} data-testid="lms-tracker-row" data-grade={t.grade || "green"}>
                      {t.grade === "red" ? "🔴" : t.grade === "yellow" ? "🟡" : "🟢"} {surahName(t.surah)} {t.from}–{t.to}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Certificates tracker={dash.tracker || []} student={actor?.name || ""} />
            {dash.leaderboard && <Leaderboard />}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {canAssign && !creating && <button type="button" className={primaryBtn} onClick={() => setCreating(true)} data-testid="lms-new-hw">+ {tr("New homework", "واجب جديد")}</button>}
              <button
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
              </button>
              <a className={smallBtn} href="/lms/activities" data-testid="lms-classroom-link">🎲 {tr("Classroom activities", "الأنشطة الصفية")}</a>
              <a className={smallBtn} href="/lms/map" data-testid="lms-map-link">🗺️ {tr("Class Quran map", "خريطة القرآن للصف")}</a>
              <span className="text-sm opacity-70">{(dash.classes || []).map((c) => `${c.cls || "—"}: ${c.students}`).join(" · ")}</span>
            </div>
            <div className={card + " py-3"}><LeaderboardSetting /></div>
            {creating && (
              <HomeworkEditor classes={dash.classes || []} students={dash.students || []} catalog={dash.catalog} scope={dash.scope} asAdmin={asAdmin} onCancel={() => setCreating(false)} onSaved={(id) => router.push(`/lms/homework?id=${id}`)} />
            )}
            <section>
              <h2 className="mb-3 text-xl font-bold">{tr("Homework", "الواجبات")} ({dash.homework.length})</h2>
              {dash.homework.length === 0 && <p className={card + " opacity-80"}>{tr("No homework yet.", "لا توجد واجبات بعد.")}</p>}
              <ul className="space-y-2">
                {dash.homework.map((h) => {
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
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.submitted}`} data-testid="lms-count-submitted">{c.submitted || 0} {tr("to review", "للمراجعة")}</span>
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.approved}`}>{c.approved || 0} ✓</span>
                          <span className={`rounded-full px-2 py-1 ${STATUS_STYLE.none}`}>{h.assigned ?? 0} {tr("assigned", "مُسند")}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </AssessmentShell>
  );
}

function DashStats({ items }: { items: { label: string; value: number; icon: string; hot?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="lms-dash-stats">
      {items.map((x) => (
        <div key={x.label} className={`flex items-center gap-3 rounded-3xl border px-4 py-4 shadow-sm backdrop-blur ${x.hot && x.value > 0 ? "border-sun bg-sun/15" : "border-black/10 bg-white/70 dark:border-white/15 dark:bg-white/5"}`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/5 text-xl dark:bg-white/10" aria-hidden>{x.icon}</span>
          <span className="min-w-0"><span className="block text-2xl font-extrabold leading-none">{x.value}</span><span className="mt-1 block truncate text-xs font-semibold opacity-70">{x.label}</span></span>
        </div>
      ))}
    </div>
  );
}
