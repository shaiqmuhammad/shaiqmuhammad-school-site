"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { exportAllHomeworkZip } from "@/components/lms/lmsFiles";
import { STATUS_STYLE, card, smallBtn, statusLabel, useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSignOut, quranChapters, type Chapter, type QuranData } from "@/lib/lms";

type Dash = Awaited<ReturnType<typeof lmsApi.dashboard>>;

/** Student dashboard (homework + Quran tracker) or teacher/admin dashboard (assign + review). */
export function LmsDashboard() {
  const { tr, lang } = useTr();
  const router = useRouter();
  const { actor, asAdmin, ready } = useLmsActor();
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
    if (!actor) {
      router.replace("/lms/login");
      return;
    }
    load();
    quranChapters().then(setChapters);
  }, [ready, actor, load, router]);

  const surahName = (n: number) => chapters.find((c) => c.id === n)?.[lang === "ar" ? "name_arabic" : "name_simple"] || `${tr("Surah", "سورة")} ${n}`;
  const staff = actor?.role === "teacher" || actor?.role === "admin";
  const canAssign = actor?.role === "admin" || actor?.perms.includes("assign");

  return (
    <AssessmentShell
      title={staff ? tr("Teacher dashboard", "لوحة المعلم") : tr("My homework", "واجباتي")}
      exitHref={asAdmin ? "/admin" : "/"}
      wide
      toolbar={staff ? <LmsStaffToolbar /> : undefined}
      actions={
        actor && !asAdmin && !staff ? (
          <button type="button" className="rounded-full border border-white/25 px-3 py-1 text-sm font-semibold text-white hover:bg-white/10" onClick={() => { lmsSignOut(); router.push("/lms/login"); }} data-testid="lms-signout">
            {tr("Sign out", "خروج")}
          </button>
        ) : null
      }
    >
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 py-5 sm:px-6" data-testid="lms-dashboard">
        {actor && <p className="text-2xl font-bold" data-testid="lms-hello">{tr("Assalamu alaikum", "السلام عليكم")}, <span dir="auto">{actor.name}</span> 👋</p>}
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
        {!dash ? (
          <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : !staff ? (
          <>
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
                            {h.due && <p className="text-sm opacity-70">{tr("Due", "التسليم")} {new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}</p>}
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[st]}`} data-testid="lms-hw-status">{statusLabel(st, tr)}</span>
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
                    <li key={i} className="rounded-2xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                      ✅ {surahName(t.surah)} {t.from}–{t.to}
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
              {(asAdmin || actor?.perms.includes("manageUsers")) && <a className={smallBtn} href="/lms/admin">👥 {tr("Students & teachers", "الطلاب والمعلمون")}</a>}
              <span className="text-sm opacity-70">{(dash.classes || []).map((c) => `${c.cls || "—"}: ${c.students}`).join(" · ")}</span>
            </div>
            {creating && (
              <HomeworkEditor classes={dash.classes || []} students={dash.students || []} asAdmin={asAdmin} onCancel={() => setCreating(false)} onSaved={(id) => router.push(`/lms/homework?id=${id}`)} />
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
                            {h.students.length ? tr(`${h.students.length} students`, `${h.students.length} طلاب`) : h.cls || tr("All students", "كل الطلاب")}
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
