"use client";

import { CriteriaChart, TrackerEntries } from "@/components/lms/QuranScores";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { lmsApi, lmsErrorText, quranChapters, type Chapter, type MapRow, type Progress, type TrackerRow } from "@/lib/lms";
import { GRADE_STYLE, STATUS_STYLE, card, gradeLabel, inputCls, smallBtn, statusLabel, useTr } from "@/components/lms/useLms";

type Tr = (en: string, ar: string) => string;
const BADGES: Record<string, [string, string, string]> = {
  first_step: ["👣", "First hand-in", "أول تسليم"],
  first_green: ["🟢", "First green", "أول أخضر"],
  five_greens: ["🏅", "5 greens", "5 تقييمات خضراء"],
  streak_3: ["🔥", "3-day streak", "3 أيام متتالية"],
  streak_7: ["🌟", "7-day streak", "7 أيام متتالية"],
  fifty_verses: ["📖", "50 verses learned", "50 آية محفوظة"],
  reviser: ["🔁", "Super reviser", "مراجع متميز"],
};

export function useChapters() {
  const [ch, setCh] = useState<Chapter[]>([]);
  useEffect(() => { quranChapters().then(setCh).catch(() => undefined); }, []);
  return ch;
}
const surahLabel = (ch: Chapter[], n: number) => ch.find((c) => c.id === n)?.name_simple || `Surah ${n}`;

/** Streak, stars and badges. */
export function ProgressCard({ p }: { p: Progress }) {
  const { tr } = useTr();
  return (
    <section className={card + " space-y-3"} data-testid="lms-progress">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 rounded-2xl bg-orange-50 px-4 py-3 text-center dark:bg-orange-900/30"><p className="text-3xl font-black" data-testid="lms-streak">🔥 {p.streak}</p><p className="text-sm font-semibold opacity-70">{tr("day streak", "أيام متتالية")}</p></div>
        <div className="flex-1 rounded-2xl bg-amber-50 px-4 py-3 text-center dark:bg-amber-900/30"><p className="text-3xl font-black" data-testid="lms-stars">⭐ {p.stars}</p><p className="text-sm font-semibold opacity-70">{tr("stars", "نجوم")}</p></div>
        <div className="flex-1 rounded-2xl bg-emerald-50 px-4 py-3 text-center dark:bg-emerald-900/30"><p className="whitespace-nowrap text-2xl font-black sm:text-3xl">🟢{p.greens} 🟡{p.yellows}</p><p className="text-sm font-semibold opacity-70">{tr("passed", "ناجح")}</p></div>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="lms-badges">
        {Object.entries(BADGES).map(([k, [icon, en, ar]]) => {
          const got = p.badges.includes(k);
          return <span key={k} title={got ? tr(en, ar) : tr(`Locked: ${en}`, `مقفل: ${ar}`)} className={`rounded-full px-3 py-1 text-sm font-semibold ${got ? "bg-header text-sun" : "bg-black/5 opacity-50 grayscale dark:bg-white/10"}`} data-testid={got ? "badge-on" : "badge-off"}>{icon} {tr(en, ar)}</span>;
        })}
      </div>
    </section>
  );
}

/** Spaced revision for passed passages (1, 3, 7, 14, 30, 60 days). */
export function RevisionList({ tracker, onChange }: { tracker: TrackerRow[]; onChange: (t: TrackerRow[]) => void }) {
  const { tr } = useTr();
  const ch = useChapters();
  const [now] = useState(() => Date.now());
  const due = tracker.filter((t) => t.revDue && t.revDue <= now);
  const next = tracker.filter((t) => t.revDue && t.revDue > now).sort((a, b) => a.revDue! - b.revDue!).slice(0, 3);
  if (!due.length && !next.length) return null;
  return (
    <section id="revision" className={card + " space-y-2"} data-testid="lms-revision">
      <h2 className="text-xl font-bold">🔁 {tr("Revision", "المراجعة")}</h2>
      {due.map((t) => (
        <div key={t.hw} className="flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 dark:bg-sky-900/30" data-testid="lms-revise-due">
          <b>{surahLabel(ch, t.surah)} {t.from}–{t.to}</b>
          <span className="text-sm opacity-70">{tr(`revised ${t.revCount || 0}×`, `روجعت ${t.revCount || 0} مرة`)}</span>
          <span className="flex-1" />
          <button type="button" className={smallBtn} onClick={() => lmsApi.revise(t.hw!).then((r) => onChange(r.tracker)).catch(() => undefined)} data-testid="lms-revise-btn">✓ {tr("I revised it", "راجعتها")}</button>
        </div>
      ))}
      {!due.length && <p className="text-sm opacity-70">{tr("Nothing due today — great!", "لا شيء مستحق اليوم — رائع!")}</p>}
      {next.length > 0 && <p className="text-sm opacity-70">{tr("Next:", "التالي:")} {next.map((t) => `${surahLabel(ch, t.surah)} ${t.from}–${t.to} (${new Date(t.revDue!).toLocaleDateString()})`).join(" · ")}</p>}
    </section>
  );
}

/** Weekly leaderboard (only when the teacher turned it on). */
export function Leaderboard({ asAdmin = false, cls = "" }: { asAdmin?: boolean; cls?: string }) {
  const { tr } = useTr();
  const [d, setD] = useState<Awaited<ReturnType<typeof lmsApi.leaderboard>> | null>(null);
  useEffect(() => { lmsApi.leaderboard(cls, asAdmin).then(setD).catch(() => setD(null)); }, [cls, asAdmin]);
  if (!d) return null;
  return (
    <section className={card + " space-y-2"} data-testid="lms-leaderboard">
      <h2 className="text-xl font-bold">🏆 {tr("This week's stars", "نجوم هذا الأسبوع")} {d.cls && <span className="text-sm font-semibold opacity-60">· {d.cls}</span>}</h2>
      {!d.list.length ? <p className="opacity-70">{tr("No stars yet this week.", "لا نجوم بعد هذا الأسبوع.")}</p> : (
        <ol className="space-y-1">
          {d.list.map((x) => (
            <li key={x.rank} className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${x.me ? "bg-sun/30 font-bold" : ""}`}>
              <span className="w-7 text-center">{x.rank === 1 ? "🥇" : x.rank === 2 ? "🥈" : x.rank === 3 ? "🥉" : x.rank}</span>
              <span className="flex-1" dir="auto">{x.name}</span><span>⭐ {x.stars}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Teacher/admin toggle: off / on / top 3 only. */
export function LeaderboardSetting({ asAdmin = false }: { asAdmin?: boolean }) {
  const { tr } = useTr();
  const [v, setV] = useState<"off" | "on" | "top3" | null>(null);
  useEffect(() => { lmsApi.settings(undefined, asAdmin).then((r) => setV(r.leaderboard)).catch(() => undefined); }, [asAdmin]);
  if (!v) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      🏆 {tr("Weekly leaderboard for students", "لوحة المتصدرين الأسبوعية للطلاب")}
      <select className={inputCls + " mt-0 w-auto!"} value={v} onChange={(e) => { const nv = e.target.value as typeof v; setV(nv); lmsApi.settings({ leaderboard: nv! }, asAdmin).catch(() => undefined); }} data-testid="lms-leaderboard-setting">
        <option value="off">{tr("Off", "متوقفة")}</option>
        <option value="on">{tr("On (full list)", "مفعلة (القائمة كاملة)")}</option>
        <option value="top3">{tr("On (top 3 only)", "مفعلة (أفضل 3 فقط)")}</option>
      </select>
    </label>
  );
}

/** Whole surahs passed (green/yellow) -> printable certificate. */
export function completedSurahs(tracker: TrackerRow[], ch: Chapter[]): Chapter[] {
  return ch.filter((c) => {
    const got = new Set<number>();
    for (const t of tracker) if (t.surah === c.id && t.grade !== "red") for (let n = t.from; n <= t.to; n++) got.add(n);
    return got.size >= c.verses_count;
  });
}

export async function downloadCertificate(student: string, c: Chapter, tr: Tr) {
  const W = 1754, H = 1240;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#fffaf0"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#1b3a57"; g.lineWidth = 28; g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = "#f5c542"; g.lineWidth = 8; g.strokeRect(80, 80, W - 160, H - 160);
  g.textAlign = "center"; g.fillStyle = "#1b3a57";
  g.font = "bold 84px Georgia, serif"; g.fillText(tr("Certificate of Memorisation", "شهادة حفظ"), W / 2, 260);
  g.font = "40px Georgia, serif"; g.fillText(tr("This certifies that", "تشهد هذه الشهادة بأن"), W / 2, 380);
  g.font = "bold 96px Georgia, serif"; g.fillStyle = "#b8892b"; g.fillText(student, W / 2, 510);
  g.fillStyle = "#1b3a57"; g.font = "40px Georgia, serif"; g.fillText(tr("has memorised", "قد حفظ"), W / 2, 610);
  g.font = "bold 110px 'Amiri Quran', 'Amiri', serif"; g.fillText(`سورة ${c.name_arabic}`, W / 2, 760);
  g.font = "bold 52px Georgia, serif"; g.fillText(`Surah ${c.name_simple} (${c.verses_count} ${tr("verses", "آيات")})`, W / 2, 850);
  g.font = "34px Georgia, serif"; g.fillText(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W / 2, 980);
  g.font = "italic 40px Georgia, serif"; g.fillText("Shaiq Muhammad", W / 2, 1080);
  g.fillStyle = "#f5c542"; g.beginPath(); g.arc(W - 260, H - 260, 90, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1b3a57"; g.font = "bold 90px serif"; g.fillText("★", W - 260, H - 228);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H] });
  pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
  pdf.save(`certificate-${c.name_simple.replace(/\W+/g, "-")}-${student.replace(/\W+/g, "-")}.pdf`);
}

export function Certificates({ tracker, student }: { tracker: TrackerRow[]; student: string }) {
  const { tr } = useTr();
  const ch = useChapters();
  const done = completedSurahs(tracker, ch);
  if (!done.length) return null;
  return (
    <section className={card + " space-y-2"} data-testid="lms-certificates">
      <h2 className="text-xl font-bold">🎓 {tr("Certificates", "الشهادات")}</h2>
      <div className="flex flex-wrap gap-2">
        {done.map((c) => <button key={c.id} type="button" className={smallBtn} onClick={() => downloadCertificate(student, c, tr)} data-testid="lms-cert">⬇ {c.name_simple}</button>)}
      </div>
    </section>
  );
}

export function TrackerBadges({ tracker }: { tracker: TrackerRow[] }) {
  const { tr } = useTr();
  const ch = useChapters();
  if (!tracker.length) return <p className="opacity-70">{tr("Nothing passed yet.", "لا شيء بعد.")}</p>;
  return (
    <div className="space-y-3" data-testid="tracker-badges">
      <TrackerEntries rows={tracker} surahName={(n) => surahLabel(ch, n)} />
      <CriteriaChart rows={tracker} />
    </div>
  );
}

/** Class Quran map: students × surahs coloured by best grade. */
export function QuranMap({ asAdmin = false, classes = [], sections = [] }: { asAdmin?: boolean; classes?: string[]; sections?: { cls: string; name: string }[] }) {
  const { tr } = useTr();
  const ch = useChapters();
  const [cls, setCls] = useState(classes[0] || "");
  const [section, setSection] = useState("");
  const [crit, setCrit] = useState<"" | "m" | "t" | "r">("");
  const [d, setD] = useState<{ rows: MapRow[]; surahs: number[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { lmsApi.quranMap(cls, section, asAdmin).then(setD).catch((e) => setErr(lmsErrorText(e, tr))); }, [cls, section, asAdmin, tr]);
  const cellCls = (g: string) => (g === "green" ? "bg-emerald-500" : g === "yellow" ? "bg-amber-400" : g === "red" ? "bg-rose-600" : "bg-black/5 dark:bg-white/10");
  return (
    <section className={card + " space-y-3"} data-testid="lms-quran-map">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">🗺️ {tr("Class Quran map", "خريطة القرآن للصف")}</h2>
        <span className="flex-1" />
        <select className={inputCls + " mt-0 w-auto!"} value={cls} onChange={(e) => { setCls(e.target.value); setSection(""); }} aria-label={tr("Class", "الصف")} data-testid="map-class">
          <option value="">{tr("All classes", "كل الصفوف")}</option>
          {classes.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={inputCls + " mt-0 w-auto!"} value={crit} onChange={(e) => setCrit(e.target.value as "" | "m" | "t" | "r")} aria-label={tr("Show", "عرض")} data-testid="map-crit">
          <option value="">{tr("Overall result", "النتيجة الإجمالية")}</option>
          <option value="m">{tr("Makharij", "المخارج")}</option>
          <option value="t">{tr("Tajweed", "التجويد")}</option>
          <option value="r">{tr("Recitation", "التلاوة")}</option>
        </select>
        <select className={inputCls + " mt-0 w-auto!"} value={section} onChange={(e) => setSection(e.target.value)} disabled={!cls} aria-label={tr("Section", "الشعبة")}>
          <option value="">{tr("All sections", "كل الشعب")}</option>
          {sections.filter((s) => s.cls === cls).map((s) => <option key={s.name}>{s.name}</option>)}
        </select>
      </div>
      {err && <p className="text-rose-700">{err}</p>}
      {d && (!d.rows.length ? <p className="opacity-70">{tr("No students.", "لا يوجد طلاب.")}</p> : !d.surahs.length ? <p className="opacity-70">{tr(`${d.rows.length} students — no Quran grades yet.`, `${d.rows.length} طالبًا — لا تقييمات بعد.`)}</p> : (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-black/10 dark:border-white/15">
          <table className="border-separate border-spacing-0 text-xs" data-testid="map-table">
            <thead className="sticky top-0 z-10 bg-header text-white">
              <tr><th className="sticky start-0 bg-header px-3 py-2 text-start">{tr("Student", "الطالب")}</th>{d.surahs.map((s) => <th key={s} className="px-1 py-2 font-semibold" title={surahLabel(ch, s)}><span className="block max-w-[4.5rem] truncate">{surahLabel(ch, s)}</span></th>)}</tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id} className="hover:bg-sky-50 dark:hover:bg-sky-900/20">
                  <td className="sticky start-0 border-t border-black/5 bg-white px-3 py-1.5 font-semibold whitespace-nowrap dark:border-white/10 dark:bg-[#0f1a26]">
                    {asAdmin ? <span dir="auto">{r.name}</span> : <Link href={`/lms/student?id=${encodeURIComponent(r.id)}`} className="underline-offset-2 hover:underline" dir="auto">{r.name}</Link>} <span className="opacity-50">{r.section}</span>
                  </td>
                  {d.surahs.map((s) => { const c0 = r.cells[s]; const lv = crit && c0 ? (c0 as { m?: number; t?: number; r?: number })[crit] : undefined; const c = c0 && crit ? { ...c0, grade: lv === 3 ? "green" : lv === 2 ? "yellow" : lv === 1 ? "red" : "" } : c0; return <td key={s} className="border-t border-black/5 p-1 text-center dark:border-white/10"><span className={`mx-auto block h-6 w-10 rounded ${cellCls(c?.grade || "")}`} title={c ? `${surahLabel(ch, s)}: ${gradeLabel(c.grade, tr)} · ${c.verses} ${tr("verses", "آيات")}` : ""} data-grade={c?.grade || ""} /></td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="flex flex-wrap gap-3 text-xs opacity-70"><span>🟩 {tr("green", "أخضر")}</span><span>🟨 {tr("yellow", "أصفر")}</span><span>🟥 {tr("red", "أحمر")}</span><span>⬜ {tr("not yet", "ليس بعد")}</span></p>
    </section>
  );
}

/** Per-student tracker screen for teachers and admin (+ parent link). */
export function StudentProgress({ id, asAdmin = false }: { id: string; asAdmin?: boolean }) {
  const { tr } = useTr();
  const [d, setD] = useState<Awaited<ReturnType<typeof lmsApi.progress>> | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => lmsApi.progress(id, asAdmin).then(setD).catch((e) => setErr(lmsErrorText(e, tr))), [id, asAdmin, tr]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="text-rose-700" role="alert">{err}</p>;
  if (!d) return <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>;
  const link = d.parentLink ? `${typeof window !== "undefined" ? window.location.origin : ""}/lms/parent?t=${d.parentLink}` : "";
  const parent = async (opts: { reset?: boolean; revoke?: boolean }) => { await lmsApi.parentLink(id, opts, asAdmin).catch(() => undefined); load(); };
  return (
    <div className="space-y-4" data-testid="lms-student-progress">
      <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-2xl font-bold" dir="auto">{d.student.name}</h2><span className="opacity-60">{[d.student.cls, d.student.section].filter(Boolean).join(" · ")}</span></div>
      <ProgressCard p={d.progress} />
      <section className={card + " space-y-2"}><h3 className="text-lg font-bold">📈 {tr("Quran tracker", "متابعة الحفظ")}</h3><TrackerBadges tracker={d.tracker} /></section>
      <Certificates tracker={d.tracker} student={d.student.name} />
      <section className={card + " space-y-2"}>
        <h3 className="text-lg font-bold">📚 {tr("Homework", "الواجبات")}</h3>
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {d.homework.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="sp-hw">
              <span className="font-semibold" dir="auto">{h.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[h.status] || ""}`}>{statusLabel(h.status as "none", tr)}</span>
              {h.grade && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLE[h.grade]}`}>{gradeLabel(h.grade, tr)}</span>}
              {h.late && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">⏰ {tr("Late", "متأخر")}</span>}
              {h.attempts > 1 && <span className="text-xs opacity-60">{tr(`${h.attempts} attempts`, `${h.attempts} محاولات`)}</span>}
              {h.due && <span className="text-xs opacity-60">{tr("due", "التسليم")} {new Date(h.due).toLocaleDateString()}</span>}
            </li>
          ))}
          {!d.homework.length && <li className="py-2 opacity-60">{tr("No homework.", "لا واجبات.")}</li>}
        </ul>
      </section>
      <section className={card + " space-y-2"} data-testid="sp-parent">
        <h3 className="text-lg font-bold">👪 {tr("Parent view (read-only link)", "رابط ولي الأمر (للعرض فقط)")}</h3>
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded-lg bg-black/5 px-2 py-1 text-xs dark:bg-white/10" dir="ltr" data-testid="sp-parent-link">{link}</code>
            <button type="button" className={smallBtn} onClick={() => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? "✅" : "📋"} {tr("Copy", "نسخ")}</button>
            <button type="button" className={smallBtn} onClick={() => parent({ reset: true })}>↻ {tr("New link", "رابط جديد")}</button>
            <button type="button" className={smallBtn + " text-rose-600"} onClick={() => parent({ revoke: true })}>{tr("Turn off", "إيقاف")}</button>
          </div>
        ) : <button type="button" className={smallBtn} onClick={() => parent({})} data-testid="sp-parent-create">🔗 {tr("Create parent link", "إنشاء رابط لولي الأمر")}</button>}
        <p className="text-xs opacity-60">{tr("Parents see homework status, grades, teacher comments and the Quran tracker. No recordings, no PIN.", "يرى ولي الأمر حالة الواجبات والتقييمات وتعليقات المعلم ومتابعة الحفظ. بدون تسجيلات أو رقم سري.")}</p>
      </section>
    </div>
  );
}
