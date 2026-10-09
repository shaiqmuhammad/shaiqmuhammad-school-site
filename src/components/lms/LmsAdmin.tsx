"use client";

import { StudentProgress } from "@/components/lms/Progress";
import { Fragment, useCallback, useEffect, useState } from "react";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { downloadCredentials, downloadSignInSheet, downloadUsersTemplate, exportAllHomeworkZip, parseUsersXlsx } from "@/components/lms/lmsFiles";
import { ADMIN_ACTOR, adminRelogin, card, inputCls, smallBtn, useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, PERMS, scopeLabel, type Catalog, type LmsUser, type Role } from "@/lib/lms";

type Pins = { username: string; name: string; pin: string }[];
type Row = Partial<LmsUser & { pin: string }>;
const PERM_LABEL: Record<string, [string, string]> = {
  assign: ["Assign homework", "إسناد الواجبات"],
  review: ["Review & approve", "المراجعة والقبول"],
  manageUsers: ["Manage students", "إدارة الطلاب"],
  viewAll: ["See all homework", "رؤية كل الواجبات"],
};
const EMPTY: Catalog = { subjects: [], classes: [], sections: [] };

/** Add / edit one student or teacher, with dropdowns from Classes & Subjects. */
function PersonForm({ role, catalog, initial, onSave, submitLabel, testPrefix }: { role: Role; catalog: Catalog; initial?: LmsUser; onSave: (r: Row) => Promise<void>; submitLabel: string; testPrefix: string }) {
  const { tr } = useTr();
  const [f, setF] = useState({ name: initial?.name || "", username: initial?.username || "", cls: initial?.cls || "", section: initial?.section || "", pin: "", subjects: initial?.subjects || [], scope: initial?.scope || [], perms: initial?.perms || ["assign", "review"], disabled: initial?.disabled || false });
  const [busy, setBusy] = useState(false);
  const toggle = (k: "subjects" | "scope" | "perms", v: string) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const secs = catalog.sections.filter((s) => s.cls === f.cls);
  const classOpts = [...new Set([...catalog.classes.map((c) => c.name), ...(f.cls ? [f.cls] : [])])];
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? "border-transparent bg-header text-sun" : "border-black/10 dark:border-white/15"}`;
  return (
    <form
      className="grid gap-2 sm:grid-cols-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ id: initial?.id, role, name: f.name.trim(), username: f.username, cls: role === "student" ? f.cls : "", section: role === "student" ? f.section : "", subjects: role === "teacher" ? f.subjects : [], scope: role === "teacher" ? f.scope : [], perms: role === "teacher" ? f.perms : [], pin: f.pin || undefined, disabled: f.disabled });
        setBusy(false);
        if (!initial) setF((x) => ({ ...x, name: "", username: "", pin: "" }));
      }}
    >
      <input className={inputCls + " sm:col-span-2"} placeholder={tr("Full name", "الاسم الكامل")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} dir="auto" data-testid={`${testPrefix}-name`} aria-label={tr("Full name", "الاسم الكامل")} />
      <input className={inputCls} placeholder={tr("username", "اسم المستخدم")} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} dir="ltr" data-testid={`${testPrefix}-username`} aria-label={tr("username", "اسم المستخدم")} />
      {role === "student" ? (
        <>
          <select className={inputCls} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value, section: "" })} data-testid={`${testPrefix}-class`} aria-label={tr("Class", "الصف")}>
            <option value="">{tr("Class…", "الصف…")}</option>
            {classOpts.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={inputCls} value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} disabled={!secs.length} data-testid={`${testPrefix}-section`} aria-label={tr("Section", "الشعبة")}>
            <option value="">{tr("Section…", "الشعبة…")}</option>
            {secs.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>
        </>
      ) : (
        <span className="hidden sm:col-span-2 sm:block" />
      )}
      {!initial && <input className={inputCls} placeholder={tr("PIN (auto)", "الرقم السري (تلقائي)")} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} inputMode="numeric" dir="ltr" data-testid={`${testPrefix}-pin`} aria-label="PIN" />}
      {role === "teacher" && (
        <div className="space-y-2 sm:col-span-6">
          <p className="text-sm font-semibold">{tr("Subjects", "المواد")}</p>
          <div className="flex flex-wrap gap-1.5">
            {catalog.subjects.map((s) => <button key={s.id} type="button" aria-pressed={f.subjects.includes(s.name)} className={chip(f.subjects.includes(s.name))} onClick={() => toggle("subjects", s.name)} data-testid={`${testPrefix}-subject`}>{s.name}</button>)}
            {!catalog.subjects.length && <span className="text-sm opacity-60">{tr("No subjects yet — add them in Classes & Subjects.", "لا توجد مواد — أضفها في الصفوف والمواد.")}</span>}
          </div>
          <p className="text-sm font-semibold">{tr("Classes / sections taught (empty = all)", "الصفوف / الشعب (فارغ = الكل)")}</p>
          <div className="flex flex-wrap gap-1.5">
            {catalog.classes.flatMap((c) => [c.name, ...catalog.sections.filter((s) => s.classId === c.id).map((s) => `${c.name}|${s.name}`)]).map((v) => (
              <button key={v} type="button" aria-pressed={f.scope.includes(v)} className={chip(f.scope.includes(v))} onClick={() => toggle("scope", v)} data-testid={`${testPrefix}-scope`}>{scopeLabel(v)}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {PERMS.map((p) => <label key={p} className="flex items-center gap-1.5"><input type="checkbox" checked={f.perms.includes(p)} onChange={() => toggle("perms", p)} data-testid={`lms-perm-${p}`} /> {tr(PERM_LABEL[p][0], PERM_LABEL[p][1])}</label>)}
          </div>
        </div>
      )}
      {initial && <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={f.disabled} onChange={(e) => setF({ ...f, disabled: e.target.checked })} /> {tr("Disabled (can't sign in)", "معطّل (لا يمكنه الدخول)")}</label>}
      <button type="submit" className={primaryBtn + " sm:col-span-6 sm:w-fit"} disabled={busy || !f.name.trim() || f.username.length < 3} data-testid={`${testPrefix}-save`}>{submitLabel}</button>
    </form>
  );
}

/** Admin area renders these without the LMS top bar; on /lms they sit in the LMS shell. */
function Frame({ embedded, title, children }: { embedded: boolean; title: string; children: React.ReactNode }) {
  if (embedded) return <>{children}</>;
  return (
    <AssessmentShell title={title} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      {children}
    </AssessmentShell>
  );
}

/** Admin: Students page or Teachers page (list, search, filters, add, bulk upload, sign-in sheet, PINs). */
export function LmsAdmin({ role = "student", embedded = false }: { role?: Role; embedded?: boolean }) {
  const { tr } = useTr();
  // Inside Admin (embedded): the admin session only. On /lms: a teacher with "manage students" only.
  const lms = useLmsActor();
  const actor = embedded ? ADMIN_ACTOR : lms.actor;
  const asAdmin = embedded;
  const ready = embedded || lms.ready;
  const [users, setUsers] = useState<LmsUser[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fCls, setFCls] = useState("");
  const [fSec, setFSec] = useState("");
  const [fSub, setFSub] = useState("");
  const [pins, setPins] = useState<Pins>([]);
  const [known, setKnown] = useState<Record<string, string | null> | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const [errors, setErrors] = useState<{ row: number; username: string; error: string }[]>([]);
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [progress, setProgress] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [prog, setProg] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<"" | "active" | "blocked">("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const allowed = embedded || (role === "student" && actor?.role === "teacher" && actor.perms.includes("manageUsers"));
  const title = role === "teacher" ? tr("Teachers", "المعلمون") : tr("Students", "الطلاب");

  const load = useCallback(() => {
    lmsApi.users(asAdmin).then((r) => { setUsers(r.users); setKnown(null); }).catch((e) => { if (asAdmin && (e as { status?: number }).status === 401 && adminRelogin()) return; setErr(lmsErrorText(e, tr)); });
    lmsApi.catalog(asAdmin).then(setCatalog).catch(() => undefined);
  }, [asAdmin, tr]);
  useEffect(() => {
    if (ready && allowed) load();
  }, [ready, allowed, load]);

  /** Admin-only PIN lookup, fetched once on first use. */
  async function allPins() {
    if (known) return known;
    const r = await lmsApi.pinsView();
    setKnown(r.pins);
    return r.pins;
  }

  async function saveMany(rows: Row[]) {
    const got: Pins = [];
    const errs: typeof errors = [];
    for (let i = 0; i < rows.length; i += 5) {
      setProgress(`${Math.min(i + 5, rows.length)} / ${rows.length}`);
      try {
        const r = await lmsApi.saveUsers(rows.slice(i, i + 5), asAdmin);
        got.push(...r.pins);
        errs.push(...r.errors.map((e) => ({ ...e, row: e.row + i })));
      } catch (e) {
        errs.push({ row: i + 1, username: rows[i]?.username || "", error: lmsErrorText(e, tr) });
      }
    }
    setProgress("");
    setPins((p) => [...got, ...p]);
    setErrors(errs);
    load();
    return errs.length === 0;
  }

  if (ready && !allowed) {
    return (
      <AssessmentShell title={title} exitHref="/lms">
        <div className="mx-auto max-w-lg flex-1 p-8 text-center">
          <p className={card} data-testid="lms-need-login">
            {tr("Students and teachers are managed in Admin.", "يُدار الطلاب والمعلمون من لوحة الإدارة.")}{" "}
            <a className="font-bold underline" href={`/admin#${role === "teacher" ? "teachers" : "students"}`}>{tr("Open Admin", "فتح الإدارة")}</a>
          </p>
        </div>
      </AssessmentShell>
    );
  }

  const people = (users || []).filter((u) => u.role === role);
  const list = people.filter((u) => {
    if (q && !`${u.name} ${u.username}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (role === "student") return (!fCls || u.cls === fCls) && (!fSec || u.section === fSec);
    return (!fSub || u.subjects.includes(fSub)) && (!fCls || !u.scope.length || u.scope.some((s) => s.split("|")[0] === fCls)) && (!fSec || u.scope.includes(`${fCls}|${fSec}`));
  });
  const errText = (e: string) => ({ username: tr("username must be 3+ letters/numbers", "اسم المستخدم 3 أحرف على الأقل"), username_taken: tr("username already used", "اسم المستخدم مستخدم"), name: tr("name missing", "الاسم مفقود"), pin_digits: tr("PIN must be 4–8 digits", "الرقم السري من 4 إلى 8 أرقام"), admin_only: tr("only the admin can edit teachers", "فقط المدير يعدّل المعلمين"), full: tr("user limit reached", "تم بلوغ الحد"), unknown_class: tr("class not in Classes & Subjects", "الصف غير موجود في القائمة"), unknown_section: tr("section not in that class", "الشعبة ليست في هذا الصف"), unknown_subject: tr("subject not in the list", "المادة غير موجودة"), unknown_scope: tr("class/section not in the list", "الصف/الشعبة غير موجود") })[e] || e;
  const secOpts = catalog.sections.filter((s) => s.cls === fCls);
  const teacherClasses = (u: LmsUser) => [...new Set(u.scope.map((x) => x.split("|")[0]))];
  const teacherSections = (u: LmsUser) => u.scope.filter((x) => x.includes("|")).map((x) => x.split("|")[1]);
  const cols: { key: string; label: string; sort: boolean }[] = [
    { key: "name", label: tr("Name", "الاسم"), sort: true },
    { key: "username", label: tr("Username", "اسم المستخدم"), sort: true },
    ...(asAdmin ? [{ key: "pin", label: "PIN", sort: false }] : []),
    ...(role === "student"
      ? [{ key: "cls", label: tr("Class", "الصف"), sort: true }, { key: "section", label: tr("Section", "الشعبة"), sort: true }]
      : [{ key: "subjects", label: tr("Subjects", "المواد"), sort: true }, { key: "classes", label: tr("Classes", "الصفوف"), sort: true }, { key: "sections", label: tr("Sections", "الشعب"), sort: true }]),
    { key: "status", label: tr("Status", "الحالة"), sort: true },
    { key: "actions", label: tr("Actions", "إجراءات"), sort: false },
  ];
  const sortVal = (u: LmsUser): string => ({ name: u.name, username: u.username, cls: u.cls, section: u.section, subjects: u.subjects.join(","), classes: teacherClasses(u).join(","), sections: teacherSections(u).join(","), status: u.disabled ? "1" : "0" })[sort.key] ?? "";
  const filtered = list.filter((u) => !fStatus || (fStatus === "blocked") === u.disabled);
  const sorted = [...filtered].sort((x, y) => sortVal(x).localeCompare(sortVal(y), undefined, { numeric: true, sensitivity: "base" }) * sort.dir);
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const pageRows = sorted.slice(Math.min(page, pages - 1) * PAGE, Math.min(page, pages - 1) * PAGE + PAGE);
  const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-white/10";
  const bulk = async (disabled: boolean) => {
    await lmsApi.setStatus([...sel], disabled, asAdmin).catch((e) => setErr(lmsErrorText(e, tr)));
    setSel(new Set());
    load();
  };
  const copy = async (id: string, pin: string) => { await navigator.clipboard?.writeText(pin).catch(() => undefined); setCopied(id); setTimeout(() => setCopied(""), 1500); };

  return (
    <Frame embedded={embedded} title={title}>
      <div className={embedded ? "space-y-5" : "mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 py-5 sm:px-6"} data-testid="lms-admin" data-role={role}>
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
        {embedded ? <h2 className="text-2xl font-extrabold" data-testid="admin-lms-heading">{title}</h2> : <nav className="flex flex-wrap gap-2 text-sm"><a className={smallBtn} href="/lms">📚 {tr("Homework", "الواجبات")}</a></nav>}

        {pins.length > 0 && (
          <section className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-4 dark:bg-amber-900/30" data-testid="lms-pins">
            <p className="font-bold">🔑 {tr("New sign-in details", "بيانات الدخول الجديدة")}</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {pins.map((p) => <li key={p.username} className="font-mono" dir="ltr">{p.name} · <b>{p.username}</b> · PIN <b data-testid="lms-pin-value">{p.pin}</b></li>)}
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className={primaryBtn} onClick={() => downloadCredentials(pins)} data-testid="lms-pins-download">⬇ {tr("Download (Excel)", "تنزيل (إكسل)")}</button>
              <button type="button" className={smallBtn} onClick={() => setPins([])}>{tr("Hide", "إخفاء")}</button>
            </div>
          </section>
        )}

        <details className={card + " space-y-3 [&[open]>summary]:mb-3"}>
          <summary className="cursor-pointer text-lg font-bold marker:text-primary" data-testid="lms-toggle-add">+ {role === "teacher" ? tr("Add a teacher", "إضافة معلم") : tr("Add a student", "إضافة طالب")}</summary>
          <PersonForm role={role} catalog={catalog} onSave={async (r) => { await saveMany([r]); }} submitLabel={"+ " + tr("Add", "إضافة")} testPrefix="lms-new" />
        </details>

        <details className={card + " space-y-3 [&[open]>summary]:mb-3"}>
          <summary className="cursor-pointer text-lg font-bold marker:text-primary" data-testid="lms-toggle-bulk">{tr("Bulk upload (Excel)", "رفع جماعي (إكسل)")}</summary>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={smallBtn} onClick={() => downloadUsersTemplate(role, catalog)} data-testid="lms-template">⬇ {role === "teacher" ? tr("Teachers template", "قالب المعلمين") : tr("Students template", "قالب الطلاب")}</button>
            <label className={smallBtn + " cursor-pointer"}>
              ⬆ {tr("Upload .xlsx", "رفع ملف .xlsx")}
              <input type="file" accept=".xlsx" className="sr-only" data-testid="lms-upload" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setPreview(await parseUsersXlsx(f, role, catalog)); } catch { setErr(tr("That file couldn't be read — use the template.", "تعذرت قراءة الملف — استخدم القالب.")); } }} />
            </label>
            {progress && <span className="font-semibold" data-testid="lms-progress">{tr("Saving", "جارٍ الحفظ")} {progress}…</span>}
          </div>
          {preview && (
            <div className="space-y-2" data-testid="lms-preview">
              <p className="font-semibold">{tr(`${preview.length} rows ready`, `${preview.length} صفًا جاهزًا`)}</p>
              <div className="max-h-60 overflow-auto rounded-xl border border-black/10 dark:border-white/15">
                <table className="w-full text-sm">
                  <tbody>{preview.map((r, i) => (<tr key={i} className="border-t border-black/5 dark:border-white/10"><td className="p-1.5" dir="auto">{r.name}</td><td className="p-1.5 font-mono">{r.username}</td><td className="p-1.5">{role === "student" ? [r.cls, r.section].filter(Boolean).join(" · ") : `${(r.subjects || []).join(", ")} — ${(r.scope || []).map(scopeLabel).join(", ")}`}</td><td className="p-1.5">{r.pin ? "••••" : tr("auto", "تلقائي")}</td></tr>))}</tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button type="button" className={primaryBtn} disabled={!!progress} onClick={async () => { const rows = preview; setPreview(null); await saveMany(rows); }} data-testid="lms-import">{tr("Import", "استيراد")}</button>
                <button type="button" className={smallBtn} onClick={() => setPreview(null)}>{tr("Cancel", "إلغاء")}</button>
              </div>
            </div>
          )}
          {errors.length > 0 && <ul className="space-y-1 text-sm text-rose-700 dark:text-rose-300" data-testid="lms-import-errors">{errors.map((e, i) => <li key={i}>{tr("Row", "صف")} {e.row} ({e.username || "—"}): {errText(e.error)}</li>)}</ul>}
        </details>

        <section className={card + " space-y-3"}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{title} ({filtered.length}{filtered.length !== people.length ? ` / ${people.length}` : ""})</h2>
            <span className="flex-1" />
            {asAdmin && <button type="button" className={smallBtn} onClick={async () => { try { await downloadSignInSheet(sorted, await allPins(), role); } catch (e) { setErr(lmsErrorText(e, tr)); } }} data-testid="lms-signin-sheet">⬇ {tr("Sign-in sheet", "ورقة الدخول")}</button>}
            {asAdmin && role === "student" && <button type="button" className={smallBtn} onClick={() => exportAllHomeworkZip(asAdmin).catch((e) => setErr(lmsErrorText(e, tr)))} data-testid="lms-admin-export">⬇ {tr("All homework (ZIP)", "كل الواجبات (ZIP)")}</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <input className={inputCls + " mt-0 max-w-xs"} placeholder={tr("Search name or username…", "ابحث بالاسم أو المستخدم…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="lms-search" aria-label={tr("Search", "بحث")} />
            {role === "teacher" && (
              <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fSub} onChange={(e) => setFSub(e.target.value)} data-testid="lms-filter-subject" aria-label={tr("Subject", "المادة")}>
                <option value="">{tr("All subjects", "كل المواد")}</option>
                {catalog.subjects.map((s) => <option key={s.id}>{s.name}</option>)}
              </select>
            )}
            <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fCls} onChange={(e) => { setFCls(e.target.value); setFSec(""); }} data-testid="lms-filter-class" aria-label={tr("Class", "الصف")}>
              <option value="">{tr("All classes", "كل الصفوف")}</option>
              {catalog.classes.map((c) => <option key={c.id}>{c.name}</option>)}
            </select>
            <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fSec} onChange={(e) => setFSec(e.target.value)} disabled={!secOpts.length} data-testid="lms-filter-section" aria-label={tr("Section", "الشعبة")}>
              <option value="">{tr("All sections", "كل الشعب")}</option>
              {secOpts.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
            <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fStatus} onChange={(e) => { setFStatus(e.target.value as typeof fStatus); setPage(0); }} data-testid="lms-filter-status" aria-label={tr("Status", "الحالة")}>
              <option value="">{tr("Any status", "كل الحالات")}</option>
              <option value="active">{tr("Active", "نشط")}</option>
              <option value="blocked">{tr("Blocked", "موقوف")}</option>
            </select>
          </div>
          {sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-sm dark:bg-sky-900/30" data-testid="lms-bulk">
              <b>{tr(`${sel.size} selected`, `${sel.size} محدد`)}</b>
              <button type="button" className={smallBtn} onClick={() => bulk(false)} data-testid="lms-bulk-activate">✅ {tr("Activate", "تفعيل")}</button>
              <button type="button" className={smallBtn} onClick={() => bulk(true)} data-testid="lms-bulk-block">⛔ {tr("Block", "إيقاف")}</button>
              <button type="button" className={smallBtn} onClick={() => setSel(new Set())}>{tr("Clear", "مسح")}</button>
            </div>
          )}
          <div className="max-h-[70vh] overflow-auto rounded-2xl border border-black/10 dark:border-white/15" data-testid="lms-table-wrap">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm" data-testid="lms-table">
              <thead className="sticky top-0 z-20">
                <tr className="bg-header text-start text-xs uppercase tracking-wide text-white">
                  <th className="sticky start-0 z-30 w-10 bg-header px-3 py-2.5"><input type="checkbox" aria-label={tr("Select all on this page", "تحديد الكل في هذه الصفحة")} checked={pageRows.length > 0 && pageRows.every((u) => sel.has(u.id))} onChange={(e) => setSel((x) => { const n = new Set(x); pageRows.forEach((u) => (e.target.checked ? n.add(u.id) : n.delete(u.id))); return n; })} data-testid="lms-select-all" /></th>
                  {cols.map((c) => (
                    <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 text-start font-bold ${c.key === "name" ? "sticky start-10 z-30 bg-header" : ""}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      {c.sort ? (
                        <button type="button" className="inline-flex items-center gap-1 hover:text-sun" onClick={() => setSort((x) => ({ key: c.key, dir: x.key === c.key ? (x.dir === 1 ? -1 : 1) : 1 }))} data-testid={`lms-sort-${c.key}`}>
                          {c.label}<span aria-hidden className="opacity-70">{sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u, i) => {
                  const pin = known?.[u.id];
                  const open = shown.has(u.id);
                  const zebra = i % 2 ? "bg-black/[0.025] dark:bg-white/[0.04]" : "bg-white dark:bg-[#0f1a26]";
                  const td = "border-t border-black/5 px-3 py-2 align-middle dark:border-white/10";
                  return (
                    <Fragment key={u.id}>
                      <tr className={`${zebra} transition hover:bg-sky-50 dark:hover:bg-sky-900/20`} data-testid="lms-user">
                        <td className={`${td} sticky start-0 z-10 ${zebra}`}><input type="checkbox" checked={sel.has(u.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} aria-label={tr(`Select ${u.name}`, `تحديد ${u.name}`)} data-testid="lms-select" /></td>
                        <td className={`${td} sticky start-10 z-10 whitespace-nowrap font-semibold ${zebra}`} dir="auto" data-testid="col-name">{u.name}</td>
                        <td className={`${td} font-mono`} dir="ltr" data-testid="col-username">{u.username}</td>
                        {asAdmin && (
                          <td className={td} data-testid="lms-pin-cell">
                            {!u.hasPin ? (
                              <span className="text-xs opacity-70" data-testid="lms-pin-reset-hint">{tr("Reset PIN to view", "أعد تعيين الرقم لعرضه")}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <span className="min-w-[4.5ch] font-mono" dir="ltr" data-testid="lms-pin-shown">{open && pin ? pin : "••••"}</span>
                                <button type="button" className={iconBtn} aria-label={open ? tr("Hide PIN", "إخفاء الرقم") : tr("Show PIN", "إظهار الرقم")} title={open ? tr("Hide PIN", "إخفاء الرقم") : tr("Show PIN", "إظهار الرقم")} aria-pressed={open} data-testid="lms-pin-eye" onClick={async () => { try { await allPins(); setShown((x) => { const n = new Set(x); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; }); } catch (e) { setErr(lmsErrorText(e, tr)); } }}>{open ? "🙈" : "👁"}</button>
                                <button type="button" className={iconBtn} aria-label={tr("Copy PIN", "نسخ الرقم")} title={tr("Copy PIN", "نسخ الرقم")} data-testid="lms-pin-copy" onClick={async () => { try { const p = (await allPins())[u.id]; if (p) await copy(u.id, p); } catch (e) { setErr(lmsErrorText(e, tr)); } }}>{copied === u.id ? "✅" : "📋"}</button>
                              </span>
                            )}
                          </td>
                        )}
                        {role === "student" ? (
                          <>
                            <td className={td} data-testid="col-class">{u.cls || "—"}</td>
                            <td className={td} data-testid="col-section">{u.section || "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className={td} data-testid="col-subjects">{u.subjects.join(", ") || "—"}</td>
                            <td className={td} data-testid="col-classes">{teacherClasses(u).join(", ") || tr("All", "الكل")}</td>
                            <td className={td} data-testid="col-sections">{teacherSections(u).join(", ") || "—"}</td>
                          </>
                        )}
                        <td className={td} data-testid="col-status">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${u.disabled ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100"}`}>{u.disabled ? tr("Blocked", "موقوف") : tr("Active", "نشط")}</span>
                        </td>
                        <td className={td + " whitespace-nowrap"}>
                          <span className="inline-flex gap-0.5">
                            <button type="button" className={iconBtn} onClick={() => setEdit(edit === u.id ? null : u.id)} aria-label={tr(`Edit ${u.name}`, `تعديل ${u.name}`)} title={tr("Edit", "تعديل")} aria-expanded={edit === u.id} data-testid="lms-user-edit">✏️</button>
                            {role === "student" && <button type="button" className={iconBtn} onClick={() => setProg(prog === u.id ? null : u.id)} aria-label={tr(`Progress of ${u.name}`, `تقدم ${u.name}`)} title={tr("Progress & tracker", "التقدم والمتابعة")} aria-expanded={prog === u.id} data-testid="lms-user-progress">📈</button>}
                            <button type="button" className={iconBtn} onClick={async () => { if (!confirm(tr(`Give ${u.name} a new PIN?`, `رقم سري جديد لـ ${u.name}؟`))) return; const r = await lmsApi.resetPin(u.id, undefined, asAdmin).catch(() => null); if (r) { setPins((p) => [{ username: u.username, name: u.name, pin: r.pin }, ...p]); load(); } }} aria-label={tr(`Reset PIN for ${u.name}`, `إعادة تعيين رقم ${u.name}`)} title={tr("Reset PIN", "إعادة تعيين الرقم")} data-testid="lms-user-pin">🔑</button>
                            <button type="button" className={iconBtn} onClick={async () => { await lmsApi.setStatus([u.id], !u.disabled, asAdmin).catch((e) => setErr(lmsErrorText(e, tr))); load(); }} aria-label={u.disabled ? tr(`Activate ${u.name}`, `تفعيل ${u.name}`) : tr(`Block ${u.name}`, `إيقاف ${u.name}`)} title={u.disabled ? tr("Activate", "تفعيل") : tr("Block", "إيقاف")} data-testid="lms-user-toggle">{u.disabled ? "✅" : "⛔"}</button>
                            <button type="button" className={iconBtn + " text-rose-600"} onClick={async () => { if (!confirm(tr(`Delete ${u.name} and their homework?`, `حذف ${u.name} وواجباته؟`))) return; await lmsApi.deleteUser(u.id, asAdmin).catch(() => undefined); load(); }} aria-label={tr(`Delete ${u.name}`, `حذف ${u.name}`)} title={tr("Delete", "حذف")} data-testid="lms-user-delete">🗑</button>
                          </span>
                        </td>
                      </tr>
                      {prog === u.id && (
                        <tr>
                          <td colSpan={cols.length + 1} className="border-t border-black/5 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/5">
                            <StudentProgress id={u.id} asAdmin={asAdmin} />
                          </td>
                        </tr>
                      )}
                      {edit === u.id && (
                        <tr>
                          <td colSpan={cols.length + 1} className="border-t border-black/5 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/5">
                            <PersonForm role={role} catalog={catalog} initial={u} onSave={async (r) => { if (await saveMany([r])) setEdit(null); }} submitLabel={tr("Save", "حفظ")} testPrefix="lms-edit" />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {users && !list.length && <tr><td colSpan={cols.length + 1} className="py-6 text-center opacity-60">{tr("Nobody here yet.", "لا يوجد أحد بعد.")}</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="lms-pager">
              <span className="opacity-70">{tr(`${page * PAGE + 1}–${Math.min((page + 1) * PAGE, sorted.length)} of ${sorted.length}`, `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, sorted.length)} من ${sorted.length}`)}</span>
              <span className="inline-flex gap-1">
                <button type="button" className={smallBtn} disabled={page === 0} onClick={() => setPage(page - 1)} data-testid="lms-page-prev">‹ {tr("Prev", "السابق")}</button>
                <button type="button" className={smallBtn} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} data-testid="lms-page-next">{tr("Next", "التالي")} ›</button>
              </span>
            </div>
          )}
        </section>
      </div>
    </Frame>
  );
}
