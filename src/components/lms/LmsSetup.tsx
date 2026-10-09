"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRelogin, card, inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, type Catalog } from "@/lib/lms";

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
  const del = (it: Item) => { if (confirm(tr(`Delete ${it.name}?`, `حذف ${it.name}؟`))) run(lmsApi.catalogDelete(it.id)); };

  return (
    <>
      <div className="space-y-5" data-testid="lms-setup">
        <h2 className="text-2xl font-extrabold" data-testid="admin-lms-heading">{tr("Classes & subjects", "الصفوف والمواد")}</h2>
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert" data-testid="lms-setup-error">{err}</p>}
        <p className="text-sm opacity-75">{tr("Renaming updates every student, teacher and homework that uses the name. Something still in use can't be deleted.", "إعادة التسمية تحدّث كل الطلاب والمعلمين والواجبات. لا يمكن حذف ما زال مستخدمًا.")}</p>

        <section className={card + " space-y-3"}>
          <h2 className="text-xl font-bold">📘 {tr("Subjects", "المواد")}</h2>
          <div className="flex flex-wrap gap-2">
            {cat?.subjects.map((s) => <ItemChip key={s.id} item={s} testId="setup-subject" onRename={(name) => run(lmsApi.catalogSave({ kind: "subject", id: s.id, name }))} onDelete={() => del(s)} />)}
            {cat && !cat.subjects.length && <span className="text-sm opacity-60">{tr("None yet.", "لا يوجد بعد.")}</span>}
          </div>
          <AddForm placeholder={tr("e.g. Islamic B, Arabic, Quran", "مثل التربية الإسلامية، العربية، القرآن")} testId="setup-subject" onAdd={(name) => run(lmsApi.catalogSave({ kind: "subject", name }))} />
        </section>

        <section className={card + " space-y-3"}>
          <h2 className="text-xl font-bold">🏫 {tr("Classes & sections", "الصفوف والشعب")}</h2>
          <AddForm placeholder={tr("New class, e.g. Year 2", "صف جديد، مثل Year 2")} testId="setup-class" onAdd={(name) => run(lmsApi.catalogSave({ kind: "class", name }))} />
          <ul className="space-y-3">
            {cat?.classes.map((c) => (
              <li key={c.id} className="rounded-2xl border border-black/10 p-3 dark:border-white/15" data-testid="setup-class-row">
                <ItemChip item={c} testId="setup-class" onRename={(name) => run(lmsApi.catalogSave({ kind: "class", id: c.id, name }))} onDelete={() => del(c)} />
                <div className="mt-2 flex flex-wrap items-center gap-2 ps-4">
                  <span className="text-sm opacity-70">{tr("Sections:", "الشعب:")}</span>
                  {cat.sections.filter((s) => s.classId === c.id).map((s) => <ItemChip key={s.id} item={s} testId="setup-section" onRename={(name) => run(lmsApi.catalogSave({ kind: "section", id: s.id, name, parent: c.id }))} onDelete={() => del(s)} />)}
                  <AddForm placeholder={tr("e.g. 2A", "مثل 2A")} testId="setup-section" onAdd={(name) => run(lmsApi.catalogSave({ kind: "section", name, parent: c.id }))} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
