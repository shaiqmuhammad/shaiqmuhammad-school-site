"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { grpLabel, lmsApi, type RosterStudent, type StudentGroup } from "@/lib/lms";

export type WhoStudent = Pick<RosterStudent, "id" | "name" | "cls" | "section">;

/** Who can be picked: a teacher's roster is already limited to the students in their assigned groups, and only assigned groups are offered. Admins get every admin group. */
export function useWho(asAdmin = false) {
  const [data, setData] = useState<{ students: RosterStudent[]; groups: StudentGroup[] } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([lmsApi.classRoster(asAdmin), lmsApi.grpList(asAdmin)]).then(([r, g]) => {
      if (!live) return;
      const ids = new Set(r.students.map((s) => s.id));
      const groups = g.items.filter((x) => (asAdmin ? x.adminGroup : x.assigned)).map((x) => ({ ...x, students: x.students.filter((id) => ids.has(id)) }));
      setData({ students: r.students, groups });
    }).catch(() => live && setData({ students: [], groups: [] }));
    return () => { live = false; };
  }, [asAdmin]);
  return data;
}

/** Classes and sections that exist among the given students only (never the full catalog). */
export function classTree(students: WhoStudent[]) {
  const m = new Map<string, Map<string, string[]>>();
  for (const s of students) {
    const c = s.cls || "—";
    if (!m.has(c)) m.set(c, new Map());
    const sm = m.get(c)!;
    const k = s.section || "";
    sm.set(k, [...(sm.get(k) || []), s.id]);
  }
  return [...m.entries()].map(([cls, sm]) => ({ cls, ids: [...sm.values()].flat(), sections: [...sm.entries()].filter(([k]) => k).map(([section, ids]) => ({ section, ids })) }));
}

const chipCls = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? "border-transparent bg-header text-sun" : "border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/10"}`;

/** One picker everywhere: the assigned Student groups only. Choosing a group selects its students; individual students (from those groups) can be fine-tuned. */
export function WhoPicker({ students, groups, value, onChange, individual = true }: { students: WhoStudent[]; groups: StudentGroup[]; value: string[]; onChange: (ids: string[]) => void; individual?: boolean }) {
  const { tr } = useTr();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const set = new Set(value);
  const isOn = (ids: string[]) => ids.length > 0 && ids.every((id) => set.has(id));
  const toggle = (ids: string[]) => onChange(isOn(ids) ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])]);
  return (
    <div className="space-y-3" data-testid="who-picker">
      <div>
        <p className="mb-1 text-sm font-bold">👥 {tr("Student groups", "مجموعات الطلاب")}</p>
        <div className="flex flex-wrap gap-2" data-testid="who-groups">
          {groups.map((g) => <button key={g.id} type="button" aria-pressed={isOn(g.students)} className={chipCls(isOn(g.students))} onClick={() => toggle(g.students)} data-testid="who-group" dir="auto">{grpLabel(g)} ({g.students.length})</button>)}
          {!groups.length && <span className="text-xs opacity-60">{tr("No groups assigned to you yet.", "لا توجد مجموعات مسندة إليك بعد.")}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <b data-testid="who-count">{tr(`${value.length} selected`, `${value.length} محدد`)}</b>
        {individual && <button type="button" className="text-xs font-bold underline" onClick={() => setOpen(!open)} data-testid="who-toggle-ind">{open ? tr("Hide individual students", "إخفاء الطلاب") : tr("Pick individual students", "اختيار طلاب محددين")}</button>}
        {value.length > 0 && <button type="button" className="text-xs underline opacity-70" onClick={() => onChange([])} data-testid="who-clear">{tr("Clear", "مسح")}</button>}
      </div>
      {open && (
        <div>
          <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-white/5" placeholder={tr("Search…", "بحث…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
            {students.filter((s) => groups.some((g) => g.students.includes(s.id))).filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).map((s) => (
              <li key={s.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={set.has(s.id)} onChange={() => onChange(set.has(s.id) ? value.filter((x) => x !== s.id) : [...value, s.id])} data-testid="who-student" /><span dir="auto" className="min-w-0 flex-1 truncate">{s.name}</span><span className="text-xs opacity-60">{s.section || s.cls}</span></label></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
