"use client";

import { useEffect, useMemo, useState } from "react";
import { QuranMap, StudentProgress } from "@/components/lms/Progress";
import { card, inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { lmsApi, type LmsUser } from "@/lib/lms";

type Dash = Awaited<ReturnType<typeof lmsApi.dashboard>>;

/** Admin → Classes: one class/section at a glance (students, homework + submissions, heatmap), links into each student. */
export function AdminClasses() {
  const { tr } = useTr();
  const [dash, setDash] = useState<Dash | null>(null);
  const [users, setUsers] = useState<LmsUser[]>([]);
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    lmsApi.dashboard(true).then((d) => { setDash(d); setCls((c) => c || d.catalog?.classes[0]?.name || ""); }).catch(() => undefined);
    lmsApi.users(true).then((r) => setUsers(r.users)).catch(() => undefined);
  }, []);
  const cat = dash?.catalog;
  const students = useMemo(() => users.filter((u) => u.role === "student" && u.cls === cls && (!section || u.section === section)).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name)), [users, cls, section]);
  const hws = (dash?.homework || []).filter((h) => h.cls === cls && (!section || !h.section || h.section === section));
  return (
    <div className="space-y-4" data-testid="admin-classes">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-extrabold">🏫 {tr("Classes", "الصفوف")}</h2>
        <span className="flex-1" />
        <select className={inputCls + " mt-0 w-auto!"} value={cls} onChange={(e) => { setCls(e.target.value); setSection(""); }} aria-label={tr("Class", "الصف")} data-testid="ac-class">
          {(cat?.classes || []).map((c) => <option key={c.id}>{c.name}</option>)}
        </select>
        <select className={inputCls + " mt-0 w-auto!"} value={section} onChange={(e) => setSection(e.target.value)} aria-label={tr("Section", "الشعبة")} data-testid="ac-section">
          <option value="">{tr("All sections", "كل الشعب")}</option>
          {(cat?.sections || []).filter((s) => s.cls === cls).map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
      </div>
      <section className={card + " space-y-2"}>
        <h3 className="text-lg font-bold">🎒 {tr("Students", "الطلاب")} ({students.length})</h3>
        <ul className="divide-y divide-black/5 dark:divide-white/10" data-testid="ac-students">
          {students.map((u) => (
            <li key={u.id} className="py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-semibold" dir="auto">{u.name} <span className="font-normal opacity-60">{u.section} · {u.username}</span></span>
                <button type="button" className={smallBtn} onClick={() => setOpen(open === u.id ? null : u.id)} aria-expanded={open === u.id}>📈 {tr("Progress", "التقدم")}</button>
                <a className={smallBtn} href={`/lms?${new URLSearchParams({ viewAs: u.id, n: u.name, r: "student", c: u.cls })}`} target="_blank" rel="noopener" data-testid="ac-viewas">👁 {tr("View as", "عرض كـ")}</a>
              </div>
              {open === u.id && <div className="mt-2"><StudentProgress id={u.id} asAdmin /></div>}
            </li>
          ))}
          {!students.length && <li className="py-3 opacity-60">{tr("No students in this class/section.", "لا طلاب هنا.")}</li>}
        </ul>
      </section>
      <section className={card + " space-y-2"}>
        <h3 className="text-lg font-bold">📚 {tr("Homework", "الواجبات")} ({hws.length})</h3>
        <ul className="space-y-1" data-testid="ac-homework">
          {hws.map((h) => { const c = h.counts || {}; return (
            <li key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1 font-semibold" dir="auto">{h.kind === "quran" ? "📖" : "📝"} {h.title} {h.section && <span className="opacity-60">· {h.section}</span>}</span>
              <span className="opacity-80">{tr("submitted", "مُسلّم")} {c.submitted || 0} · {tr("approved", "مقبول")} {c.approved || 0} · {tr("returned", "مُعاد")} {c.returned || 0}</span>
            </li>
          ); })}
          {!hws.length && <li className="opacity-60">{tr("No homework for this class yet.", "لا واجبات لهذا الصف بعد.")}</li>}
        </ul>
      </section>
      {cls && <QuranMap key={cls + section} asAdmin classes={[cls]} sections={(cat?.sections || []).map((s) => ({ cls: s.cls, name: s.name }))} />}
    </div>
  );
}
