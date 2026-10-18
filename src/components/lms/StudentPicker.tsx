"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/lms/Avatar";
import { useTr } from "@/components/lms/useLms";
import { clsNum, secLetter } from "@/lib/classFmt";

export type PickStudent = { id: string; name: string; cls: string; section: string; avatar?: string };

/** Student list for groups: shows the students of the picked classes/sections (pre-selected by the caller) plus anything selected; the search bar finds any student from any class. */
export function StudentPicker({ students, sel, onChange, base = [], height = "max-h-64" }: { students: PickStudent[]; sel: string[]; onChange: (ids: string[]) => void; base?: string[]; height?: string }) {
  const { tr } = useTr();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const need = q.trim().toLowerCase();
    if (need) return students.filter((s) => s.name.toLowerCase().includes(need) || `${clsNum(s.cls)}${secLetter(s.section)}`.toLowerCase() === need);
    const keep = new Set([...base, ...sel]);
    return students.filter((s) => keep.has(s.id));
  }, [students, q, base, sel]);
  const sc = "rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm dark:border-white/20 dark:bg-black/20";
  return (
    <div data-testid="student-picker">
      <input className={sc + " mt-2 w-full"} placeholder={tr("Search any student to add…", "ابحث عن أي طالب لإضافته…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="pick-search" />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <b data-testid="pick-count">{tr(`${sel.length} selected`, `${sel.length} محدد`)}</b>
        {sel.length > 0 && <button type="button" className="text-xs underline opacity-70" onClick={() => onChange([])} data-testid="pick-clear">{tr("Clear all", "مسح الكل")}</button>}
      </div>
      <div className={`mt-2 ${height} space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2 dark:border-white/15`}>
        {shown.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sel.includes(s.id)} onChange={() => onChange(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])} data-testid="grp-pick" />
            {s.avatar && <Avatar code={s.avatar} size={24} />}<span dir="auto" className="min-w-0 flex-1 truncate">{s.name}</span><span className="text-xs opacity-60">{clsNum(s.cls)}{s.section ? secLetter(s.section) : ""}</span>
          </label>
        ))}
        {!shown.length && <p className="p-2 text-sm opacity-60" data-testid="pick-empty">{q ? tr("No students match.", "لا يوجد طلاب مطابقون.") : tr("Pick a class or section above to list its students, or search for a student.", "اختر صفًا أو شعبة أعلاه لعرض طلابها، أو ابحث عن طالب.")}</p>}
      </div>
    </div>
  );
}
