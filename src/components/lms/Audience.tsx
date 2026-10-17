"use client";

import { useEffect, useMemo, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsSession, type RosterStudent, type StudentGroup } from "@/lib/lms";

/** Teacher's roster (own classes) + custom groups, loaded once. Null when not signed in as a teacher. */
export function useTeacherRoster() {
  const [data, setData] = useState<{ students: RosterStudent[]; groups: StudentGroup[] } | null>(null);
  useEffect(() => {
    const s = lmsSession();
    if (!s || s.user.role !== "teacher") return;
    Promise.all([lmsApi.classRoster(), lmsApi.grpList()]).then(([r, g]) => setData({ students: r.students, groups: g.items })).catch(() => undefined);
  }, []);
  return data;
}

/** Choose participants: whole class/section, custom groups, or individual students. Emits student ids. */
export function AudiencePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { tr } = useTr();
  const data = useTeacherRoster();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => {
    const m = new Map<string, RosterStudent[]>();
    (data?.students || []).forEach((s) => { const k = [s.cls, s.section].filter(Boolean).join(" · ") || "—"; m.set(k, [...(m.get(k) || []), s]); });
    return [...m.entries()];
  }, [data]);
  if (!data) return null;
  const set = new Set(value);
  const addAll = (ids: string[]) => onChange([...new Set([...value, ...ids])]);
  const chip = "rounded-full border border-black/10 bg-white/80 px-3 py-1 text-sm font-semibold hover:bg-sun/30 dark:border-white/15 dark:bg-white/10";
  return (
    <fieldset className="rounded-2xl border border-card-border p-3" data-testid="audience">
      <legend className="px-1 text-sm font-semibold">{tr("Participants (auto-joined, no code needed)", "المشاركون (ينضمون تلقائيًا بلا رمز)")} · <span data-testid="aud-count">{value.length}</span></legend>
      <div className="flex flex-wrap gap-2">
        {sections.map(([k, list]) => <button key={k} type="button" className={chip} onClick={() => addAll(list.map((s) => s.id))} data-testid="aud-class">🏫 {k} ({list.length})</button>)}
        {data.groups.map((g) => <button key={g.id} type="button" className={chip} onClick={() => addAll(g.students.filter((id) => data.students.some((s) => s.id === id)))} data-testid="aud-group">👥 {g.name} ({g.students.length})</button>)}
        <button type="button" className={chip} onClick={() => setOpen(!open)}>＋ {tr("Pick students", "اختيار طلاب")}</button>
        {value.length > 0 && <button type="button" className={chip + " !text-rose-700"} onClick={() => onChange([])}>{tr("Clear", "مسح")}</button>}
      </div>
      {open && <div className="mt-2">
        <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-white/5" placeholder={tr("Search…", "بحث…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">{data.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).map((s) => <li key={s.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={set.has(s.id)} onChange={() => onChange(set.has(s.id) ? value.filter((x) => x !== s.id) : [...value, s.id])} /><span dir="auto">{s.name}</span></label></li>)}</ul>
      </div>}
      {value.length > 0 && <p className="mt-2 text-xs opacity-70" dir="auto">{data.students.filter((s) => set.has(s.id)).map((s) => s.name).slice(0, 12).join(", ")}{value.length > 12 ? "…" : ""}</p>}
    </fieldset>
  );
}

/** Wheel / Randomiser: fill the names box from a class, section or group. */
export function RosterLoader({ onNames }: { onNames: (names: string[]) => void }) {
  const { tr } = useTr();
  const data = useTeacherRoster();
  if (!data) return null;
  const opts: [string, string, string[]][] = [];
  const m = new Map<string, string[]>();
  data.students.forEach((s) => { const k = [s.cls, s.section].filter(Boolean).join(" · ") || "—"; m.set(k, [...(m.get(k) || []), s.name]); });
  m.forEach((names, k) => opts.push([`c:${k}`, `🏫 ${k} (${names.length})`, names]));
  data.groups.forEach((g) => { const names = data.students.filter((s) => g.students.includes(s.id)).map((s) => s.name); opts.push([`g:${g.id}`, `👥 ${g.name} (${names.length})`, names]); });
  return (
    <select className="mt-3 w-full rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-black/30" value="" onChange={(e) => { const o = opts.find((x) => x[0] === e.target.value); if (o) onNames(o[2]); }} aria-label={tr("Load from my classes", "تحميل من صفوفي")} data-testid="roster-loader">
      <option value="">{tr("Load names from my class or group…", "تحميل الأسماء من صفي أو مجموعتي…")}</option>
      {opts.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
    </select>
  );
}
