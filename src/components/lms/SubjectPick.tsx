"use client";
/** t322: teacher subject picker — one subject: fixed chip (auto-filled); several: dropdown defaulting to the last-used (or first); admin: full list. */
import { useEffect } from "react";
import { useTr } from "@/components/lms/useLms";

const KEY = "sm-last-subject";
/** A teacher's subjects: their subject groups (subj) or, failing that, the subjects on their account. */
export const teacherSubjects = (u?: { subj?: string[]; subjects?: string[] } | null) => [...new Set([...(u?.subj || []), ...(u?.subjects || [])].filter(Boolean))];
export const lastSubject = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const remember = (s: string) => { try { if (s) localStorage.setItem(KEY, s); } catch { /* ignore */ } };
/** The default subject for a teacher with these subjects. */
export const defaultSubject = (mine: string[]) => (mine.length ? (mine.includes(lastSubject()) ? lastSubject() : mine[0]) : "");

export function SubjectPick({ value, onChange, mine, all, admin, className = "", testId = "subject-pick" }: { value: string; onChange: (s: string) => void; mine: string[]; all?: string[]; admin: boolean; className?: string; testId?: string }) {
  const { tr } = useTr();
  const list = admin ? [...new Set([...(all || []), ...mine, value].filter(Boolean))] : mine;
  // Auto-fill for teachers (fixed for one subject, last-used / first for several).
  useEffect(() => { if (!admin && mine.length && !mine.includes(value)) onChange(defaultSubject(mine)); }, [admin, mine, value, onChange]);
  if (!admin && mine.length === 1) return <span className={`mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-extrabold text-emerald-900 ring-1 ring-emerald-300 ${className}`} data-testid={`${testId}-chip`}>📘 {mine[0]}<span className="text-xs font-semibold opacity-70">· {tr("your subject", "مادتك")}</span></span>;
  return (
    <select className={className} value={value} onChange={(e) => { remember(e.target.value); onChange(e.target.value); }} data-testid={testId}>
      {admin && <option value="">—</option>}
      {list.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>
  );
}
