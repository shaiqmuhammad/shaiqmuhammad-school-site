"use client";

import { useEffect, useState } from "react";
import { lmsApi } from "@/lib/lms";
import { useTr, GRADE_STYLE, gradeLabel } from "@/components/lms/useLms";
import type { Level, Scores, TrackerRow } from "@/lib/lms";

/** Overall rule (mirrors the worker): all 3 → Excellent; any 1 → Needs practice; otherwise Good. */
export const overallOf = (s: { m: Level; t: Level; r: Level; h?: Level }) => { const v = [s.m, s.t, s.r, ...(s.h ? [s.h] : [])]; return v.every((x) => x === 3) ? "green" : Math.min(...v) === 1 ? "red" : "yellow"; };
export const CRITS = [
  { k: "m", short: ["M", "م"], en: "Makharij", ar: "المخارج", hintEn: "Articulation points", hintAr: "مخارج الحروف" },
  { k: "t", short: ["T", "ج"], en: "Tajweed", ar: "التجويد", hintEn: "Rules", hintAr: "الأحكام" },
  { k: "r", short: ["R", "ت"], en: "Recitation", ar: "التلاوة", hintEn: "Fluency", hintAr: "الطلاقة" },
  { k: "h", short: ["Mem", "ح"], en: "Memorisation", ar: "الحفظ", hintEn: "Recited from memory", hintAr: "التلاوة من الحفظ" },
] as const;
export const LEVELS: Record<Level, [string, string, string]> = { 1: ["Needs practice", "يحتاج تدريبًا", "bg-rose-700"], 2: ["Good", "جيد", "bg-amber-400"], 3: ["Excellent", "ممتاز", "bg-emerald-500"] };
type CK = "m" | "t" | "r" | "h";
/** Default quick comments (admin can replace them; saved on the server). */
/** t335: general encouragement chips (Quran grading). */
const ENCOURAGE: [string, string][] = [["MashaAllah, beautiful recitation!", "ما شاء الله، تلاوة جميلة!"], ["Great effort — keep going!", "جهد رائع — استمر!"], ["You have improved a lot", "لقد تحسّنت كثيرًا"], ["Proud of you!", "أنا فخور بك!"], ["Keep practising daily", "واصل التدريب يوميًا"]];
export const CRIT_PRESETS: Record<CK, [string, string][]> = {
  h: [["Revise these verses daily", "راجع هذه الآيات يوميًا"], ["Secure the start of each verse", "ثبّت بدايات الآيات"], ["Mixed up verse order", "خلط في ترتيب الآيات"], ["Fully memorised — MashaAllah", "محفوظ تمامًا — ما شاء الله"]],
  m: [["Makharij: work on ح / ه", "المخارج: تدرّب على ح / ه"], ["Makharij: work on ع / ء", "المخارج: تدرّب على ع / ء"], ["Makharij: ق / ك", "المخارج: ق / ك"], ["Makharij: س / ص", "المخارج: س / ص"], ["Makharij: د / ض", "المخارج: د / ض"], ["Heavy letters (ص ض ط ظ ق)", "حروف التفخيم (ص ض ط ظ ق)"], ["ث / ذ / ظ with the tongue tip", "ث / ذ / ظ بطرف اللسان"]],
  t: [["Lam Shamsiyah — don't pronounce the ل (الشّمس)", "اللام الشمسية — لا تُنطق اللام (الشّمس)"], ["Lam Qamariyah — pronounce the ل clearly (القَمر)", "اللام القمرية — تُنطق اللام بوضوح (القَمر)"], ["Ghunnah on نّ / مّ (2 counts)", "الغنة في النون والميم المشددتين (حركتان)"], ["Ikhfa — hide the ن with ghunnah", "الإخفاء — إخفاء النون مع الغنة"], ["Idgham — merge ن into ي ر م ل و ن", "الإدغام — إدغام النون في (يرملون)"], ["Iqlab — ن / tanween before ب becomes م", "الإقلاب — النون أو التنوين قبل الباء تُقلب ميمًا"], ["Izhar — say ن clearly before throat letters", "الإظهار — إظهار النون قبل حروف الحلق"], ["Qalqalah (ق ط ب ج د)", "القلقلة (قطب جد)"], ["Madd — hold 2/4/6 counts", "المد — 2/4/6 حركات"], ["Tafkheem — heavy letters (خص ضغط قظ)", "التفخيم — حروف الاستعلاء (خص ضغط قظ)"], ["Tarqeeq — keep light letters light", "الترقيق — رقّق الحروف المرققة"], ["Raa: heavy / light", "الراء: تفخيم وترقيق"], ["Waqf — stop correctly at the verse end", "الوقف — قف بشكل صحيح عند نهاية الآية"], ["Meem sakinah: ikhfa shafawi / idgham", "الميم الساكنة: إخفاء شفوي / إدغام"]],
  r: [["Recite without stopping", "اتلُ دون توقف"], ["Revise from memory daily", "راجع من الحفظ يوميًا"], ["Watch verse endings", "انتبه لنهايات الآيات"], ["Slow, steady pace", "إيقاع هادئ ثابت"]],
};

/** Three small labelled bars (1–3) for Makharij / Tajweed / Recitation. */
export function ScoreBadges({ s, compact = false }: { s?: Scores | null; compact?: boolean }) {
  const { tr } = useTr();
  if (!s) return null;
  return (
    <span className={`inline-flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`} data-testid="score-badges">
      {CRITS.filter((c) => s[c.k]).map((c) => {
        const v = s[c.k] as Level;
        return (
          <span key={c.k} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${({ t: "bg-violet-100 text-violet-900 ring-violet-200", m: "bg-sky-100 text-sky-900 ring-sky-200", r: "bg-teal-100 text-teal-900 ring-teal-200", h: "bg-amber-100 text-amber-900 ring-amber-200" } as Record<string, string>)[c.k] || "bg-slate-100 text-slate-900 ring-slate-200"}`} title={`${tr(c.en, c.ar)}: ${tr(LEVELS[v][0], LEVELS[v][1])}`} data-crit={c.k} data-level={v}>
            {compact ? tr(c.short[0], c.short[1]) : tr(c.en, c.ar)}
            <span className="inline-flex gap-0.5" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={`h-2 w-2.5 rounded-sm ${i <= v ? LEVELS[v][2] : "bg-black/15 dark:bg-white/20"}`} />)}</span>
            <span className="sr-only">{v}/3</span>
          </span>
        );
      })}
    </span>
  );
}

export function FeedbackText({ s }: { s?: Scores | null }) {
  const { lang } = useTr();
  if (!s?.fb) return null;
  return <p className="whitespace-pre-line rounded-2xl bg-black/[0.03] px-3 py-2 text-sm leading-relaxed dark:bg-white/5" dir="auto" data-testid="score-feedback">{lang === "ar" ? s.fb.ar : s.fb.en}</p>;
}

/** Rich tracker: surah/verses, date, the three criteria, overall title and feedback. */
export function TrackerEntries({ rows, surahName }: { rows: TrackerRow[]; surahName: (n: number) => string }) {
  const { tr, lang } = useTr();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="space-y-2" data-testid="lms-tracker">
      {rows.map((t, i) => (
        <li key={i} className="rounded-2xl border border-black/10 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/5" data-testid="lms-tracker-row" data-grade={t.grade || "green"}>
          <button type="button" className="flex w-full flex-wrap items-center gap-2 text-start" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <b>{surahName(t.surah)} {t.from}–{t.to}</b>
            <span className="text-xs opacity-60">{t.approved ? new Date(t.approved).toLocaleDateString(lang === "ar" ? "ar" : "en-GB") : ""}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_STYLE[t.grade || "green"]}`}>{gradeLabel(t.grade || "green", tr)}</span>
            <span className="flex-1" />
            <ScoreBadges s={t.scores} compact />
          </button>
          {open === i && <div className="mt-2"><FeedbackText s={t.scores} /></div>}
        </li>
      ))}
    </ul>
  );
}

/** Simple per-criterion progress chart over time (one line per criterion, levels 1–3). */
export function CriteriaChart({ rows }: { rows: TrackerRow[] }) {
  const { tr } = useTr();
  const pts = rows.filter((r) => r.scores && r.approved).sort((a, b) => a.approved - b.approved);
  if (pts.length < 2) return null;
  const W = 320, H = 110, P = 18;
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v: number) => H - P - ((v - 1) * (H - 2 * P)) / 2;
  const colors = { m: "#0ea5e9", t: "#a855f7", r: "#10b981", h: "#f97316" } as const;
  return (
    <figure className="rounded-2xl border border-black/10 p-3 dark:border-white/10" data-testid="criteria-chart">
      <figcaption className="mb-1 flex flex-wrap gap-3 text-xs font-bold">{tr("Progress by criterion", "التقدم حسب المعيار")}{CRITS.map((c) => <span key={c.k} className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded" style={{ background: colors[c.k] }} />{tr(c.en, c.ar)}</span>)}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={tr("Criteria chart", "مخطط المعايير")}>
        {[1, 2, 3].map((v) => <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.12" /></g>)}
        {CRITS.filter((c) => c.k !== "h" || pts.every((p) => p.scores?.h)).map((c, ci) => <polyline key={c.k} fill="none" stroke={colors[c.k]} strokeWidth="2" vectorEffect="non-scaling-stroke" points={pts.map((p, i) => `${x(i)},${y(p.scores![c.k] as number) + (ci - 1) * 2}`).join(" ")} />)}
      </svg>
    </figure>
  );
}

/** Teacher grading: three criteria × 3 levels, optional comment/presets per criterion, live overall preview. */
let presetCache: Promise<Record<CK, [string, string][]>> | null = null;
const loadPresets = (asAdmin: boolean) => (presetCache ??= lmsApi.qpreGet(asAdmin).then((r) => ({ ...CRIT_PRESETS, ...Object.fromEntries(Object.entries(r.presets || {}).filter(([, v]) => Array.isArray(v) && v.length)) }) as Record<CK, [string, string][]>).catch(() => CRIT_PRESETS));
export function ScoreGrader({ onSubmit, busy, asAdmin = false }: { onSubmit: (s: { m: Level; t: Level; r: Level; h: Level; notes: { m?: string; t?: string; r?: string; h?: string }; comment?: string }) => void; busy?: boolean; asAdmin?: boolean }) {
  const { tr } = useTr();
  const [v, setV] = useState<{ m: Level | 0; t: Level | 0; r: Level | 0; h: Level | 0 }>({ m: 0, t: 0, r: 0, h: 0 });
  const [comment, setComment] = useState("");
  const [pre, setPre] = useState<Record<CK, [string, string][]>>(CRIT_PRESETS);
  const [editP, setEditP] = useState(false);
  const [draft, setDraft] = useState<Record<CK, string>>({ m: "", t: "", r: "", h: "" });
  useEffect(() => { loadPresets(asAdmin).then(setPre); }, [asAdmin]);
  const ready = v.m && v.t && v.r && v.h;
  const o = ready ? overallOf(v as { m: Level; t: Level; r: Level; h: Level }) : "";
  const openEdit = () => { setDraft(Object.fromEntries((["m", "t", "r", "h"] as CK[]).map((k) => [k, pre[k].map(([en, ar]) => `${en} | ${ar}`).join("\n")])) as Record<CK, string>); setEditP(true); };
  const savePre = async () => { const next = Object.fromEntries((["m", "t", "r", "h"] as CK[]).map((k) => [k, draft[k].split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => x[0]).map((x) => [x[0], x[1] || x[0]] as [string, string])])) as Record<CK, [string, string][]>; await lmsApi.qpreSave(next); presetCache = null; setPre({ ...CRIT_PRESETS, ...next }); setEditP(false); };
  // t335: one tap adds a ready-made comment to the student's comment; tap again removes it.
  const parts = comment.split("\n").map((x) => x.trim()).filter(Boolean);
  const has = (t: string) => parts.includes(t);
  const [qcOpen, setQcOpen] = useState(false);
  const [qcTab, setQcTab] = useState("t");
  const tap = (t: string) => setComment((has(t) ? parts.filter((x) => x !== t) : [...parts, t]).join("\n"));
  const GROUPS: { k: string; icon: string; en: string; ar: string; cls: string; on: string; items: [string, string][] }[] = [
    { k: "t", icon: "📜", en: "Tajweed", ar: "التجويد", cls: "bg-violet-50 text-violet-900 ring-violet-200", on: "bg-violet-700 text-white ring-violet-700", items: pre.t },
    { k: "m", icon: "👄", en: "Makharij", ar: "المخارج", cls: "bg-sky-50 text-sky-900 ring-sky-200", on: "bg-sky-700 text-white ring-sky-700", items: pre.m },
    { k: "r", icon: "🌊", en: "Fluency", ar: "الطلاقة", cls: "bg-teal-50 text-teal-900 ring-teal-200", on: "bg-teal-700 text-white ring-teal-700", items: pre.r },
    { k: "h", icon: "🧠", en: "Memorisation", ar: "الحفظ", cls: "bg-amber-50 text-amber-900 ring-amber-200", on: "bg-amber-700 text-white ring-amber-700", items: pre.h },
    { k: "e", icon: "🌟", en: "Encouragement", ar: "تشجيع", cls: "bg-rose-50 text-rose-900 ring-rose-200", on: "bg-rose-700 text-white ring-rose-700", items: ENCOURAGE },
  ];
  return (
    <div className="light-island w-full space-y-2.5 rounded-2xl border-t-4 border-violet-500 bg-gradient-to-br from-white via-sky-50 to-emerald-50 p-3 text-slate-900 shadow-md ring-1 ring-black/10" data-testid="hw-grader">
      {/* t335: all four criteria in one line of compact segmented selectors (wraps at narrow widths). */}
      <div className="flex flex-wrap gap-2" data-testid="grade-row">
        {CRITS.map((c) => (
          <div key={c.k} className="min-w-[10.5rem] flex-1" data-testid={`grade-${c.k}`}>
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-600">{tr(c.en, c.ar)}</p>
            <div role="radiogroup" aria-label={tr(c.en, c.ar)} className="flex overflow-hidden rounded-full ring-1 ring-black/15">
              {([1, 2, 3] as Level[]).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={v[c.k] === l} title={tr(LEVELS[l][0], LEVELS[l][1])} onClick={() => setV({ ...v, [c.k]: l })} className={`flex-1 px-1 py-1.5 text-xs font-bold transition ${l > 1 ? "border-s border-black/10" : ""} ${v[c.k] === l ? `${LEVELS[l][2]} text-white` : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`} data-testid={`grade-${c.k}-${l}`}>{l} · {tr(LEVELS[l][0], LEVELS[l][1]).split(" ")[0]}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {o ? <span className={`rounded-full px-3 py-1 text-sm font-bold ${GRADE_STYLE[o]}`} data-testid="grade-overall">{gradeLabel(o, tr)}</span> : <span className="text-xs text-slate-500">{tr("Choose a level for each criterion.", "اختر مستوى لكل معيار.")}</span>}
        <span className="text-[11px] text-slate-500">{tr("All 3 = Excellent · any 1 = Needs practice · otherwise Good", "الكل 3 = ممتاز · أي 1 = يحتاج تدريبًا · غير ذلك = جيد")}</span>
      </div>
      {/* t351: ready-made comments in one big dropdown (tap to add / tap again to remove) so grading fits without scrolling. */}
      <div className="relative" data-testid="qc-groups">
        <button type="button" aria-expanded={qcOpen} onClick={() => setQcOpen((x) => !x)} className="flex w-full items-center gap-2 rounded-xl bg-gradient-to-r from-violet-100 via-sky-100 to-amber-100 px-3 py-2 text-start text-sm font-extrabold text-slate-900 ring-1 ring-black/10" data-testid="qc-toggle">
          💬 {tr("Ready-made comments", "تعليقات جاهزة")} <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold" data-testid="qc-count">{parts.length} {tr("added", "مضاف")}</span><span className="flex-1" /><span aria-hidden>{qcOpen ? "▴" : "▾"}</span>
        </button>
        {qcOpen && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-2xl bg-white p-3 text-slate-900 shadow-2xl ring-1 ring-black/15" data-testid="qc-panel">
            <div className="mb-2 flex flex-wrap gap-1.5" role="tablist">{GROUPS.map((g) => <button key={g.k} type="button" role="tab" aria-selected={qcTab === g.k} onClick={() => setQcTab(g.k)} className={`rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${qcTab === g.k ? g.on : g.cls}`} data-testid={`qc-tab-${g.k}`}>{g.icon} {tr(g.en, g.ar)}</button>)}</div>
            {GROUPS.filter((g) => g.k === qcTab).map((g) => (
              <div key={g.k} className="flex flex-wrap gap-1.5" data-testid={`qc-group-${g.k}`}>
                {g.items.map(([en, ar]) => { const t = tr(en, ar); const on = has(t); return <button key={en} type="button" aria-pressed={on} onClick={() => tap(t)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 transition ${on ? g.on : g.cls + " hover:brightness-95"}`} data-testid="qc-chip">{on ? "✓ " : ""}{t}</button>; })}
              </div>
            ))}
            <div className="mt-2 text-end"><button type="button" onClick={() => setQcOpen(false)} className="rounded-full bg-header px-4 py-1 text-xs font-bold text-white" data-testid="qc-done">{tr("Done", "تم")}</button></div>
          </div>
        )}
      </div>
      <label className="block text-xs font-bold text-slate-600">{tr("Comment for the student (optional)", "تعليق للطالب (اختياري)")}
        <textarea className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-normal text-slate-900" rows={2} dir="auto" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={tr("Pick ready-made comments above or type your own…", "اضغط على التعليقات أعلاه أو اكتب تعليقك…")} data-testid="grade-comment" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {asAdmin && <button type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800" onClick={() => (editP ? setEditP(false) : openEdit())} data-testid="qpre-edit">✏️ {tr("Edit quick comments", "تعديل التعليقات السريعة")}</button>}
        <span className="flex-1" />
        <button type="button" disabled={!ready || busy} className="rounded-full bg-header px-5 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => ready && onSubmit({ ...(v as { m: Level; t: Level; r: Level; h: Level }), notes: {}, comment: comment.trim() || undefined })} data-testid="grade-submit">{tr("Save grade", "حفظ التقييم")}</button>
      </div>
      {asAdmin && editP && <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-slate-900" data-testid="qpre-panel"><p className="text-xs">{tr("One comment per line: English | Arabic", "تعليق في كل سطر: الإنجليزية | العربية")}</p>{CRITS.map((c) => <label key={c.k} className="block text-xs font-bold">{tr(c.en, c.ar)}<textarea className="mt-1 w-full rounded-lg border border-black/15 bg-white p-2 text-xs font-normal" rows={4} value={draft[c.k]} onChange={(e) => setDraft({ ...draft, [c.k]: e.target.value })} data-testid={`qpre-${c.k}`} /></label>)}<button type="button" className="rounded-full bg-header px-4 py-1.5 text-xs font-bold text-white" onClick={savePre} data-testid="qpre-save">{tr("Save quick comments", "حفظ التعليقات")}</button></div>}
    </div>
  );
}
