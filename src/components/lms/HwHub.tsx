"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { HwMeta, hwAud, packAud } from "@/components/lms/HwMeta";
import { HwRemindBell } from "@/components/lms/HwRemind";
import { TrkLink } from "@/components/tracker/TrkLink";
import { btn, cardCls } from "@/components/lms/mods/ModUi";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { clsCmp, sortCls } from "@/lib/classSort";
import { lmsApi, lmsErrorText, type Catalog, type Chapter, type DashStudent, type Homework, type QuranData } from "@/lib/lms";
import { modErr, qhwPerm } from "@/lib/lmsMods";
import { lp, type Acc, type Pack } from "@/lib/packs";

export type HwHubTab = "lessons" | "homeworks" | "assigned" | "review" | "corrected";
export type DashHw = Homework & { counts?: Record<string, number>; assigned?: number };

const TAB_ITEMS: { id: HwHubTab; ic: string; en: string; ar: string }[] = [
  { id: "lessons", ic: "🎤", en: "Lessons", ar: "الدروس" },
  { id: "homeworks", ic: "📝", en: "Homework", ar: "الواجبات" },
  { id: "assigned", ic: "📋", en: "Assigned Homework", ar: "الواجبات المسندة" },
  { id: "review", ic: "📥", en: "Review", ar: "المراجعة" },
  { id: "corrected", ic: "✅", en: "Corrected Homeworks", ar: "الواجبات المصحَّحة" },
];

const OPEN_PILL = "inline-flex items-center justify-center rounded-full bg-[#1b3a57] px-3 py-1 text-sm font-extrabold text-[#f5c542] shadow transition hover:brightness-110";
/** Same lift as the class cards on My classes, and the same eight colour pairs. */
const PORTION_LIFT = "transition hover:-translate-y-1 hover:shadow-2xl";
const PORTION_WASH = [
  "from-sky-100 via-white to-blue-50 dark:from-sky-950/70 dark:via-[#13202e] dark:to-blue-950/50",
  "from-amber-100 via-white to-orange-50 dark:from-amber-950/60 dark:via-[#13202e] dark:to-orange-950/40",
  "from-emerald-100 via-white to-teal-50 dark:from-emerald-950/60 dark:via-[#13202e] dark:to-teal-950/40",
  "from-pink-100 via-white to-rose-50 dark:from-pink-950/60 dark:via-[#13202e] dark:to-rose-950/40",
  "from-violet-100 via-white to-violet-50 dark:from-violet-950/60 dark:via-[#13202e] dark:to-violet-950/40",
  "from-teal-100 via-white to-cyan-50 dark:from-teal-950/60 dark:via-[#13202e] dark:to-cyan-950/40",
  "from-orange-100 via-white to-red-50 dark:from-orange-950/50 dark:via-[#13202e] dark:to-red-950/40",
  "from-lime-100 via-white to-green-50 dark:from-lime-950/50 dark:via-[#13202e] dark:to-green-950/40",
];
const PORTION_BAR = [
  "from-sky-400 to-blue-600",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-pink-400 to-rose-600",
  "from-violet-400 to-violet-600",
  "from-teal-400 to-cyan-600",
  "from-orange-400 to-red-600",
  "from-lime-400 to-green-600",
];

/** Read the hub tab from ?tab= or a leftover hash (#quran / #general / #assigned / #corrected / #review). */
export function tabFromLocation(): HwHubTab {
  if (typeof window === "undefined") return "homeworks";
  const q = new URLSearchParams(window.location.search).get("tab") || "";
  const h = window.location.hash.replace("#", "");
  const v = (q || h).toLowerCase();
  if (v === "lessons" || v === "lesson") return "lessons";
  if (v === "assigned" || v === "assigned-homework") return "assigned";
  if (v === "review" || v === "to-review" || v === "toreview" || v === "to_review") return "review";
  if (v === "corrected" || v === "corrected-homeworks") return "corrected";
  return "homeworks";
}

export function tabHref(tab: HwHubTab): string {
  return tab === "homeworks" ? "/lms/homework" : `/lms/homework?tab=${tab}`;
}

function countsOf(h: DashHw) {
  const c = h.counts || {};
  return {
    submitted: c.submitted || 0,
    waiting: c.waiting || 0,
    approved: c.approved || 0,
    returned: c.returned || 0,
    draft: c.draft || 0,
  };
}

function isActivity(h: DashHw) {
  return !!(h.data as { activity?: boolean } | undefined)?.activity;
}

function isLive(h: DashHw) {
  const assignAt = Number((h.data as { assignAt?: number } | undefined)?.assignAt || 0);
  return (h.assigned ?? 0) > 0 && !(assignAt > Date.now());
}

/** Submissions finished by students and still waiting for the teacher.
 *  Quran stays until Save grade. A comment on general homework or an activity waits on the student, so it leaves Review. */
export function reviewCount(h: DashHw) {
  const c = countsOf(h);
  if (h.kind === "quran") return c.submitted;
  return Math.max(0, c.submitted - c.waiting);
}

function needsReview(h: DashHw) {
  return reviewCount(h) > 0;
}

/** Every assignee has been approved and nothing is left to review. Assigned still lists the work; this only stops the reminder bell. */
function isFullyCorrected(h: DashHw) {
  const assigned = h.assigned ?? 0;
  return assigned > 0 && countsOf(h).approved >= assigned && reviewCount(h) === 0;
}

/**
 * A homework/activity has been corrected if any work on it has been marked done:
 *  - Quran: a graded submission (including "needs practice" / returned), a resubmission
 *    that still has a grade, or teacher feedback — those come from lmsApi.corrected().
 *    approved/returned counts are a fallback when that list isn't loaded yet.
 *  - General homework and lesson activities: at least one approved submission.
 * This is the same meaning as the old Corrected list and the per-homework "Corrected" sub-tab,
 * not "every student has been approved".
 */
export function hasCorrectedWork(h: DashHw, quranCorrectedHw?: Set<string>) {
  if (quranCorrectedHw?.has(h.id)) return true;
  const c = countsOf(h);
  if (h.kind === "quran") return c.approved > 0 || c.returned > 0;
  return c.approved > 0;
}

/**
 * Homework = created but not yet assigned (unassigned or scheduled for later).
 * Assigned Homework = everything live with students (general homework, activities, and Quran homework),
 * including work that already has a correction.
 * Review and Corrected Homeworks are separate lists and can overlap with Assigned.
 */
export function hwBucket(h: DashHw): "homeworks" | "assigned" {
  if (isLive(h)) return "assigned";
  return "homeworks";
}


function yearOf(h: DashHw) {
  const years = sortCls(hwAud(h).years.filter(Boolean));
  if (years.length) return years.join(" · ");
  return h.students.length ? "__sel" : "__all";
}

function sectionOf(h: DashHw) {
  return sortCls(hwAud(h).sections.filter(Boolean)).join(" · ");
}

function groupKey(h: DashHw) {
  return `${yearOf(h)}|${sectionOf(h)}`;
}

export function HwHubTabs({ tab, onTab, className = "" }: { tab: HwHubTab; onTab: (t: HwHubTab) => void; className?: string }) {
  const { tr } = useTr();
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="tablist" data-testid="hw-hub-tabs">
      {TAB_ITEMS.map(({ id, ic, en, ar }) => (
        <a
          key={id}
          href={tabHref(id)}
          role="tab"
          aria-selected={tab === id}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            onTab(id);
          }}
          className={`rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition ${tab === id ? "bg-header text-white" : "bg-white text-[#1b2f44] hover:bg-sun/50 dark:bg-white/10 dark:text-white"}`}
          data-testid={`hw-tab-${id}`}
        >
          {ic} {tr(en, ar)}
        </a>
      ))}
    </div>
  );
}

/** Same tab bar on list pages and on an opened homework; from an opened homework, a tab goes back to that list. */
export function HomeworkHubTabs({ tab, onTab }: { tab: HwHubTab; onTab?: (t: HwHubTab) => void }) {
  const router = useRouter();
  const go = (t: HwHubTab) => {
    if (onTab) onTab(t);
    else router.push(tabHref(t));
  };
  return <HwHubTabs tab={tab} onTab={go} />;
}

function sharedOnly(h: DashHw, actorId?: string, role?: string) {
  return role === "teacher" && h.createdBy !== actorId && (((h.data as { share?: { teachers?: string[] } }).share?.teachers) || []).includes(actorId || "");
}

export function HwPortionGrid({
  items,
  chapters,
  asAdmin,
  canAssign,
  empty,
  onChange,
  extra,
  openHash = "",
  correctedCounts,
}: {
  items: DashHw[];
  chapters: Chapter[];
  asAdmin: boolean;
  canAssign: boolean;
  empty: string;
  onChange: () => void;
  extra: { classes: { cls: string; students: number }[]; students: DashStudent[]; catalog?: Catalog; scope?: string[] };
  /** #corrected or #review so the opened homework keeps that hub tab selected. */
  openHash?: string;
  correctedCounts?: Record<string, number>;
}) {
  const { tr, lang } = useTr();
  const { actor } = useLmsActor();
  const q = qhwPerm(actor?.perms, actor?.role === "admin");
  const [editor, setEditor] = useState<DashHw | null>(null);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const [yr, setYr] = useState("");
  const [sec, setSec] = useState("");
  const sn = (n: number) => chapters.find((c) => c.id === n)?.[lang === "ar" ? "name_arabic" : "name_simple"] || `${tr("Surah", "سورة")} ${n}`;

  const years = useMemo(() => sortCls([...new Set(items.flatMap((h) => hwAud(h).years.filter(Boolean)))]), [items]);
  const shown = useMemo(() => items.filter((h) => {
    const a = hwAud(h);
    if (yr && !a.years.includes(yr)) return false;
    if (sec && !a.sections.includes(sec)) return false;
    return true;
  }), [items, yr, sec]);
  const sections = useMemo(() => sortCls([...new Set(shown.flatMap((h) => hwAud(h).sections.filter(Boolean)))]), [shown]);
  const groups = useMemo(() => {
    const map = new Map<string, DashHw[]>();
    for (const h of shown) {
      const k = groupKey(h);
      const list = map.get(k) || [];
      list.push(h);
      map.set(k, list);
    }
    return [...map.entries()].sort((a, b) => clsCmp(a[0], b[0])).map(([key, rows]) => {
      const [year, section = ""] = key.split("|");
      return { key, year, section, rows };
    });
  }, [shown]);

  const yearLabel = (y: string) => y === "__sel" ? tr("Selected students", "طلاب محددون") : y === "__all" ? tr("All students", "كل الطلاب") : y;
  const sectionLabel = (s: string) => s || tr("All sections", "كل الشعب");

  const del = async (h: DashHw) => {
    if (!confirm(tr("Delete this homework and all submissions?", "حذف هذا الواجب وكل التسليمات؟"))) return;
    try {
      await lmsApi.deleteHomework(h.id, asAdmin);
      setMsg(tr("Deleted.", "تم الحذف."));
      setBad(false);
      onChange();
    } catch (e) {
      setMsg(lmsErrorText(e, tr));
      setBad(true);
    }
  };

  const canEdit = (h: DashHw) => !sharedOnly(h, actor?.id, actor?.role) && (h.kind !== "quran" ? canAssign || actor?.role === "admin" : q.edit);
  const canDel = (h: DashHw) => !sharedOnly(h, actor?.id, actor?.role) && (h.kind !== "quran" ? canAssign || actor?.role === "admin" : q.del);

  const card = (h: DashHw, i = 0) => {
    const qd = h.kind === "quran" ? (h.data as QuranData) : null;
    const c = countsOf(h);
    const remind = isLive(h) && !isFullyCorrected(h);
    const n = i % PORTION_WASH.length;
    const icon = h.kind === "quran" ? "📖" : isActivity(h) ? "🎲" : "📝";
    return (
      <article key={h.id} className={`group relative overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br p-4 pt-5 shadow-md ring-1 ring-black/5 dark:border-white/10 ${PORTION_WASH[n]} ${PORTION_LIFT}`} data-testid="hw-portion">
        <span className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${PORTION_BAR[n]}`} aria-hidden />
        <p className="text-xl font-extrabold leading-tight text-heading sm:text-2xl" dir="auto"><span className="me-1 inline-block origin-center transition group-hover:scale-110" aria-hidden>{icon}</span>{h.title}</p>
        {isActivity(h) && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-extrabold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" data-testid="hw-activity-badge">{tr("Activity", "نشاط")}</span>}
        {h.kind === "quran" && <TrkLink id={h.id} kind="hw" asAdmin={asAdmin} />}
        <HwMeta {...hwAud(h)} className="mt-1" />
        {qd && <p className="text-sm opacity-80">{sn(qd.surah)} · {qd.from}–{qd.to}</p>}
        {h.due ? <p className="mt-1 text-xs opacity-70">⏰ {new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}</p> : null}
        <p className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-800 dark:bg-white/10 dark:text-white">{tr("Assigned", "مُسند")} {h.assigned ?? 0}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{tr("Submitted", "مُسلَّم")} {c.submitted}</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">{tr("Approved", "مقبول")} {c.approved}</span>
          {(correctedCounts?.[h.id] || (h.kind === "quran" ? c.approved + c.returned : c.approved)) > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" data-testid="hw-corrected-n">✅ {tr("Corrected", "مصحَّح")} {correctedCounts?.[h.id] ?? (h.kind === "quran" ? c.approved + c.returned : c.approved)}</span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* t587: Open / review takes the navy-and-gold pill style Remind used to have; Remind is now a bell-only button like Edit and Delete. */}
          <a className={OPEN_PILL} href={`/lms/homework?id=${h.id}${openHash}`} data-testid="hw-portion-open">{tr("Open / review", "فتح / مراجعة")}</a>
          {remind && <HwRemindBell hw={h.id} title={h.title} asAdmin={asAdmin} iconOnly btnClass={btn + " !py-1"} />}
          {canEdit(h) && (
            <button type="button" className={btn + " !py-1"} onClick={() => setEditor(h)} title={tr("Edit", "تعديل")} aria-label={tr("Edit", "تعديل")} data-testid="hw-portion-edit">✎</button>
          )}
          {canDel(h) && (
            <button type="button" className={btn + " !py-1"} onClick={() => del(h)} title={tr("Delete", "حذف")} aria-label={tr("Delete", "حذف")} data-testid="hw-portion-del">🗑</button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-3">
      {msg && <p role="status" className={`rounded-xl px-3 py-2 text-sm font-semibold ${bad ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"}`}>{msg}</p>}
      {editor && (
        <div className="mb-4">
          <HomeworkEditor
            initial={editor}
            kinds={[editor.kind]}
            classes={extra.classes}
            students={extra.students}
            catalog={extra.catalog}
            scope={extra.scope}
            asAdmin={asAdmin}
            onCancel={() => setEditor(null)}
            onSaved={() => { setEditor(null); setMsg(tr("Saved.", "تم الحفظ.")); setBad(false); onChange(); }}
          />
        </div>
      )}
      {!!items.length && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="hw-year-filter">
          <button type="button" aria-pressed={!yr} onClick={() => { setYr(""); setSec(""); }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${!yr ? "bg-header text-white" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`} data-testid="hw-year-all">{tr("All years", "كل الصفوف")}</button>
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={yr === y} onClick={() => { setYr(yr === y ? "" : y); setSec(""); }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${yr === y ? "bg-header text-white" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`} data-testid="hw-year-chip">{y}</button>
          ))}
        </div>
      )}
      {!!items.length && sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="hw-sec-filter">
          <button type="button" aria-pressed={!sec} onClick={() => setSec("")} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${!sec ? "bg-[#f5c542] text-[#1b3a57]" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`} data-testid="hw-sec-all">{tr("All sections", "كل الشعب")}</button>
          {sections.map((s) => (
            <button key={s} type="button" aria-pressed={sec === s} onClick={() => setSec(sec === s ? "" : s)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${sec === s ? "bg-[#f5c542] text-[#1b3a57]" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`} data-testid="hw-sec-chip">{s}</button>
          ))}
        </div>
      )}
      {!items.length || !shown.length ? (
        <p className={cardCls + " text-center opacity-70"} data-testid="hw-hub-empty">{empty}</p>
      ) : (
        <div className="space-y-6" data-testid="hw-portion-groups">
          {(() => { let n = 0; return groups.map((g, i) => {
            const prev = groups[i - 1];
            const showYear = !prev || prev.year !== g.year;
            return (
              <section key={g.key} className="space-y-3" data-testid="hw-year-group">
                {showYear && <h3 className="text-lg font-extrabold text-[#1b3a57] dark:text-white" data-testid="hw-year-heading">🏫 {tr("Year", "الصف")}: {yearLabel(g.year)}</h3>}
                <h4 className="text-sm font-extrabold opacity-80" data-testid="hw-sec-heading">👥 {tr("Section", "الشعبة")}: {sectionLabel(g.section)}</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="hw-portion-grid">
                  {g.rows.map((h) => card(h, n++))}
                </div>
              </section>
            );
          }); })()}
        </div>
      )}
    </div>
  );
}

function lessonPlace(p: Pack) {
  const fromAud = packAud(p.aud || []);
  const years = (p.years?.length ? p.years : fromAud.years.length ? fromAud.years : p.topic?.yr ? [p.topic.yr] : []).filter(Boolean);
  const sections = (p.sections?.length ? p.sections : fromAud.sections).filter(Boolean);
  return { years, sections, subject: p.subject || "" };
}

/** Lesson presentations only (Lesson Builder packs of type "lesson"), in the same Year / section cards. */
function LessonBoard({ asAdmin }: { asAdmin: boolean }) {
  const { tr, lang } = useTr();
  const { actor } = useLmsActor();
  const [items, setItems] = useState<Pack[] | null>(null);
  const [acc, setAcc] = useState<Acc | null>(null);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const [yr, setYr] = useState("");
  const [sec, setSec] = useState("");

  const load = useCallback(() => {
    let live = true;
    lp.list(asAdmin).then((r) => {
      if (!live) return;
      const mine = r.items.filter((p) => p.type === "lesson" && (asAdmin || actor?.role === "admin" || p.owner === actor?.id));
      setItems(mine);
      setAcc(r.acc || null);
    }).catch((e) => { if (!live) return; setItems([]); setMsg(modErr(e, tr)); setBad(true); });
    return () => { live = false; };
  }, [asAdmin, actor?.id, actor?.role, tr]);
  useEffect(() => load(), [load]);

  const years = useMemo(() => sortCls([...new Set((items || []).flatMap((p) => lessonPlace(p).years))]), [items]);
  const shown = useMemo(() => (items || []).filter((p) => {
    const a = lessonPlace(p);
    if (yr && !a.years.includes(yr)) return false;
    if (sec && !a.sections.includes(sec)) return false;
    return true;
  }), [items, yr, sec]);
  const sections = useMemo(() => sortCls([...new Set(shown.flatMap((p) => lessonPlace(p).sections))]), [shown]);
  const groups = useMemo(() => {
    const map = new Map<string, Pack[]>();
    for (const p of shown) {
      const a = lessonPlace(p);
      const key = `${a.years.length ? sortCls(a.years).join(" · ") : "__none"}|${sortCls(a.sections).join(" · ")}`;
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => clsCmp(a[0], b[0])).map(([key, rows]) => {
      const [year, section = ""] = key.split("|");
      return { key, year, section, rows };
    });
  }, [shown]);
  const yearLabel = (y: string) => y === "__none" ? tr("No class yet", "بدون صف بعد") : y;
  const sectionLabel = (s: string) => s || tr("All sections", "كل الشعب");
  const canEdit = (p: Pack) => !!acc?.edit && (asAdmin || actor?.role === "admin" || p.owner === actor?.id);
  const canDel = (p: Pack) => !!acc?.delete && (asAdmin || actor?.role === "admin" || p.owner === actor?.id);
  const del = async (p: Pack) => {
    if (!confirm(tr("Delete this lesson presentation?", "حذف عرض هذا الدرس؟"))) return;
    try { await lp.del(p.id, asAdmin); setMsg(tr("Deleted.", "تم الحذف.")); setBad(false); load(); }
    catch (e) { setMsg(modErr(e, tr)); setBad(true); }
  };

  if (items === null && !msg) return <p className={cardCls + " text-center opacity-70"}>{tr("Loading…", "جارٍ التحميل…")}</p>;
  return (
    <div className="space-y-3" data-testid="lesson-hub">
      {!!items?.length && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="lesson-year-filter">
          <button type="button" aria-pressed={!yr} onClick={() => { setYr(""); setSec(""); }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${!yr ? "bg-header text-white" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`}>{tr("All years", "كل الصفوف")}</button>
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={yr === y} onClick={() => { setYr(yr === y ? "" : y); setSec(""); }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${yr === y ? "bg-header text-white" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`}>{y}</button>
          ))}
        </div>
      )}
      {!!items?.length && sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-pressed={!sec} onClick={() => setSec("")} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${!sec ? "bg-[#f5c542] text-[#1b3a57]" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`}>{tr("All sections", "كل الشعب")}</button>
          {sections.map((s) => (
            <button key={s} type="button" aria-pressed={sec === s} onClick={() => setSec(sec === s ? "" : s)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${sec === s ? "bg-[#f5c542] text-[#1b3a57]" : "bg-white text-[#1b2f44] ring-1 ring-black/10 dark:bg-white/10 dark:text-white"}`}>{s}</button>
          ))}
        </div>
      )}
      {msg && !(bad && !items?.length) && <p role="status" className={`rounded-xl px-3 py-2 text-sm font-semibold ${bad ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"}`}>{msg}</p>}
      {!items?.length || !shown.length ? (
        <p className={cardCls + " text-center opacity-70"} data-testid="lesson-hub-empty">{bad && msg ? msg : tr("No lesson presentations for your classes yet. Build them in Lesson Builder — homework, activities and Quran homework stay on their own tabs.", "لا توجد عروض دروس لصفوفك بعد. أنشئها في منشئ الدروس — الواجبات والأنشطة وواجب القرآن تبقى في صفحاتها.")}</p>
      ) : (
        <div className="space-y-6" data-testid="lesson-portion-groups">
          {groups.map((g, i) => {
            const prev = groups[i - 1];
            const showYear = !prev || prev.year !== g.year;
            return (
              <section key={g.key} className="space-y-3" data-testid="lesson-year-group">
                {showYear && <h3 className="text-lg font-extrabold text-[#1b3a57] dark:text-white">🏫 {tr("Year", "الصف")}: {yearLabel(g.year)}</h3>}
                <h4 className="text-sm font-extrabold opacity-80">👥 {tr("Section", "الشعبة")}: {sectionLabel(g.section)}</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {g.rows.map((p) => {
                    const a = lessonPlace(p);
                    return (
                      <article key={p.id} className={cardCls} data-testid="lesson-portion">
                        <p className="text-lg font-extrabold" dir="auto">🎤 {p.title}</p>
                        <HwMeta {...a} className="mt-1" />
                        <p className="mt-1 text-xs opacity-70">{p.count ?? p.slides?.length ?? 0} {tr("slides", "شرائح")} · {p.status === "published" ? tr("Ready to present", "جاهز للعرض") : tr("Draft", "مسودة")}{p.topic?.title ? ` · ${p.topic.title}` : ""}{p.updated ? ` · ${new Date(p.updated).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <a className={OPEN_PILL} href={`/lms/material?open=${encodeURIComponent(p.id)}`} data-testid="lesson-portion-open">{tr("Present", "عرض")}</a>
                          {canEdit(p) && <a className={btn + " !py-1"} href={`/lms/material?edit=${encodeURIComponent(p.id)}`} title={tr("Edit", "تعديل")} aria-label={tr("Edit", "تعديل")} data-testid="lesson-portion-edit">✎</a>}
                          {canDel(p) && <button type="button" className={btn + " !py-1"} onClick={() => del(p)} title={tr("Delete", "حذف")} aria-label={tr("Delete", "حذف")} data-testid="lesson-portion-del">🗑</button>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TeacherHomeworkHub({
  dash,
  chapters,
  asAdmin,
  canAssign,
  tab,
  onTab,
  onReload,
  toolbar,
}: {
  dash: { homework: DashHw[]; classes?: { cls: string; students: number }[]; students?: DashStudent[]; catalog?: Catalog; scope?: string[] };
  chapters: Chapter[];
  asAdmin: boolean;
  canAssign: boolean;
  tab: HwHubTab;
  onTab: (t: HwHubTab) => void;
  onReload: () => void;
  toolbar?: ReactNode;
}) {
  const { tr } = useTr();
  const extra = { classes: dash.classes || [], students: dash.students || [], catalog: dash.catalog, scope: dash.scope };
  const [quranCorr, setQuranCorr] = useState<{ ids: Set<string>; n: Record<string, number> }>({ ids: new Set(), n: {} });
  useEffect(() => {
    let live = true;
    lmsApi.corrected(asAdmin).then((r) => {
      if (!live) return;
      const n: Record<string, number> = {};
      for (const x of r.items) n[x.hw] = (n[x.hw] || 0) + 1;
      setQuranCorr({ ids: new Set(Object.keys(n)), n });
    }).catch(() => { if (live) setQuranCorr({ ids: new Set(), n: {} }); });
    return () => { live = false; };
  }, [asAdmin, dash.homework]);
  const rows = dash.homework.filter((h) => {
    if (tab === "lessons") return false;
    if (tab === "corrected") return hasCorrectedWork(h, quranCorr.ids);
    if (tab === "review") return needsReview(h);
    return hwBucket(h) === tab;
  });
  const empty =
    tab === "homeworks" ? tr("No homework or activities waiting to be assigned. Once you assign them to students, they move to Assigned Homework.", "لا توجد واجبات أو أنشطة بانتظار الإسناد. بعد إسنادها للطلاب تنتقل إلى الواجبات المسندة.")
    : tab === "assigned" ? tr("No assigned homework, activities, or Quran homework.", "لا توجد واجبات أو أنشطة أو واجبات قرآن مسندة.")
    : tab === "review" ? tr("Nothing submitted and waiting for correction.", "لا يوجد عمل مُسلَّم بانتظار التصحيح.")
    : tr("No corrected homework yet. Work you have corrected appears here.", "لا توجد واجبات مصحَّحة بعد. يظهر هنا ما صحّحته.");
  const openHash = tab === "corrected" ? "#corrected" : tab === "review" ? "#review" : "";
  return (
    <section id="homework" className="scroll-mt-28 space-y-4" data-testid="hw-hub">
      <div className="flex flex-wrap items-center gap-2">
        <HomeworkHubTabs tab={tab} onTab={onTab} />
        {toolbar}
      </div>
      {tab === "lessons" ? <LessonBoard asAdmin={asAdmin} /> : (
        <HwPortionGrid items={rows} chapters={chapters} asAdmin={asAdmin} canAssign={canAssign} empty={empty} onChange={onReload} extra={extra} openHash={openHash} correctedCounts={tab === "corrected" ? { ...Object.fromEntries(rows.map((h) => [h.id, h.kind === "quran" ? 0 : countsOf(h).approved])), ...quranCorr.n } : quranCorr.n} />
      )}
    </section>
  );
}
