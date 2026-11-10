"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { HwRemindBell } from "@/components/lms/HwRemind";
import { TrkLink } from "@/components/tracker/TrkLink";
import { btn, cardCls } from "@/components/lms/mods/ModUi";
import { CorrectedList } from "@/components/lms/mods/CorrectedHomework";
import { useLmsActor, useTr } from "@/components/lms/useLms";
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

/** Fully corrected: every assignee has been approved and nothing is left to review. */
function isFullyCorrected(h: DashHw) {
  const assigned = h.assigned ?? 0;
  return assigned > 0 && countsOf(h).approved >= assigned && toReview(h) === 0;
}

/**
 * Homeworks = created but not yet assigned (unassigned or scheduled for later).
 * Assigned homework = live with students (assigned count > 0 and assignAt not in the future), even if no one has started.
 * Corrected Homeworks = every assignee approved, nothing left to review.
 */
export function hwBucket(h: DashHw): HwHubTab {
  if (isFullyCorrected(h)) return "corrected";
  if (isLive(h)) return "assigned";
  return "homeworks";
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
}: {
  items: DashHw[];
  chapters: Chapter[];
  asAdmin: boolean;
  canAssign: boolean;
  empty: string;
  onChange: () => void;
  extra: { classes: { cls: string; students: number }[]; students: DashStudent[]; catalog?: Catalog; scope?: string[] };
}) {
  const { tr, lang } = useTr();
  const { actor } = useLmsActor();
  const q = qhwPerm(actor?.perms, actor?.role === "admin");
  const [editor, setEditor] = useState<DashHw | null>(null);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const sn = (n: number) => chapters.find((c) => c.id === n)?.[lang === "ar" ? "name_arabic" : "name_simple"] || `${tr("Surah", "سورة")} ${n}`;

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
      {!items.length ? (
        <p className={cardCls + " text-center opacity-70"} data-testid="hw-hub-empty">{empty}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="hw-portion-grid">
          {items.map((h) => {
            const qd = h.kind === "quran" ? (h.data as QuranData) : null;
            const c = countsOf(h);
            return (
              <article key={h.id} className={cardCls} data-testid="hw-portion">
                <p className="text-lg font-extrabold" dir="auto">{h.kind === "quran" ? "📖" : "📝"} {h.title}</p>
                {isActivity(h) && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-extrabold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" data-testid="hw-activity-badge">{tr("Activity", "نشاط")}</span>}
                {h.kind === "quran" && <TrkLink id={h.id} kind="hw" asAdmin={asAdmin} />}
                {qd && <p className="text-sm opacity-80">{sn(qd.surah)} · {qd.from}–{qd.to}</p>}
                <p className="mt-1 text-xs opacity-70">{[h.cls, h.section].filter(Boolean).join(" · ") || (h.students.length ? tr("Selected students", "طلاب محددون") : tr("All students", "كل الطلاب"))}{h.due ? ` · ⏰ ${new Date(h.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}</p>
                <p className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-800 dark:bg-white/10 dark:text-white">{tr("Assigned", "مُسند")} {h.assigned ?? 0}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{tr("Submitted", "مُسلَّم")} {c.submitted}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">{tr("Approved", "مقبول")} {c.approved}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <HwRemindBell hw={h.id} title={h.title} asAdmin={asAdmin} />
                  <a className={btn + " !py-1"} href={`/lms/homework?id=${h.id}`} data-testid="hw-portion-open">{tr("Open / review", "فتح / مراجعة")}</a>
                  {canEdit(h) && (
                    <button type="button" className={btn + " !py-1"} onClick={() => setEditor(h)} title={tr("Edit", "تعديل")} aria-label={tr("Edit", "تعديل")} data-testid="hw-portion-edit">✎</button>
                  )}
                  {canDel(h) && (
                    <button type="button" className={btn + " !py-1"} onClick={() => del(h)} title={tr("Delete", "حذف")} aria-label={tr("Delete", "حذف")} data-testid="hw-portion-del">🗑</button>
                  )}
                </div>
              </article>
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
  const { actor } = useLmsActor();
  const qOk = actor?.role === "teacher" && qhwPerm(actor?.perms).show && qhwPerm(actor?.perms).view;
  const extra = { classes: dash.classes || [], students: dash.students || [], catalog: dash.catalog, scope: dash.scope };
  const rows = dash.homework.filter((h) => hwBucket(h) === tab);
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
      {tab === "corrected" ? (
        <div className="space-y-6">
          {qOk && <CorrectedList asAdmin={false} />}
          <HwPortionGrid items={rows} chapters={chapters} asAdmin={asAdmin} canAssign={canAssign} empty={qOk && !rows.length ? tr("No corrected general homework or activities yet.", "لا توجد واجبات أو أنشطة عامة مصحّحة بعد.") : empty} onChange={onReload} extra={extra} />
        </div>
      ) : (
        <HwPortionGrid items={rows} chapters={chapters} asAdmin={asAdmin} canAssign={canAssign} empty={empty} onChange={onReload} extra={extra} />
      )}
    </section>
  );
}
