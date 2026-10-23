"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, type Catalog, type LmsUser, type StudentGroup } from "@/lib/lms";
import { clsNum, secLetter } from "@/lib/classFmt";

/** Shared admin filter: Subject · Teacher · Year · Section. One choice for every admin page (kept in this browser). */
export type AdminScope = { subject: string; teacher: string; yr: string; sec: string };
const KEY = "sm-admin-scope";
const EV = "sm-admin-scope-change";
const EMPTY: AdminScope = { subject: "", teacher: "", yr: "", sec: "" };
let snap: AdminScope = EMPTY;
let snapRaw = "";
function read(): AdminScope {
  if (typeof window === "undefined") return EMPTY;
  let raw = "";
  try { raw = localStorage.getItem(KEY) || ""; } catch { /* ignore */ }
  if (raw !== snapRaw) { snapRaw = raw; try { snap = { ...EMPTY, ...(JSON.parse(raw || "{}") as Partial<AdminScope>) }; } catch { snap = EMPTY; } }
  return snap;
}
export const readAdminScope = () => read();
export function setAdminScope(p: Partial<AdminScope>) {
  const n = { ...read(), ...p };
  if (p.subject !== undefined && p.teacher === undefined) n.teacher = "";
  if (p.yr !== undefined && p.sec === undefined) n.sec = "";
  try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EV));
}
const sub = (cb: () => void) => { window.addEventListener(EV, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EV, cb); window.removeEventListener("storage", cb); }; };
export function useAdminScopeValue(): AdminScope { return useSyncExternalStore(sub, read, () => EMPTY); }

type Ctx = { users: LmsUser[]; groups: StudentGroup[]; catalog: Catalog | null };
let ctxP: Promise<Ctx> | null = null;
export function loadScopeCtx(): Promise<Ctx> {
  if (!ctxP) ctxP = Promise.all([lmsApi.users(true).then((r) => r.users).catch(() => [] as LmsUser[]), lmsApi.grpList(true).then((r) => r.items).catch(() => [] as StudentGroup[]), lmsApi.catalog(true).catch(() => null)]).then(([users, groups, catalog]) => ({ users, groups, catalog: catalog as Catalog | null }));
  return ctxP;
}
const subjOf = (u: LmsUser) => String(u.subject || "").split(/\s*,\s*/).filter(Boolean);

/** The current choice plus helpers: which students / teachers it allows (null = no restriction). */
export function useAdminScope() {
  const s = useAdminScopeValue();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  useEffect(() => { loadScopeCtx().then(setCtx).catch(() => undefined); }, []);
  return useMemo(() => {
    const users = ctx?.users || [];
    const teachers = users.filter((u) => u.role === "teacher");
    const teacherOpts = teachers.filter((t) => !s.subject || t.subjects.includes(s.subject) || (t.groups || []).some((g) => g.subject === s.subject));
    const tStu = s.teacher ? new Set((ctx?.groups || []).filter((g) => (g.teachers || []).includes(s.teacher) && (!s.subject || !g.subject || g.subject === s.subject)).flatMap((g) => g.students)) : null;
    const stuOk = (u: { id: string; cls?: string; section?: string; subject?: string }) => {
      const full = users.find((x) => x.id === u.id) || (u as LmsUser);
      if (s.subject && !subjOf(full).includes(s.subject)) return false;
      if (tStu && !tStu.has(u.id)) return false;
      if (s.yr && (full.cls || "") !== s.yr) return false;
      if (s.sec && (full.section || "") !== s.sec) return false;
      return true;
    };
    const active = !!(s.subject || s.teacher || s.yr || s.sec);
    const studentIds = active ? new Set(users.filter((u) => u.role === "student" && stuOk(u)).map((u) => u.id)) : null;
    const nameOk = (name: string) => !studentIds || users.some((u) => studentIds.has(u.id) && (u.name === name || `${u.firstName || ""} ${u.lastName || ""}`.trim() === name));
    const teacherIds = s.teacher ? new Set([s.teacher]) : s.subject ? new Set(teacherOpts.map((t) => t.id)) : null;
    return { ...s, active, ready: !!ctx, ctx, teacherOpts, studentIds, stuOk, nameOk, teacherIds };
  }, [s, ctx]);
}

/** The shared filter bar (Subject, Teacher and — where relevant — Year and Section). Collapses into a panel below 640px. */
export function AdminScopeBar({ years = true, teacher = true, count, testId = "scope-bar" }: { years?: boolean; teacher?: boolean; count?: string; testId?: string }) {
  const { tr } = useTr();
  const sc = useAdminScope();
  const [open, setOpen] = useState(false);
  const cat = sc.ctx?.catalog;
  const n = [sc.subject, teacher && sc.teacher, years && sc.yr, years && sc.sec].filter(Boolean).length;
  const sel = "rounded-xl border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900";
  const secs = (cat?.sections || []).filter((x) => x.cls === sc.yr);
  return (
    <div className="rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-2 dark:border-white/10 dark:bg-white/5" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold sm:hidden" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="scope-toggle">⚙ {tr("Filters", "عوامل التصفية")}{n ? ` (${n})` : ""}</button>
        <div className={`${open ? "flex" : "hidden"} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center`} data-testid="scope-panel">
          <select className={sel} value={sc.subject} onChange={(e) => setAdminScope({ subject: e.target.value })} aria-label={tr("Subject", "المادة")} data-testid="scope-subject">
            <option value="">{tr("All subjects", "كل المواد")}</option>
            {(cat?.subjects || []).map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
          </select>
          {teacher && <select className={sel} value={sc.teacher} onChange={(e) => setAdminScope({ teacher: e.target.value })} aria-label={tr("Teacher", "المعلم")} data-testid="scope-teacher">
            <option value="">{tr("All teachers", "كل المعلمين")}</option>
            {sc.teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>}
          {years && <>
            <select className={sel} value={sc.yr} onChange={(e) => setAdminScope({ yr: e.target.value })} aria-label={tr("Year", "السنة")} data-testid="scope-year">
              <option value="">{tr("All years", "كل السنوات")}</option>
              {(cat?.classes || []).map((c) => <option key={c.id} value={c.name}>{clsNum(c.name)}</option>)}
            </select>
            <select className={sel} value={sc.sec} onChange={(e) => setAdminScope({ sec: e.target.value })} disabled={!secs.length} aria-label={tr("Section", "الشعبة")} data-testid="scope-section">
              <option value="">{tr("All sections", "كل الشعب")}</option>
              {secs.map((x) => <option key={x.id} value={x.name}>{secLetter(x.name)}</option>)}
            </select>
          </>}
          <button type="button" className="rounded-full border border-black/15 px-3 py-1.5 text-sm" onClick={() => setAdminScope({ ...EMPTY })} disabled={!n} data-testid="scope-clear">✕ {tr("Clear", "مسح")}</button>
          {count && <span className="text-sm font-semibold" data-testid="scope-count">{count}</span>}
        </div>
      </div>
    </div>
  );
}
