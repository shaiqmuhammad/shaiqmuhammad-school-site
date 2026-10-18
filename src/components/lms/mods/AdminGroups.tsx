"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StudentPicker } from "@/components/lms/StudentPicker";
import { btn, btnCta, cardCls, field, Head, Modal, Toast, useRoster } from "@/components/lms/mods/ModUi";
import { useTr } from "@/components/lms/useLms";
import { clsNum, secLetter } from "@/lib/classFmt";
import { lmsApi, scopeLabel, type LmsUser, type StudentGroup } from "@/lib/lms";
import { modCall, modErr } from "@/lib/lmsMods";

type Draft = { id?: string; name: string; classes: string[]; students: string[]; teachers: string[] };

/** Admin → Groups: groups made of whole classes, sections and individual students, assigned to teachers (who then see them, scoped to their own classes). */
export function AdminGroups() {
  const { tr } = useTr();
  const { students } = useRoster(true);
  const [items, setItems] = useState<StudentGroup[] | null>(null);
  const [teachers, setTeachers] = useState<LmsUser[]>([]);
  const [d, setD] = useState<Draft | null>(null);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const load = useCallback(() => { lmsApi.grpList(true).then((r) => setItems(r.items.filter((g) => g.adminGroup))).catch((e) => { setItems([]); setMsg(modErr(e, tr)); setBad(true); }); }, [tr]);
  useEffect(() => { load(); lmsApi.users(true).then((r) => setTeachers(r.users.filter((u) => u.role === "teacher"))).catch(() => undefined); }, [load]);
  const tokens = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of students || []) { if (!m.has(s.cls)) m.set(s.cls, new Set()); if (s.section) m.get(s.cls)!.add(s.section); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).flatMap(([c, ss]) => [c, ...[...ss].sort().map((x) => `${c}|${x}`)]);
  }, [students]);
  const tname = (id: string) => teachers.find((t) => t.id === id)?.name || "?";
  const save = async () => {
    if (!d) return;
    try { await modCall("grp-admin-save", { id: d.id, name: d.name, classes: d.classes, students: d.students, teachers: d.teachers }, true); setD(null); setMsg(tr("Saved.", "تم الحفظ.")); setBad(false); load(); } catch (e) { setMsg(modErr(e, tr)); setBad(true); }
  };
  const del = async (g: StudentGroup) => { if (!confirm(tr("Delete this group?", "حذف هذه المجموعة؟"))) return; try { await lmsApi.grpDelete(g.id, true); setMsg(tr("Deleted.", "تم الحذف.")); setBad(false); load(); } catch (e) { setMsg(modErr(e, tr)); setBad(true); } };
  const tog = (k: "classes" | "teachers", v: string) => d && setD({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] });
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? "border-transparent bg-header text-sun" : "border-black/10 dark:border-white/15"}`;
  return (
    <div className="space-y-3" data-testid="admin-groups">
      <Head icon="👥" title={tr("Groups", "المجموعات")} sub={tr("Build groups from classes, sections and individual students, then assign them to teachers. Teachers see only the members inside their own classes.", "أنشئ مجموعات من صفوف وشعب وطلاب أفراد ثم أسندها للمعلمين. يرى المعلم الأعضاء ضمن صفوفه فقط.")}>
        <button type="button" className={btnCta} onClick={() => setD({ name: "", classes: [], students: [], teachers: [] })} data-testid="ag-new">+ {tr("New group", "مجموعة جديدة")}</button>
      </Head>
      <Toast msg={msg} bad={bad} />
      {items === null ? <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p> : !items.length ? <p className={cardCls + " text-center opacity-70"} data-testid="ag-empty">{tr("No admin groups yet.", "لا توجد مجموعات بعد.")}</p> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((g) => (
            <article key={g.id} className={cardCls} data-testid="ag-row">
              <p className="text-lg font-extrabold" dir="auto">👥 {g.name}</p>
              <p className="mt-1 text-sm opacity-80">{(g.classes || []).length ? (g.classes || []).map(scopeLabel).join("، ") : ""}{(g.classes || []).length && (g.rawStudents || []).length ? " + " : ""}{(g.rawStudents || []).length ? tr(`${(g.rawStudents || []).length} students`, `${(g.rawStudents || []).length} طالب`) : ""}</p>
              <p className="mt-1 text-sm">{tr("Teachers", "المعلمون")}: {(g.teachers || []).length ? (g.teachers || []).map(tname).join("، ") : <i className="opacity-60">{tr("none", "لا أحد")}</i>}</p>
              <div className="mt-3 flex gap-2"><button type="button" className={btn + " !py-1"} onClick={() => setD({ id: g.id, name: g.name, classes: g.classes || [], students: g.rawStudents || [], teachers: g.teachers || [] })} data-testid="ag-edit">✎ {tr("Edit", "تعديل")}</button><button type="button" className={btn + " !py-1 text-rose-600"} onClick={() => del(g)} data-testid="ag-del">🗑</button></div>
            </article>
          ))}
        </div>
      )}
      {d && (
        <Modal title={d.id ? tr("Edit group", "تعديل المجموعة") : tr("New group", "مجموعة جديدة")} onClose={() => setD(null)} wide>
          <input className={field} placeholder={tr("Group name", "اسم المجموعة")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} dir="auto" data-testid="ag-name" />
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
