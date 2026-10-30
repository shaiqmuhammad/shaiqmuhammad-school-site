"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRelogin, card, inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { modCall, modErr } from "@/lib/lmsMods";
import { lmsApi, lmsErrorText, type Catalog, type LmsError } from "@/lib/lms";

type Item = { id: string; name: string };

/** One editable chip: click ✏️ to rename (renames carry over to people and homework), 🗑 to delete. */
function ItemChip({ item, onRename, onDelete, testId }: { item: Item; onRename: (name: string) => Promise<boolean>; onDelete: () => void; testId: string }) {
  const { tr } = useTr();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(item.name);
  return edit ? (
    <form className="inline-flex items-center gap-1" onSubmit={async (e) => { e.preventDefault(); if (await onRename(v.trim())) setEdit(false); }}>
      <input className={inputCls + " mt-0 w-36 py-1"} value={v} onChange={(e) => setV(e.target.value)} autoFocus dir="auto" aria-label={tr("New name", "الاسم الجديد")} data-testid={`${testId}-rename-input`} />
      <button type="submit" className={smallBtn} data-testid={`${testId}-rename-save`}>✓</button>
      <button type="button" className={smallBtn} onClick={() => { setV(item.name); setEdit(false); }}>✕</button>
    </form>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 py-1 pe-1 ps-3 text-sm font-semibold dark:border-white/15 dark:bg-white/5" data-testid={testId}>
      <span dir="auto">{item.name}</span>
      <button type="button" className="rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setEdit(true)} aria-label={tr(`Rename ${item.name}`, `إعادة تسمية ${item.name}`)} title={tr("Rename", "إعادة تسمية")} data-testid={`${testId}-rename`}>✏️</button>
      <button type="button" className="rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10" onClick={onDelete} aria-label={tr(`Delete ${item.name}`, `حذف ${item.name}`)} title={tr("Delete", "حذف")} data-testid={`${testId}-delete`}>🗑</button>
    </span>
  );
}

function AddForm({ placeholder, onAdd, testId }: { placeholder: string; onAdd: (name: string) => Promise<boolean>; testId: string }) {
  const { tr } = useTr();
  const [v, setV] = useState("");
  return (
    <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (v.trim() && (await onAdd(v.trim()))) setV(""); }}>
      <input className={inputCls + " mt-0 w-44 py-1.5 sm:w-56"} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} dir="auto" aria-label={placeholder} data-testid={`${testId}-input`} />
      <button type="submit" className={smallBtn + " shrink-0 whitespace-nowrap"} disabled={!v.trim()} data-testid={`${testId}-add`}>+ {tr("Add", "إضافة")}</button>
    </form>
  );
}


type K = "phase" | "dept" | "subject" | "class";
type SaveFn = (kind: K | "section", id: string | undefined, name: string, parent?: string) => Promise<boolean>;
function PSel({ value, opts, onChange, none, testId }: { value: string; opts: Item[]; onChange: (v: string) => void; none: string; testId: string }) {
  return (
    <select className="rounded-full border border-black/15 bg-white px-2 py-1 text-xs font-semibold text-[#1b2f44]" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label={none}>
      <option value="">{none}</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
function AddWithParent({ kind, placeholder, opts, none, testId, save }: { kind: K; placeholder: string; opts?: Item[]; none?: string; testId: string; save: SaveFn }) {
  const [pv, setPv] = useState("");
  return <div className="flex flex-wrap items-center gap-2">{opts && <PSel value={pv} opts={opts} onChange={setPv} none={none || ""} testId={`${testId}-parent`} />}<AddForm placeholder={placeholder} testId={testId} onAdd={(name) => save(kind, undefined, name, opts ? pv : undefined)} /></div>;
}
function H({ icon, t, sub, tone }: { icon: string; t: string; sub: string; tone: string }) {
  return <div className={`-mx-4 -mt-4 mb-3 rounded-t-3xl px-4 py-3 text-white sm:-mx-5 sm:-mt-5 sm:px-5 ${tone}`}><h3 className="text-lg font-extrabold">{icon} {t}</h3><p className="text-xs opacity-90">{sub}</p></div>;
}

/** Admin area only (rendered inside the Admin layout): Subjects, Classes and their Sections (used by people forms, templates, homework targeting and filters). */
export function LmsSetup() {
  const { tr } = useTr();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => lmsApi.catalog(true).then(setCat).catch((e) => { if ((e as { status?: number }).status === 401 && adminRelogin()) return; setErr(lmsErrorText(e, tr)); }), [tr]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (p: Promise<Catalog>) => {
    try {
      setCat(await p);
      setErr("");
      return true;
    } catch (e) {
      setErr(lmsErrorText(e, tr));
      return false;
    }
  };
  const del = async (it: Item) => {
    if (!confirm(tr(`Delete ${it.name}?`, `حذف ${it.name}؟`))) return;
    try { setCat(await lmsApi.catalogDelete(it.id)); setErr(""); }
    catch (e) {
      const d = (e as LmsError).data?.detail as { students: number; teachers: number; sections: number; homework: number } | undefined;
      if ((e as LmsError).code !== "in_use" || !d) { setErr(lmsErrorText(e, tr)); return; }
      const parts = [d.students && tr(`${d.students} student(s)`, `${d.students} طالب`), d.teachers && tr(`${d.teachers} teacher(s)`, `${d.teachers} معلم`), d.sections && tr(`${d.sections} section(s)`, `${d.sections} شعبة`), d.homework && tr(`${d.homework} homework`, `${d.homework} واجب`)].filter(Boolean).join(", ");
      if (confirm(tr(`${it.name} is still used by ${parts}.\n\nDelete it anyway? Students/teachers are NOT deleted — they are just unassigned from it (sections inside a class are removed; homework keeps its old label).`, `${it.name} ما زال مستخدمًا (${parts}).\n\nالحذف على أي حال؟ لن يُحذف الطلاب/المعلمون، بل يُلغى ربطهم فقط.`))) {
        try { setCat(await lmsApi.catalogDelete(it.id, true)); setErr(""); } catch (e2) { setErr(lmsErrorText(e2, tr)); }
      } else setErr(tr(`${it.name} was not deleted — it is used by ${parts}.`, `لم يُحذف ${it.name} — مستخدم من ${parts}.`));
    }
  };

  const save: SaveFn = (kind, id, name, parent) => run(lmsApi.catalogSave({ kind, id, name, ...(parent !== undefined ? { parent } : {}) }));
  const phases = cat?.phases || [], depts = cat?.depts || [];
  const panel = "rounded-3xl border bg-white p-4 shadow-sm sm:p-5";
  return (
    <>
      <div className="light-island space-y-5 text-[#1b2f44]" data-testid="lms-setup">
        <div className="rounded-3xl bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-500 p-5 text-white shadow">
          <h2 className="text-2xl font-extrabold" data-testid="admin-lms-heading">🏫 {tr("Classes & subjects", "الصفوف والمواد")}</h2>
          <p className="mt-1 text-sm opacity-90">{tr("The only place to create Phases, Departments, Subjects, Classes and Sections. Groups, Teaching assignment, Timetable, filters, trackers and reports all read from here. Renaming updates everyone who uses the name.", "المكان الوحيد لإنشاء المراحل والأقسام والمواد والصفوف والشعب. كل الصفحات تقرأ من هنا.")}</p>
          <p className="mt-2 text-xs font-bold opacity-90">{tr("Phase → Department → Subject · Phase → Class → Section", "المرحلة ← القسم ← المادة · المرحلة ← الصف ← الشعبة")}</p>
        </div>
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert" data-testid="lms-setup-error">{err}</p>}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={panel + " border-indigo-200"} data-testid="setup-phases">
            <H icon="🧭" t={tr("Phases", "المراحل")} sub={tr("e.g. EYFS, Primary, Secondary", "مثل EYFS، الابتدائي، الثانوي")} tone="bg-indigo-600" />
            <div className="mb-3 flex flex-wrap gap-2">{phases.map((x) => <ItemChip key={x.id} item={x} testId="setup-phase" onRename={(name) => save("phase", x.id, name)} onDelete={() => del(x)} />)}{cat && !phases.length && <span className="text-sm opacity-60">{tr("None yet.", "لا يوجد بعد.")}</span>}</div>
            <AddWithParent save={save} kind="phase" placeholder={tr("New phase", "مرحلة جديدة")} testId="setup-phase" />
          </section>
          <section className={panel + " border-violet-200"} data-testid="setup-depts">
            <H icon="🏛️" t={tr("Departments", "الأقسام")} sub={tr("Each department can belong to a phase (or all phases).", "كل قسم يتبع مرحلة (أو كل المراحل).")} tone="bg-violet-600" />
            <ul className="mb-3 space-y-2">{depts.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2" data-testid="setup-dept-row"><ItemChip item={x} testId="setup-dept" onRename={(name) => save("dept", x.id, name)} onDelete={() => del(x)} /><PSel value={x.phaseId} opts={phases} none={tr("All phases", "كل المراحل")} onChange={(v) => save("dept", x.id, x.name, v)} testId="setup-dept-phase" /></li>)}</ul>
            <AddWithParent save={save} kind="dept" placeholder={tr("New department", "قسم جديد")} opts={phases} none={tr("All phases", "كل المراحل")} testId="setup-dept" />
          </section>
          <section className={panel + " border-sky-200"} data-testid="setup-subjects">
            <H icon="📘" t={tr("Subjects", "المواد")} sub={tr("Each subject belongs to a department.", "كل مادة تتبع قسمًا.")} tone="bg-sky-600" />
            <ul className="mb-3 space-y-2">{cat?.subjects.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2" data-testid="setup-subject-row"><ItemChip item={x} testId="setup-subject" onRename={(name) => save("subject", x.id, name)} onDelete={() => del(x)} /><PSel value={x.deptId || ""} opts={depts} none={tr("No department", "بلا قسم")} onChange={(v) => save("subject", x.id, x.name, v)} testId="setup-subject-dept" /></li>)}</ul>
            <AddWithParent save={save} kind="subject" placeholder={tr("e.g. Islamic B, Arabic", "مثل التربية الإسلامية")} opts={depts} none={tr("No department", "بلا قسم")} testId="setup-subject" />
          </section>
          <section className={panel + " border-emerald-200"} data-testid="setup-classes">
            <H icon="🏫" t={tr("Classes & sections", "الصفوف والشعب")} sub={tr("Each class belongs to a phase; sections belong to a class.", "كل صف يتبع مرحلة؛ والشعب تتبع الصف.")} tone="bg-emerald-600" />
            <AddWithParent save={save} kind="class" placeholder={tr("New class, e.g. Year 2", "صف جديد، مثل Year 2")} opts={phases} none={tr("No phase", "بلا مرحلة")} testId="setup-class" />
            <ul className="mt-3 space-y-2">
              {cat?.classes.map((c) => (
                <li key={c.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-2.5" data-testid="setup-class-row">
                  <div className="flex flex-wrap items-center gap-2"><ItemChip item={c} testId="setup-class" onRename={(name) => save("class", c.id, name)} onDelete={() => del(c)} /><PSel value={c.phaseId || ""} opts={phases} none={tr("No phase", "بلا مرحلة")} onChange={(v) => save("class", c.id, c.name, v)} testId="setup-class-phase" /></div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 ps-3">
                    <span className="text-xs font-bold opacity-70">{tr("Sections:", "الشعب:")}</span>
                    {cat.sections.filter((s) => s.classId === c.id).map((s) => <ItemChip key={s.id} item={s} testId="setup-section" onRename={(name) => save("section", s.id, name, c.id)} onDelete={() => del(s)} />)}
                    <AddForm placeholder={tr("e.g. 2A", "مثل 2A")} testId="setup-section" onAdd={(name) => save("section", undefined, name, c.id)} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {cat && <div className="rounded-3xl bg-white p-1"><StdDocs subjects={cat.subjects.map((x) => x.name)} /></div>}
      </div>
    </>
  );
}

/** t304: each subject's Standards document (PDF / Word / image, up to 10 MB) — teachers read it in the Standards book. */
function StdDocs({ subjects }: { subjects: string[] }) {
  const { tr } = useTr();
  const [docs, setDocs] = useState<{ subject: string; name: string; lang: string; size: number }[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => modCall<{ items: typeof docs }>("std-doc-list", {}, true).then((r) => setDocs(r.items)).catch(() => undefined), []);
  useEffect(() => { load(); }, [load]);
  const upload = async (subject: string, f: File) => {
    if (f.size > 10 * 1048576) { setMsg(tr("That file is over 10 MB.", "الملف أكبر من 10 ميغابايت.")); return; }
    setBusy(subject); setMsg("");
    try {
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      const lang = /islamic a/i.test(subject) || /[\u0600-\u06ff]/.test(f.name) ? "ar" : "en";
      await modCall("std-doc-save", { subject, name: f.name, lang, mime: f.type || "application/pdf", data }, true);
      setMsg(tr(`Uploaded for ${subject}.`, `تم الرفع لمادة ${subject}.`)); load();
    } catch (e) { setMsg(modErr(e, tr)); }
    setBusy("");
  };
  const remove = async (subject: string) => { if (!confirm(tr(`Remove the standards document of ${subject}?`, `حذف وثيقة معايير ${subject}؟`))) return; try { await modCall("std-doc-save", { subject, remove: true }, true); load(); } catch (e) { setMsg(modErr(e, tr)); } };
  return (
    <section className={card + " space-y-3"} data-testid="std-docs">
      <h2 className="text-xl font-bold">📄 {tr("Subject standards documents", "وثائق معايير المواد")}</h2>
      <p className="text-sm opacity-75">{tr("Upload each subject's Standards document. Teachers open it in their Standards book (Islamic A in Arabic, Islamic B in English).", "ارفع وثيقة معايير كل مادة. يفتحها المعلمون في كتاب المعايير (الإسلامية أ بالعربية، والإسلامية ب بالإنجليزية).")}</p>
      <ul className="divide-y divide-black/10 dark:divide-white/10">{subjects.map((sub) => { const d = docs.find((x) => x.subject === sub); return (
        <li key={sub} className="flex flex-wrap items-center gap-2 py-2" data-testid="std-doc-row">
          <span className="min-w-[8rem] font-bold" dir="auto">{sub}</span>
          <span className="flex-1 text-sm opacity-75" dir="auto">{d ? `${d.name} · ${(d.size / 1048576).toFixed(1)} MB · ${d.lang === "ar" ? "عربي" : "English"}` : tr("No document", "لا توجد وثيقة")}</span>
          <label className={smallBtn + " cursor-pointer"}>{busy === sub ? tr("Uploading…", "جارٍ الرفع…") : d ? tr("Replace", "استبدال") : tr("Upload", "رفع")}<input type="file" accept="application/pdf,.pdf,.docx,image/png,image/jpeg" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(sub, f); }} data-testid="std-doc-input" /></label>
          {d && <button type="button" className={smallBtn} onClick={() => remove(sub)} data-testid="std-doc-remove">🗑</button>}
        </li>
      ); })}</ul>
      {msg && <p className="text-sm font-semibold" role="status">{msg}</p>}
    </section>
  );
}
