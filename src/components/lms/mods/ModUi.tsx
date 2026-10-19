"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { clsNum, secLetter } from "@/lib/classFmt";
import { grpLabel, lmsApi, type StudentGroup } from "@/lib/lms";
import { modCall, modPerm, type Roster } from "@/lib/lmsMods";

export const cardCls = "rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5";
export const field = "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40 dark:border-white/15 dark:bg-black/20";
export const btn = "inline-flex items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-sm font-bold transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15";
export const btnCta = "inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--cta)] px-4 py-2 text-sm font-extrabold text-[var(--cta-foreground)] shadow-sm transition hover:brightness-95 disabled:opacity-50";
export const th = "px-3 py-2 text-start text-xs font-bold uppercase tracking-wide text-black/60 dark:text-white/60";
export const td = "px-3 py-2 align-middle text-sm";

/** Teacher page frame (admin renders the modules without it). */
export function ModPage({ title, children, perm }: { title: string; perm: "att" | "beh" | "cur"; children: (asAdmin: false) => ReactNode }) {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  const p = modPerm(actor?.perms, false, perm);
  return (
    <AssessmentShell title={title} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
        {!ready ? null : !actor || actor.role === "student" ? (
          <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in as a teacher.", "سجّل الدخول كمعلم.")} <a className="font-bold underline" href="/lms/login/">{tr("Sign in", "دخول")}</a></p>
        ) : !p.view ? (
          <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="mod-no-access">{tr("You don't have access to this module. Ask the admin to switch it on for you.", "ليس لديك صلاحية لهذه الوحدة. اطلب من الإدارة تفعيلها.")}</p>
        ) : children(false)}
      </div>
    </AssessmentShell>
  );
}

export function Head({ icon, title, sub, children, hide }: { icon: string; title: string; sub: string; children?: ReactNode; hide?: boolean }) {
  if (hide) return children ? <div className="mb-4 flex justify-end">{children}</div> : null;
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><h2 className="text-2xl font-extrabold tracking-tight">{icon} {title}</h2><p className="text-sm opacity-70">{sub}</p></div>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, testId }: { value: T; onChange: (v: T) => void; items: [T, string][]; testId?: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-3xl border border-black/10 bg-black/[0.04] p-1 dark:border-white/10 dark:bg-white/5" role="tablist" data-testid={testId}>
      {items.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)} data-testid={`${testId}-${id}`} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${value === id ? "bg-[var(--cta)] text-[var(--cta-foreground)] shadow" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>{label}</button>)}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-black/60 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 text-[#1b2f44] shadow-2xl dark:bg-[#12273b] dark:text-white ${wide ? "max-w-3xl" : "max-w-xl"}`} onClick={(e) => e.stopPropagation()} data-testid="mod-modal">
        <div className="mb-3 flex items-center gap-3"><h3 className="min-w-0 flex-1 text-lg font-extrabold">{title}</h3><button type="button" className={btn} onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ msg, bad }: { msg: string; bad?: boolean }) {
  if (!msg) return null;
  return <p role="status" className={`mb-3 rounded-xl px-3 py-2 text-sm font-semibold ${bad ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"}`} data-testid="mod-msg">{msg}</p>;
}

export type RGroup = { key: string; name: string; ids: string[]; cls: string; section: string };
/** Staff roster (admin: all students; teacher: own students only — enforced by the server) plus the assigned Student GROUPS (shared by every picker). */
export function useRoster(asAdmin: boolean) {
  const [students, setStudents] = useState<Roster[] | null>(null);
  const [grp, setGrp] = useState<StudentGroup[]>([]);
  useEffect(() => {
    modCall<{ students: Roster[] }>("class-roster", undefined, asAdmin).then((r) => setStudents(r.students)).catch(() => setStudents([]));
    lmsApi.grpList(asAdmin).then((r) => setGrp(r.items.filter((x) => (asAdmin ? x.adminGroup : x.assigned)))).catch(() => setGrp([]));
  }, [asAdmin]);
  const groups = useMemo<RGroup[]>(() => {
    const have = new Set((students || []).map((s) => s.id));
    return grp.map((g) => ({ key: g.id, name: grpLabel(g), ids: g.students.filter((id) => have.has(id)), cls: "", section: "" })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [grp, students]);
  return { students, groups };
}
/** The class|section pairs that the given student ids belong to (for endpoints that take a class). */
export function groupClasses(students: Roster[] | null, ids: string[]) {
  const set = new Set(ids); const out = new Set<string>();
  for (const s of students || []) if (set.has(s.id)) out.add(`${s.cls}|${s.section}`);
  return [...out];
}
export const groupLabel = (g: { cls: string; section: string }, tr: (en: string, ar: string) => string) => `${tr("Class", "الصف")} ${clsNum(g.cls)}${g.section ? secLetter(g.section) : ""}`;

/** Group tabs (wrap onto new lines — never a sliding strip). Replaces the old class pickers. */
export function ClassSelect({ groups, value, onChange, all, testId = "mod-class" }: { groups: RGroup[]; value: string; onChange: (v: string) => void; all?: string; testId?: string }) {
  const { tr } = useTr();
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-bold ${on ? "border-transparent bg-header text-sun" : "border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/10"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tr("Student groups", "مجموعات الطلاب")} data-testid={testId}>
      {all && <button type="button" aria-pressed={value === ""} className={chip(value === "")} onClick={() => onChange("")} data-testid="grp-tab-all">{all}</button>}
      {groups.map((g) => <button key={g.key} type="button" aria-pressed={value === g.key} className={chip(value === g.key)} onClick={() => onChange(g.key)} data-testid="grp-tab" dir="auto">👥 {g.name} ({g.ids.length})</button>)}
      {!groups.length && <span className="text-xs opacity-60">{tr("No groups assigned to you yet.", "لا توجد مجموعات مسندة إليك بعد.")}</span>}
    </div>
  );
}
