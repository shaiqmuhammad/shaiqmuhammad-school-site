"use client";

import { useEffect, useMemo, useState } from "react";
import { inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { catPhaseNames, catPhaseOf, lmsApi, type Catalog, type LmsUser, type StudentGroup } from "@/lib/lms";
import { Avatar } from "@/components/lms/Avatar";
import { clsCmp } from "@/lib/classSort";

const GC = [["#38bdf8", "#2563eb", "🌟"], ["#fbbf24", "#f97316", "🚀"], ["#34d399", "#0d9488", "🌱"], ["#f472b6", "#e11d48", "🎨"], ["#a78bfa", "#7c3aed", "🌙"], ["#2dd4bf", "#0891b2", "🐬"], ["#fb923c", "#dc2626", "🦁"], ["#a3e635", "#16a34a", "📚"]];

/** t426: Admin → Classes — My-Classes-style cards for every group; Phase / Class / Section / Subject / Teacher filters (no By-class tab). */
export function AdminClasses() {
  const { tr } = useTr();
  const [groups, setGroups] = useState<StudentGroup[] | null>(null);
  const [users, setUsers] = useState<LmsUser[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [open, setOpen] = useState<string>("");
  const [phase, setPhase] = useState("");
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [subj, setSubj] = useState("");
  const [teacher, setTeacher] = useState("");
  useEffect(() => {
    lmsApi.grpList(true).then((r) => setGroups(r.items)).catch(() => setGroups([]));
    lmsApi.users(true).then((r) => setUsers(r.users)).catch(() => undefined);
    lmsApi.dashboard(true).then((d) => setCatalog(d.catalog || null)).catch(() => undefined);
  }, []);
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const tName = (id: string) => byId.get(id)?.name || "";
  const teachersOf = (g: StudentGroup) => [...new Set([...(g.teachers || []), ...users.filter((u) => u.role === "teacher" && (u.scope || []).includes(`grp:${g.id}`)).map((u) => u.id), ...(g.owner && byId.get(g.owner)?.role === "teacher" ? [g.owner] : [])])];
  const groupClasses = (g: StudentGroup) => {
    const fromMeta = (g.classes || []).filter(Boolean);
    if (fromMeta.length) return [...new Set(fromMeta)];
    return [...new Set(g.students.map((id) => byId.get(id)?.cls || "").filter(Boolean))];
  };
  const groupPhaseOk = (g: StudentGroup, ph: string) => {
    if (!ph) return true;
    const cs = groupClasses(g);
    if (!cs.length) return false;
    return cs.some((c) => catPhaseOf(catalog, c) === ph);
  };
  const groupClassOk = (g: StudentGroup, c: string) => !c || groupClasses(g).includes(c);
  const groupSectionOk = (g: StudentGroup, sec: string, c: string) => {
    if (!sec) return true;
    return g.students.some((id) => {
      const u = byId.get(id);
      return !!u && u.role === "student" && u.section === sec && (!c || u.cls === c);
    });
  };
  const all = useMemo(() => [...(groups || [])].sort((a, b) => clsCmp((a.classes || [])[0] || a.name, (b.classes || [])[0] || b.name) || (a.subject || "").localeCompare(b.subject || "") || a.name.localeCompare(b.name, undefined, { numeric: true })), [groups]);
  const phases = catPhaseNames(catalog);
  const classOpts = useMemo(() => {
    const fromCat = (catalog?.classes || []).map((c) => c.name);
    const fromGroups = all.flatMap(groupClasses);
    const names = [...new Set([...fromCat, ...fromGroups].filter(Boolean))].sort(clsCmp);
    return phase ? names.filter((n) => catPhaseOf(catalog, n) === phase) : names;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- groupClasses closes over byId; all/users/phase/catalog drive refresh
  }, [catalog, all, phase, users]);
  const sectionOpts = useMemo(() => {
    const fromCat = (catalog?.sections || []).filter((s) => !cls || s.cls === cls).map((s) => s.name);
    const fromUsers = users.filter((u) => u.role === "student" && (!cls || u.cls === cls) && (!phase || catPhaseOf(catalog, u.cls) === phase)).map((u) => u.section).filter(Boolean);
    return [...new Set([...fromCat, ...fromUsers])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [catalog, users, cls, phase]);
  const subjects = [...new Set(all.map((g) => g.subject || "").filter(Boolean))].sort();
  const teacherIds = [...new Set(all.flatMap(teachersOf))].sort((a, b) => tName(a).localeCompare(tName(b)));
  const shown = all.filter((g) => groupPhaseOk(g, phase) && groupClassOk(g, cls) && groupSectionOk(g, section, cls) && (!subj || g.subject === subj) && (!teacher || teachersOf(g).includes(teacher)));
  const g = shown.find((x) => x.id === open);
  const members = g ? g.students.map((id) => byId.get(id)).filter((u): u is LmsUser => !!u && u.role === "student").sort((a, b) => clsCmp(`${a.cls}|${a.section}`, `${b.cls}|${b.section}`) || a.name.localeCompare(b.name)) : [];
  const sel = inputCls + " mt-0 w-auto!";
  useEffect(() => { if (open && !shown.some((x) => x.id === open)) setOpen(""); }, [shown, open]);
  return (
    <div className="space-y-4" data-testid="admin-classes">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-extrabold">🏫 {tr("Classes", "الصفوف")}</h2>
      </div>
      {g ? (
        <div className="space-y-4" data-testid="ac-group-open">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={smallBtn} onClick={() => setOpen("")} data-testid="ac-back">← {tr("All classes", "كل الصفوف")}</button>
            <span className="rounded-full bg-[#1b3a57] px-4 py-1.5 text-sm font-extrabold text-[#f5c542]" dir="auto">{g.name} · {members.length}</span>
            {g.subject && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900" dir="auto">📘 {g.subject}</span>}
            {teachersOf(g).map((t) => <span key={t} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1b2f44] shadow" dir="auto">👩‍🏫 {tName(t)}</span>)}
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" data-testid="ac-group-grid">
            {members.map((u, i) => (
              <li key={u.id} className="flex flex-col items-center gap-2 rounded-[1.75rem] border-2 border-white/80 p-4 text-center text-[#1b2f44] shadow-[0_6px_20px_rgba(27,58,87,0.12)]" style={{ background: `linear-gradient(155deg, ${["#bae6fd", "#fde68a", "#bbf7d0", "#fbcfe8", "#ddd6fe", "#99f6e4", "#fed7aa", "#c7d2fe"][i % 8]}e6, rgba(255,255,255,0.72))` }} data-testid="ac-member">
                <Avatar code={u.avatar || "n0"} size={88} anim="idle" className="ring-4 ring-white shadow-lg" />
                <span className="line-clamp-2 text-base font-extrabold leading-tight text-[#1b3a57] sm:text-lg" dir="auto">{u.name}</span>
                <span className="text-xs font-bold opacity-70">{[u.cls, u.section].filter(Boolean).join(" · ")}</span>
                <a className={smallBtn} href={`/lms?${new URLSearchParams({ viewAs: u.id, n: u.name, r: "student", c: u.cls })}`} target="_blank" rel="noopener" data-testid="ac-viewas">👁 {tr("View as", "عرض كـ")}</a>
              </li>
            ))}
            {!members.length && <li className="col-span-full py-3 opacity-60">{tr("No students in this group yet.", "لا طلاب في هذه المجموعة بعد.")}</li>}
          </ul>
        </div>
      ) : (
        <div className="space-y-4" data-testid="ac-groups">
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1b3a57] via-[#24507a] to-[#1b3a57] px-6 py-6 text-white shadow-xl">
            <span className="pointer-events-none absolute -end-6 -top-8 text-[9rem] leading-none opacity-10" aria-hidden>🏫</span>
            <p className="text-sm font-bold uppercase tracking-widest text-[#f5c542]">✨ {tr("All subjects · all teachers", "كل المواد · كل المعلمين")}</p>
            <h3 className="mt-1 text-2xl font-extrabold text-white" style={{ color: "#fff" }}>{tr("Every class group in the school", "كل مجموعات الصفوف في المدرسة")}</h3>
            <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[#f5c542] px-3 py-1 text-xs font-extrabold text-[#1b3a57]">👥 {tr(`${shown.length} groups`, `${shown.length} مجموعات`)}</span><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">🎓 {tr(`${new Set(shown.flatMap((x) => x.students)).size} students`, `${new Set(shown.flatMap((x) => x.students)).size} طالبًا`)}</span></div>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="ac-filters">
            <select className={sel} value={phase} onChange={(e) => { setPhase(e.target.value); setCls(""); setSection(""); }} aria-label={tr("Phase", "المرحلة")} data-testid="ac-f-phase"><option value="">{tr("All phases", "كل المراحل")}</option>{phases.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            <select className={sel} value={cls} onChange={(e) => { setCls(e.target.value); setSection(""); }} aria-label={tr("Class", "الصف")} data-testid="ac-f-cls"><option value="">{tr("All classes", "كل الصفوف")}</option>{classOpts.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            <select className={sel} value={section} onChange={(e) => setSection(e.target.value)} aria-label={tr("Section", "الشعبة")} data-testid="ac-f-section"><option value="">{tr("All sections", "كل الشعب")}</option>{sectionOpts.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            <select className={sel} value={subj} onChange={(e) => setSubj(e.target.value)} aria-label={tr("Subject", "المادة")} data-testid="ac-f-subj"><option value="">{tr("All subjects", "كل المواد")}</option>{subjects.map((x) => <option key={x}>{x}</option>)}</select>
            <select className={sel} value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label={tr("Teacher", "المعلم")} data-testid="ac-f-teacher"><option value="">{tr("All teachers", "كل المعلمين")}</option>{teacherIds.map((x) => <option key={x} value={x}>{tName(x) || x}</option>)}</select>
          </div>
          {groups === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !shown.length ? <p className="rounded-3xl bg-white p-8 text-center text-[#1b2f44] shadow">{tr("No groups match these filters.", "لا مجموعات تطابق هذه الفلاتر.")}</p> : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5" data-testid="ac-cards">
              {shown.map((x, i) => { const G = GC[i % 8]; const ts = teachersOf(x); return (
                <li key={x.id}><button type="button" onClick={() => setOpen(x.id)} className="group w-full overflow-hidden rounded-3xl bg-white text-center text-[#1b2f44] shadow-md ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-2xl" data-testid="ac-card">
                  <span className="relative block h-24 sm:h-28" style={{ background: `linear-gradient(135deg, ${G[0]}, ${G[1]})` }}>
                    <span className="absolute -start-4 -top-4 h-16 w-16 rounded-full bg-white/20" aria-hidden />
                    <span className="absolute inset-x-0 bottom-0 mx-auto grid h-16 w-16 translate-y-1/2 place-items-center rounded-2xl bg-white text-4xl shadow-lg ring-4 ring-white transition group-hover:scale-110" aria-hidden>{G[2]}</span>
                  </span>
                  <span className="block px-3 pb-4 pt-10">
                    <span className="block text-base font-extrabold leading-tight sm:text-lg" dir="auto">{x.name}</span>
                    {x.subject && <span className="mt-0.5 block text-xs font-semibold opacity-70" dir="auto">{x.subject}</span>}
                    {groupClasses(x).length > 0 && <span className="mt-0.5 block truncate text-xs opacity-70" dir="auto">🏫 {groupClasses(x).join(", ")}</span>}
                    {ts.length > 0 && <span className="mt-0.5 block truncate text-xs opacity-70" dir="auto">👩‍🏫 {ts.map(tName).filter(Boolean).join(", ")}</span>}
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#1b3a57] px-3 py-1 text-xs font-bold text-[#f5c542]">🎓 {tr(`${x.students.length} students`, `${x.students.length} طالبًا`)}</span>
                  </span>
                </button></li>
              ); })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
