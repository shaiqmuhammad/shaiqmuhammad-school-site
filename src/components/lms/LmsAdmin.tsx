"use client";

import { useCallback, useEffect, useState } from "react";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { downloadCredentials, downloadUsersTemplate, exportAllHomeworkZip, parseUsersXlsx } from "@/components/lms/lmsFiles";
import { card, inputCls, smallBtn, useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, PERMS, type LmsUser } from "@/lib/lms";

type Pins = { username: string; name: string; pin: string }[];
const PERM_LABEL: Record<string, [string, string]> = {
  assign: ["Assign homework", "إسناد الواجبات"],
  review: ["Review & approve", "المراجعة والقبول"],
  manageUsers: ["Manage students", "إدارة الطلاب"],
  viewAll: ["See all homework", "رؤية كل الواجبات"],
};

/** Admin: students & teachers (add, edit, permissions, PIN reset, bulk Excel upload) + export all homework. */
export function LmsAdmin() {
  const { tr } = useTr();
  const { actor, asAdmin, ready } = useLmsActor();
  const [users, setUsers] = useState<LmsUser[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [pins, setPins] = useState<Pins>([]);
  const [errors, setErrors] = useState<{ row: number; username: string; error: string }[]>([]);
  const [preview, setPreview] = useState<Partial<LmsUser & { pin: string }>[] | null>(null);
  const [progress, setProgress] = useState("");
  const [draft, setDraft] = useState({ username: "", name: "", role: "student" as LmsUser["role"], cls: "", pin: "" });
  const [edit, setEdit] = useState<string | null>(null);
  const allowed = asAdmin || actor?.perms.includes("manageUsers");

  const load = useCallback(() => {
    lmsApi.users(asAdmin).then((r) => setUsers(r.users)).catch((e) => setErr(lmsErrorText(e, tr)));
  }, [asAdmin, tr]);
  useEffect(() => {
    if (ready && allowed) load();
  }, [ready, allowed, load]);

  /** Saves in small batches (PIN hashing is deliberately slow). */
  async function saveMany(rows: Partial<LmsUser & { pin: string }>[]) {
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
  }

  if (ready && !allowed) {
    return (
      <AssessmentShell title={tr("Students & teachers", "الطلاب والمعلمون")} exitHref="/admin">
        <div className="mx-auto max-w-lg flex-1 p-8 text-center">
          <p className={card}>{tr("Sign in to the admin first.", "سجّل الدخول إلى الإدارة أولًا.")} <a className="font-bold underline" href="/admin/login">{tr("Admin sign-in", "دخول الإدارة")}</a></p>
        </div>
      </AssessmentShell>
    );
  }

  const shown = (users || []).filter((u) => !filter || `${u.name} ${u.username} ${u.cls}`.toLowerCase().includes(filter.toLowerCase()));
  const errText = (e: string) => ({ username: tr("username must be 3+ letters/numbers", "اسم المستخدم 3 أحرف على الأقل"), username_taken: tr("username already used", "اسم المستخدم مستخدم"), name: tr("name missing", "الاسم مفقود"), pin_digits: tr("PIN must be 4–8 digits", "الرقم السري من 4 إلى 8 أرقام"), admin_only: tr("only the admin can edit teachers", "فقط المدير يعدّل المعلمين"), full: tr("user limit reached", "تم بلوغ الحد") })[e] || e;

  return (
    <AssessmentShell title={tr("Students & teachers", "الطلاب والمعلمون")} exitHref={asAdmin ? "/admin" : "/lms"} wide>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 py-5 sm:px-6" data-testid="lms-admin">
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}

        {pins.length > 0 && (
          <section className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-4 dark:bg-amber-900/30" data-testid="lms-pins">
            <p className="font-bold">🔑 {tr("New sign-in details — PINs are shown only now. Download or print them.", "بيانات الدخول الجديدة — الأرقام السرية تظهر الآن فقط. نزّلها أو اطبعها.")}</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {pins.map((p) => (
                <li key={p.username} className="font-mono" dir="ltr">{p.name} · <b>{p.username}</b> · PIN <b data-testid="lms-pin-value">{p.pin}</b></li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className={primaryBtn} onClick={() => downloadCredentials(pins)} data-testid="lms-pins-download">⬇ {tr("Download (Excel)", "تنزيل (إكسل)")}</button>
              <button type="button" className={smallBtn} onClick={() => setPins([])}>{tr("Hide", "إخفاء")}</button>
            </div>
          </section>
        )}

        <section className={card + " space-y-3"}>
          <h2 className="text-xl font-bold">{tr("Add one person", "إضافة شخص")}</h2>
          <form
            className="grid gap-2 sm:grid-cols-6"
            onSubmit={async (e) => {
              e.preventDefault();
              await saveMany([{ ...draft, pin: draft.pin || undefined, perms: draft.role === "teacher" ? ["assign", "review"] : [] }]);
              setDraft({ username: "", name: "", role: draft.role, cls: draft.cls, pin: "" });
            }}
          >
            <input className={inputCls + " sm:col-span-2"} placeholder={tr("Full name", "الاسم الكامل")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} dir="auto" data-testid="lms-new-name" />
            <input className={inputCls} placeholder={tr("username", "اسم المستخدم")} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value.toLowerCase() })} dir="ltr" data-testid="lms-new-username" />
            <select className={inputCls} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as LmsUser["role"] })} disabled={!asAdmin} data-testid="lms-new-role">
              <option value="student">{tr("Student", "طالب")}</option>
              <option value="teacher">{tr("Teacher", "معلم")}</option>
            </select>
            <input className={inputCls} placeholder={tr("Class e.g. 3A", "الصف مثل 3A")} value={draft.cls} onChange={(e) => setDraft({ ...draft, cls: e.target.value })} data-testid="lms-new-class" />
            <input className={inputCls} placeholder={tr("PIN (auto)", "الرقم السري (تلقائي)")} value={draft.pin} onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} inputMode="numeric" dir="ltr" data-testid="lms-new-pin" />
            <button type="submit" className={primaryBtn + " sm:col-span-6 sm:w-fit"} disabled={!draft.name.trim() || draft.username.length < 3 || !!progress} data-testid="lms-new-save">+ {tr("Add", "إضافة")}</button>
          </form>
        </section>

        <section className={card + " space-y-3"}>
          <h2 className="text-xl font-bold">{tr("Bulk upload (Excel)", "رفع جماعي (إكسل)")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={smallBtn} onClick={() => downloadUsersTemplate()} data-testid="lms-template">⬇ {tr("Download template", "تنزيل القالب")}</button>
            <label className={smallBtn + " cursor-pointer"}>
              ⬆ {tr("Upload .xlsx", "رفع ملف .xlsx")}
              <input
                type="file"
                accept=".xlsx"
                className="sr-only"
                data-testid="lms-upload"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    setPreview(await parseUsersXlsx(f));
                  } catch {
                    setErr(tr("That file couldn't be read — use the template.", "تعذرت قراءة الملف — استخدم القالب."));
                  }
                }}
              />
            </label>
            {progress && <span className="font-semibold" data-testid="lms-progress">{tr("Saving", "جارٍ الحفظ")} {progress}…</span>}
          </div>
          {preview && (
            <div className="space-y-2" data-testid="lms-preview">
              <p className="font-semibold">{tr(`${preview.length} rows ready`, `${preview.length} صفًا جاهزًا`)}</p>
              <div className="max-h-60 overflow-auto rounded-xl border border-black/10 dark:border-white/15">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 dark:bg-white/5"><tr><th className="p-1.5 text-start">{tr("Name", "الاسم")}</th><th className="p-1.5 text-start">{tr("Username", "المستخدم")}</th><th className="p-1.5 text-start">{tr("Role", "الدور")}</th><th className="p-1.5 text-start">{tr("Class", "الصف")}</th><th className="p-1.5 text-start">PIN</th></tr></thead>
                  <tbody>{preview.map((r, i) => (<tr key={i} className="border-t border-black/5 dark:border-white/10"><td className="p-1.5" dir="auto">{r.name}</td><td className="p-1.5 font-mono">{r.username}</td><td className="p-1.5">{r.role}</td><td className="p-1.5">{r.cls}</td><td className="p-1.5">{r.pin ? "••••" : tr("auto", "تلقائي")}</td></tr>))}</tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button type="button" className={primaryBtn} disabled={!!progress} onClick={async () => { const rows = preview; setPreview(null); await saveMany(rows); }} data-testid="lms-import">{tr("Import", "استيراد")}</button>
                <button type="button" className={smallBtn} onClick={() => setPreview(null)}>{tr("Cancel", "إلغاء")}</button>
              </div>
            </div>
          )}
          {errors.length > 0 && (
            <ul className="space-y-1 text-sm text-rose-700 dark:text-rose-300" data-testid="lms-import-errors">
              {errors.map((e, i) => (<li key={i}>{tr("Row", "صف")} {e.row} ({e.username || "—"}): {errText(e.error)}</li>))}
            </ul>
          )}
        </section>

        <section className={card + " space-y-3"}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{tr("Everyone", "الجميع")} ({users?.length ?? "…"})</h2>
            <input className={inputCls + " mt-0 max-w-xs"} placeholder={tr("Search…", "بحث…")} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <span className="flex-1" />
            <a className={smallBtn} href="/lms">🏫 {tr("Homework dashboard", "لوحة الواجبات")}</a>
            <button type="button" className={smallBtn} onClick={() => exportAllHomeworkZip(asAdmin).catch((e) => setErr(lmsErrorText(e, tr)))} data-testid="lms-admin-export">⬇ {tr("Export all homework (ZIP)", "تصدير كل الواجبات (ZIP)")}</button>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {shown.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="lms-user">
                <span className="text-xl" aria-hidden>{u.role === "teacher" ? "🧑‍🏫" : "🎒"}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${u.disabled ? "line-through opacity-60" : ""}`} dir="auto">{u.name}</span>
                  <span className="block text-xs opacity-70"><span className="font-mono" dir="ltr">{u.username}</span> · {u.cls || "—"}{u.role === "teacher" && u.perms.length ? ` · ${u.perms.join(", ")}` : ""}</span>
                </span>
                <button type="button" className={smallBtn} onClick={() => setEdit(edit === u.id ? null : u.id)} data-testid="lms-user-edit">✏️</button>
                <button type="button" className={smallBtn} onClick={async () => { if (!confirm(tr(`Give ${u.name} a new PIN?`, `رقم سري جديد لـ ${u.name}؟`))) return; const r = await lmsApi.resetPin(u.id, undefined, asAdmin).catch(() => null); if (r) setPins((p) => [{ username: u.username, name: u.name, pin: r.pin }, ...p]); }} data-testid="lms-user-pin">🔑 {tr("New PIN", "رقم جديد")}</button>
                <button type="button" className={smallBtn + " text-rose-600"} onClick={async () => { if (!confirm(tr(`Delete ${u.name} and their homework?`, `حذف ${u.name} وواجباته؟`))) return; await lmsApi.deleteUser(u.id, asAdmin).catch(() => undefined); load(); }} data-testid="lms-user-delete">🗑</button>
                {edit === u.id && (
                  <form
                    className="mt-2 grid w-full gap-2 rounded-2xl bg-black/[0.03] p-3 sm:grid-cols-4 dark:bg-white/5"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await saveMany([{ id: u.id, username: String(f.get("username")), name: String(f.get("name")), role: u.role, cls: String(f.get("cls")), disabled: f.get("disabled") === "on", perms: PERMS.filter((p) => f.get(`perm-${p}`) === "on") }]);
                      setEdit(null);
                    }}
                  >
                    <input name="name" defaultValue={u.name} className={inputCls} dir="auto" />
                    <input name="username" defaultValue={u.username} className={inputCls} dir="ltr" />
                    <input name="cls" defaultValue={u.cls} className={inputCls} placeholder={tr("Class", "الصف")} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="disabled" defaultChecked={u.disabled} /> {tr("Disabled (can't sign in)", "معطّل (لا يمكنه الدخول)")}</label>
                    {u.role === "teacher" && (
                      <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-4">
                        {PERMS.map((p) => (<label key={p} className="flex items-center gap-1.5"><input type="checkbox" name={`perm-${p}`} defaultChecked={u.perms.includes(p)} data-testid={`lms-perm-${p}`} /> {tr(PERM_LABEL[p][0], PERM_LABEL[p][1])}</label>))}
                      </fieldset>
                    )}
                    <button type="submit" className={primaryBtn + " sm:w-fit"} data-testid="lms-user-save">{tr("Save", "حفظ")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AssessmentShell>
  );
}
