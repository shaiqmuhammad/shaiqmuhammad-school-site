"use client";

import { useCallback, useEffect, useState } from "react";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { downloadCredentials, downloadSignInSheet, downloadUsersTemplate, exportAllHomeworkZip, parseUsersXlsx } from "@/components/lms/lmsFiles";
import { adminRelogin, card, inputCls, smallBtn, useLmsActor, useTr } from "@/components/lms/useLms";
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

/** Admin: Students page or Teachers page (list, search, filters, add, bulk upload, sign-in sheet, PINs). */
export function LmsAdmin({ role = "student" }: { role?: Role }) {
  const { tr } = useTr();
  const { actor, asAdmin, ready } = useLmsActor(true);
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
  const allowed = role === "teacher" ? asAdmin : asAdmin || actor?.perms.includes("manageUsers");
  const title = role === "teacher" ? tr("Teachers", "المعلمون") : tr("Students", "الطلاب");

  const load = useCallback(() => {
    lmsApi.users(asAdmin).then((r) => { setUsers(r.users); setKnown(null); }).catch((e) => { if (asAdmin && (e as { status?: number }).status === 401 && adminRelogin()) return; setErr(lmsErrorText(e, tr)); });
    lmsApi.catalog(asAdmin).then(setCatalog).catch(() => undefined);
  }, [asAdmin, tr]);
  useEffect(() => {
    if (ready && allowed) load();
    // Admin pages: no valid admin session (and not a teacher allowed here) → admin sign-in once, then back.
    else if (ready && !allowed && !actor) adminRelogin();
  }, [ready, allowed, actor, load]);

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
      <AssessmentShell title={title} exitHref="/admin">
        <div className="mx-auto max-w-lg flex-1 p-8 text-center">
          <p className={card}>{role === "teacher" && actor ? tr("Only the admin manages teachers.", "فقط المدير يدير المعلمين.") : tr("Sign in to the admin first.", "سجّل الدخول إلى الإدارة أولًا.")} <a className="font-bold underline" href={`/admin/login?next=/lms/${role === "teacher" ? "teachers" : "students"}`}>{tr("Admin sign-in", "دخول الإدارة")}</a></p>
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
  const copy = async (id: string, pin: string) => { await navigator.clipboard?.writeText(pin).catch(() => undefined); setCopied(id); setTimeout(() => setCopied(""), 1500); };

  return (
    <AssessmentShell title={title} exitHref={asAdmin ? "/admin" : "/lms"} wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 py-5 sm:px-6" data-testid="lms-admin" data-role={role}>
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
        <nav className="flex flex-wrap gap-2 text-sm">
          <a className={smallBtn + (role === "student" ? " ring-2 ring-sun" : "")} href="/lms/students">🎒 {tr("Students", "الطلاب")}</a>
          {asAdmin && <a className={smallBtn + (role === "teacher" ? " ring-2 ring-sun" : "")} href="/lms/teachers">🧑‍🏫 {tr("Teachers", "المعلمون")}</a>}
          {asAdmin && <a className={smallBtn} href="/lms/setup">🏫 {tr("Classes & subjects", "الصفوف والمواد")}</a>}
          <a className={smallBtn} href="/lms">📚 {tr("Homework", "الواجبات")}</a>
        </nav>

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

        <section className={card + " space-y-3"}>
          <h2 className="text-xl font-bold">{role === "teacher" ? tr("Add a teacher", "إضافة معلم") : tr("Add a student", "إضافة طالب")}</h2>
          <PersonForm role={role} catalog={catalog} onSave={async (r) => { await saveMany([r]); }} submitLabel={"+ " + tr("Add", "إضافة")} testPrefix="lms-new" />
        </section>

        <section className={card + " space-y-3"}>
          <h2 className="text-xl font-bold">{tr("Bulk upload (Excel)", "رفع جماعي (إكسل)")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={smallBtn} onClick={() => downloadUsersTemplate(role, catalog)} data-testid="lms-template">⬇ {role === "teacher" ? tr("Teachers template", "قالب المعلمين") : tr("Students template", "قالب الطلاب")}</button>
            <label className={smallBtn + " cursor-pointer"}>
              ⬆ {tr("Upload .xlsx", "رفع ملف .xlsx")}
              <input type="file" accept=".xlsx" className="sr-only" data-testid="lms-upload" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setPreview(await parseUsersXlsx(f, role)); } catch { setErr(tr("That file couldn't be read — use the template.", "تعذرت قراءة الملف — استخدم القالب.")); } }} />
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
        </section>

        <section className={card + " space-y-3"}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{title} ({list.length}{list.length !== people.length ? ` / ${people.length}` : ""})</h2>
            <span className="flex-1" />
            {asAdmin && <button type="button" className={smallBtn} onClick={async () => { try { await downloadSignInSheet(list, await allPins(), role); } catch (e) { setErr(lmsErrorText(e, tr)); } }} data-testid="lms-signin-sheet">⬇ {tr("Sign-in sheet", "ورقة الدخول")}</button>}
            {asAdmin && role === "student" && <button type="button" className={smallBtn} onClick={() => exportAllHomeworkZip(asAdmin).catch((e) => setErr(lmsErrorText(e, tr)))} data-testid="lms-admin-export">⬇ {tr("All homework (ZIP)", "كل الواجبات (ZIP)")}</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <input className={inputCls + " mt-0 max-w-xs"} placeholder={tr("Search name or username…", "ابحث بالاسم أو المستخدم…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="lms-search" aria-label={tr("Search", "بحث")} />
            {role === "teacher" && (
              <select className={inputCls + " mt-0 w-auto"} value={fSub} onChange={(e) => setFSub(e.target.value)} data-testid="lms-filter-subject" aria-label={tr("Subject", "المادة")}>
                <option value="">{tr("All subjects", "كل المواد")}</option>
                {catalog.subjects.map((s) => <option key={s.id}>{s.name}</option>)}
              </select>
            )}
            <select className={inputCls + " mt-0 w-auto"} value={fCls} onChange={(e) => { setFCls(e.target.value); setFSec(""); }} data-testid="lms-filter-class" aria-label={tr("Class", "الصف")}>
              <option value="">{tr("All classes", "كل الصفوف")}</option>
              {catalog.classes.map((c) => <option key={c.id}>{c.name}</option>)}
            </select>
            <select className={inputCls + " mt-0 w-auto"} value={fSec} onChange={(e) => setFSec(e.target.value)} disabled={!secOpts.length} data-testid="lms-filter-section" aria-label={tr("Section", "الشعبة")}>
              <option value="">{tr("All sections", "كل الشعب")}</option>
              {secOpts.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {list.map((u) => {
              const pin = known?.[u.id];
              const open = shown.has(u.id);
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="lms-user">
                  <span className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                  <span className="text-xl" aria-hidden>{u.role === "teacher" ? "🧑‍🏫" : "🎒"}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-semibold ${u.disabled ? "line-through opacity-60" : ""}`} dir="auto">{u.name}</span>
                    <span className="block text-xs opacity-70">
                      <span className="font-mono" dir="ltr">{u.username}</span> · {role === "student" ? [u.cls, u.section].filter(Boolean).join(" · ") || "—" : [u.subjects.join(", ") || tr("no subjects", "بلا مواد"), u.scope.length ? u.scope.map(scopeLabel).join(", ") : tr("all classes", "كل الصفوف")].join(" — ")}
                    </span>
                  </span>
                  </span>
                  {asAdmin && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-sm dark:bg-white/10" data-testid="lms-pin-cell">
                      {!u.hasPin ? (
                        <span className="text-xs opacity-70" data-testid="lms-pin-reset-hint">{tr("Reset PIN to view", "أعد تعيين الرقم لعرضه")}</span>
                      ) : (
                        <>
                          <span className="min-w-[4.5ch] font-mono" dir="ltr" data-testid="lms-pin-shown">{open && pin ? pin : "••••"}</span>
                          <button type="button" className="rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10" aria-label={open ? tr("Hide PIN", "إخفاء الرقم") : tr("Show PIN", "إظهار الرقم")} title={open ? tr("Hide PIN", "إخفاء الرقم") : tr("Show PIN", "إظهار الرقم")} aria-pressed={open} data-testid="lms-pin-eye"
                            onClick={async () => { try { await allPins(); setShown((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; }); } catch (e) { setErr(lmsErrorText(e, tr)); } }}>
                            {open ? "🙈" : "👁"}
                          </button>
                          <button type="button" className="rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10" aria-label={tr("Copy PIN", "نسخ الرقم")} title={tr("Copy PIN", "نسخ الرقم")} data-testid="lms-pin-copy"
                            onClick={async () => { try { const p = (await allPins())[u.id]; if (p) await copy(u.id, p); } catch (e) { setErr(lmsErrorText(e, tr)); } }}>
                            {copied === u.id ? "✅" : "📋"}
                          </button>
                        </>
                      )}
                    </span>
                  )}
                  <button type="button" className={smallBtn} onClick={() => setEdit(edit === u.id ? null : u.id)} aria-label={tr("Edit", "تعديل")} data-testid="lms-user-edit">✏️</button>
                  <button type="button" className={smallBtn} onClick={async () => { if (!confirm(tr(`Give ${u.name} a new PIN?`, `رقم سري جديد لـ ${u.name}؟`))) return; const r = await lmsApi.resetPin(u.id, undefined, asAdmin).catch(() => null); if (r) { setPins((p) => [{ username: u.username, name: u.name, pin: r.pin }, ...p]); load(); } }} data-testid="lms-user-pin">🔑 {tr("New PIN", "رقم جديد")}</button>
                  <button type="button" className={smallBtn + " text-rose-600"} aria-label={tr("Delete", "حذف")} onClick={async () => { if (!confirm(tr(`Delete ${u.name} and their homework?`, `حذف ${u.name} وواجباته؟`))) return; await lmsApi.deleteUser(u.id, asAdmin).catch(() => undefined); load(); }} data-testid="lms-user-delete">🗑</button>
                  {edit === u.id && (
                    <div className="mt-2 w-full rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5">
                      <PersonForm role={role} catalog={catalog} initial={u} onSave={async (r) => { if (await saveMany([r])) setEdit(null); }} submitLabel={tr("Save", "حفظ")} testPrefix="lms-edit" />
                    </div>
                  )}
                </li>
              );
            })}
            {users && !list.length && <li className="py-4 text-center opacity-60">{tr("Nobody here yet.", "لا يوجد أحد بعد.")}</li>}
          </ul>
        </section>
      </div>
    </AssessmentShell>
  );
}
