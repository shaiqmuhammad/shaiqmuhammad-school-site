"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { HwMeta, hwAud } from "@/components/lms/HwMeta";
import { HwRemindBell } from "@/components/lms/HwRemind";
import { TrkLink } from "@/components/tracker/TrkLink";
import { btn, cardCls } from "@/components/lms/mods/ModUi";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { clsCmp, sortCls } from "@/lib/classSort";
import { lmsApi, lmsErrorText, type Catalog, type Chapter, type DashStudent, type Homework, type QuranData } from "@/lib/lms";
import { qhwPerm } from "@/lib/lmsMods";

export type HwHubTab = "homeworks" | "assigned" | "corrected";
export type DashHw = Homework & { counts?: Record<string, number>; assigned?: number };

const TAB_ITEMS: { id: HwHubTab; ic: string; en: string; ar: string }[] = [
  { id: "homeworks", ic: "📝", en: "Homeworks", ar: "الواجبات" },
  { id: "assigned", ic: "📋", en: "Assigned homework", ar: "الواجبات المسندة" },
  { id: "corrected", ic: "✅", en: "Corrected Homeworks", ar: "الواجبات المصحَّحة" },
];

/** Read the hub tab from ?tab= or a leftover hash (#quran / #general / #assigned / #corrected). */
export function tabFromLocation(): HwHubTab {
  if (typeof window === "undefined") return "homeworks";
  const q = new URLSearchParams(window.location.search).get("tab") || "";
  const h = window.location.hash.replace("#", "");
  const v = q || h;
  if (v === "assigned") return "assigned";
  if (v === "corrected") return "corrected";
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

function toReview(h: DashHw) {
  const c = countsOf(h);
  return Math.max(0, c.submitted - c.waiting);
}

/** Every assignee has been approved and nothing is left to review — leaves the Assigned tab. */
function isFullyCorrected(h: DashHw) {
  const assigned = h.assigned ?? 0;
  return assigned > 0 && countsOf(h).approved >= assigned && toReview(h) === 0;
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
 * Homeworks = created but not yet assigned (unassigned or scheduled for later).
 * Assigned homework = live with students, unless every assignee is already approved.
 * (The Corrected tab uses hasCorrectedWork and can overlap with Assigned.)
 */
export function hwBucket(h: DashHw): HwHubTab {
  if (isFullyCorrected(h)) return "corrected";
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
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onTab(id)}
          className={`rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition ${tab === id ? "bg-header text-white" : "bg-white text-[#1b2f44] hover:bg-sun/50 dark:bg-white/10 dark:text-white"}`}
          data-testid={`hw-tab-${id}`}
        >
          {ic} {tr(en, ar)}
        </button>
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
  openToCorrected = false,
  correctedCounts,
}: {
  items: DashHw[];
  chapters: Chapter[];
  asAdmin: boolean;
  canAssign: boolean;
  empty: string;
  onChange: () => void;
  extra: { classes: { cls: string; students: number }[]; students: DashStudent[]; catalog?: Catalog; scope?: string[] };
  openToCorrected?: boolean;
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

  const card = (h: DashHw) => {
    const qd = h.kind === "quran" ? (h.data as QuranData) : null;
    const c = countsOf(h);
    const remind = isLive(h) && !isFullyCorrected(h);
    return (
      <article key={h.id} className={cardCls} data-testid="hw-portion">
        <p className="text-lg font-extrabold" dir="auto">{h.kind === "quran" ? "📖" : "📝"} {h.title}</p>
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
        <div className="mt-3 flex flex-wrap gap-2">
          {remind && <HwRemindBell hw={h.id} title={h.title} asAdmin={asAdmin} />}
          <a className={btn + " !py-1"} href={`/lms/homework?id=${h.id}${openToCorrected ? "#corrected" : ""}`} data-testid="hw-portion-open">{tr("Open / review", "فتح / مراجعة")}</a>
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
          {groups.map((g, i) => {
            const prev = groups[i - 1];
            const showYear = !prev || prev.year !== g.year;
            return (
              <section key={g.key} className="space-y-3" data-testid="hw-year-group">
                {showYear && <h3 className="text-lg font-extrabold text-[#1b3a57] dark:text-white" data-testid="hw-year-heading">🏫 {tr("Year", "الصف")}: {yearLabel(g.year)}</h3>}
                <h4 className="text-sm font-extrabold opacity-80" data-testid="hw-sec-heading">👥 {tr("Section", "الشعبة")}: {sectionLabel(g.section)}</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="hw-portion-grid">
                  {g.rows.map(card)}
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
  const rows = dash.homework.filter((h) => tab === "corrected" ? hasCorrectedWork(h, quranCorr.ids) : hwBucket(h) === tab);
  const empty =
    tab === "homeworks" ? tr("No homework or activities waiting to be assigned. Once you assign them to students, they move to Assigned homework.", "لا توجد واجبات أو أنشطة بانتظار الإسناد. بعد إسنادها للطلاب تنتقل إلى الواجبات المسندة.")
    : tab === "assigned" ? tr("No assigned homework or activities.", "لا توجد واجبات أو أنشطة مسندة.")
    : tr("No corrected homework or activities yet.", "لا توجد واجبات أو أنشطة مصحّحة بعد.");
  return (
    <section id="homework" className="scroll-mt-28 space-y-4" data-testid="hw-hub">
      <div className="flex flex-wrap items-center gap-2">
        <HomeworkHubTabs tab={tab} onTab={onTab} />
        {toolbar}
      </div>
      <HwPortionGrid items={rows} chapters={chapters} asAdmin={asAdmin} canAssign={canAssign} empty={empty} onChange={onReload} extra={extra} openToCorrected={tab === "corrected"} correctedCounts={tab === "corrected" ? { ...Object.fromEntries(rows.map((h) => [h.id, h.kind === "quran" ? 0 : countsOf(h).approved])), ...quranCorr.n } : quranCorr.n} />
    </section>
  );
}
