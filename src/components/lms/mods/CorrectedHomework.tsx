"use client";

import { useEffect, useMemo, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { cardCls, ClassSelect, Head, useRoster } from "@/components/lms/mods/ModUi";
import { ScoreBadges, ScoreGrader } from "@/components/lms/QuranScores";
import { GRADE_STYLE, gradeLabel, useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, quranChapters, type Chapter, type CorrectedItem } from "@/lib/lms";
import { qhwPerm } from "@/lib/lmsMods";

/** Teacher page: graded ("corrected") Quran homework. */
export function CorrectedHomeworkPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  const p = qhwPerm(actor?.perms);
  return (
    <AssessmentShell title={tr("Corrected homework", "الواجبات المصحَّحة")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-6" data-testid="corrected-page">
        {!ready ? null : !actor || actor.role !== "teacher" ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in as a teacher.", "سجّل الدخول كمعلم.")} <a className="font-bold underline" href="/lms/login/">{tr("Sign in", "دخول")}</a></p>
          : !p.show || !p.view ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("You don't have access to Quran Homework.", "ليس لديك صلاحية لواجب القرآن.")}</p>
          : <CorrectedList asAdmin={false} />}
      </div>
    </AssessmentShell>
  );
}

/** Shared list (teacher page and admin): grade, date, student, group filter, open to edit the grade or reopen. */
export function CorrectedList({ asAdmin }: { asAdmin: boolean }) {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<CorrectedItem[] | null>(null);
  const [err, setErr] = useState("");
  const [grp, setGrp] = useState("");
  const [grade, setGrade] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const { groups } = useRoster(asAdmin);
  useEffect(() => {
    lmsApi.corrected(asAdmin).then((r) => setItems(r.items)).catch((e) => { setErr(lmsErrorText(e, tr)); setItems([]); });
    quranChapters().then(setChapters).catch(() => undefined);
  }, [asAdmin, tr]);
  const shown = useMemo(() => {
    const g = groups.find((x) => x.key === grp);
    return (items || []).filter((x) => (!g || g.ids.includes(x.student)) && (!grade || x.grade === grade));
  }, [items, groups, grp, grade]);
  const [edit, setEdit] = useState("");
  const [msg, setMsg] = useState("");
  const reload = () => lmsApi.corrected(asAdmin).then((r) => setItems(r.items)).catch(() => undefined);
  const review = async (id: string, patch: Parameters<typeof lmsApi.review>[1], ok: string) => {
    try { await lmsApi.review(id, patch, asAdmin); setMsg(ok); setEdit(""); reload(); } catch (e) { setMsg(lmsErrorText(e, tr)); }
  };
  const sn = (n: number) => chapters.find((c) => c.id === n)?.name_simple || `Surah ${n}`;
  return (
    <div className="space-y-3">
      <Head icon="✅" title={tr("Corrected homework", "الواجبات المصحَّحة")} sub={tr("Quran homework you have graded. Open one to edit the grade or reopen it for the student.", "واجبات القرآن التي قيّمتها. افتح واجبًا لتعديل التقييم أو إعادة فتحه للطالب.")} />
      {groups.length > 0 && <ClassSelect groups={groups} value={grp} onChange={setGrp} all={tr("All groups", "كل المجموعات")} testId="corr-group" />}
      <div className="flex flex-wrap gap-1.5" data-testid="corr-grade-filter">
        {["", "green", "yellow", "red"].map((g) => <button key={g || "all"} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)} className={`rounded-full px-3 py-1 text-xs font-bold ${grade === g ? "ring-2 ring-header" : ""} ${g ? GRADE_STYLE[g] : "bg-black/5 dark:bg-white/10"}`}>{g ? gradeLabel(g, tr) : tr("All grades", "كل التقييمات")}</button>)}
      </div>
      {msg && <p className="rounded-xl bg-emerald-100 px-4 py-2 font-bold text-emerald-900" role="status" data-testid="corr-msg">{msg}</p>}
      {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
      {items === null ? <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p> : shown.length === 0 ? <p className={cardCls + " text-center opacity-70"} data-testid="corr-empty">{tr("No corrected homework yet.", "لا توجد واجبات مصحّحة بعد.")}</p> : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="corr-list">
          {shown.map((x) => (
            <li key={x.id} className={cardCls + " space-y-1.5"} data-testid="corr-item">
              <div className="flex flex-wrap items-center gap-2">
                <b dir="auto">{x.name}</b>
                <span className="text-xs opacity-60">{[x.cls, x.section].filter(Boolean).join(" · ")}</span>
                <span className="flex-1" />
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_STYLE[x.grade] || ""}`} data-testid="corr-grade">{gradeLabel(x.grade, tr)}</span>
              </div>
              <p className="text-sm font-semibold" dir="auto">📖 {x.title} <span className="font-normal opacity-70">· {sn(x.data?.surah)} {x.data?.from}–{x.data?.to}</span></p>
              <ScoreBadges s={x.scores} compact />
              <p className="text-xs opacity-70">🗓 {new Date(x.gradedAt).toLocaleString(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}{x.by ? ` · ${x.by}` : ""}{x.status === "returned" ? ` · ${tr("sent back to practise", "أُعيد للتدرّب")}` : ""}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex rounded-full bg-header px-3 py-1 text-xs font-bold text-white" aria-expanded={edit === x.id} onClick={() => setEdit(edit === x.id ? "" : x.id)} data-testid="corr-edit">✎ {tr("Edit grade", "تعديل التقييم")}</button>
                {x.status === "approved" && <button type="button" className="inline-flex rounded-full bg-black/5 px-3 py-1 text-xs font-bold dark:bg-white/10" onClick={() => { if (confirm(tr("Reopen this homework? The student will be asked to practise and submit again.", "إعادة فتح هذا الواجب؟ سيُطلب من الطالب التدرّب والتسليم مجددًا."))) review(x.id, { status: "returned" }, tr("Reopened — the student can submit again.", "أُعيد فتحه — يمكن للطالب التسليم مجددًا.")); }} data-testid="corr-reopen">↺ {tr("Reopen", "إعادة فتح")}</button>}
                {!asAdmin && <a className="inline-flex rounded-full bg-black/5 px-3 py-1 text-xs font-bold dark:bg-white/10" href={`/lms/homework?id=${x.hw}#corrected`} data-testid="corr-open">📖 {tr("Open homework", "فتح الواجب")}</a>}
              </div>
              {edit === x.id && <ScoreGrader asAdmin={asAdmin} onSubmit={(sc) => review(x.id, { scores: sc }, tr("✅ Grade updated.", "✅ تم تحديث التقييم."))} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
