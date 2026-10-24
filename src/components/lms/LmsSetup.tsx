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
        {cat && <StdDocs subjects={cat.subjects.map((x) => x.name)} />}

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
