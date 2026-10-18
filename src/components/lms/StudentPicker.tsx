"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/lms/Avatar";
import { useTr } from "@/components/lms/useLms";
import { clsNum, secLetter } from "@/lib/classFmt";

export type PickStudent = { id: string; name: string; cls: string; section: string; avatar?: string };

/** Student list with Class + Section filters, search, and "select all (filtered)" for picking students fast. */
export function StudentPicker({ students, sel, onChange, height = "max-h-64" }: { students: PickStudent[]; sel: string[]; onChange: (ids: string[]) => void; height?: string }) {
  const { tr } = useTr();
  const [cls, setCls] = useState("");
  const [sec, setSec] = useState("");
  const [q, setQ] = useState("");
  const classes = useMemo(() => [...new Set(students.map((s) => s.cls))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [students]);
  const sections = useMemo(() => [...new Set(students.filter((s) => !cls || s.cls === cls).map((s) => s.section).filter(Boolean))].sort(), [students, cls]);
  const list = useMemo(() => students.filter((s) => (!cls || s.cls === cls) && (!sec || s.section === sec) && (!q || s.name.toLowerCase().includes(q.toLowerCase()))), [students, cls, sec, q]);
  const ids = list.map((s) => s.id);
  const allOn = ids.length > 0 && ids.every((id) => sel.includes(id));
  const sc = "rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm dark:border-white/20 dark:bg-black/20";
  return (
    <div data-testid="student-picker">
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select className={sc} value={cls} onChange={(e) => { setCls(e.target.value); setSec(""); }} data-testid="pick-class" aria-label={tr("Class", "الصف")}>
          <option value="">{tr("All classes", "كل الصفوف")}</option>
          {classes.map((c) => <option key={c} value={c}>{clsNum(c)}</option>)}
        </select>
        <select className={sc} value={sec} onChange={(e) => setSec(e.target.value)} data-testid="pick-section" aria-label={tr("Section", "الشعبة")}>
          <option value="">{tr("All sections", "كل الشعب")}</option>
          {sections.map((s) => <option key={s} value={s}>{secLetter(s)}</option>)}
        </select>
      </div>
      <input className={sc + " mt-2 w-full"} placeholder={tr("Search students…", "ابحث عن طالب…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="pick-search" />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="rounded-full border border-black/15 px-3 py-1 font-bold dark:border-white/20" onClick={() => onChange(allOn ? sel.filter((x) => !ids.includes(x)) : [...new Set([...sel, ...ids])])} disabled={!ids.length} data-testid="pick-all">{allOn ? tr("Unselect filtered", "إلغاء تحديد المعروض") : tr(`Select all filtered (${ids.length})`, `تحديد كل المعروض (${ids.length})`)}</button>
        {sel.length > 0 && <button type="button" className="text-xs underline opacity-70" onClick={() => onChange([])}>{tr("Clear", "مسح")} ({sel.length})</button>}
      </div>
      <div className={`mt-2 ${height} space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2 dark:border-white/15`}>
        {list.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sel.includes(s.id)} onChange={() => onChange(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])} data-testid="grp-pick" />
            {s.avatar && <Avatar code={s.avatar} size={24} />}<span dir="auto" className="min-w-0 flex-1 truncate">{s.name}</span><span className="text-xs opacity-60">{clsNum(s.cls)}{s.section ? secLetter(s.section) : ""}</span>
          </label>
        ))}
        {!list.length && <p className="p-2 text-sm opacity-60">{tr("No students match.", "لا يوجد طلاب مطابقون.")}</p>}
      </div>
    </div>
  );
}
