"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { PptDownload } from "@/components/lms/packs/PptDownload";
import { hwParts, lp, packParts, PART_LABEL, partText, type Acc, type Pack } from "@/lib/packs";

export type HwHubTab = "lessons" | "homeworks" | "tasks" | "quran" | "assigned" | "review" | "corrected";
export type DashHw = Homework & { counts?: Record<string, number>; assigned?: number };

const TAB_ITEMS: { id: HwHubTab; ic: string; en: string; ar: string }[] = [
  { id: "lessons", ic: "🎤", en: "Lessons", ar: "الدروس" },
  { id: "tasks", ic: "✏️", en: "Tasks", ar: "مهام" },
  { id: "homeworks", ic: "📝", en: "Homeworks", ar: "الواجبات" },
  { id: "quran", ic: "📖", en: "Quran Homeworks", ar: "واجبات القرآن" },
  // t664/t756: Review keeps working (rail link, dashboard tile, ?tab=review) and shows here only while open.
  { id: "review", ic: "📥", en: "Review", ar: "مراجعة" },
];
/** t663: Homework sub-tabs (mirror Tasks). "Not assigned yet" keeps drafts / scheduled work reachable. */
export type HwSub = "assigned" | "completed" | "corrected" | "unassigned";
const HW_SUBS: [HwSub, string][] = [["assigned", "📋"], ["completed", "📥"], ["corrected", "✅"], ["unassigned", "🗂️"]];
/** ?sub= or a legacy ?tab= (assigned / corrected) → the Homework sub-tab. */
export function hwSubFromLocation(): HwSub {
  if (typeof window === "undefined") return "assigned";
  const q = new URLSearchParams(window.location.search);
  const v = (q.get("sub") || q.get("tab") || "").toLowerCase();
  if (v === "corrected" || v === "corrected-homeworks") return "corrected";
  if (v === "completed" || v === "submitted") return "completed";
  if (v === "unassigned" || v === "drafts" || v === "not-assigned") return "unassigned";
  return "assigned";
}

const OPEN_PILL = "inline-flex items-center justify-center rounded-full bg-[#1b3a57] px-3 py-1 text-sm font-extrabold text-[#f5c542] shadow transition hover:brightness-110";
/** Same lift as the class cards on My classes, and the same eight colour pairs. */
export const PORTION_LIFT = "transition hover:-translate-y-1 hover:shadow-2xl";
export const PORTION_WASH = [
  "from-sky-100 via-white to-blue-50",
  "from-amber-100 via-white to-orange-50",
  "from-emerald-100 via-white to-teal-50",
  "from-pink-100 via-white to-rose-50",
  "from-violet-100 via-white to-violet-50",
  "from-teal-100 via-white to-cyan-50",
  "from-orange-100 via-white to-red-50",
  "from-lime-100 via-white to-green-50",
];
export const PORTION_BAR = [
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
  if (v === "tasks" || v === "task") return "tasks";
  if (v === "quran" || v === "quran-homework" || v === "quran-homeworks") return "quran";
  // t663: Assigned / Corrected are now Homework sub-tabs (hwSubFromLocation); old links land there.
  if (v === "review" || v === "to-review" || v === "toreview" || v === "to_review") return "review";
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

/** t651: assigned work with Task slides (or an older activity pack). */
export function isTaskHw(h: DashHw) {
  return isLive(h) && (isActivity(h) || hwParts(h.data as { activity?: boolean; parts?: unknown }, h.kind).includes("activity"));
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

/** t670: child-friendly tab widgets for the Homework page — big rounded cards, a bright colour per tab, bubbly counts. */
export type KidTheme = "lessons" | "tasks" | "homeworks" | "quran" | "review";
const KID_GRAD: Record<KidTheme, string> = {
  lessons: "from-violet-400 to-fuchsia-500",
  tasks: "from-amber-400 to-orange-500",
  homeworks: "from-sky-400 to-blue-600",
  quran: "from-emerald-400 to-teal-600",
  review: "from-rose-400 to-pink-600",
};
export function kidTabCls(t: KidTheme, on: boolean) {
  return `group inline-flex min-w-[9.5rem] items-center gap-3 rounded-3xl px-4 py-3 text-base font-extrabold shadow-md transition duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-95 motion-reduce:transform-none ${on ? `bg-gradient-to-br ${KID_GRAD[t]} text-white shadow-lg ring-4 ring-white/70 dark:ring-white/25` : "bg-white/85 text-[#1b2f44] ring-1 ring-black/10 backdrop-blur-md hover:bg-white dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15"}`;
}
export function KidIcon({ t, on, ic }: { t: KidTheme; on: boolean; ic: string }) {
  return <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl shadow-inner transition group-hover:rotate-6 motion-reduce:transform-none ${on ? "bg-white/25" : `bg-gradient-to-br ${KID_GRAD[t]}`}`}>{ic}</span>;
}
export function KidBubble({ t, on, n, small = false }: { t: KidTheme; on: boolean; n: number; small?: boolean }) {
  return <span className={`inline-grid place-items-center rounded-full font-black shadow ${small ? "h-6 min-w-6 px-1.5 text-xs" : "h-7 min-w-7 px-2 text-sm"} ${on ? "bg-white text-[#1b2f44]" : `bg-gradient-to-br ${KID_GRAD[t]} text-white`}`} data-testid="kid-count">{n}</span>;
}
export function kidSubCls(t: KidTheme, on: boolean) {
  return `inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-extrabold shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95 motion-reduce:transform-none ${on ? `bg-gradient-to-br ${KID_GRAD[t]} text-white shadow-md` : "bg-white/85 text-[#1b2f44] ring-1 ring-black/10 backdrop-blur-md hover:bg-white dark:bg-white/10 dark:text-white dark:ring-white/15"}`;
}
/** A sub-tab row in its parent tab's colour (soft tinted glass panel). */
export function kidSubRow(t: KidTheme) {
  const tint: Record<KidTheme, string> = { lessons: "bg-violet-100/60 dark:bg-violet-400/10", tasks: "bg-amber-100/70 dark:bg-amber-400/10", homeworks: "bg-sky-100/70 dark:bg-sky-400/10", quran: "bg-emerald-100/70 dark:bg-emerald-400/10", review: "bg-rose-100/70 dark:bg-rose-400/10" };
  return `flex flex-wrap gap-2 rounded-3xl p-2 ring-1 ring-black/5 dark:ring-white/10 ${tint[t]}`;
}

/** t756: hover (desktop) / tap (mobile) menu on a homework widget. Keyboard: Enter/Space/Arrow to open, arrows to move, Escape to close. */
export type HwMenuItem = { key: string; ic: string; en: string; ar: string; n: number };

export function HwKidWidget({
  theme, ic, label, selected, count, href, items, activeKey, onPick, testId,
}: {
  theme: KidTheme;
  ic: string;
  label: string;
  selected: boolean;
  count?: number;
  href?: string;
  items?: HwMenuItem[];
  activeKey?: string;
  onPick?: (key?: string) => void;
  testId: string;
}) {
  const { tr } = useTr();
  const uid = useId();
  const menuId = `${uid}-menu`;
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeT = useRef<number>(0);
  const [open, setOpen] = useState(false);
  const hasMenu = !!(items && items.length);

  const clearClose = () => { if (closeT.current) window.clearTimeout(closeT.current); closeT.current = 0; };
  const close = () => { clearClose(); setOpen(false); };
  const openMenu = () => { if (hasMenu) { clearClose(); setOpen(true); } };

  useEffect(() => () => clearClose(), []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const focusItem = (i: number) => {
    const list = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!list.length) return;
    const n = (i + list.length) % list.length;
    list[n]?.focus();
  };

  const onBtnKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!hasMenu) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " " || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
      window.setTimeout(() => focusItem(e.key === "ArrowUp" ? (items!.length - 1) : 0), 0);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const onItemKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem((items?.length || 1) - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(); btn.current?.focus(); }
    else if (e.key === "Tab") { close(); }
  };

  const pick = (key?: string) => {
    close();
    onPick?.(key);
  };

  const face = (
    <>
      <KidIcon t={theme} on={selected} ic={ic} />
      <span className="flex-1 text-start">{label}</span>
      {count !== undefined && <KidBubble t={theme} on={selected} n={count} />}
      {hasMenu && <span aria-hidden className={`text-xs opacity-80 transition ${open ? "rotate-180" : ""}`}>▾</span>}
    </>
  );

  const menu = hasMenu && open && (
    <div
      id={menuId}
      role="menu"
      aria-label={label}
      className="absolute start-0 top-[calc(100%-0.25rem)] z-40 mt-1 min-w-[16.5rem] rounded-2xl bg-white p-1.5 text-[#1b2f44] shadow-2xl ring-1 ring-black/10 dark:bg-[#12233a] dark:text-white dark:ring-white/15"
      data-testid={testId + "-menu"}
    >
      {items!.map((it, i) => {
        const on = selected && activeKey === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            ref={(el) => { itemRefs.current[i] = el; }}
            className={`flex w-full min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b3a57] ${on ? `bg-gradient-to-br ${KID_GRAD[theme]} text-white` : "hover:bg-black/5 dark:hover:bg-white/10"}`}
            onClick={() => pick(it.key)}
            onKeyDown={(e) => onItemKey(e, i)}
            data-testid={`${testId}-${it.key}`}
          >
            <span aria-hidden className="text-lg">{it.ic}</span>
            <span className="flex-1">{tr(it.en, it.ar)}</span>
            <KidBubble t={theme} on={on} n={it.n} small />
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={wrap}
      className="relative"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") openMenu(); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") { clearClose(); closeT.current = window.setTimeout(() => setOpen(false), 160); } }}
    >
      {hasMenu ? (
        <button
          ref={btn}
          type="button"
          className={kidTabCls(theme, selected)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={onBtnKey}
          data-testid={testId}
        >
          {face}
        </button>
      ) : href ? (
        <a
          href={href}
          role="tab"
          aria-selected={selected}
          className={kidTabCls(theme, selected)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            pick();
          }}
          data-testid={testId}
        >
          {face}
        </a>
      ) : (
        <button type="button" role="tab" aria-selected={selected} className={kidTabCls(theme, selected)} onClick={() => pick()} data-testid={testId}>
          {face}
        </button>
      )}
      {menu}
    </div>
  );
}

export function HwHubTabs({ tab, onTab, className = "", counts, menus, activeSub }: {
  tab: HwHubTab;
  onTab: (t: HwHubTab, sub?: string) => void;
  className?: string;
  counts?: Partial<Record<HwHubTab, number>>;
  menus?: Partial<Record<HwHubTab, HwMenuItem[]>>;
  activeSub?: string;
}) {
  const { tr } = useTr();
  return (
    <div className={`flex flex-wrap gap-3 ${className}`} role="tablist" data-testid="hw-hub-tabs">
      {TAB_ITEMS.filter(({ id }) => id !== "review" || tab === "review").map(({ id, ic, en, ar }) => (
        <HwKidWidget
          key={id}
          theme={id as KidTheme}
          ic={ic}
          label={tr(en, ar)}
          selected={tab === id}
          count={counts?.[id]}
          href={tabHref(id)}
          items={menus?.[id]}
          activeKey={tab === id ? activeSub : undefined}
          onPick={(key) => onTab(id, key)}
          testId={`hw-tab-${id}`}
        />
      ))}
    </div>
  );
}

/** Same tab bar on list pages and on an opened homework; from an opened homework, a tab goes back to that list. */
export function HomeworkHubTabs({ tab, onTab, counts, menus, activeSub }: {
  tab: HwHubTab;
  onTab?: (t: HwHubTab, sub?: string) => void;
  counts?: Partial<Record<HwHubTab, number>>;
  menus?: Partial<Record<HwHubTab, HwMenuItem[]>>;
  activeSub?: string;
}) {
  const router = useRouter();
  const go = (t: HwHubTab, sub?: string) => {
    if (onTab) onTab(t, sub);
    else {
      const href = tabHref(t);
      router.push(sub && sub !== "assigned" ? `${href}${href.includes("?") ? "&" : "?"}sub=${sub}` : href);
    }
  };
  return <HwHubTabs tab={tab} onTab={go} counts={counts} menus={menus} activeSub={activeSub} />;
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
      <article key={h.id} className={`light-island group relative overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br p-4 pt-5 shadow-md ring-1 ring-black/5 ${PORTION_WASH[n]} ${PORTION_LIFT}`} data-testid="hw-portion">
        <span className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${PORTION_BAR[n]}`} aria-hidden />
        <p className="text-xl font-extrabold leading-tight text-heading sm:text-2xl" dir="auto"><span className="me-1 inline-block origin-center transition group-hover:scale-110" aria-hidden>{icon}</span>{h.title}</p>
        {isActivity(h) && !(Array.isArray((h.data as { parts?: unknown }).parts) && ((h.data as { parts?: unknown[] }).parts || []).length) && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-extrabold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" data-testid="hw-activity-badge">{tr("Task", "مهمة")}</span>}
        {hwParts(h.data as { activity?: boolean; parts?: unknown }, h.kind).length > 0 && Array.isArray((h.data as { parts?: unknown }).parts) && <p className="mt-1 flex flex-wrap gap-1" data-testid="hw-parts">{hwParts(h.data as { activity?: boolean; parts?: unknown }, h.kind).map((k) => <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${PART_LABEL[k][3]}`}>{PART_LABEL[k][0]} {tr(partText(k, false)[0], partText(k, false)[1])}</span>)}</p>}
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
function LessonBoard({ asAdmin, onCount }: { asAdmin: boolean; onCount?: (n: number) => void }) {
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
      const mine = r.items.filter((p) => {
        const own = asAdmin || actor?.role === "admin" || p.owner === actor?.id;
        if (!own || p.type === "material") return false;
        if (p.type === "lesson") return true;
        return p.status === "published" && packParts(p).includes("lesson");
      });
      setItems(mine);
      onCount?.(mine.length);
      setAcc(r.acc || null);
    }).catch((e) => { if (!live) return; setItems([]); setMsg(modErr(e, tr)); setBad(true); });
    return () => { live = false; };
  }, [asAdmin, actor?.id, actor?.role, tr, onCount]);
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
        <p className={cardCls + " text-center opacity-70"} data-testid="lesson-hub-empty">{bad && msg ? msg : tr("No lesson presentations for your classes yet. Build them in Lesson Builder — homework, tasks and Quran homework stay on their own tabs.", "لا توجد عروض دروس لصفوفك بعد. أنشئها في منشئ الدروس — الواجبات والمهام وواجب القرآن تبقى في صفحاتها.")}</p>
      ) : (
        <div className="space-y-6" data-testid="lesson-portion-groups">
          {(() => { let lessonN = 0; return groups.map((g, i) => {
            const prev = groups[i - 1];
            const showYear = !prev || prev.year !== g.year;
            return (
              <section key={g.key} className="space-y-3" data-testid="lesson-year-group">
                {showYear && <h3 className="text-lg font-extrabold text-[#1b3a57] dark:text-white">🏫 {tr("Year", "الصف")}: {yearLabel(g.year)}</h3>}
                <h4 className="text-sm font-extrabold opacity-80">👥 {tr("Section", "الشعبة")}: {sectionLabel(g.section)}</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {g.rows.map((p) => {
                    const a = lessonPlace(p);
                    const n = lessonN++ % PORTION_WASH.length;
                    return (
                      <article key={p.id} className={`light-island group relative overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br p-4 pt-5 shadow-md ring-1 ring-black/5 ${PORTION_WASH[n]} ${PORTION_LIFT}`} data-testid="lesson-portion">
                        <span className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${PORTION_BAR[n]}`} aria-hidden />
                        <p className="text-xl font-extrabold leading-tight text-heading sm:text-2xl" dir="auto"><span className="me-1 inline-block origin-center transition group-hover:scale-110" aria-hidden>🎤</span>{p.title}</p>
                        <HwMeta {...a} className="mt-1" />
                        <p className="mt-1 text-xs opacity-70">{p.count ?? p.slides?.length ?? 0} {tr("slides", "شرائح")} · {p.type !== "lesson" ? tr("Assigned · lesson slides", "مُسند · شرائح الدرس") : p.status === "published" ? tr("Ready to present", "جاهز للعرض") : tr("Draft", "مسودة")}{p.topic?.title ? ` · ${p.topic.title}` : ""}{p.updated ? ` · ${new Date(p.updated).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <a className={OPEN_PILL} href={`/lms/material?open=${encodeURIComponent(p.id)}&from=lessons${p.type !== "lesson" ? "&part=lesson" : ""}`} data-testid="lesson-portion-open">{p.type !== "lesson" ? tr("Lesson slides", "شرائح الدرس") : tr("Present", "عرض")}</a>
                          {canEdit(p) && <a className={btn + " !py-1"} href={`/lms/material?edit=${encodeURIComponent(p.id)}&from=lessons`} title={tr("Edit", "تعديل")} aria-label={tr("Edit", "تعديل")} data-testid="lesson-portion-edit">✎</a>}
                          <PptDownload id={p.id} asAdmin={asAdmin} className={btn + " !py-1"} />
                          {canDel(p) && p.type === "lesson" && <button type="button" className={btn + " !py-1"} onClick={() => del(p)} title={tr("Delete", "حذف")} aria-label={tr("Delete", "حذف")} data-testid="lesson-portion-del">🗑</button>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          }); })()}
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
  onTab: (t: HwHubTab, sub?: string) => void;
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
  /** t664/t756: Tasks, Homeworks and Quran Homeworks offer Assigned / Completed / Corrected (plus Not assigned yet when something is waiting) from a hover/tap menu on each widget. Counts come from the dashboard data already loaded. */
  const [subs, setSubs] = useState<Partial<Record<HwHubTab, HwSub>>>({});
  const sub: HwSub = subs[tab] || "assigned";
  // Deep link from ?sub= / an old ?tab=assigned|corrected link.
  useEffect(() => {
    const read = () => setSubs({ [tabFromLocation()]: hwSubFromLocation() });
    read();
    const old = new URLSearchParams(window.location.search).get("tab");
    if (window.location.pathname.replace(/\/$/, "") === "/lms/homework" && (old === "assigned" || old === "corrected" || old === "assigned-homework" || old === "corrected-homeworks")) {
      window.history.replaceState(null, "", `/lms/homework?sub=${hwSubFromLocation()}${window.location.hash}`);
    }
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const pagesOf = (h: DashHw) => hwParts(h.data as { activity?: boolean; parts?: unknown }, h.kind);
  const groupOf = (h: DashHw): "tasks" | "homeworks" | "quran" => (h.kind === "quran" ? "quran" : pagesOf(h).includes("homework") || !pagesOf(h).length ? "homeworks" : "tasks");
  const live = dash.homework.filter((h) => hwBucket(h) === "assigned");
  const liveOf = { tasks: dash.homework.filter(isTaskHw), homeworks: live.filter((h) => h.kind !== "quran" && pagesOf(h).includes("homework")), quran: live.filter((h) => h.kind === "quran") };
  const subRows = (g: "tasks" | "homeworks" | "quran"): Record<HwSub, DashHw[]> => ({
    assigned: liveOf[g],
    completed: liveOf[g].filter(needsReview),
    corrected: liveOf[g].filter((h) => hasCorrectedWork(h, quranCorr.ids)),
    unassigned: dash.homework.filter((h) => hwBucket(h) === "homeworks" && groupOf(h) === g),
  });
  const grp = tab === "tasks" || tab === "homeworks" || tab === "quran" ? tab : null;
  const cur = grp ? subRows(grp) : null;
  const rows = cur ? cur[sub] : tab === "review" ? dash.homework.filter(needsReview) : [];
  const noun = grp === "tasks" ? tr("tasks", "مهام") : grp === "quran" ? tr("Quran homework", "واجبات قرآن") : tr("homework", "واجبات");
  const empty = tab === "review" ? tr("Nothing submitted and waiting for correction.", "لا يوجد عمل مُسلَّم بانتظار التصحيح.")
    : sub === "unassigned" ? tr(`No ${noun} waiting to be assigned.`, `لا توجد ${noun} بانتظار الإسناد.`)
    : sub === "completed" ? tr(`No completed ${noun} waiting for correction.`, `لا توجد ${noun} مكتملة بانتظار التصحيح.`)
    : sub === "corrected" ? tr(`No corrected ${noun} yet.`, `لا توجد ${noun} مصحَّحة بعد.`)
    : grp === "tasks" ? tr("No assigned tasks yet. Task slides you assign from Lesson Builder appear here.", "لا توجد مهام مسندة بعد. تظهر هنا شرائح المهام التي تسندها من منشئ الدروس.")
    : tr(`No assigned ${noun} yet.`, `لا توجد ${noun} مسندة بعد.`);
  /** t662: a count on every hub tab (no extra reads). Lessons are counted once the Lessons tab has loaded its own list. */
  const [lessonCount, setLessonCount] = useState<number | undefined>(undefined);
  const hubCounts: Partial<Record<HwHubTab, number>> = {
    tasks: liveOf.tasks.length,
    homeworks: liveOf.homeworks.length,
    quran: liveOf.quran.length,
    review: dash.homework.filter(needsReview).length,
    ...(lessonCount !== undefined ? { lessons: lessonCount } : {}),
  };
  const corrView = !!grp && sub === "corrected";
  const openHash = corrView ? "#corrected" : tab === "review" || (!!grp && sub === "completed") ? "#review" : "";
  const SUB_LABEL: Record<"tasks" | "homeworks" | "quran", Record<HwSub, [string, string]>> = {
    tasks: { assigned: ["Assigned Tasks", "المهام المسندة"], completed: ["Completed Tasks", "المهام المكتملة"], corrected: ["Corrected Tasks", "المهام المصحَّحة"], unassigned: ["Not assigned yet", "لم تُسند بعد"] },
    homeworks: { assigned: ["Assigned Homework", "الواجبات المسندة"], completed: ["Completed Homework", "الواجبات المكتملة"], corrected: ["Corrected Homework", "الواجبات المصحَّحة"], unassigned: ["Not assigned yet", "لم تُسند بعد"] },
    quran: { assigned: ["Assigned Quran Homework", "واجبات القرآن المسندة"], completed: ["Completed Quran Homework", "واجبات القرآن المكتملة"], corrected: ["Corrected Quran Homework", "واجبات القرآن المصحَّحة"], unassigned: ["Not assigned yet", "لم تُسند بعد"] },
  };
  const menus: Partial<Record<HwHubTab, HwMenuItem[]>> = {};
  for (const g of ["tasks", "homeworks", "quran"] as const) {
    const rows = subRows(g);
    menus[g] = HW_SUBS.filter(([k]) => k !== "unassigned" || rows.unassigned.length > 0 || (tab === g && sub === "unassigned")).map(([k, ic]) => ({
      key: k, ic, en: SUB_LABEL[g][k][0], ar: SUB_LABEL[g][k][1], n: rows[k].length,
    }));
  }
  const goTab = (t: HwHubTab, k?: string) => {
    const next = (k === "completed" || k === "corrected" || k === "unassigned" || k === "assigned") ? k : undefined;
    if (next && (t === "tasks" || t === "homeworks" || t === "quran")) setSubs((m) => ({ ...m, [t]: next }));
    onTab(t, next);
  };

  return (
    <section id="homework" className="scroll-mt-28 space-y-4" data-testid="hw-hub">
      <div className="flex flex-wrap items-center gap-2">
        <HomeworkHubTabs tab={tab} onTab={goTab} counts={hubCounts} menus={menus} activeSub={grp ? sub : undefined} />
        {toolbar}
      </div>
      {tab === "lessons" ? <LessonBoard asAdmin={asAdmin} onCount={setLessonCount} /> : (
        <HwPortionGrid items={rows} chapters={chapters} asAdmin={asAdmin} canAssign={canAssign} empty={empty} onChange={onReload} extra={extra} openHash={openHash} correctedCounts={corrView ? { ...Object.fromEntries(rows.map((h) => [h.id, h.kind === "quran" ? 0 : countsOf(h).approved])), ...quranCorr.n } : quranCorr.n} />
      )}
    </section>
  );
}
