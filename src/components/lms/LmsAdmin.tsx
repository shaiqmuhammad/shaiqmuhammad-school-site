"use client";

import { BodyPortal } from "@/components/BodyPortal";
import { ModulePermsTeacher , QaPermsTeacher } from "@/components/lms/ModulePerms";
import { PresenceDot } from "@/components/lms/Presence";
import { mailApi } from "@/lib/mail";
import { listPublishedQuizzes, loadQuizzesData, type Quiz } from "@/lib/quiz";
import { StudentProgress } from "@/components/lms/Progress";
import { ParentLog } from "@/components/lms/ParentMail";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { readAdminScope, setAdminScope } from "@/components/AdminScope";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { exportStudentsXlsx, downloadCredentials, downloadSignInSheet, downloadUsersTemplate, exportAllHomeworkZip, parseUsersXlsx } from "@/components/lms/lmsFiles";
import { ADMIN_ACTOR, adminRelogin, card, inputCls, smallBtn, useLmsActor, useTr } from "@/components/lms/useLms";
import { clsNum, secLetter } from "@/lib/classFmt";
import { lmsApi, lmsErrorText, PERMS, stuUi, scopeLabel, grpLabel, type Catalog, type LmsUser, type Role, type StudentGroup } from "@/lib/lms";

type Pins = { username: string; name: string; pin: string }[];
type Row = Partial<LmsUser & { pin: string }>;
const PERM_LABEL: Record<string, [string, string]> = {
  assign: ["Assign homework", "إسناد الواجبات"],
  review: ["Review & approve", "المراجعة والقبول"],
  manageUsers: ["Manage students", "إدارة الطلاب"],
  viewAll: ["See all homework", "رؤية كل الواجبات"],
  shareCorrect: ["Correct homework shared with them", "تصحيح الواجبات المشاركة معه"],
  viewAsStudent: ["Log in as student (read-only, logged)", "الدخول كطالب (للعرض فقط، مسجَّل)"],
};
const PHASES = ["EYFS", "Primary", "Secondary"];
const EMPTY: Catalog = { subjects: [], classes: [], sections: [] };

/** Add / edit one student or teacher, with dropdowns from Classes & Subjects. */
/** Compact long lists (many classes/sections) so table rows stay short; full list in the tooltip. */
const shortList = (xs: string[]) => { const u = [...new Set(xs.filter(Boolean))]; return u.length > 4 ? `${u.slice(0, 3).join(", ")} +${u.length - 3}` : u.join(", "); };

function PersonForm({ role, catalog, initial, onSave, submitLabel, testPrefix, staff = false, admin = false }: { admin?: boolean; staff?: boolean; role: Role; catalog: Catalog; initial?: LmsUser; onSave: (r: Row) => Promise<void>; submitLabel: string; testPrefix: string }) {
  const { tr } = useTr();
  const [f, setF] = useState({ nameAr: initial?.nameAr || "", name: initial?.name || "", username: initial?.username || "", cls: initial?.cls || "", section: initial?.section || "", pin: "", email: initial?.email || "", gender: initial?.gender || "", first: initial?.firstName ?? (initial?.name || "").split(/\s+/)[0] ?? "", last: initial?.lastName ?? (initial?.name || "").split(/\s+/).slice(1).join(" "), dob: initial?.dob || "", phone: initial?.phone || "", semail: initial?.semail || "", parentName: initial?.parentName || "", nat: initial?.nationality || "", lang: initial?.prefLang || "", sen: !!initial?.sen, eal: !!initial?.eal, gt: !!initial?.gt, target: initial?.target || "", scaled: initial?.scaled || "", isamsId: initial?.isamsId || "", isamsSurname: initial?.isamsSurname || "", subject: initial?.subject || "", phase: initial?.phase || "", subjects: initial?.subjects || [], scope: initial?.scope || [], perms: initial?.perms || (staff ? ["staff", "review"] : ["assign", "review"]), disabled: initial?.disabled || false });
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
        await onSave({ id: initial?.id, role, name: role === "student" ? `${f.first.trim()} ${f.last.trim()}`.trim() : f.name.trim(), ...(role === "student" ? { firstName: f.first.trim(), lastName: f.last.trim() } : {}), username: f.username, cls: role === "student" ? f.cls : "", section: role === "student" ? f.section : "", subjects: role === "teacher" ? f.subjects : [], scope: role === "teacher" ? f.scope : [], perms: role === "teacher" ? f.perms : [], pin: f.pin || undefined, disabled: f.disabled, ...(admin ? (role === "student" ? { subject: f.subject, ...(f.phase ? { phase: f.phase } : {}) } : { phase: f.phase }) : {}), ...(role === "student" ? (admin ? { nameAr: f.nameAr.trim(), email: f.email.trim(), parentName: f.parentName.trim(), gender: f.gender, dob: f.dob, phone: f.phone.trim(), semail: f.semail.trim(), nationality: f.nat.trim(), prefLang: f.lang.trim(), sen: f.sen, eal: f.eal, gt: f.gt, target: f.target, scaled: f.scaled, isamsId: f.isamsId.trim(), isamsSurname: f.isamsSurname.trim() } : {}) : { email: f.email.trim() }) });
        setBusy(false);
        if (!initial) setF((x) => ({ ...x, name: "", first: "", last: "", username: "", pin: "" }));
      }}
    >
      {role === "student" ? (<>
        <input className={inputCls + " sm:col-span-2"} placeholder={tr("First name", "الاسم الأول")} value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} dir="auto" data-testid={`${testPrefix}-first`} aria-label={tr("First name", "الاسم الأول")} />
        <input className={inputCls + " sm:col-span-2"} placeholder={tr("Last name", "اسم العائلة")} value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} dir="auto" data-testid={`${testPrefix}-last`} aria-label={tr("Last name", "اسم العائلة")} />
      </>) : (
        <input className={inputCls + " sm:col-span-2"} placeholder={tr("Full name", "الاسم الكامل")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} dir="auto" data-testid={`${testPrefix}-name`} aria-label={tr("Full name", "الاسم الكامل")} />
      )}
      <input className={inputCls} placeholder={tr("username", "اسم المستخدم")} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} dir="ltr" data-testid={`${testPrefix}-username`} aria-label={tr("username", "اسم المستخدم")} />
      {role === "teacher" && <input type="email" className={inputCls + " sm:col-span-2"} placeholder={tr("Email (optional)", "البريد (اختياري)")} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} dir="ltr" data-testid={`${testPrefix}-email`} aria-label="Email" />}
      {role === "student" && admin && (<>
        <select className={inputCls} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} aria-label={tr("Gender", "الجنس")} data-testid={`${testPrefix}-gender`}><option value="">{tr("Gender —", "الجنس —")}</option><option value="b">{tr("Boy", "ولد")}</option><option value="g">{tr("Girl", "بنت")}</option></select>
        <label className="text-xs">{tr("Date of birth", "تاريخ الميلاد")}<input type="date" className={inputCls} value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} data-testid={`${testPrefix}-dob`} /></label>
        <input className={inputCls} placeholder={tr("Contact no", "رقم التواصل")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" data-testid={`${testPrefix}-phone`} />
        <input type="email" className={inputCls + " sm:col-span-2"} placeholder={tr("Student email", "بريد الطالب")} value={f.semail} onChange={(e) => setF({ ...f, semail: e.target.value })} dir="ltr" data-testid={`${testPrefix}-semail`} />
        <input className={inputCls + " sm:col-span-2"} placeholder={tr("Parent name (shown to teachers)", "اسم ولي الأمر (يظهر للمعلمين)")} value={f.parentName} onChange={(e) => setF({ ...f, parentName: e.target.value })} dir="auto" data-testid={`${testPrefix}-parentname`} />
        <input type="email" className={inputCls + " sm:col-span-2"} placeholder={tr("Parent email (for reports)", "بريد ولي الأمر (للتقارير)")} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} dir="ltr" data-testid={`${testPrefix}-email`} />
        <input className={inputCls} placeholder={tr("Nationality", "الجنسية")} value={f.nat} onChange={(e) => setF({ ...f, nat: e.target.value })} data-testid={`${testPrefix}-nat`} />
        <input className={inputCls} placeholder={tr("Preferred language", "اللغة المفضلة")} value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })} data-testid={`${testPrefix}-lang`} />
        <select className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} aria-label={tr("Subject", "المادة")} data-testid={`${testPrefix}-subject-field`}><option value="">{tr("Subject —", "المادة —")}</option>{f.subject.includes(",") && <option value={f.subject}>{f.subject}</option>}{[...new Set([...(f.subject ? [f.subject] : []), ...catalog.subjects.map((x) => x.name)])].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select className={inputCls} value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value })} aria-label={tr("Phase", "المرحلة")} data-testid={`${testPrefix}-phase-field`}><option value="">{tr("Phase — auto from class", "المرحلة — تلقائي من الصف")}</option>{PHASES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <input className={inputCls} type="number" min={1} max={9} placeholder={tr("Target grade (tracker)", "الهدف (المتتبع)")} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} aria-label={tr("Target grade", "الهدف")} data-testid={`${testPrefix}-target`} />
        <input className={inputCls} type="number" min={1} max={200} placeholder={tr("Scaled score (optional)", "الدرجة المعيارية (اختياري)")} value={f.scaled} onChange={(e) => setF({ ...f, scaled: e.target.value })} aria-label={tr("Scaled score", "الدرجة المعيارية")} title={tr("Used only when no Target is set: 67–80→2, 81–93→3, 94–109→4, 110–120→5, 121+→6", "تُستخدم فقط عند عدم وجود هدف")} data-testid={`${testPrefix}-scaled`} />
        <input className={inputCls + " sm:col-span-2"} placeholder={tr("Arabic name", "الاسم بالعربية")} value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} aria-label={tr("Arabic name", "الاسم بالعربية")} dir="rtl" data-testid={`${testPrefix}-name-ar`} />
        <input className={inputCls} placeholder={tr("iSAMS SchoolID", "رقم iSAMS")} value={f.isamsId} onChange={(e) => setF({ ...f, isamsId: e.target.value })} aria-label="iSAMS SchoolID" data-testid={`${testPrefix}-isams-id`} />
        <input className={inputCls} placeholder={tr("iSAMS surname", "اسم العائلة في iSAMS")} value={f.isamsSurname} onChange={(e) => setF({ ...f, isamsSurname: e.target.value })} aria-label="iSAMS surname" dir="auto" data-testid={`${testPrefix}-isams-surname`} />
        <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-6">{([["sen", "SEN", "SEN"], ["eal", "EAL", "EAL"], ["gt", "Gifted & Talented", "موهوب ومتميز"]] as const).map(([k, en, ar]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} data-testid={`${testPrefix}-${k}`} /> {tr(en, ar)}</label>)}</div>
      </>)}
      {role === "student" ? (
        <>
          <select className={inputCls} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value, section: "" })} data-testid={`${testPrefix}-class`} aria-label={tr("Class", "الصف")}>
            <option value="">{tr("Class…", "الصف…")}</option>
            {classOpts.map((c) => <option key={c} value={c}>{clsNum(c)}</option>)}
          </select>
          <select className={inputCls} value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} disabled={!secs.length} data-testid={`${testPrefix}-section`} aria-label={tr("Section", "الشعبة")}>
            <option value="">{tr("Section…", "الشعبة…")}</option>
            {secs.map((s) => <option key={s.id} value={s.name}>{secLetter(s.name)}</option>)}
          </select>
        </>
      ) : (
        <span className="hidden sm:col-span-2 sm:block" />
      )}
      {!initial && <input className={inputCls} placeholder={tr("PIN (auto)", "الرقم السري (تلقائي)")} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.slice(0, 64) })} dir="ltr" data-testid={`${testPrefix}-pin`} aria-label="PIN" />}
      {role === "teacher" && (
        <div className="space-y-2 sm:col-span-6">
          {!initial && <><p className="text-sm font-semibold">{tr("Subjects", "المواد")}</p>
          <div className="flex flex-wrap gap-1.5">
            {catalog.subjects.map((s) => <button key={s.id} type="button" aria-pressed={f.subjects.includes(s.name)} className={chip(f.subjects.includes(s.name))} onClick={() => toggle("subjects", s.name)} data-testid={`${testPrefix}-subject`}>{s.name}</button>)}
            {!catalog.subjects.length && <span className="text-sm opacity-60">{tr("No subjects yet — add them in Classes & Subjects.", "لا توجد مواد — أضفها في الصفوف والمواد.")}</span>}
          </div>
          <p className="text-sm font-semibold">{tr("Phase", "المرحلة")}</p>
          <div className="flex flex-wrap gap-1.5" data-testid={`${testPrefix}-phase-chips`}>{PHASES.map((x) => { const on = f.phase.split(",").includes(x); return <button key={x} type="button" aria-pressed={on} className={chip(on)} onClick={() => setF((y) => ({ ...y, phase: PHASES.filter((z) => (z === x ? !on : y.phase.split(",").includes(z))).join(",") }))}>{x}</button>; })}</div>
          <p className="text-xs opacity-70" data-testid="grp-hint">{tr("Students come from Groups: after saving, assign groups in Admin → Members → Groups.", "الطلاب يأتون من المجموعات: بعد الحفظ أسند المجموعات من الإدارة ← الأعضاء ← المجموعات.")}</p></>}
<p className="text-xs opacity-70" data-testid="perm-hint">{initial ? tr("Subjects, class groups and all permissions are set from the 🔐 Permissions button in the Teachers list.", "المواد ومجموعات الصفوف وكل الصلاحيات من زر 🔐 الصلاحيات في قائمة المعلمين.") : tr("After adding, use 🔐 Permissions in the Teachers list to set access.", "بعد الإضافة، استخدم 🔐 الصلاحيات في قائمة المعلمين لضبط الوصول.")}</p>
        </div>
      )}
      {initial && <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={f.disabled} onChange={(e) => setF({ ...f, disabled: e.target.checked })} /> {tr("Disabled (can't sign in)", "معطّل (لا يمكنه الدخول)")}</label>}
      <button type="submit" className={primaryBtn + " sm:col-span-6 sm:w-fit"} disabled={busy || !(role === "student" ? f.first.trim() : f.name.trim()) || f.username.length < 3} data-testid={`${testPrefix}-save`}>{submitLabel}</button>
    </form>
  );
}

/** Student-account switches (own classes only). "stu:none" = everything off (an empty list would mean legacy full access). */
function StudentAccess({ perms, setPerms }: { perms: string[]; setPerms: (p: string[]) => void }) {
  const { tr } = useTr();
  const ops = ["view", "add", "edit", "block", "delete"] as const;
  const L = { view: tr("View", "عرض"), add: tr("Add students", "إضافة طلاب"), edit: tr("Edit", "تعديل"), block: tr("Block", "إيقاف"), delete: tr("Delete", "حذف") };
  const flip = (op: (typeof ops)[number]) => { const cur = ops.filter((o) => stuUi(perms, o)); const next = cur.includes(op) ? cur.filter((o) => o !== op) : [...cur, op]; setPerms([...perms.filter((q) => !q.startsWith("stu:")), ...(next.length === 5 ? [] : next.length === 0 ? ["stu:none"] : next.map((o) => `stu:${o}`))]); };
  return (
    <div className="rounded-2xl border border-dashed border-black/15 p-3 dark:border-white/20" data-testid="stu-switches">
      <p className="mb-2 text-sm font-bold">🎓 {tr("Student accounts (assigned groups only)", "حسابات الطلاب (مجموعاته فقط)")}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">{ops.map((op) => <label key={op} className="flex items-center gap-1.5"><input type="checkbox" checked={stuUi(perms, op)} onChange={() => flip(op)} data-testid={`stu-${op}`} /> {L[op]}</label>)}</div>
    </div>
  );
}

/** Admin → Teachers → "🔐 Permissions": module access (Quran Homework, Attendance, Behaviour, Curriculum, Downloads), classroom access and general permissions in one clear panel. */
function PermissionsModal({ u, onClose, onSaved, asAdmin, catalog }: { catalog: Catalog; u: LmsUser; onClose: () => void; onSaved: () => void; asAdmin: boolean }) {
  const { tr } = useTr();
  const [perms, setPerms] = useState<string[]>(u.perms || []);
  const [subjects, setSubjects] = useState<string[]>(u.subjects || []);
  const scope = u.scope || [];
  const [allGroups, setAllGroups] = useState<StudentGroup[] | null>(null);
  const [picked, setPicked] = useState<string[]>((u.groups || []).map((g) => g.id));
  useEffect(() => { lmsApi.grpList(true).then((r) => setAllGroups(r.items.filter((g) => g.adminGroup))).catch(() => setAllGroups([])); }, []);
  const [others, setOthers] = useState<LmsUser[]>([]);
  useEffect(() => { lmsApi.users(asAdmin).then((r) => setOthers(r.users.filter((x) => x.role === "teacher" && x.id !== u.id))).catch(() => undefined); }, [asAdmin, u.id]);
  const tog = (xs: string[], v: string) => (xs.includes(v) ? xs.filter((y) => y !== v) : [...xs, v]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  const toggle = (v: string) => setPerms((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? "border-transparent bg-header text-sun" : "border-black/10 dark:border-white/15"}`;
  const save = async () => {
    setBusy(true); setErr("");
    try { const r = await lmsApi.saveUsers([{ ...u, perms, subjects, scope }], asAdmin); if (r.errors.length) throw new Error(r.errors[0].error); if (allGroups) { const before = (u.groups || []).map((g) => g.id); const add = picked.filter((x) => !before.includes(x)), remove = before.filter((x) => !picked.includes(x)); if (add.length || remove.length) await lmsApi.grpAssign(u.id, add, remove); } onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : lmsErrorText(e, tr)); setBusy(false); }
  };
  return (
    <BodyPortal>
    <div className="fixed inset-0 z-[2147483000] flex justify-end bg-black/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={tr("Permissions", "الصلاحيات")} data-testid="perm-modal">
      <div className="h-full w-full overflow-y-auto bg-white p-4 text-[#1b2f44] shadow-2xl dark:bg-[#12273b] dark:text-white sm:max-w-2xl sm:p-6" data-testid="perm-panel">
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-center gap-3 border-b border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#12273b] sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6" data-testid="perm-panel-head"><h3 className="min-w-0 flex-1 text-lg font-extrabold">🔐 {tr("Permissions", "الصلاحيات")} — <span dir="auto">{u.name}</span></h3><button type="button" className={smallBtn} onClick={onClose} aria-label={tr("Close", "إغلاق")} data-testid="perm-panel-close">✕</button></div>
        <div className="space-y-3">
          <div className="rounded-2xl border border-dashed border-black/15 p-3 dark:border-white/20" data-testid="perm-subjects">
            <p className="mb-2 text-sm font-bold">📚 {tr("Subjects taught", "المواد")}</p>
            <div className="flex flex-wrap gap-1.5">{catalog.subjects.map((x) => <button key={x.id} type="button" aria-pressed={subjects.includes(x.name)} className={chip(subjects.includes(x.name))} onClick={() => setSubjects((c) => tog(c, x.name))}>{x.name}</button>)}{!catalog.subjects.length && <span className="text-sm opacity-60">{tr("No subjects yet.", "لا توجد مواد.")}</span>}</div>
            <p className="mb-2 mt-3 text-sm font-bold">👥 {tr("Class groups", "مجموعات الصفوف")}</p>
            <div className="flex flex-wrap items-center gap-1.5" data-testid="perm-groups">{(allGroups || []).map((g) => <button key={g.id} type="button" aria-pressed={picked.includes(g.id)} className={chip(picked.includes(g.id))} onClick={() => setPicked((c) => tog(c, g.id))} data-testid="perm-group-chip" dir="auto">{picked.includes(g.id) ? "✓ " : ""}{grpLabel(g)}</button>)}{allGroups && !allGroups.length && <span className="text-xs opacity-70">{tr("No groups yet — create them in Admin → Members → Groups.", "لا توجد مجموعات — أنشئها من الإدارة ← الأعضاء ← المجموعات.")}</span>}{allGroups === null && <span className="text-xs opacity-60">…</span>}</div>
            {!picked.length && allGroups !== null && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{tr("No groups ticked — this teacher sees no students.", "لا توجد مجموعات — لا يرى المعلم أي طالب.")}</p>}
            <a className="mt-1 inline-block text-xs font-bold underline" href="/admin#groups" data-testid="perm-groups-link">{tr("Manage groups in Admin → Members → Groups", "إدارة المجموعات من الإدارة ← الأعضاء ← المجموعات")}</a>
          </div>
          <ModuleAccess perms={perms} setPerms={setPerms} teachers={others} />
          <QaPermsTeacher perms={perms} setPerms={setPerms} />
          <ModulePermsTeacher perms={perms} setPerms={setPerms} />
          <div className="rounded-2xl border border-dashed border-black/15 p-3 dark:border-white/20">
            <p className="mb-2 text-sm font-bold">✅ {tr("General permissions", "الصلاحيات العامة")}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">{PERMS.filter((p) => p !== "viewAll" && p !== "shareCorrect").map((p) => <label key={p} className="flex items-center gap-1.5"><input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} /> {tr(PERM_LABEL[p][0], PERM_LABEL[p][1])}</label>)}</div>
            {/* t334: homework permissions — "Correct homework shared with them" sits right under "See all homework". */}
            <div className="mt-3 space-y-1.5 rounded-xl bg-black/[0.03] p-2 text-sm dark:bg-white/5" data-testid="perm-hw-group">
              <p className="text-xs font-bold opacity-70">📝 {tr("Homework", "الواجبات")}</p>
              {(["viewAll", "shareCorrect"] as const).map((p) => <label key={p} className="flex items-center gap-1.5" data-testid={`perm-${p}`}><input type="checkbox" role="switch" checked={perms.includes(p)} onChange={() => toggle(p)} /> {tr(PERM_LABEL[p][0], PERM_LABEL[p][1])}</label>)}
            </div>
          </div>
          {perms.includes("manageUsers") && <StudentAccess perms={perms} setPerms={setPerms} />}
          <ClassroomAccess perms={perms} toggle={toggle} chip={chip} />
        </div>
        {err && <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800" role="alert">{err}</p>}
        <p className="mt-3 text-xs opacity-70">{tr("Changes apply to the teacher straight away.", "تسري التغييرات على المعلم فورًا.")}</p>
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={smallBtn} onClick={onClose}>{tr("Cancel", "إلغاء")}</button><button type="button" className={primaryBtn} disabled={busy} onClick={save} data-testid="perm-modal-save">{busy ? "…" : tr("Save permissions", "حفظ الصلاحيات")}</button></div>
      </div>
    </div>
    </BodyPortal>
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
export function LmsAdmin({ role = "student", embedded = false, staff = false }: { role?: Role; embedded?: boolean; staff?: boolean }) {
  const { tr } = useTr();
  // Inside Admin (embedded): the admin session only. On /lms: a teacher with "manage students" only.
  const lms = useLmsActor();
  const actor = embedded ? ADMIN_ACTOR : lms.actor;
  const asAdmin = embedded;
  const ready = embedded || lms.ready;
  const [users, setUsers] = useState<LmsUser[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY);
  const [err, setErr] = useState("");
  const [permFor, setPermFor] = useState<LmsUser | null>(null);
  const [q, setQ] = useState("");
  const [fCls, setFCls] = useState("");
  const [fPhase, setFPhase] = useState("");
  const [fSec, setFSec] = useState("");
  const [fSub, setFSub] = useState("");
  const [fTeach, setFTeach] = useState("");
  const scopeReady = useRef(false);
  const [fOpen, setFOpen] = useState(false);
  const [grps, setGrps] = useState<StudentGroup[]>([]);
  const urlFilters = asAdmin && role === "student";
  // Admin Students: filters live in the URL (?sub=&teacher=&yr=&sec=&q=) so a filtered list can be bookmarked or shared.
  useEffect(() => {
    if (!urlFilters) return;
    const p = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect */
    // URL first; otherwise the shared admin filter remembered from other admin pages.
    const has = ["sub", "teacher", "yr", "sec", "q"].some((k) => p.get(k));
    const sh = readAdminScope();
    setFSub(has ? p.get("sub") || "" : sh.subject); setFTeach(has ? p.get("teacher") || "" : sh.teacher); setFCls(has ? p.get("yr") || "" : sh.yr); setFSec(has ? p.get("sec") || "" : sh.sec); setQ(p.get("q") || "");
    /* eslint-enable react-hooks/set-state-in-effect */
    lmsApi.grpList(true).then((r) => setGrps(r.items)).catch(() => setGrps([]));
  }, [urlFilters]);
  useEffect(() => {
    if (!urlFilters) return;
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of [["sub", fSub], ["teacher", fTeach], ["yr", fCls], ["sec", fSec], ["q", q]] as const) { if (v) p.set(k, v); else p.delete(k); }
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`);
    if (scopeReady.current) setAdminScope({ subject: fSub, teacher: fTeach, yr: fCls, sec: fSec }); else scopeReady.current = true;
  }, [urlFilters, fSub, fTeach, fCls, fSec, q]);
  const [pins, setPins] = useState<Pins>([]);
  const [known, setKnown] = useState<Record<string, string | null> | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const [errors, setErrors] = useState<{ row: number; username: string; error: string }[]>([]);
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [drawer, setDrawer] = useState<"add" | "bulk" | null>(null);
  const [progress, setProgress] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [prog, setProg] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<"" | "active" | "blocked">("");
  const [showCols, setShowCols] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("sm-lms-cols-" + role) || "null") || (asAdmin ? ["subj", "phase"] : ["pemail"]); } catch { return []; } });
  const [colMenu, setColMenu] = useState(false);
  const toggleCol = (k: string) => setShowCols((c) => { const n = c.includes(k) ? c.filter((x) => x !== k) : [...c, k]; try { localStorage.setItem("sm-lms-cols-" + role, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const myScope = !asAdmin ? actor?.scope || [] : [];
  const scopedCatalog = (c: Catalog): Catalog => !myScope.length ? c : { ...c, classes: c.classes.filter((x) => myScope.some((t) => t === x.name || t.startsWith(x.name + "|"))), sections: c.sections.filter((x) => myScope.some((t) => t === x.cls || t === `${x.cls}|${x.name}`)) };
  const canOp = (op: "view" | "add" | "edit" | "block" | "delete") => asAdmin || stuUi(actor?.perms || [], op);
  const showPin = asAdmin || (role === "student" && canOp("view"));
  const allowed = embedded || (role === "student" && actor?.role === "teacher" && actor.perms.includes("manageUsers"));
  const title = staff ? tr("Staff", "الموظفون") : role === "teacher" ? tr("Teachers", "المعلمون") : tr("Students", "الطلاب");

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
    const r = await lmsApi.pinsView(undefined, asAdmin);
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

  // Staff = teacher accounts flagged "staff" (permissions like teachers, no class teaching required).
  const people = (users || []).filter((u) => u.role === role && (role !== "teacher" || (u.perms || []).includes("staff") === staff));
  // Teacher filter: the students in that teacher's assigned groups (and of the chosen subject).
  const teacherOpts = (users || []).filter((u) => u.role === "teacher" && (!fSub || u.subjects.includes(fSub) || (u.groups || []).some((g) => g.subject === fSub)));
  const teachStu = fTeach ? new Set(grps.filter((g) => (g.teachers || []).includes(fTeach) && (!fSub || !g.subject || g.subject === fSub)).flatMap((g) => g.students)) : null;
  const list = people.filter((u) => {
    if (teachStu && role === "student" && !teachStu.has(u.id)) return false;
    if (q && !`${u.name} ${u.username}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fPhase && !(u.phase || "").split(",").includes(fPhase)) return false;
    if (role === "student") return (!fCls || u.cls === fCls) && (!fSec || u.section === fSec) && (!fSub || (u.subject || "").split(/\s*,\s*/).includes(fSub));
    return (!fSub || u.subjects.includes(fSub)) && true;
  });
  const errText = (e: string) => ({ username: tr("username must be 3+ letters/numbers", "اسم المستخدم 3 أحرف على الأقل"), username_taken: tr("username already used", "اسم المستخدم مستخدم"), name: tr("name missing", "الاسم مفقود"), pin_digits: tr("Password/PIN must be 4–64 characters", "كلمة المرور من 4 إلى 64 حرفًا"), admin_only: tr("only the admin can edit teachers", "فقط المدير يعدّل المعلمين"), full: tr("user limit reached", "تم بلوغ الحد"), unknown_class: tr("class not in Classes & Subjects", "الصف غير موجود في القائمة"), unknown_section: tr("section not in that class", "الشعبة ليست في هذا الصف"), unknown_subject: tr("subject not in the list", "المادة غير موجودة"), unknown_scope: tr("class/section not in the list", "الصف/الشعبة غير موجود") })[e] || e;
  const secOpts = catalog.sections.filter((s) => s.cls === fCls);
  const nFilters = [fSub, fTeach, fCls, fSec, q].filter(Boolean).length;
  const clearFilters = () => { setFSub(""); setFTeach(""); setFCls(""); setFSec(""); setQ(""); setFPhase(""); setFStatus(""); setPage(0); };
  const teacherSections = (u: LmsUser) => u.scope.filter((x) => x.includes("|")).map((x) => x.split("|")[1]);
  // Optional student columns (admin sees every field; teachers only "parent email on file").
  const EXTRA: [string, string, string, (u: LmsUser) => string][] = role !== "student" ? [] : asAdmin ? [
    ["nameAr", "Arabic name", "الاسم بالعربية", (u) => u.nameAr || ""], ["first", "First name", "الاسم الأول", (u) => u.firstName || ""], ["last", "Last name", "اسم العائلة", (u) => u.lastName || ""],
    ["gender", "Gender", "الجنس", (u) => (u.gender === "b" ? "Boy" : u.gender === "g" ? "Girl" : "")], ["dob", "DOB", "الميلاد", (u) => u.dob || ""],
    ["phone", "Contact no", "التواصل", (u) => u.phone || ""], ["semail", "Student email", "بريد الطالب", (u) => u.semail || ""], ["pname", "Parent name", "اسم ولي الأمر", (u) => u.parentName || ""], ["pemail", "Parent email", "بريد ولي الأمر", (u) => u.email || ""],
    ["subj", "Subject", "المادة", (u) => u.subject || ""], ["phase", "Phase", "المرحلة", (u) => u.phase || ""], ["nat", "Nationality", "الجنسية", (u) => u.nationality || ""], ["lang", "Language", "اللغة", (u) => u.prefLang || ""],
    ["sen", "SEN", "SEN", (u) => (u.sen ? "✓" : "")], ["eal", "EAL", "EAL", (u) => (u.eal ? "✓" : "")], ["gt", "G&T", "موهوب", (u) => (u.gt ? "✓" : "")],
    ["target", "Target", "الهدف", (u) => (u.target || (u.targetEff ? `${u.targetEff} (scaled)` : ""))], ["scaled", "Scaled score", "الدرجة المعيارية", (u) => u.scaled || ""], ["isams", "iSAMS ID", "رقم iSAMS", (u) => u.isamsId || ""],
  ] : [["pname", "Parent name", "اسم ولي الأمر", (u) => u.parentName || ""], ["pemail", "Parent email on file", "بريد ولي الأمر", (u) => (u.parentEmail ? "Yes" : "No")]];
  const extraOn = EXTRA.filter((e) => showCols.includes(e[0]));
  const cols: { key: string; label: string; sort: boolean }[] = [
    { key: "name", label: tr("Name", "الاسم"), sort: true },
    { key: "username", label: tr("Username", "اسم المستخدم"), sort: true },
    ...(showPin ? [{ key: "pin", label: "PIN", sort: false }] : []),
    ...(role === "student"
      ? [{ key: "cls", label: tr("Class", "الصف"), sort: true }, { key: "section", label: tr("Section", "الشعبة"), sort: true }]
      : [{ key: "subjects", label: tr("Subjects", "المواد"), sort: true }, { key: "phase", label: tr("Phase", "المرحلة"), sort: true }, { key: "groups", label: tr("Groups", "المجموعات"), sort: true }]),
    ...extraOn.map((e) => ({ key: "x_" + e[0], label: tr(e[1], e[2]), sort: true })),
    { key: "status", label: tr("Status", "الحالة"), sort: true },
    { key: "actions", label: tr("Actions", "إجراءات"), sort: false },
  ];
  const sortVal = (u: LmsUser): string => ({ phase: u.phase || "", name: u.name, username: u.username, cls: u.cls, section: u.section, subjects: u.subjects.join(","), groups: (u.groups || []).map((g) => g.name).join(","), sections: teacherSections(u).join(","), status: u.disabled ? "1" : "0", ...Object.fromEntries(EXTRA.map((e) => ["x_" + e[0], e[3](u)])) })[sort.key] ?? "";
  const filtered = list.filter((u) => !fStatus || (fStatus === "blocked") === u.disabled);
  const sorted = [...filtered].sort((x, y) => sortVal(x).localeCompare(sortVal(y), undefined, { numeric: true, sensitivity: "base" }) * sort.dir);
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const pageRows = sorted.slice(Math.min(page, pages - 1) * PAGE, Math.min(page, pages - 1) * PAGE + PAGE);
  const iconBtn = "inline-flex h-7 w-7 text-[13px] items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-white/10";
  const bulk = async (disabled: boolean) => {
    await lmsApi.setStatus([...sel], disabled, asAdmin).catch((e) => setErr(lmsErrorText(e, tr)));
    setSel(new Set());
    load();
  };
  const copy = async (id: string, pin: string) => { await navigator.clipboard?.writeText(pin).catch(() => undefined); setCopied(id); setTimeout(() => setCopied(""), 1500); };

  return (
    <Frame embedded={embedded} title={title}>
      {permFor && <PermissionsModal catalog={catalog} u={permFor} onClose={() => setPermFor(null)} onSaved={() => { setPermFor(null); load(); }} asAdmin={asAdmin} />}
      <div className={embedded ? "w-full space-y-4" : "w-full flex-1 space-y-4 px-3 py-5 sm:px-6"} data-testid="lms-admin" data-role={role}>
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}

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

        <header className="flex flex-wrap items-center gap-3" data-testid="lms-page-head">
          <div className="min-w-0 flex-1">
            <h2 className="admin-tab-title text-2xl font-extrabold tracking-tight" data-testid="admin-lms-heading">{title}</h2>
            <p className="text-sm opacity-70">{tr(`${people.length} total · ${filtered.length} shown`, `${people.length} إجمالي · ${filtered.length} معروض`)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={tr("Actions", "إجراءات")}>
            {(asAdmin || role !== "student" || canOp("add")) && <HeadBtn label={role === "teacher" ? tr("Add teacher", "إضافة معلم") : tr("Add student", "إضافة طالب")} text={tr("Add", "إضافة")} primary onClick={() => setDrawer("add")} testId="lms-toggle-add" icon={<path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-3v6m3-3h-6" />} />}
            {(asAdmin || role !== "student" || canOp("add")) && <HeadBtn label={tr("Bulk add from Excel", "إضافة جماعية من إكسل")} text={tr("Bulk add", "إضافة جماعية")} onClick={() => setDrawer("bulk")} testId="lms-toggle-bulk" icon={<path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />} />}
            {(asAdmin || role !== "student" || canOp("add")) && <HeadBtn label={role === "teacher" ? tr("Teachers template (Excel)", "قالب المعلمين (إكسل)") : tr("Students template (Excel)", "قالب الطلاب (إكسل)")} text={tr("Template", "القالب")} onClick={() => downloadUsersTemplate(role, catalog)} testId="lms-template" icon={<path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" />} />}
            {asAdmin && role === "student" && <HeadBtn label={tr("Export all fields (Excel, admin only)", "تصدير كل الحقول (إكسل)")} text={tr("Export", "تصدير")} icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>} onClick={() => exportStudentsXlsx(people).catch((e) => setErr(lmsErrorText(e, tr)))} testId="lms-export-all" />}
            {asAdmin && <HeadBtn label={tr("Download sign-in sheet (shown rows)", "تنزيل ورقة الدخول (الصفوف المعروضة)")} text={tr("Sign-in sheet", "ورقة الدخول")} onClick={async () => { try { await downloadSignInSheet(sorted, await allPins(), role); } catch (e) { setErr(lmsErrorText(e, tr)); } }} testId="lms-signin-sheet" icon={<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7M9 9h2" />} />}
            {asAdmin && role === "student" && <HeadBtn label={tr("All homework (ZIP)", "كل الواجبات (ZIP)")} text="ZIP" onClick={() => exportAllHomeworkZip(asAdmin).catch((e) => setErr(lmsErrorText(e, tr)))} testId="lms-admin-export" icon={<path d="M4 7h16v13H4zM4 7l2-3h12l2 3M10 11h4" />} />}
          </div>
        </header>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="lms-stats">
          <Stat label={tr("Total", "الإجمالي")} value={people.length} onClick={() => setFStatus("")} active={!fStatus} />
          <Stat label={tr("Active", "نشط")} value={people.filter((u) => !u.disabled).length} tone="ok" onClick={() => setFStatus("active")} active={fStatus === "active"} />
          <Stat label={tr("Blocked", "موقوف")} value={people.filter((u) => u.disabled).length} tone="bad" onClick={() => setFStatus("blocked")} active={fStatus === "blocked"} />
          {role === "student" && catalog.classes.map((c) => ({ c, n: people.filter((u) => u.cls === c.name).length })).filter((x) => x.n > 0).map(({ c, n }) => (
            <Stat key={c.id} label={tr("Class ", "الصف ") + clsNum(c.name)} value={n} onClick={() => { setFCls(fCls === c.name ? "" : c.name); setFSec(""); setPage(0); }} active={fCls === c.name} small />
          ))}
        </div>

        {drawer && (<BodyPortal>
          <div className="fixed inset-0 z-[2147483000] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={() => setDrawer(null)} data-testid="lms-drawer-backdrop">
            <aside role="dialog" aria-modal="true" aria-label={drawer === "add" ? tr("Add", "إضافة") : tr("Bulk add", "إضافة جماعية")} className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-2xl dark:bg-[#0f1a26] sm:rounded-s-3xl" onClick={(e) => e.stopPropagation()} data-testid="lms-drawer">
              <div className="mb-4 flex items-center gap-2">
                <h3 className="flex-1 text-lg font-extrabold">{drawer === "add" ? (role === "teacher" ? tr("Add a teacher", "إضافة معلم") : tr("Add a student", "إضافة طالب")) : tr("Bulk add (Excel)", "إضافة جماعية (إكسل)")}</h3>
                <button type="button" className={iconBtn} onClick={() => setDrawer(null)} aria-label={tr("Close", "إغلاق")} title={tr("Close", "إغلاق")} data-testid="lms-drawer-close">✕</button>
              </div>
              {drawer === "add" ? (
                <PersonForm admin={asAdmin} staff={staff} role={role} catalog={scopedCatalog(catalog)} onSave={async (r) => { if (await saveMany([r])) setDrawer(null); }} submitLabel={"+ " + tr("Add", "إضافة")} testPrefix="lms-new" />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm opacity-75">{tr("1. Download the template · 2. Fill one row per person · 3. Upload it here and check the preview.", "١. نزّل القالب · ٢. صف لكل شخص · ٣. ارفعه هنا وراجع المعاينة.")}</p>
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
                </div>
              )}
            </aside>
          </div>
        </BodyPortal>)}

        <section className={card + " space-y-3 p-3 sm:p-4"}>
          <div className="flex flex-wrap gap-2">
            <input className={inputCls + " mt-0 min-w-[12rem] flex-1 sm:max-w-sm"} placeholder={tr("Search name or username…", "ابحث بالاسم أو المستخدم…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="lms-search" aria-label={tr("Search", "بحث")} />
            {urlFilters && <button type="button" className={smallBtn + " sm:hidden"} onClick={() => setFOpen(!fOpen)} aria-expanded={fOpen} data-testid="lms-filter-toggle">⚙ {tr("Filters", "عوامل التصفية")}{nFilters ? ` (${nFilters})` : ""}</button>}
            <div className={urlFilters ? `${fOpen ? "flex" : "hidden"} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-wrap` : "contents"} data-testid="lms-filter-panel">
            {asAdmin && <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fPhase} onChange={(e) => setFPhase(e.target.value)} data-testid="lms-filter-phase" aria-label={tr("Phase", "المرحلة")}><option value="">{tr("All phases", "كل المراحل")}</option>{PHASES.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
            {(role === "teacher" || asAdmin) && (
              <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fSub} onChange={(e) => { setFSub(e.target.value); setFTeach(""); setPage(0); }} data-testid="lms-filter-subject" aria-label={tr("Subject", "المادة")}>
                <option value="">{tr("All subjects", "كل المواد")}</option>
                {catalog.subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            )}
            {urlFilters && <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fTeach} onChange={(e) => { setFTeach(e.target.value); setPage(0); }} data-testid="lms-filter-teacher" aria-label={tr("Teacher", "المعلم")}>
              <option value="">{tr("All teachers", "كل المعلمين")}</option>
              {teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>}
            {role === "student" && <><select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fCls} onChange={(e) => { setFCls(e.target.value); setFSec(""); setPage(0); }} data-testid="lms-filter-class" aria-label={tr("Class", "الصف")}>
              <option value="">{tr("All classes", "كل الصفوف")}</option>
              {catalog.classes.map((c) => <option key={c.id} value={c.name}>{clsNum(c.name)}</option>)}
            </select>
            <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fSec} onChange={(e) => setFSec(e.target.value)} disabled={!secOpts.length} data-testid="lms-filter-section" aria-label={tr("Section", "الشعبة")}>
              <option value="">{tr("All sections", "كل الشعب")}</option>
              {secOpts.map((s) => <option key={s.id} value={s.name}>{secLetter(s.name)}</option>)}
            </select></>}
            {urlFilters && <button type="button" className={smallBtn} onClick={clearFilters} disabled={!nFilters && !fPhase && !fStatus} data-testid="lms-filter-clear">✕ {tr("Clear", "مسح")}</button>}
            {urlFilters && <span className="self-center text-sm font-semibold" data-testid="lms-filter-count">{tr(`${list.length} of ${people.length}`, `${list.length} من ${people.length}`)}</span>}
            </div>
            {EXTRA.length > 0 && <div className="relative"><button type="button" className={smallBtn} onClick={() => setColMenu(!colMenu)} aria-expanded={colMenu} data-testid="lms-cols-btn">▥ {tr("Columns", "الأعمدة")}</button>
              {colMenu && <div className="absolute end-0 z-40 mt-1 w-52 rounded-2xl border border-black/10 bg-white p-2 text-sm shadow-xl dark:border-white/15 dark:bg-[#13202e]" data-testid="lms-cols-menu">{EXTRA.map((e) => <label key={e[0]} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10"><input type="checkbox" checked={showCols.includes(e[0])} onChange={() => toggleCol(e[0])} />{tr(e[1], e[2])}</label>)}</div>}</div>}
            <select className={inputCls + " mt-0 w-auto! min-w-[9rem]"} value={fStatus} onChange={(e) => { setFStatus(e.target.value as typeof fStatus); setPage(0); }} data-testid="lms-filter-status" aria-label={tr("Status", "الحالة")}>
              <option value="">{tr("Any status", "كل الحالات")}</option>
              <option value="active">{tr("Active", "نشط")}</option>
              <option value="blocked">{tr("Blocked", "موقوف")}</option>
            </select>
          </div>
          {sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-sm dark:bg-sky-900/30" data-testid="lms-bulk">
              <b>{tr(`${sel.size} selected`, `${sel.size} محدد`)}</b>
              {canOp("block") && <button type="button" className={smallBtn} onClick={() => bulk(false)} data-testid="lms-bulk-activate">✅ {tr("Activate", "تفعيل")}</button>}
              {canOp("block") && <button type="button" className={smallBtn} onClick={() => bulk(true)} data-testid="lms-bulk-block">⛔ {tr("Block", "إيقاف")}</button>}
              <button type="button" className={smallBtn} onClick={() => setSel(new Set())}>{tr("Clear", "مسح")}</button>
            </div>
          )}
          <div className="max-h-[calc(100vh-17rem)] min-h-[20rem] overflow-auto rounded-2xl border border-black/10 dark:border-white/15" data-testid="lms-table-wrap">
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
                  const zebra = i % 2 ? "bg-[#f3f6f9] dark:bg-[#16222f]" : "bg-white dark:bg-[#0f1a26]";
                  const td = "border-t border-black/5 px-2.5 py-2 align-middle dark:border-white/10";
                  return (
                    <Fragment key={u.id}>
                      <tr className={`${zebra} transition hover:bg-sky-50 dark:hover:bg-sky-900/20`} data-testid="lms-user">
                        <td className={`${td} sticky start-0 z-10 ${zebra}`}><input type="checkbox" checked={sel.has(u.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} aria-label={tr(`Select ${u.name}`, `تحديد ${u.name}`)} data-testid="lms-select" /></td>
                        <td className={`${td} sticky start-10 z-10 min-w-[9rem] max-w-[14rem] font-semibold leading-snug ${zebra}`} dir="auto" data-testid="col-name"><PresenceDot seen={u.lastSeen} className="me-1.5 align-middle" />{u.name}{role === "teacher" && asAdmin && <button type="button" onClick={() => setPermFor(u)} className="mt-1 flex items-center gap-1 rounded-full bg-sun/90 px-2.5 py-0.5 text-[11px] font-extrabold text-[#0b1b2b] shadow-sm hover:brightness-95" data-testid="lms-user-perms">🔐 {tr("Permissions", "الصلاحيات")}</button>}</td>
                        <td className={`${td} max-w-[11rem] truncate font-mono text-[13px]`} dir="ltr" title={u.username} data-testid="col-username">{u.username}</td>
                        {showPin && (
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
                            <td className={td} data-testid="col-class">{clsNum(u.cls) || "—"}</td>
                            <td className={td} data-testid="col-section">{secLetter(u.section) || "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className={td} data-testid="col-subjects">{u.subjects.join(", ") || "—"}</td>
                            <td className={td} data-testid="col-phase">{(u.phase || "").split(",").filter(Boolean).join(", ") || "—"}</td>
                            <td className={td} data-testid="col-groups" title={(u.groups || []).map((g) => g.name).join(", ")}>{shortList((u.groups || []).map((g) => g.name)) || <span className="text-rose-700 dark:text-rose-300">{tr("None", "لا شيء")}</span>}</td>
                          </>
                        )}
                        {extraOn.map((e) => <td key={e[0]} className={td + " whitespace-nowrap text-[13px]"} data-testid={`col-${e[0]}`} dir="auto">{e[3](u) || "—"}</td>)}
                        <td className={td} data-testid="col-status">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${u.disabled ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100"}`}>{u.disabled ? tr("Blocked", "موقوف") : tr("Active", "نشط")}</span>
                        </td>
                        <td className={td + " whitespace-nowrap"}>
                          <span className="inline-flex gap-0.5">
                            {canOp("edit") && <button type="button" className={iconBtn} onClick={() => setEdit(edit === u.id ? null : u.id)} aria-label={tr(`Edit ${u.name}`, `تعديل ${u.name}`)} title={tr("Edit", "تعديل")} aria-expanded={edit === u.id} data-testid="lms-user-edit">✏️</button>}
                            {asAdmin && <a className={iconBtn} href={`/lms?${new URLSearchParams({ viewAs: u.id, n: u.name, r: u.role, c: u.cls || "" })}`} target="_blank" rel="noopener" aria-label={tr(`View as ${u.name} (read-only)`, `عرض كـ ${u.name} (للعرض فقط)`)} title={tr("View as (read-only, new tab)", "عرض كـ (للعرض فقط، تبويب جديد)")} data-testid="lms-user-viewas">👁</a>}
                            {!asAdmin && role === "student" && actor?.role === "teacher" && actor.perms.includes("viewAsStudent") && !actor.viewAs && <a className={iconBtn} href={`/lms?${new URLSearchParams({ viewAs: u.id, n: u.name, r: "student", c: u.cls || "", by: "t" })}`} target="_blank" rel="noopener" aria-label={tr(`View as ${u.name} (read-only)`, `عرض كـ ${u.name} (للعرض فقط)`)} title={tr("View as (read-only, new tab)", "عرض كـ (للعرض فقط، تبويب جديد)")} data-testid="t-lms-user-viewas">👁</a>}
                            {u.email && <button type="button" className={iconBtn} onClick={async () => { if (!confirm(tr(`Email the username and PIN to ${u.email}?`, `إرسال اسم المستخدم والرقم السري إلى ${u.email}؟`))) return; try { await mailApi.emailPin(u.id); alert(tr("Sent.", "تم الإرسال.")); } catch (e) { const c = (e as Error).message; alert(c === "mail_not_configured" ? tr("Email isn't connected yet.", "البريد غير متصل بعد.") : c === "reset_pin_first" ? tr("Reset the PIN first so it can be sent.", "أعد تعيين الرقم السري أولاً.") : tr("Couldn't send.", "تعذر الإرسال.")); } }} aria-label={tr(`Email PIN to ${u.email}`, `إرسال الرقم السري إلى ${u.email}`)} title={tr(`Email sign-in details to ${u.email}`, `إرسال بيانات الدخول إلى ${u.email}`)} data-testid="lms-user-email-pin">📧</button>}
                            {role === "student" && <button type="button" className={iconBtn} onClick={() => setProg(prog === u.id ? null : u.id)} aria-label={tr(`Progress of ${u.name}`, `تقدم ${u.name}`)} title={tr("Progress & tracker", "التقدم والمتابعة")} aria-expanded={prog === u.id} data-testid="lms-user-progress">📈</button>}
                            {asAdmin && <button type="button" className={iconBtn} onClick={async () => { if (!confirm(tr(`Give ${u.name} a new PIN?`, `رقم سري جديد لـ ${u.name}؟`))) return; const r = await lmsApi.resetPin(u.id, undefined, asAdmin).catch(() => null); if (r) { setPins((p) => [{ username: u.username, name: u.name, pin: r.pin }, ...p]); load(); } }} aria-label={tr(`Reset PIN for ${u.name}`, `إعادة تعيين رقم ${u.name}`)} title={tr("Reset PIN", "إعادة تعيين الرقم")} data-testid="lms-user-pin">🔑</button>}
                            {canOp("block") && <button type="button" className={iconBtn} onClick={async () => { await lmsApi.setStatus([u.id], !u.disabled, asAdmin).catch((e) => setErr(lmsErrorText(e, tr))); load(); }} aria-label={u.disabled ? tr(`Activate ${u.name}`, `تفعيل ${u.name}`) : tr(`Block ${u.name}`, `إيقاف ${u.name}`)} title={u.disabled ? tr("Activate", "تفعيل") : tr("Block", "إيقاف")} data-testid="lms-user-toggle">{u.disabled ? "✅" : "⛔"}</button>}
                            {canOp("delete") && <button type="button" className={iconBtn + " text-rose-600"} onClick={async () => { if (!confirm(tr(`Delete ${u.name} and their homework?`, `حذف ${u.name} وواجباته؟`))) return; await lmsApi.deleteUser(u.id, asAdmin).catch(() => undefined); load(); }} aria-label={tr(`Delete ${u.name}`, `حذف ${u.name}`)} title={tr("Delete", "حذف")} data-testid="lms-user-delete">🗑</button>}
                          </span>
                        </td>
                      </tr>
                      {prog === u.id && (
                        <tr>
                          <td colSpan={cols.length + 1} className="border-t border-black/5 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/5">
                            <div className="sticky start-0 w-[calc(100vw-6.75rem)] max-w-full">
                            <StudentProgress id={u.id} asAdmin={asAdmin} />
                            <div className="mt-3"><ParentLog student={u.id} asAdmin={asAdmin} /></div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {edit === u.id && (
                        <tr>
                          <td colSpan={cols.length + 1} className="border-t border-black/5 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/5">
                            <div className="sticky start-0 w-[calc(100vw-6.75rem)] max-w-full">
                            <PersonForm admin={asAdmin} staff={staff} role={role} catalog={scopedCatalog(catalog)} initial={u} onSave={async (r) => { if (await saveMany([r])) setEdit(null); }} submitLabel={tr("Save", "حفظ")} testPrefix="lms-edit" />
                            </div>
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
        {embedded && <ViewAsLog />}
      </div>
    </Frame>
  );
}

/** Admin audit: who was opened in "view as" mode, and when. */
function ViewAsLog() {
  const { tr } = useTr();
  const [items, setItems] = useState<{ uid: string; name: string; role: string; at: number; by?: string }[] | null>(null);
  return (
    <details className={card + " py-3"} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !items) lmsApi.viewAsLog().then((r) => setItems(r.items)).catch(() => setItems([])); }} data-testid="viewas-log">
      <summary className="cursor-pointer font-bold">👁 {tr("View-as log", "سجل العرض كمستخدم")}</summary>
      {!items ? <p className="mt-2 opacity-60">…</p> : !items.length ? <p className="mt-2 opacity-60">{tr("No view-as access yet.", "لا يوجد بعد.")}</p> : (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">{items.map((x, i) => <li key={i}><span dir="auto">{x.name}</span> <span className="opacity-60">({x.role}) · {tr("by", "بواسطة")} {x.by || "Admin"} · {new Date(x.at).toLocaleString("en-GB")}</span></li>)}</ul>
      )}
    </details>
  );
}

function HeadBtn({ label, text, icon, onClick, primary, testId }: { label: string; text: string; icon: React.ReactNode; onClick: () => void; primary?: boolean; testId: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} data-testid={testId}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${primary ? "bg-sun text-[#0b1b2b] shadow-sm hover:brightness-105" : "border border-black/10 bg-white/70 hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
      <span className="hidden md:inline">{text}</span>
    </button>
  );
}

function Stat({ label, value, tone, onClick, active, small }: { label: string; value: number; tone?: "ok" | "bad"; onClick: () => void; active?: boolean; small?: boolean }) {
  const dot = tone === "ok" ? "bg-emerald-500" : tone === "bad" ? "bg-rose-500" : "bg-sun";
  return (
    <button type="button" onClick={onClick} aria-pressed={!!active} data-testid="lms-stat"
      className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 text-start transition ${small ? "py-1.5" : "py-2"} ${active ? "border-sun bg-sun/15" : "border-black/10 bg-white/70 hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0"><span className={`block font-extrabold leading-tight ${small ? "text-base" : "text-xl"}`}>{value}</span><span className="block truncate text-xs opacity-70">{label}</span></span>
    </button>
  );
}

const ACTS: [string, string, string][] = [["wall", "Shared Wall", "الجدار المشترك"], ["wheel", "Wheel", "العجلة"], ["randomiser", "Randomiser", "العشوائي"], ["wordcloud", "Word Cloud", "سحابة الكلمات"], ["poll", "Poll", "استطلاع"], ["survey", "Survey", "استبيان"], ["tps", "Think/Pair/Share", "فكّر/شارك"], ["vote", "Vote", "تصويت"]];

/** Admin → teacher form: per-module View / Add-Edit switches (own classes only; enforced on the server). */
const MOD_TOKEN = /^(hide:|att:|beh:|cur:|qhw:|nodl:)/;
function ModuleAccess({ perms, setPerms, teachers }: { perms: string[]; setPerms: (p: string[]) => void; teachers?: LmsUser[] }) {
  const { tr } = useTr();
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const has = (m: string, op: string) => perms.includes(`${m}:${op}`);
  const viewOn = (m: string) => has(m, "view") || has(m, "edit") || has(m, "delete");
  // Add/Edit and Delete each imply Show; hiding the module switches them off too.
  const set = (m: string, op: "view" | "edit" | "delete", on: boolean) => {
    const next = new Set(perms.filter((p) => !p.startsWith(`${m}:`)));
    const cur = { view: viewOn(m), edit: has(m, "edit"), delete: has(m, "delete") };
    if (op === "view") { cur.view = on; if (!on) { cur.edit = false; cur.delete = false; } } else { cur[op] = on; if (on) cur.view = true; }
    for (const k of ["view", "edit", "delete"] as const) if (cur[k]) next.add(`${m}:${k}`);
    setPerms([...next]);
  };
  // Simple modules: shown unless "hide:<module>" is present (so existing teachers keep their current access).
  const shown = (m: string) => !perms.includes(`hide:${m}`);
  const setShown = (m: string, on: boolean) => setPerms([...perms.filter((p) => p !== `hide:${m}`), ...(on ? [] : [`hide:${m}`])]);
  // Quran Homework: Show/Hide, View, Add, Edit, Delete. A teacher without a saved set keeps full (legacy) access, shown as all on.
  const qSet = perms.includes("qhw:set");
  const q = (op: string) => (qSet ? perms.includes(`qhw:${op}`) : true);
  const setQ = (op: "show" | "view" | "add" | "edit" | "delete", on: boolean) => {
    const cur: Record<string, boolean> = { show: q("show"), view: q("view"), add: q("add"), edit: q("edit"), delete: q("delete") };
    cur[op] = on;
    if (on && op !== "show") { cur.view = true; cur.show = true; }
    if (op === "view" && !on) { cur.add = false; cur.edit = false; cur.delete = false; }
    if (op === "show" && !on) { cur.view = false; cur.add = false; cur.edit = false; cur.delete = false; }
    setPerms([...perms.filter((p) => !p.startsWith("qhw:")), "qhw:set", ...Object.keys(cur).filter((k) => cur[k]).map((k) => `qhw:${k}`)]);
  };
  const dlOn = (k: "audio" | "export") => !perms.includes(`nodl:${k}`);
  const setDl = (k: "audio" | "export", on: boolean) => setPerms([...perms.filter((p) => p !== `nodl:${k}`), ...(on ? [] : [`nodl:${k}`])]);
  const rest = perms.filter((p) => !MOD_TOKEN.test(p));
  const preset = (kind: "full" | "view" | "min") => {
    const t: string[] = [];
    if (kind === "full") t.push("att:view", "att:edit", "beh:view", "beh:edit", "cur:view", "cur:edit", "cur:delete", "qhw:set", "qhw:show", "qhw:view", "qhw:add", "qhw:edit", "qhw:delete");
    if (kind === "view") t.push("att:view", "beh:view", "cur:view", "qhw:set", "qhw:show", "qhw:view", "nodl:audio", "nodl:export");
    if (kind === "min") t.push("hide:messaging", "hide:wall", "hide:activities", "hide:results", "qhw:set", "nodl:audio", "nodl:export");
    setPerms([...rest, ...t]);
    setNote(kind === "full" ? tr("Preset applied: Full access — remember to Save.", "تم تطبيق: وصول كامل — لا تنس الحفظ.") : kind === "view" ? tr("Preset applied: View only — remember to Save.", "تم تطبيق: عرض فقط — لا تنس الحفظ.") : tr("Preset applied: Minimal — remember to Save.", "تم تطبيق: الحد الأدنى — لا تنس الحفظ."));
  };
  const copyFrom = () => { const t = (teachers || []).find((x) => x.id === from); if (!t) return; setPerms([...(t.perms || [])]); setNote(tr(`Copied permissions from ${t.name} (not subjects/classes) — remember to Save.`, `تم نسخ الصلاحيات من ${t.name} (دون المواد/الصفوف) — لا تنس الحفظ.`)); };
  const show = (on: boolean, onChange: (v: boolean) => void, id: string) => (
    <label className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${on ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100" : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100"}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid={id} /> {on ? tr("Shown", "ظاهر") : tr("Hidden", "مخفي")}
    </label>
  );
  const sub = (on: boolean, kids: React.ReactNode) => on ? <div className="ms-4 flex flex-wrap gap-x-4 gap-y-1 border-s-2 border-black/10 ps-3 text-sm dark:border-white/15">{kids}</div> : null;
  const cb = (checked: boolean, onChange: (v: boolean) => void, label: string, id: string) => <label className="flex items-center gap-1.5"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={id} /> {label}</label>;
  const simple: [string, string, string][] = [["messaging", "💬 Messaging", "💬 الرسائل"], ["wall", "🧱 Class Wall", "🧱 جدار الصف"], ["activities", "🎲 Activities", "🎲 الأنشطة"], ["homework", "📝 Homework", "📝 الواجبات"], ["assessments", "✅ Assessments", "✅ التقييمات"], ["results", "📊 Assessment Results", "📊 نتائج التقييمات"]];
  const fine: [string, string, string, boolean][] = [["att", "🗓️ Attendance Register", "🗓️ سجل الحضور", false], ["beh", "🌟 Behaviour", "🌟 السلوك", false], ["cur", "📚 Curriculum", "📚 المنهج", true]];
  const qOps: ["view" | "add" | "edit" | "delete", string, string][] = [["view", "View", "عرض"], ["add", "Add", "إضافة"], ["edit", "Edit", "تعديل"], ["delete", "Delete", "حذف"]];
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-black/15 p-3 dark:border-white/20" data-testid="lms-module-access">
      <p className="text-sm font-bold">🧩 {tr("Modules — Show / Hide (assigned groups only)", "الوحدات — إظهار / إخفاء (مجموعاته فقط)")}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="perm-presets">
        <span className="text-xs font-bold uppercase opacity-70">{tr("Quick presets", "إعدادات سريعة")}</span>
        <button type="button" className={smallBtn} onClick={() => preset("full")} data-testid="preset-full">{tr("Full access", "وصول كامل")}</button>
        <button type="button" className={smallBtn} onClick={() => preset("view")} data-testid="preset-view">{tr("View only", "عرض فقط")}</button>
        <button type="button" className={smallBtn} onClick={() => preset("min")} data-testid="preset-min">{tr("Minimal", "الحد الأدنى")}</button>
        {!!teachers?.length && <><span className="ms-2 text-xs font-bold uppercase opacity-70">{tr("Copy from", "نسخ من")}</span>
          <select className={inputCls + " !w-auto"} value={from} onChange={(e) => setFrom(e.target.value)} aria-label={tr("Copy permissions from", "نسخ الصلاحيات من")} data-testid="perm-copy-select"><option value="">{tr("Pick a teacher…", "اختر معلمًا…")}</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <button type="button" className={smallBtn} disabled={!from} onClick={copyFrom} data-testid="perm-copy-btn">{tr("Copy", "نسخ")}</button></>}
      </div>
      {note && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300" role="status" data-testid="perm-note">{note}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {simple.map(([m, en, ar]) => (
          <div key={m} className="flex items-center justify-between gap-2 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/5" data-testid={`perm-mod-${m}`}>
            <span className="text-sm font-semibold">{tr(en, ar)}</span>{show(shown(m), (v) => setShown(m, v), `perm-show-${m}`)}
          </div>
        ))}
        {fine.map(([m, en, ar, del]) => (
          <div key={m} className="space-y-1.5 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/5" data-testid={`perm-mod-${m}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{tr(en, ar)}</span>{show(viewOn(m), (v) => set(m, "view", v), `perm-${m}-view`)}</div>
            {sub(viewOn(m), <>{cb(has(m, "edit"), (v) => set(m, "edit", v), tr("Add / Edit", "إضافة / تعديل"), `perm-${m}-edit`)}{del && cb(has(m, "delete"), (v) => set(m, "delete", v), tr("Delete", "حذف"), "perm-cur-delete")}</>)}
          </div>
        ))}
        <div className="space-y-1.5 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/5" data-testid="perm-qhw">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">📖 {tr("Quran Homework", "واجب القرآن")}</span>{show(q("show"), (v) => setQ("show", v), "perm-qhw-show")}</div>
          {sub(q("show"), qOps.map(([op, en, ar]) => <Fragment key={op}>{cb(q(op), (v) => setQ(op, v), tr(en, ar), `perm-qhw-${op}`)}</Fragment>))}
        </div>
        <div className="space-y-1.5 rounded-xl bg-black/[0.03] px-3 py-2 md:col-span-2 dark:bg-white/5" data-testid="perm-rep">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">📈 {tr("Department Report", "تقرير القسم")}</span>{show(perms.includes("rep:view"), (v) => setPerms([...perms.filter((p) => !p.startsWith("rep:")), ...(v ? ["rep:view"] : [])]), "perm-rep-view")}</div>
          {sub(perms.includes("rep:view"), <>{REP_PERM_KEYS.map(([k, en, ar]) => { const cur = perms.includes(`rep:${k}:on`) ? "on" : perms.includes(`rep:${k}:off`) ? "off" : ""; const ex = k === "pdf" || k === "xlsx"; return (
            <label key={k} className="flex items-center gap-1.5 text-xs">{tr(en, ar)}
              <select className="rounded-lg border border-black/15 bg-white px-1 py-0.5 text-xs dark:border-white/20 dark:bg-slate-900" value={cur} data-testid={`perm-rep-${k}`} onChange={(e) => setPerms([...perms.filter((p) => p !== `rep:${k}:on` && p !== `rep:${k}:off`), ...(e.target.value ? [`rep:${k}:${e.target.value}`] : [])])}>
                <option value="">{tr("As report settings", "كإعدادات التقرير")}</option><option value="on">{ex ? tr("Allow", "سماح") : tr("Show", "إظهار")}</option><option value="off">{ex ? tr("Not allow", "منع") : tr("Hide", "إخفاء")}</option>
              </select></label>); })}</>)}
          <p className="text-[11px] opacity-70">{tr("Read-only, limited to this teacher's classes. Defaults come from Assessment → Department Report → Settings.", "للقراءة فقط وضمن صفوف المعلم. الافتراضي من إعدادات التقرير.")}</p>
        </div>
        <div className="space-y-1.5 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/5" data-testid="perm-dl">
          <div className="text-sm font-semibold">⬇️ {tr("Downloads", "التنزيلات")}</div>
          <div className="ms-4 flex flex-wrap gap-x-4 gap-y-1 border-s-2 border-black/10 ps-3 text-sm dark:border-white/15">
            {cb(dlOn("audio"), (v) => setDl("audio", v), tr("Download audio", "تنزيل الصوت"), "perm-dl-audio")}
            {cb(dlOn("export"), (v) => setDl("export", v), tr("Download Excel / PDF", "تنزيل إكسل / PDF"), "perm-dl-export")}
          </div>
        </div>
      </div>
    </div>
  );
}

const TRK_PERM_KEYS: [string, string, string][] = [["view", "Show / Hide", "إظهار / إخفاء"], ["edit", "Add / Edit", "إضافة / تعديل"], ["effort", "Edit Effort", "تعديل الجهد"], ["xlsx", "Download Excel", "تنزيل Excel"], ["pdf", "Download PDF", "تنزيل PDF"], ["isams", "Download iSAMS", "تنزيل iSAMS"]];
const REP_PERM_KEYS: [string, string, string][] = [["kpi", "KPI overview", "المؤشرات"], ["attainment", "Attainment", "التحصيل"], ["progress", "Progress", "التقدّم"], ["quran", "Quran", "القرآن"], ["homework", "Homework", "الواجبات"], ["coverage", "Curriculum", "المنهج"], ["drill", "Drill-down", "التفصيل"], ["pdf", "PDF", "PDF"], ["xlsx", "Excel", "إكسل"]];

/** Admin → teacher form: which Classroom Activities and assessments this teacher may host from their own login. */
function ClassroomAccess({ perms, toggle, chip }: { perms: string[]; toggle: (v: string) => void; chip: (on: boolean) => string }) {
  const { tr } = useTr();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  useEffect(() => { loadQuizzesData().then((d) => setQuizzes(listPublishedQuizzes(d))).catch(() => undefined); }, []);
  const allA = perms.includes("act:*");
  const allH = perms.includes("host:*");
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-black/15 p-3 dark:border-white/20" data-testid="lms-classroom-access">
      <p className="text-sm font-bold">🎲 {tr("Classroom access", "صلاحيات الصف")}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={allA} className={chip(allA)} onClick={() => toggle("act:*")} data-testid="lms-act-all">{tr("All activities", "كل الأنشطة")}</button>
        {ACTS.map(([k, en, ar]) => <button key={k} type="button" disabled={allA} aria-pressed={allA || perms.includes(`act:${k}`)} className={chip(allA || perms.includes(`act:${k}`)) + " disabled:opacity-60"} onClick={() => toggle(`act:${k}`)} data-testid={`lms-act-${k}`}>{tr(en, ar)}</button>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={allH} className={chip(allH)} onClick={() => toggle("host:*")} data-testid="lms-host-all">{tr("Host all assessments", "استضافة كل التقييمات")}</button>
        {quizzes.map((q) => <button key={q.slug} type="button" disabled={allH} aria-pressed={allH || perms.includes(`host:${q.slug}`)} className={chip(allH || perms.includes(`host:${q.slug}`)) + " max-w-[16rem] truncate disabled:opacity-60"} onClick={() => toggle(`host:${q.slug}`)} title={q.title}>{q.title}</button>)}
      </div>
    </div>
  );
}
