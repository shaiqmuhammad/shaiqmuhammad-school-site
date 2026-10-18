"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { btn, btnCta, cardCls, field, Head, Modal, Toast, useRoster } from "@/components/lms/mods/ModUi";
import { useTr } from "@/components/lms/useLms";
import { downloadBlob } from "@/lib/exportUtils";
import { lmsApi } from "@/lib/lms";
import { modCall, modErr } from "@/lib/lmsMods";

type Par = { id: string; username: string; name: string; email: string; disabled: boolean; hasPin: boolean; lastLogin: number | null; students: { id: string; name: string; cls: string; section: string }[] };
type Plan = { name: string; email: string; students: string[]; action: string };
type Made = { username: string; name: string; pin: string; students: string[] };

/** Admin → Parents: create / link parent accounts (login + PIN) to students. Admin only; emails are stored here and never shown to teachers. */
export function AdminParents() {
  const { tr } = useTr();
  const { students } = useRoster(true);
  const [items, setItems] = useState<Par[] | null>(null);
  const [edit, setEdit] = useState<Partial<Par> & { pin?: string } | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const [plan, setPlan] = useState<Plan[] | null>(null);
  const [made, setMade] = useState<Made[] | null>(null);
  const [shown, setShown] = useState<{ name: string; username: string; pin: string } | null>(null);
  const note = (m: string, b = false) => { setMsg(m); setBad(b); };
  const load = useCallback(() => { modCall<{ items: Par[] }>("par-list", {}, true).then((r) => setItems(r.items)).catch((e) => { setItems([]); note(modErr(e, tr), true); }); }, [tr]);
  useEffect(() => { load(); }, [load]);
  const shownList = useMemo(() => (items || []).filter((p) => !q || `${p.name} ${p.username} ${p.students.map((s) => s.name).join(" ")}`.toLowerCase().includes(q.toLowerCase())), [items, q]);

  const reveal = async (p: Par) => { const r = await lmsApi.pinsView([p.id]).catch(() => null); const pin = r?.pins[p.id]; if (pin) setShown({ name: p.name, username: p.username, pin }); else note(tr("PIN not viewable — reset it to get a new one.", "الرقم السري غير متاح — أعد تعيينه."), true); };
  const reset = async (p: Par) => { if (!confirm(tr("Reset this parent's PIN?", "إعادة تعيين الرقم السري لولي الأمر؟"))) return; try { const r = await lmsApi.resetPin(p.id); setShown({ name: p.name, username: p.username, pin: r.pin }); } catch (e) { note(modErr(e, tr), true); } };
  const del = async (p: Par) => { if (!confirm(tr("Delete this parent account? Their messages stay in the admin record.", "حذف حساب ولي الأمر؟ تبقى رسائله في سجل الإدارة."))) return; try { await modCall("par-delete", { id: p.id }, true); note(tr("Deleted.", "تم الحذف.")); load(); } catch (e) { note(modErr(e, tr), true); } };
  const save = async () => {
    if (!edit) return;
    try {
      const r = await modCall<{ pin?: string }>("par-save", { id: edit.id, username: edit.username, name: edit.name, email: edit.email ?? "", pin: edit.pin || undefined, disabled: !!edit.disabled, students: (edit.students || []).map((s) => s.id) }, true);
      setEdit(null); note(tr("Saved.", "تم الحفظ.")); load();
      if (r.pin) setShown({ name: edit.name || "", username: edit.username || "", pin: r.pin });
    } catch (e) { note(modErr(e, tr), true); }
  };
  const csv = (rows: Made[]) => downloadBlob(new Blob(["\ufeff" + ["Parent,Username,PIN,Children", ...rows.map((r) => [r.name, r.username, r.pin, r.students.join("; ")].map((x) => `"${x.replace(/"/g, '""')}"`).join(","))].join("\n")], { type: "text/csv" }), "parent-logins.csv");
  const preview = async () => { try { const r = await modCall<{ plan: Plan[] }>("par-import", {}, true); setPlan(r.plan); if (!r.plan.length) note(tr("No student has a parent name or email yet.", "لا يوجد طالب لديه اسم أو بريد ولي أمر بعد.")); } catch (e) { note(modErr(e, tr), true); } };
  const run = async () => { try { const r = await modCall<{ created: number; linked: number; pins: Made[] }>("par-import", { confirm: true }, true); setPlan(null); setMade(r.pins); note(tr(`Created ${r.created}, linked ${r.linked}.`, `أُنشئ ${r.created}، رُبط ${r.linked}.`)); load(); } catch (e) { note(modErr(e, tr), true); } };
  const toggle = (s: { id: string; name: string; cls: string; section: string }) => { const cur = edit?.students || []; setEdit({ ...edit, students: cur.some((x) => x.id === s.id) ? cur.filter((x) => x.id !== s.id) : [...cur, s] }); };
  const [sq, setSq] = useState("");
  return (
    <div className="space-y-3" data-testid="admin-parents">
      <Head icon="👨‍👩‍👧" title={tr("Parents", "أولياء الأمور")} sub={tr("Create parent logins linked to one or more students. Parents see only their own children, read-only.", "أنشئ حسابات أولياء الأمور وربطها بطالب أو أكثر. يرون أبناءهم فقط وللعرض.")}>
        <button type="button" className={btn} onClick={preview} data-testid="par-import">⬇ {tr("Import from student parent fields", "استيراد من بيانات ولي الأمر")}</button>
        <button type="button" className={btnCta} onClick={() => setEdit({ students: [] })} data-testid="par-new">+ {tr("New parent", "ولي أمر جديد")}</button>
      </Head>
      <Toast msg={msg} bad={bad} />
      <input className={field + " max-w-sm"} placeholder={tr("Search parent or child…", "ابحث عن ولي أمر أو طالب…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="par-search" />
      {items === null ? <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p> : !shownList.length ? <p className={cardCls + " text-center opacity-70"} data-testid="par-empty">{tr("No parent accounts yet.", "لا توجد حسابات أولياء أمور بعد.")}</p> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shownList.map((p) => (
            <article key={p.id} className={cardCls + (p.disabled ? " opacity-60" : "")} data-testid="par-row">
              <p className="text-lg font-extrabold" dir="auto">👨‍👩‍👧 {p.name}{p.disabled ? " 🚫" : ""}</p>
              <p className="text-sm opacity-80" dir="ltr">@{p.username}{p.email ? ` · ${p.email}` : ""}</p>
              <p className="mt-1 text-sm" dir="auto">{p.students.length ? p.students.map((s) => `${s.name} (${s.cls}${s.section ? " " + s.section.replace(s.cls, "").trim() : ""})`).join("، ") : <i className="opacity-60">{tr("No children linked", "لا أبناء مرتبطون")}</i>}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btn + " !py-1"} onClick={() => setEdit({ ...p })} data-testid="par-edit">✎ {tr("Edit", "تعديل")}</button>
                <button type="button" className={btn + " !py-1"} onClick={() => reveal(p)} data-testid="par-pin">🔑 {tr("PIN", "الرقم")}</button>
                <button type="button" className={btn + " !py-1"} onClick={() => reset(p)} data-testid="par-reset">↻ {tr("Reset", "إعادة")}</button>
                <button type="button" className={btn + " !py-1 text-rose-600"} onClick={() => del(p)} data-testid="par-del">🗑</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? tr("Edit parent", "تعديل ولي أمر") : tr("New parent", "ولي أمر جديد")} onClose={() => setEdit(null)} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">{tr("Full name", "الاسم الكامل")}<input className={field} value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} dir="auto" data-testid="par-name" /></label>
            <label className="text-sm font-semibold">{tr("Username", "اسم المستخدم")}<input className={field} value={edit.username || ""} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })} dir="ltr" autoCapitalize="none" data-testid="par-username" /></label>
            <label className="text-sm font-semibold">{tr("Email (optional, admin only)", "البريد (اختياري، للإدارة فقط)")}<input className={field} type="email" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} dir="ltr" data-testid="par-email" /></label>
            <label className="text-sm font-semibold">{edit.id ? tr("New PIN (leave empty to keep)", "رقم جديد (اتركه فارغًا للإبقاء)") : tr("PIN (empty = auto)", "الرقم السري (فارغ = تلقائي)")}<input className={field} value={edit.pin || ""} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} inputMode="numeric" dir="ltr" data-testid="par-pin-input" /></label>
          </div>
          {edit.id && <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!edit.disabled} onChange={(e) => setEdit({ ...edit, disabled: e.target.checked })} /> {tr("Disabled (cannot sign in)", "معطّل (لا يمكنه الدخول)")}</label>}
          <p className="mt-4 text-sm font-bold">{tr("Children", "الأبناء")} ({(edit.students || []).length})</p>
          <div className="mt-1 flex flex-wrap gap-1.5" data-testid="par-linked">{(edit.students || []).map((s) => <button key={s.id} type="button" onClick={() => toggle(s)} className="rounded-full bg-header px-3 py-1 text-xs font-bold text-sun">{s.name} ✕</button>)}</div>
          <input className={field + " mt-2"} placeholder={tr("Search students to add…", "ابحث عن طالب للإضافة…")} value={sq} onChange={(e) => setSq(e.target.value)} data-testid="par-student-search" />
          <ul className="mt-2 max-h-48 divide-y divide-black/10 overflow-y-auto rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
            {(students || []).filter((s) => sq && s.name.toLowerCase().includes(sq.toLowerCase()) && !(edit.students || []).some((x) => x.id === s.id)).slice(0, 40).map((s) => <li key={s.id}><button type="button" className="flex w-full justify-between px-3 py-1.5 text-start text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { toggle(s); setSq(""); }} data-testid="par-student-opt"><span dir="auto">{s.name}</span><span className="opacity-60">{s.cls} {s.section}</span></button></li>)}
          </ul>
          <div className="mt-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setEdit(null)}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btnCta} onClick={save} disabled={!edit.name || (edit.username || "").length < 3} data-testid="par-save">{tr("Save", "حفظ")}</button></div>
        </Modal>
      )}
      {shown && (
        <Modal title={tr("Parent sign-in", "دخول ولي الأمر")} onClose={() => setShown(null)}>
          <p dir="auto" className="font-bold">{shown.name}</p>
          <p className="mt-2 text-sm">{tr("Username", "اسم المستخدم")}: <b dir="ltr" data-testid="par-shown-user">{shown.username}</b></p>
          <p className="text-sm">PIN: <b className="text-2xl tracking-widest" dir="ltr" data-testid="par-shown-pin">{shown.pin}</b></p>
          <p className="mt-2 text-xs opacity-70">{tr("Give this to the parent yourself — nothing is emailed automatically.", "سلّمها لولي الأمر بنفسك — لا يُرسل أي بريد تلقائيًا.")}</p>
        </Modal>
      )}
      {plan && (
        <Modal title={tr("Import parents from student records", "استيراد أولياء الأمور من سجلات الطلاب")} onClose={() => setPlan(null)} wide>
          <p className="mb-2 text-sm opacity-80">{tr("One account per distinct parent email (or name). Nothing is emailed.", "حساب واحد لكل بريد (أو اسم) مختلف. لا يُرسل أي بريد.")}</p>
          <ul className="max-h-72 divide-y divide-black/10 overflow-y-auto rounded-xl border border-black/10 text-sm dark:divide-white/10 dark:border-white/10" data-testid="par-plan">
            {plan.map((g, i) => <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span dir="auto"><b>{g.name}</b> <span className="opacity-60" dir="ltr">{g.email}</span><br /><span className="opacity-80">{g.students.join("، ")}</span></span><span className={`h-fit rounded-full px-2.5 py-0.5 text-xs font-bold ${g.action === "create" ? "bg-emerald-100 text-emerald-900" : "bg-sky-100 text-sky-900"}`}>{g.action === "create" ? tr("Create", "إنشاء") : tr("Link", "ربط")}</span></li>)}
          </ul>
          <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setPlan(null)}>{tr("Cancel", "إلغاء")}</button>{plan.length > 0 && <button type="button" className={btnCta} onClick={run} data-testid="par-import-confirm">{tr(`Create / link ${plan.length}`, `إنشاء / ربط ${plan.length}`)}</button>}</div>
        </Modal>
      )}
      {made && (
        <Modal title={tr("New parent logins", "حسابات أولياء الأمور الجديدة")} onClose={() => setMade(null)} wide>
          <p className="mb-2 text-sm text-amber-700 dark:text-amber-300">{tr("Save these PINs now (also viewable later in the list).", "احفظ الأرقام الآن (ويمكن عرضها لاحقًا من القائمة).")}</p>
          <div className="max-h-72 overflow-auto"><table className="w-full text-sm" data-testid="par-made"><tbody>{made.map((m, i) => <tr key={i} className="border-b border-black/10 dark:border-white/10"><td className="py-1.5" dir="auto">{m.name}</td><td dir="ltr">{m.username}</td><td dir="ltr" className="font-bold">{m.pin}</td><td className="opacity-70" dir="auto">{m.students.join("، ")}</td></tr>)}</tbody></table></div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} onClick={() => csv(made)}>⬇ CSV</button><button type="button" className={btnCta} onClick={() => setMade(null)}>{tr("Done", "تم")}</button></div>
        </Modal>
      )}
    </div>
  );
}
