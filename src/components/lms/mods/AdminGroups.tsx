"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StudentPicker } from "@/components/lms/StudentPicker";
import { btn, btnCta, cardCls, field, Head, Modal, Tabs, Toast, useRoster } from "@/components/lms/mods/ModUi";
import { useTr } from "@/components/lms/useLms";
import { clsNum, secLetter } from "@/lib/classFmt";
import { grpLabel, lmsApi, scopeLabel, type LmsUser, type StudentGroup } from "@/lib/lms";
import { modCall, modErr } from "@/lib/lmsMods";

type Draft = { id?: string; name: string; subject: string; classes: string[]; students: string[]; teachers: string[] };

/** Admin → Groups: groups made of whole classes, sections and individual students, assigned to teachers (who then see them, scoped to their own classes). */
export function AdminGroups() {
  const { tr } = useTr();
  const { students } = useRoster(true);
  const [items, setItems] = useState<StudentGroup[] | null>(null);
  const [teachers, setTeachers] = useState<LmsUser[]>([]);
  const [d, setD] = useState<Draft | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [fSub, setFSub] = useState("");
  const [view, setView] = useState<"groups" | "teacher">("groups");
  const [tid, setTid] = useState("");
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const load = useCallback(() => { lmsApi.grpList(true).then((r) => setItems(r.items.filter((g) => g.adminGroup))).catch((e) => { setItems([]); setMsg(modErr(e, tr)); setBad(true); }); }, [tr]);
  useEffect(() => { load(); lmsApi.catalog(true).then((c) => setSubjects(c.subjects.map((x) => x.name))).catch(() => undefined); lmsApi.users(true).then((r) => setTeachers(r.users.filter((u) => u.role === "teacher"))).catch(() => undefined); }, [load]);
  const tokens = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of students || []) { if (!m.has(s.cls)) m.set(s.cls, new Set()); if (s.section) m.get(s.cls)!.add(s.section); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).flatMap(([c, ss]) => [c, ...[...ss].sort().map((x) => `${c}|${x}`)]);
  }, [students]);
  const tname = (id: string) => teachers.find((t) => t.id === id)?.name || "?";
  const shown = (items || []).filter((g) => !fSub || g.subject === fSub);
  const assign = async (teacher: string, add: string[], remove: string[]) => { try { await modCall("grp-admin-assign", { teacher, add, remove }, true); setMsg(tr("Updated.", "تم التحديث.")); setBad(false); load(); } catch (e) { setMsg(modErr(e, tr)); setBad(true); } };
  const copy = async (g: StudentGroup) => { try { await modCall("grp-admin-copy", { id: g.id }, true); setMsg(tr("Copied — edit the copy to change its subject, classes or teachers.", "تم النسخ — عدّل النسخة لتغيير المادة أو الصفوف أو المعلمين.")); setBad(false); load(); } catch (e) { setMsg(modErr(e, tr)); setBad(true); } };
  const save = async () => {
    if (!d) return;
    try { await modCall("grp-admin-save", { id: d.id, name: d.name, subject: d.subject, classes: d.classes, students: d.students, teachers: d.teachers }, true); setD(null); setMsg(tr("Saved.", "تم الحفظ.")); setBad(false); load(); } catch (e) { setMsg(modErr(e, tr)); setBad(true); }
  };
  const del = async (g: StudentGroup) => { if (!confirm(tr("Delete this group?", "حذف هذه المجموعة؟"))) return; try { await lmsApi.grpDelete(g.id, true); setMsg(tr("Deleted.", "تم الحذف.")); setBad(false); load(); } catch (e) { setMsg(modErr(e, tr)); setBad(true); } };
  const tog = (k: "classes" | "teachers", v: string) => d && setD({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] });
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? "border-transparent bg-header text-sun" : "border-black/10 dark:border-white/15"}`;
  return (
    <div className="space-y-3" data-testid="admin-groups">
      <Head icon="👥" title={tr("Groups", "المجموعات")} sub={tr("Build groups from classes, sections and individual students, then assign them to teachers. Teachers see only the members inside their own classes.", "أنشئ مجموعات من صفوف وشعب وطلاب أفراد ثم أسندها للمعلمين. يرى المعلم الأعضاء ضمن صفوفه فقط.")}>
        <button type="button" className={btnCta} onClick={() => setD({ name: "", subject: fSub, classes: [], students: [], teachers: [] })} data-testid="ag-new">+ {tr("New group", "مجموعة جديدة")}</button>
      </Head>
      <details className={cardCls + " text-sm"} open data-testid="ag-help">
        <summary className="cursor-pointer font-extrabold">💡 {tr("How groups work", "كيف تعمل المجموعات")}</summary>
        <ol className="mt-2 list-decimal space-y-1 ps-5 opacity-90">
          <li>{tr("Click New group, give it a name and (optionally) a Subject, e.g. “4A Maths”.", "اضغط مجموعة جديدة، وأعطها اسمًا ومادة (اختياري)، مثل «4أ رياضيات».")}</li>
          <li>{tr("Pick whole classes or sections (4A, 4B…) and/or individual students.", "اختر صفوفًا أو شعبًا كاملة (4أ، 4ب…) و/أو طلابًا أفرادًا.")}</li>
          <li>{tr("Assign it to the teachers who teach that subject — different teachers can have different groups for the same class.", "أسندها للمعلمين الذين يدرّسون المادة — يمكن لمعلمين مختلفين الحصول على مجموعات مختلفة لنفس الصف.")}</li>
          <li>{tr("Teachers see it (with its subject) in My classes, Homework, Activities and Points. They only get students from their own classes.", "يراها المعلمون (مع المادة) في صفوفي والواجبات والأنشطة والنقاط، ولا يحصلون إلا على طلاب صفوفهم.")}</li>
          <li>{tr("Use “By teacher” to see or change one teacher's groups, and Copy to reuse a group for another subject or teacher.", "استخدم «حسب المعلم» لعرض مجموعات معلم أو تعديلها، ونسخ لإعادة استخدام مجموعة لمادة أو معلم آخر.")}</li>
        </ol>
      </details>
      <Tabs<"groups" | "teacher"> testId="ag-tabs" value={view} onChange={setView} items={[["groups", tr("All groups", "كل المجموعات")], ["teacher", tr("By teacher", "حسب المعلم")]]} />
      <Toast msg={msg} bad={bad} />
      <div className="flex flex-wrap items-center gap-2">
        <select className={field + " !w-auto"} value={fSub} onChange={(e) => setFSub(e.target.value)} aria-label={tr("Subject", "المادة")} data-testid="ag-filter-subject"><option value="">{tr("All subjects", "كل المواد")}</option>{subjects.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        {view === "teacher" && <select className={field + " !w-auto"} value={tid} onChange={(e) => setTid(e.target.value)} aria-label={tr("Teacher", "المعلم")} data-testid="ag-teacher"><option value="">{tr("Pick a teacher…", "اختر معلمًا…")}</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      </div>
      {view === "teacher" ? (
        !tid ? <p className={cardCls + " text-center opacity-70"}>{tr("Pick a teacher to see and manage their groups.", "اختر معلمًا لعرض مجموعاته وإدارتها.")}</p> : (
          <div className="space-y-3" data-testid="ag-teacher-view">
            <section className={cardCls}>
              <h3 className="mb-2 font-extrabold">{tname(tid)} — {tr("assigned groups", "المجموعات المسندة")}</h3>
              {(() => { const mine = shown.filter((g) => (g.teachers || []).includes(tid)); return !mine.length ? <p className="text-sm opacity-60" data-testid="ag-t-empty">{tr("No groups assigned (for this subject filter).", "لا مجموعات مسندة (بحسب فلتر المادة).")}</p> : <ul className="divide-y divide-black/10 dark:divide-white/10">{mine.map((g) => <li key={g.id} className="flex items-center justify-between gap-2 py-2" data-testid="ag-t-row"><span dir="auto" className="font-semibold">👥 {grpLabel(g)}</span><button type="button" className={btn + " !py-1 text-rose-600"} onClick={() => assign(tid, [], [g.id])} data-testid="ag-t-remove">✕ {tr("Remove", "إزالة")}</button></li>)}</ul>; })()}
            </section>
            <section className={cardCls}>
              <h3 className="mb-2 font-extrabold">{tr("Add a group", "إضافة مجموعة")}</h3>
              {(() => { const rest = shown.filter((g) => !(g.teachers || []).includes(tid)); return !rest.length ? <p className="text-sm opacity-60">{tr("Nothing left to add.", "لا شيء لإضافته.")}</p> : <ul className="divide-y divide-black/10 dark:divide-white/10">{rest.map((g) => <li key={g.id} className="flex items-center justify-between gap-2 py-2" data-testid="ag-t-avail"><span dir="auto">{grpLabel(g)}</span><button type="button" className={btn + " !py-1"} onClick={() => assign(tid, [g.id], [])} data-testid="ag-t-add">＋ {tr("Add", "إضافة")}</button></li>)}</ul>; })()}
            </section>
          </div>
        )
      ) : items === null ? <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p> : !items.length ? <p className={cardCls + " text-center opacity-70"} data-testid="ag-empty">{tr("No admin groups yet.", "لا توجد مجموعات بعد.")}</p> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((g) => (
            <article key={g.id} className={cardCls} data-testid="ag-row">
              <p className="text-lg font-extrabold" dir="auto">👥 {g.name}</p>
              {g.subject && <p className="text-xs font-bold uppercase tracking-wide opacity-70" data-testid="ag-subject">📚 {g.subject}</p>}
              <p className="mt-1 text-sm opacity-80">{(g.classes || []).length ? (g.classes || []).map(scopeLabel).join("، ") : ""}{(g.classes || []).length && (g.rawStudents || []).length ? " + " : ""}{(g.rawStudents || []).length ? tr(`${(g.rawStudents || []).length} students`, `${(g.rawStudents || []).length} طالب`) : ""}</p>
              <p className="mt-1 text-sm">{tr("Teachers", "المعلمون")}: {(g.teachers || []).length ? (g.teachers || []).map(tname).join("، ") : <i className="opacity-60">{tr("none", "لا أحد")}</i>}</p>
              <div className="mt-3 flex gap-2"><button type="button" className={btn + " !py-1"} onClick={() => setD({ id: g.id, name: g.name, subject: g.subject || "", classes: g.classes || [], students: g.rawStudents || [], teachers: g.teachers || [] })} data-testid="ag-edit">✎ {tr("Edit", "تعديل")}</button><button type="button" className={btn + " !py-1"} onClick={() => copy(g)} data-testid="ag-copy">⧉ {tr("Copy", "نسخ")}</button><button type="button" className={btn + " !py-1 text-rose-600"} onClick={() => del(g)} data-testid="ag-del">🗑</button></div>
            </article>
          ))}
        </div>
      )}
      {d && (
        <Modal title={d.id ? tr("Edit group", "تعديل المجموعة") : tr("New group", "مجموعة جديدة")} onClose={() => setD(null)} wide>
          <input className={field} placeholder={tr("Group name", "اسم المجموعة")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} dir="auto" data-testid="ag-name" />
          <label className="mt-3 block text-sm font-bold">{tr("Subject (optional)", "المادة (اختياري)")}<select className={field + " mt-1"} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} data-testid="ag-subject-select"><option value="">{tr("— none —", "— بلا —")}</option>{subjects.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          <p className="mt-4 text-sm font-bold">{tr("Whole classes / sections", "صفوف / شعب كاملة")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5" data-testid="ag-classes">{tokens.map((t) => <button key={t} type="button" aria-pressed={d.classes.includes(t)} className={chip(d.classes.includes(t))} onClick={() => tog("classes", t)}>{t.includes("|") ? `${clsNum(t.split("|")[0])}${secLetter(t.split("|")[1])}` : clsNum(t)}</button>)}</div>
          <p className="mt-4 text-sm font-bold">{tr("Individual students", "طلاب أفراد")} ({d.students.length})</p>
          <StudentPicker students={students || []} sel={d.students} onChange={(ids) => setD({ ...d, students: ids })} height="max-h-48" />
          <p className="mt-4 text-sm font-bold">{tr("Assign to teachers", "إسناد للمعلمين")} ({d.teachers.length})</p>
          <div className="mt-1 flex flex-wrap gap-1.5" data-testid="ag-teachers">{teachers.map((t) => <button key={t.id} type="button" aria-pressed={d.teachers.includes(t.id)} className={chip(d.teachers.includes(t.id))} onClick={() => tog("teachers", t.id)}>{t.name}</button>)}</div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setD(null)}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btnCta} disabled={!d.name.trim()} onClick={save} data-testid="ag-save">{tr("Save", "حفظ")}</button></div>
        </Modal>
      )}
    </div>
  );
}
