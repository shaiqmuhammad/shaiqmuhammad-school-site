"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { NeedLogin } from "@/components/lms/LmsDashboard";
import { Certificates, ProgressCard, QuranMap, StudentProgress, TrackerBadges } from "@/components/lms/Progress";
import { GRADE_STYLE, STATUS_STYLE, card, gradeLabel, smallBtn, statusLabel, useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, type Catalog } from "@/lib/lms";

function StaffFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const { tr } = useTr();
  const { actor, ready, adminElsewhere } = useLmsActor();
  if (ready && !actor) return <NeedLogin adminElsewhere={adminElsewhere} />;
  if (ready && actor?.role === "student") return <AssessmentShell title={title} exitHref="/lms"><p className={card + " m-6"}>{tr("This page is for teachers.", "هذه الصفحة للمعلمين.")}</p></AssessmentShell>;
  return (
    <AssessmentShell title={title} exitHref="/lms" wide toolbar={actor ? <LmsStaffToolbar /> : undefined}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-3 py-5 sm:px-6">
        <Link href="/lms" className={smallBtn}>← {tr("Dashboard", "اللوحة")}</Link>
        {ready && actor && children}
      </div>
    </AssessmentShell>
  );
}

export function LmsMapPage() {
  const { tr } = useTr();
  const [cat, setCat] = useState<{ catalog?: Catalog; scope?: string[] } | null>(null);
  const { actor } = useLmsActor();
  useEffect(() => { if (actor) lmsApi.dashboard().then((d) => setCat({ catalog: d.catalog, scope: d.scope })).catch(() => setCat({})); }, [actor]);
  const scope = cat?.scope || [];
  const classes = (cat?.catalog?.classes || []).map((c) => c.name).filter((c) => !scope.length || scope.some((x) => x.split("|")[0] === c));
  return (
    <StaffFrame title={tr("Class Quran map", "خريطة القرآن للصف")}>
      {cat && <QuranMap classes={classes} sections={(cat.catalog?.sections || []).map((s) => ({ cls: s.cls, name: s.name }))} />}
    </StaffFrame>
  );
}

export function LmsStudentPage() {
  const { tr } = useTr();
  const id = useSearchParams().get("id") || "";
  return <StaffFrame title={tr("Student progress", "تقدم الطالب")}>{id && <StudentProgress id={id} />}</StaffFrame>;
}

/** Public read-only parent view (secret link, no login). */
export function LmsParentPage() {
  const { tr } = useTr();
  const t = useSearchParams().get("t") || "";
  const [d, setD] = useState<Awaited<ReturnType<typeof lmsApi.parent>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (t) lmsApi.parent(t).then(setD).catch((e) => setErr(lmsErrorText(e, tr))); }, [t, tr]);
  return (
    <AssessmentShell title={tr("Parent view", "صفحة ولي الأمر")} exitHref="/" wide>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-3 py-5 sm:px-6" data-testid="lms-parent">
        {!t || err ? <p className={card}>{tr("This link is not valid or was turned off. Please ask the teacher for a new link.", "هذا الرابط غير صالح أو تم إيقافه. يرجى طلب رابط جديد من المعلم.")}</p> : !d ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : (
          <>
            <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-2xl font-bold" dir="auto">{d.name}</h2><span className="opacity-60">{[d.cls, d.section].filter(Boolean).join(" · ")}</span><span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">👁 {tr("read-only", "للعرض فقط")}</span></div>
            <ProgressCard p={d.progress} />
            <section className={card + " space-y-2"}><h3 className="text-lg font-bold">📈 {tr("Quran tracker", "متابعة الحفظ")}</h3><TrackerBadges tracker={d.tracker} /></section>
            <Certificates tracker={d.tracker} student={d.name} />
            <section className={card + " space-y-2"}>
              <h3 className="text-lg font-bold">📚 {tr("Homework", "الواجبات")}</h3>
              <ul className="divide-y divide-black/5 dark:divide-white/10">
                {d.homework.map((h) => (
                  <li key={h.id} className="space-y-1 py-2" data-testid="parent-hw">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" dir="auto">{h.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[h.status] || ""}`}>{statusLabel(h.status as "none", tr)}</span>
                      {h.grade && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLE[h.grade]}`}>{gradeLabel(h.grade, tr)}</span>}
                      {h.late && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">⏰ {tr("Late", "متأخر")}</span>}
                      {h.due && <span className="text-xs opacity-60">{tr("due", "التسليم")} {new Date(h.due).toLocaleDateString()}</span>}
                    </div>
                    {h.comments.map((c, i) => <p key={i} className="text-sm opacity-80" dir="auto">💬 <b>{c.by}:</b> {c.text}</p>)}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </AssessmentShell>
  );
}
