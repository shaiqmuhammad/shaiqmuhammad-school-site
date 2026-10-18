"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { Avatar } from "@/components/lms/Avatar";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { Tabs } from "@/components/lms/mods/ModUi";
import { GRADE_STYLE, STATUS_STYLE, card, gradeLabel, statusLabel, useLmsActor, useTr } from "@/components/lms/useLms";
import { quranChapters, type Chapter, type Homework, type QuranData, type TrackerRow, type WallPost } from "@/lib/lms";
import { modCall, modErr, type CurUnit } from "@/lib/lmsMods";

type Kid = { id: string; name: string; cls: string; section: string; avatar: string };
type HwRow = Homework & { sub?: { status: string; grade?: string; liked?: boolean } | null; locked?: boolean; late?: boolean };
type Dash = { homework: HwRow[]; tracker?: TrackerRow[]; progress?: { stars: number; streak: number; greens: number; yellows: number; handed: number; badges: string[]; activeDays: number } };
type Sec = "overview" | "homework" | "assess" | "cur" | "att" | "beh" | "quran" | "wall";

const dt = (n: number, ar: boolean) => new Date(n).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Parent dashboard: read-only view of each linked child. The server only ever answers for the parent's own linked children. */
export function FamilyPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  return (
    <AssessmentShell title={tr("Parent Dashboard", "لوحة ولي الأمر")} exitHref="/lms/family" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 py-6 sm:px-6" data-testid="family">
        {!ready ? null : !actor || actor.role !== "parent" ? (
          <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in with your parent account.", "سجّل الدخول بحساب ولي الأمر.")} <a className="font-bold underline" href="/lms/login/">{tr("Sign in", "دخول")}</a></p>
        ) : <Family name={actor.name} />}
      </div>
    </AssessmentShell>
  );
}

function Family({ name }: { name: string }) {
  const { tr, lang } = useTr();
  const ar = lang === "ar";
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [kid, setKid] = useState("");
  const [sec, setSec] = useState<Sec>("overview");
  const [err, setErr] = useState("");
  useEffect(() => {
    modCall<{ children: Kid[] }>("par-children", undefined, false).then((r) => { setKids(r.children); setKid((k) => k || r.children[0]?.id || ""); }).catch((e) => { setKids([]); setErr(modErr(e, tr)); });
  }, [tr]);
  const k = kids?.find((x) => x.id === kid);
  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-header p-5 text-white shadow-lg sm:p-7">
        <p className="text-sm text-white/70">{tr("Welcome", "أهلاً")}</p>
        <h1 className="text-2xl font-extrabold !text-white sm:text-3xl" dir="auto">{name}</h1>
        <p className="mt-1 text-sm text-white/75">{tr("Follow your child's learning, read-only.", "تابع تعلّم ابنك/ابنتك (للعرض فقط).")}</p>
      </section>
      {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
      {kids === null ? <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !kids.length ? (
        <p className={card + " opacity-80"} data-testid="family-empty">{tr("No children are linked to your account yet. Please contact the school.", "لا يوجد أبناء مرتبطون بحسابك بعد. يرجى التواصل مع المدرسة.")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={tr("Children", "الأبناء")} data-testid="family-kids">
            {kids.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={c.id === kid} onClick={() => setKid(c.id)} data-testid="family-kid" className={`flex items-center gap-2 rounded-full py-1.5 pe-4 ps-1.5 font-bold transition ${c.id === kid ? "bg-header text-sun shadow" : "glass"}`}>
                <Avatar code={c.avatar} size={34} /> <span dir="auto">{c.name}</span>
                <span className="text-xs font-semibold opacity-70">{c.cls}{c.section ? ` · ${c.section}` : ""}</span>
              </button>
            ))}
          </div>
          <Tabs<Sec> testId="family-tabs" value={sec} onChange={setSec} items={[["overview", tr("Overview", "نظرة عامة")], ["homework", tr("Homework", "الواجبات")], ["assess", tr("Assessments", "التقييمات")], ["cur", tr("Curriculum", "المنهج")], ["att", tr("Attendance", "الحضور")], ["beh", tr("Behaviour", "السلوك")], ["quran", tr("Quran", "القرآن")], ["wall", tr("Class Wall", "جدار الصف")]]} />
          {k && <Child key={k.id + sec} kid={k} sec={sec} ar={ar} go={setSec} />}
          <a href="/lms/messages" className="inline-flex items-center gap-2 rounded-full bg-[var(--cta)] px-5 py-2.5 font-extrabold text-[var(--cta-foreground)] shadow" data-testid="family-messages">✉️ {tr("Message your child's teachers", "راسل معلمي ابنك/ابنتك")}</a>
        </>
      )}
    </>
  );
}

function useChild<T>(action: string, kid: string, body: object = {}) {
  const [d, setD] = useState<T | null>(null);
  const [bad, setBad] = useState("");
  const { tr } = useTr();
  const key = JSON.stringify(body);
  useEffect(() => { let on = true; modCall<T>(action, { ...JSON.parse(key), child: kid }, false).then((r) => on && setD(r)).catch((e) => { if (on) { setBad(modErr(e, tr)); setD(null); } }); return () => { on = false; }; }, [action, kid, key, tr]);
  return { d, bad };
}

const Empty = ({ t }: { t: string }) => <p className={card + " opacity-75"}>{t}</p>;
const Load = () => { const { tr } = useTr(); return <p className="p-6 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>; };
const Stat = ({ icon, label, value, hot }: { icon: string; label: string; value: string | number; hot?: boolean }) => (
  <div className={`glass rounded-3xl p-4 ${hot ? "ring-2 ring-sun/60" : ""}`}><p className="text-2xl" aria-hidden>{icon}</p><p className="text-2xl font-extrabold">{value}</p><p className="text-xs font-semibold opacity-70">{label}</p></div>
);

function Child({ kid, sec, ar, go }: { kid: Kid; sec: Sec; ar: boolean; go: (s: Sec) => void }) {
  if (sec === "overview") return <Overview kid={kid} ar={ar} go={go} />;
  if (sec === "homework") return <Homeworks kid={kid} ar={ar} />;
  if (sec === "assess") return <Assess kid={kid} ar={ar} />;
  if (sec === "cur") return <Cur kid={kid} />;
  if (sec === "att") return <Att kid={kid} ar={ar} />;
  if (sec === "beh") return <Beh kid={kid} ar={ar} />;
  if (sec === "quran") return <Quran kid={kid} ar={ar} />;
  return <Wall kid={kid} ar={ar} />;
}

function Overview({ kid, ar, go }: { kid: Kid; ar: boolean; go: (s: Sec) => void }) {
  const { tr } = useTr();
  const dash = useChild<Dash>("dashboard", kid.id);
  const att = useChild<{ pct: number | null }>("par-att", kid.id);
  const beh = useChild<{ total: number }>("par-beh", kid.id);
  const hw = dash.d?.homework || [];
  const todo = hw.filter((h) => !h.locked && (!h.sub || h.sub.status === "draft" || h.sub.status === "returned")).length;
  void ar;
  return (
    <div className="space-y-4" data-testid="family-overview">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="📚" label={tr("Homework", "الواجبات")} value={dash.d ? hw.length : "…"} />
        <Stat icon="✏️" label={tr("Still to do", "المتبقي")} value={dash.d ? todo : "…"} hot />
        <Stat icon="📅" label={tr("Attendance", "الحضور")} value={att.d ? (att.d.pct == null ? "–" : `${att.d.pct}%`) : "…"} />
        <Stat icon="⭐" label={tr("Behaviour points", "نقاط السلوك")} value={beh.d ? beh.d.total : "…"} />
      </div>
      <div className="flex flex-wrap gap-2">
        {([["homework", "📝 " + tr("Homework", "الواجبات")], ["assess", "🧪 " + tr("Assessments & results", "التقييمات والنتائج")], ["quran", "📖 " + tr("Quran tracker", "متابعة القرآن")], ["att", "📅 " + tr("Attendance", "الحضور")]] as [Sec, string][]).map(([s, l]) => <button key={s} type="button" onClick={() => go(s)} className="glass rounded-full px-4 py-2 font-bold">{l}</button>)}
      </div>
    </div>
  );
}

function Homeworks({ kid, ar }: { kid: Kid; ar: boolean }) {
  const { tr } = useTr();
  const { d, bad } = useChild<Dash>("dashboard", kid.id);
  const chapters = useChapters();
  if (bad) return <Empty t={bad} />;
  if (!d) return <Load />;
  if (!d.homework.length) return <Empty t={tr("No homework yet.", "لا توجد واجبات بعد.")} />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="family-hw">
      {d.homework.map((h) => {
        const st = h.sub?.status || "none"; const q = h.data as QuranData;
        return (
          <li key={h.id} className={card}>
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>{h.kind === "quran" ? "📖" : "📝"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold" dir="auto">{h.title}</p>
                {h.kind === "quran" && <p className="text-sm opacity-80">{chapters.find((c) => c.id === q.surah)?.name_simple || `Surah ${q.surah}`} · {q.from}–{q.to}</p>}
                {h.due && <p className="text-sm opacity-70">{tr("Due", "التسليم")} {dt(h.due, ar)}</p>}
              </div>
              {h.sub?.grade ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_STYLE[h.sub.grade] || ""}`}>{gradeLabel(h.sub.grade, tr)}</span> : <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[st] || "bg-black/10"}`}>{statusLabel(st, tr)}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function useChapters() {
  const [c, setC] = useState<Chapter[]>([]);
  useEffect(() => { quranChapters().then(setC).catch(() => undefined); }, []);
  return c;
}

function Assess({ kid, ar }: { kid: Kid; ar: boolean }) {
  const { tr } = useTr();
  const { d, bad } = useChild<{ items: { quizTitle: string; score: number; maxScore: number; percentage: number; finishedAt: number }[]; assigned: { id: string; title: string; due: number | null }[] }>("par-results", kid.id);
  if (bad) return <Empty t={bad} />;
  if (!d) return <Load />;
  return (
    <div className="space-y-4" data-testid="family-assess">
      <section className={card}>
        <h2 className="mb-2 text-lg font-bold">🧪 {tr("Assigned assessments", "التقييمات المسندة")}</h2>
        {!d.assigned.length ? <p className="opacity-70">{tr("None assigned.", "لا يوجد.")}</p> : <ul className="divide-y divide-black/10 dark:divide-white/10">{d.assigned.map((x) => <li key={x.id} className="flex justify-between gap-3 py-2"><span dir="auto" className="font-semibold">{x.title}</span>{x.due && <span className="text-sm opacity-70">{tr("Due", "التسليم")} {dt(x.due, ar)}</span>}</li>)}</ul>}
      </section>
      <section className={card}>
        <h2 className="mb-2 text-lg font-bold">🏆 {tr("Results", "النتائج")}</h2>
        {!d.items.length ? <p className="opacity-70">{tr("No results yet.", "لا توجد نتائج بعد.")}</p> : (
          <ul className="divide-y divide-black/10 dark:divide-white/10" data-testid="family-results">{d.items.map((x, i) => <li key={i} className="flex items-center justify-between gap-3 py-2"><span dir="auto" className="font-semibold">{x.quizTitle}<span className="block text-xs font-normal opacity-60">{dt(x.finishedAt, ar)}</span></span><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-extrabold text-emerald-900">{x.score}/{x.maxScore} · {Math.round(x.percentage)}%</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

function Cur({ kid }: { kid: Kid }) {
  const { tr } = useTr();
  const { d, bad } = useChild<{ items: CurUnit[]; year?: string }>("cur-list", kid.id);
  const terms = useMemo(() => { const m = new Map<string, CurUnit[]>(); (d?.items || []).forEach((u) => m.set(u.term, [...(m.get(u.term) || []), u])); return [...m.entries()]; }, [d]);
  if (bad) return <Empty t={bad} />;
  if (!d) return <Load />;
  if (!d.items.length) return <Empty t={tr("No curriculum published for this year yet.", "لا يوجد منهج منشور لهذا الصف بعد.")} />;
  const ST: Record<string, [string, string]> = { planned: ["Planned", "مخطط"], in_progress: ["In progress", "قيد التنفيذ"], taught: ["Taught", "تم تدريسه"] };
  return (
    <div className="space-y-4" data-testid="family-cur">
      {terms.map(([t, us]) => (
        <section key={t} className={card}>
          <h2 className="mb-2 text-lg font-bold">{t}</h2>
          <ul className="space-y-2">{us.map((u) => (
            <li key={u.id} className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold" dir="auto">{u.subject ? `${u.subject} · ` : ""}{u.title}</p><span className="rounded-full bg-black/10 px-2.5 py-0.5 text-xs font-bold dark:bg-white/15">{tr(...ST[u.status] as [string, string])}{u.wkFrom ? ` · ${tr("Wk", "أسبوع")} ${u.wkFrom}${u.wkTo && u.wkTo !== u.wkFrom ? `–${u.wkTo}` : ""}` : ""}</span></div>
              {u.objectives && <p className="mt-1 whitespace-pre-line text-sm opacity-80" dir="auto">{u.objectives}</p>}
            </li>
          ))}</ul>
        </section>
      ))}
    </div>
  );
}

function Att({ kid, ar }: { kid: Kid; ar: boolean }) {
  const { tr } = useTr();
  const { d, bad } = useChild<{ counts: Record<string, number>; pct: number | null; items: { day: string; period: string; status: string }[] }>("par-att", kid.id);
  if (bad) return <Empty t={bad} />;
  if (!d) return <Load />;
  const L: Record<string, [string, string, string]> = { P: ["Present", "حاضر", "bg-emerald-100 text-emerald-900"], A: ["Absent", "غائب", "bg-rose-100 text-rose-900"], L: ["Late", "متأخر", "bg-amber-100 text-amber-900"], E: ["Excused", "بعذر", "bg-sky-100 text-sky-900"] };
  return (
    <div className="space-y-4" data-testid="family-att">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon="📅" label={tr("Attendance", "الحضور")} value={d.pct == null ? "–" : `${d.pct}%`} hot />
        {Object.keys(L).map((s) => <Stat key={s} icon={s === "P" ? "✅" : s === "A" ? "❌" : s === "L" ? "⏰" : "📝"} label={tr(L[s][0], L[s][1])} value={d.counts[s] || 0} />)}
      </div>
      {!d.items.length ? <Empty t={tr("No attendance recorded yet.", "لم يُسجَّل حضور بعد.")} /> : (
        <section className={card}><ul className="divide-y divide-black/10 dark:divide-white/10">{d.items.map((x, i) => <li key={i} className="flex items-center justify-between py-2 text-sm"><span>{dt(new Date(x.day).getTime(), ar)} · {x.period}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${L[x.status]?.[2] || ""}`}>{L[x.status] ? tr(L[x.status][0], L[x.status][1]) : x.status}</span></li>)}</ul></section>
      )}
    </div>
  );
}

function Beh({ kid, ar }: { kid: Kid; ar: boolean }) {
  const { tr } = useTr();
  const { d, bad } = useChild<{ total: number; items: { label: string; pts: number; icon: string; at: number }[] }>("par-beh", kid.id);
  if (bad) return <Empty t={bad} />;
  if (!d) return <Load />;
  return (
    <div className="space-y-4" data-testid="family-beh">
      <Stat icon="⭐" label={tr("Total behaviour points", "مجموع نقاط السلوك")} value={d.total} hot />
      {!d.items.length ? <Empty t={tr("No behaviour points yet.", "لا توجد نقاط سلوك بعد.")} /> : (
        <section className={card}><ul className="divide-y divide-black/10 dark:divide-white/10">{d.items.map((x, i) => <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm"><span dir="auto">{x.icon} {x.label}<span className="block text-xs opacity-60">{dt(x.at, ar)}</span></span><span className={`rounded-full px-3 py-1 text-xs font-extrabold ${x.pts >= 0 ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{x.pts > 0 ? "+" : ""}{x.pts}</span></li>)}</ul></section>
      )}
    </div>
  );
}

function Quran({ kid, ar }: { kid: Kid; ar: boolean }) {
  const { tr } = useTr();
  const { d, bad } = useChild<Dash>("dashboard", kid.id);
  const ch = useChapters();
  if (bad) return <Empty t={bad} />;
  if (!d) return <Load />;
  const p = d.progress;
  const rows = d.tracker || [];
  return (
    <div className="space-y-4" data-testid="family-quran">
      {p && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat icon="🌟" label={tr("Stars", "نجوم")} value={p.stars} hot /><Stat icon="🔥" label={tr("Day streak", "أيام متتالية")} value={p.streak} /><Stat icon="🟢" label={tr("Green grades", "درجات خضراء")} value={p.greens} /><Stat icon="📖" label={tr("Surahs tracked", "سور في المتابعة")} value={rows.length} /></div>}
      {!rows.length ? <Empty t={tr("Approved Quran homework will appear here.", "سيظهر هنا واجب القرآن المقبول.")} /> : (
        <section className={card}><h2 className="mb-2 text-lg font-bold">📈 {tr("Quran tracker", "متابعة القرآن")}</h2>
          <ul className="divide-y divide-black/10 dark:divide-white/10">{rows.map((r, i) => <li key={i} className="flex items-center justify-between gap-3 py-2"><span className="font-semibold">{ch.find((c) => c.id === r.surah)?.name_simple || `Surah ${r.surah}`} <span className="text-sm font-normal opacity-70">{r.from}–{r.to}</span><span className="block text-xs font-normal opacity-60">{r.approved ? dt(r.approved, ar) : ""}</span></span>{r.grade && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_STYLE[r.grade] || ""}`}>{gradeLabel(r.grade, tr)}</span>}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

function Wall({ kid, ar }: { kid: Kid; ar: boolean }) {
  const { tr } = useTr();
  const cls = useChild<{ items: { key: string; label: string }[] }>("wall-classes", kid.id);
  const [key, setKey] = useState("");
  const k = key || cls.d?.items[0]?.key || "";
  if (cls.bad) return <Empty t={cls.bad} />;
  if (!cls.d) return <Load />;
  if (!cls.d.items.length) return <Empty t={tr("No class wall yet.", "لا يوجد جدار صف بعد.")} />;
  return (
    <div className="space-y-3" data-testid="family-wall">
      {cls.d.items.length > 1 && <div className="flex flex-wrap gap-2">{cls.d.items.map((i) => <button key={i.key} type="button" onClick={() => setKey(i.key)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${i.key === k ? "bg-header text-sun" : "glass"}`}>{i.label}</button>)}</div>}
      <p className="text-xs font-semibold opacity-60">{tr("View only — liking and commenting are switched off for parents.", "للعرض فقط — الإعجاب والتعليق غير متاحين لأولياء الأمور.")}</p>
      <Posts kid={kid.id} wkey={k} ar={ar} />
    </div>
  );
}

function Posts({ kid, wkey, ar }: { kid: string; wkey: string; ar: boolean }) {
  const { tr } = useTr();
  const { d, bad } = useChild<{ posts: WallPost[] }>("wall-list", kid, { key: wkey });
  if (bad) return <Empty t={bad} />;
  if (!d) return <Load />;
  if (!d.posts.length) return <Empty t={tr("No posts yet.", "لا توجد منشورات بعد.")} />;
  return <>{d.posts.map((p) => (
    <article key={p.id} className={card} data-testid="family-post">
      <p className="text-sm font-bold" dir="auto">{p.pinned ? "📌 " : ""}{p.name} <span className="font-normal opacity-60">· {dt(p.at, ar)}</span></p>
      {p.text && <p className="mt-1 whitespace-pre-line" dir="auto">{p.text}</p>}
      <PostMedia kid={kid} id={p.id} image={p.hasImage} audio={p.hasAudio} />
      <p className="mt-2 text-xs opacity-60">❤️ {p.likes} · 💬 {p.comments.length}</p>
      {p.comments.map((c) => <p key={c.id} className="mt-1 rounded-xl bg-black/[0.04] px-3 py-1.5 text-sm dark:bg-white/5" dir="auto"><b>{c.name}</b> {c.text}</p>)}
    </article>
  ))}</>;
}

function PostMedia({ kid, id, image, audio }: { kid: string; id: string; image: boolean; audio: boolean }) {
  const [m, setM] = useState<{ image: string; audio: string } | null>(null);
  const load = useCallback(() => { if (image || audio) modCall<{ image: string; audio: string }>("wall-media", { id, child: kid }, false).then(setM).catch(() => undefined); }, [id, kid, image, audio]);
  useEffect(() => { load(); }, [load]);
  if (!m) return null;
  return <div className="mt-2 space-y-2">{m.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.image} alt="" className="max-h-96 w-full rounded-2xl bg-black/5 object-contain" />}{m.audio && <audio controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} src={m.audio} className="w-full" />}</div>;
}
