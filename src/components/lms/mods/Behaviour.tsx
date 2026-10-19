"use client";

import { DlGate } from "@/components/lms/DlGate";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { btn, btnCta, ClassSelect, cardCls, field, Head, Modal, ModPage, td, th, Tabs, Toast, useRoster } from "@/components/lms/mods/ModUi";
import { addDays, modCall, modErr, modPerm, pdfTable, todayStr, xlsxTable, type Beh } from "@/lib/lmsMods";

const SEV: [string, string][] = [["", ""], ["Low", "منخفضة"], ["Medium", "متوسطة"], ["High", "عالية"]];
const FOLLOW: Record<string, [string, string]> = { none: ["No follow-up", "لا متابعة"], open: ["Open", "مفتوح"], in_progress: ["In progress", "قيد المتابعة"], done: ["Done", "تمّ"] };
const FCLS: Record<string, string> = { none: "bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-white", open: "bg-rose-100 text-rose-900", in_progress: "bg-amber-100 text-amber-900", done: "bg-emerald-100 text-emerald-900" };
const SCLS = ["", "bg-yellow-100 text-yellow-900", "bg-orange-200 text-orange-900", "bg-rose-600 text-white"];
type Cats = { positive: string[]; concern: string[] };
type Resp = { items: Beh[]; cats: Cats; canEdit: boolean };

export function BehaviourPage() { return <ModPage title="Behaviour" perm="beh">{(asAdmin) => <Behaviour asAdmin={asAdmin} />}</ModPage>; }

/** Behaviour Management: incident / positive log, class overview, student profile, reports. */
export function Behaviour({ asAdmin }: { asAdmin: boolean }) {
  const { tr } = useTr();
  const { actor } = useLmsActor();
  const perm = modPerm(actor?.perms, asAdmin, "beh");
  const { students, groups } = useRoster(asAdmin);
  const [tab, setTab] = useState<"log" | "overview" | "profile">("log");
  const [f, setF] = useState({ g: "", kind: "", category: "", severity: "", follow: "", from: addDays(todayStr(), -30), to: todayStr(), q: "" });
  const [data, setData] = useState<Resp | null>(null);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const [edit, setEdit] = useState<Partial<Beh> | null>(null);
  const [profile, setProfile] = useState("");
  const load = useCallback(() => {
    modCall<Resp>("beh-list", { cls: "", section: "", kind: f.kind, category: f.category, severity: Number(f.severity) || 0, follow: f.follow, from: f.from, to: f.to }, asAdmin).then(setData).catch((e) => { setBad(true); setMsg(modErr(e, tr)); });
  }, [f.kind, f.category, f.severity, f.follow, f.from, f.to, asAdmin, tr]);
  useEffect(() => { load(); }, [load]);
  const gids = useMemo(() => new Set(groups.find((x) => x.key === f.g)?.ids || []), [groups, f.g]);
  const items = useMemo(() => (data?.items || []).filter((x) => (!f.g || gids.has(x.student)) && (!f.q || `${x.name} ${x.note} ${x.category} ${x.action}`.toLowerCase().includes(f.q.toLowerCase()))), [data, f.q, f.g, gids]);
  const note = (m: string, b = false) => { setMsg(m); setBad(b); };
  const setFollow = async (id: string, follow: string) => { try { await modCall("beh-follow", { id, follow }, asAdmin); load(); } catch (e) { note(modErr(e, tr), true); } };
  const del = async (id: string) => { if (!confirm(tr("Delete this entry?", "حذف هذا السجل؟"))) return; try { await modCall("beh-delete", { id }, asAdmin); load(); } catch (e) { note(modErr(e, tr), true); } };
  const head = [tr("Date", "التاريخ"), tr("Student", "الطالب"), tr("Class", "الصف"), tr("Type", "النوع"), tr("Category", "الفئة"), tr("Severity", "الخطورة"), tr("Note", "الملاحظة"), tr("Action taken", "الإجراء"), tr("Follow-up", "المتابعة"), tr("By", "بواسطة")];
  const body = items.map((x) => [x.day, x.name, `${x.cls} ${x.section}`.trim(), x.kind === "positive" ? tr("Positive", "إيجابي") : tr("Concern", "ملاحظة"), x.category, x.kind === "positive" ? "" : tr(...(SEV[x.severity] as [string, string])), x.restricted ? tr("(restricted)", "(مقيّد)") : x.note, x.restricted ? "" : x.action, tr(...(FOLLOW[x.follow] as [string, string])), x.by]);
  const cats = data?.cats;
  return (
    <div data-testid="behaviour" className="space-y-1">
      <Head hide={asAdmin} icon="🌟" title={tr("Behaviour Management", "إدارة السلوك")} sub={tr("Positive and concern log with follow-up. Notes are staff-only — students and parents never see them.", "سجل السلوك الإيجابي والملاحظات مع المتابعة. الملاحظات للموظفين فقط — لا يراها الطلاب ولا أولياء الأمور.")}>
        {perm.edit && <button type="button" className={btnCta} onClick={() => setEdit({ kind: "concern", day: todayStr(), severity: 1 })} data-testid="beh-new">+ {tr("New entry", "سجل جديد")}</button>}
      </Head>
      <Tabs testId="beh-tabs" value={tab} onChange={setTab} items={[["log", tr("Log & reports", "السجل والتقارير")], ["overview", tr("Class overview", "نظرة على الصف")], ["profile", tr("Student profile", "ملف الطالب")]]} />
      <div className={cardCls + " mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6"}>
        <ClassSelect groups={groups} value={f.g} onChange={(g) => setF({ ...f, g })} all={tr("All my groups", "كل مجموعاتي")} testId="beh-class" />
        <select className={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, category: "" })} aria-label={tr("Type", "النوع")} data-testid="beh-f-kind"><option value="">{tr("All types", "كل الأنواع")}</option><option value="positive">{tr("Positive", "إيجابي")}</option><option value="concern">{tr("Concern", "ملاحظة")}</option></select>
        <select className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label={tr("Category", "الفئة")}><option value="">{tr("All categories", "كل الفئات")}</option>{cats && [...(f.kind !== "concern" ? cats.positive : []), ...(f.kind !== "positive" ? cats.concern : [])].map((c) => <option key={c}>{c}</option>)}</select>
        <select className={field} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} aria-label={tr("Severity", "الخطورة")}><option value="">{tr("Any severity", "أي خطورة")}</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{tr(...(SEV[n] as [string, string]))}</option>)}</select>
        <select className={field} value={f.follow} onChange={(e) => setF({ ...f, follow: e.target.value })} aria-label={tr("Follow-up", "المتابعة")} data-testid="beh-f-follow"><option value="">{tr("Any follow-up", "أي متابعة")}</option>{Object.keys(FOLLOW).map((k) => <option key={k} value={k}>{tr(...FOLLOW[k])}</option>)}</select>
        <input className={field} placeholder={tr("Search…", "بحث…")} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} dir="auto" data-testid="beh-search" />
        <input type="date" className={field} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label={tr("From", "من")} />
        <input type="date" className={field} value={f.to} max={todayStr()} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label={tr("To", "إلى")} />
      </div>
      <Toast msg={msg} bad={bad} />
      {tab === "log" && (<>
        <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-sm opacity-70">{items.length} {tr("entries", "سجلات")}</span><span className="flex-1" />
        <DlGate kind="export">
          <button type="button" className={btn} onClick={() => xlsxTable("Behaviour", head, body, `behaviour-${f.from}-to-${f.to}.xlsx`, [12, 22, 10, 11, 18, 10, 50, 36, 14, 18])} disabled={!items.length} data-testid="beh-xlsx">⬇ Excel</button>
          <button type="button" className={btn} onClick={() => pdfTable({ title: tr("Behaviour report", "تقرير السلوك"), subtitle: `${f.from} → ${f.to} · ${items.length} ${tr("entries", "سجلات")} · ${tr("Staff only — confidential", "للموظفين فقط — سري")}`, headers: head, rows: body, filename: `behaviour-${f.from}-to-${f.to}.pdf` })} disabled={!items.length} data-testid="beh-pdf">⬇ PDF</button>
        </DlGate></div>
        <div className="space-y-2" data-testid="beh-list">
          {items.map((x) => (
            <article key={x.id} className={cardCls + " !p-3"} data-testid="beh-item">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${x.kind === "positive" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>{x.kind === "positive" ? "🌟 " + tr("Positive", "إيجابي") : "⚠ " + tr("Concern", "ملاحظة")}</span>
                <b dir="auto"><button type="button" className="hover:underline" onClick={() => { setProfile(x.student); setTab("profile"); }}>{x.name}</button></b>
                <span className="text-xs opacity-60">{x.cls} {x.section} · {x.day} · {x.category}</span>
                {x.kind === "concern" && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SCLS[x.severity]}`}>{tr(...(SEV[x.severity] as [string, string]))}</span>}
                {x.sensitive && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-900" title={tr("Visible to its author and the admin only", "مرئي لكاتبه والإدارة فقط")}>🔒 {tr("Sensitive", "حساس")}</span>}
                <span className="flex-1" />
                {perm.edit ? <select className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold ${FCLS[x.follow]}`} value={x.follow} onChange={(e) => setFollow(x.id, e.target.value)} aria-label={tr("Follow-up status", "حالة المتابعة")} data-testid="beh-follow">{Object.keys(FOLLOW).map((k) => <option key={k} value={k}>{tr(...FOLLOW[k])}</option>)}</select> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${FCLS[x.follow]}`}>{tr(...FOLLOW[x.follow])}</span>}
                {perm.edit && !x.restricted && <button type="button" className={btn + " !px-2.5 !py-1"} onClick={() => setEdit(x)} data-testid="beh-edit">✎</button>}
                {perm.edit && (asAdmin || x.mine) && <button type="button" className={btn + " !px-2.5 !py-1"} onClick={() => del(x.id)} aria-label={tr("Delete", "حذف")} data-testid="beh-del">🗑</button>}
              </div>
              {x.restricted ? <p className="mt-2 text-sm italic opacity-60">🔒 {tr("Restricted note — only its author and the admin can read it.", "ملاحظة مقيّدة — لكاتبها والإدارة فقط.")}</p> : (<>
                {x.note && <p className="mt-2 whitespace-pre-wrap text-sm" dir="auto">{x.note}</p>}
                {x.action && <p className="mt-1 text-sm" dir="auto"><b>{tr("Action taken", "الإجراء")}:</b> {x.action}</p>}
                {x.followNote && <p className="mt-1 text-sm opacity-80" dir="auto"><b>{tr("Follow-up note", "ملاحظة المتابعة")}:</b> {x.followNote}</p>}
              </>)}
              <p className="mt-1 text-xs opacity-50">{tr("Logged by", "سجّله")} {x.by}</p>
            </article>
          ))}
          {data && !items.length && <p className={cardCls + " text-center opacity-70"}>{tr("No entries for these filters.", "لا سجلات لهذه المرشحات.")}</p>}
        </div>
      </>)}
      {tab === "overview" && <Overview items={items} />}
      {tab === "profile" && <Profile asAdmin={asAdmin} students={students || []} items={data?.items || []} sel={profile} setSel={setProfile} />}
      {edit && cats && <Editor init={edit} cats={cats} students={(students || []).filter((s) => !f.g || `${s.cls}|${s.section}` === f.g)} asAdmin={asAdmin} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); note(tr("Saved.", "تم الحفظ.")); load(); }} />}
    </div>
  );
}

function Overview({ items }: { items: Beh[] }) {
  const { tr } = useTr();
  const byClass = new Map<string, { pos: number; con: number; high: number; open: number }>();
  const byStu = new Map<string, { name: string; cls: string; pos: number; con: number; high: number; open: number }>();
  for (const x of items) {
    const k = `${x.cls} ${x.section}`.trim();
    const c = byClass.get(k) || { pos: 0, con: 0, high: 0, open: 0 }; const s = byStu.get(x.student) || { name: x.name, cls: k, pos: 0, con: 0, high: 0, open: 0 };
    for (const t of [c, s]) { if (x.kind === "positive") t.pos++; else t.con++; if (x.kind === "concern" && x.severity === 3) t.high++; if (x.follow === "open" || x.follow === "in_progress") t.open++; }
    byClass.set(k, c); byStu.set(x.student, s);
  }
  const stu = [...byStu.values()].sort((a, b) => b.con - a.con || b.high - a.high).slice(0, 15);
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="beh-overview">
      <div className={cardCls + " overflow-x-auto p-0"}>
        <p className="px-4 pt-3 text-sm font-bold">{tr("By class", "حسب الصف")}</p>
        <table className="w-full"><thead><tr>{[tr("Class", "الصف"), "🌟", "⚠", tr("High", "عالية"), tr("Open follow-ups", "متابعات مفتوحة")].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">{[...byClass.entries()].map(([k, v]) => <tr key={k}><td className={td + " font-semibold"}>{k}</td><td className={td}>{v.pos}</td><td className={td}>{v.con}</td><td className={td}>{v.high}</td><td className={td}>{v.open}</td></tr>)}{!byClass.size && <tr><td className={td + " opacity-60"} colSpan={5}>—</td></tr>}</tbody></table>
      </div>
      <div className={cardCls + " overflow-x-auto p-0"}>
        <p className="px-4 pt-3 text-sm font-bold">{tr("Students needing attention", "طلاب يحتاجون متابعة")}</p>
        <table className="w-full"><thead><tr>{[tr("Student", "الطالب"), tr("Class", "الصف"), "🌟", "⚠", tr("Open", "مفتوح")].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">{stu.map((s) => <tr key={s.name + s.cls}><td className={td + " font-semibold"} dir="auto">{s.name}</td><td className={td}>{s.cls}</td><td className={td}>{s.pos}</td><td className={td}>{s.con}</td><td className={td}>{s.open}</td></tr>)}{!stu.length && <tr><td className={td + " opacity-60"} colSpan={5}>—</td></tr>}</tbody></table>
      </div>
    </div>
  );
}

function Profile({ asAdmin, students, items, sel, setSel }: { asAdmin: boolean; students: { id: string; name: string; cls: string; section: string }[]; items: Beh[]; sel: string; setSel: (s: string) => void }) {
  const { tr } = useTr();
  const [pts, setPts] = useState<{ total: number; recent: { label: string; pts: number; icon: string; by: string; at: number }[]; attendance: Record<string, number> | null } | null>(null);
  useEffect(() => { if (!sel) return; let on = true; modCall<NonNullable<typeof pts>>("beh-points", { student: sel }, asAdmin).then((r) => on && setPts(r)).catch(() => on && setPts(null)); return () => { on = false; }; }, [sel, asAdmin]);
  const mine = items.filter((x) => x.student === sel);
  const pos = mine.filter((x) => x.kind === "positive").length, con = mine.length - pos;
  const st = students.find((s) => s.id === sel);
  return (
    <div className="space-y-4" data-testid="beh-profile">
      <select className={field + " max-w-sm"} value={sel} onChange={(e) => { setSel(e.target.value); setPts(null); }} aria-label={tr("Student", "الطالب")} data-testid="beh-student"><option value="">{tr("Choose a student…", "اختر طالبًا…")}</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.cls} {s.section}</option>)}</select>
      {sel && st && (<>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["🌟 " + tr("Positive", "إيجابي"), pos], ["⚠ " + tr("Concerns", "ملاحظات"), con], [tr("Open follow-ups", "متابعات مفتوحة"), mine.filter((x) => x.follow === "open" || x.follow === "in_progress").length], [tr("Class points", "نقاط الصف"), pts ? pts.total : "…"]].map(([l, v]) => <div key={String(l)} className={cardCls}><p className="text-xs font-bold uppercase opacity-60">{l}</p><p className="mt-1 text-2xl font-extrabold">{v}</p></div>)}
        </div>
        {pts?.attendance && <p className="text-sm opacity-80">{tr("Attendance records", "سجلات الحضور")}: P {pts.attendance.P || 0} · A {pts.attendance.A || 0} · L {pts.attendance.L || 0} · E {pts.attendance.E || 0}</p>}
        <div className={cardCls}>
          <p className="mb-2 text-sm font-bold">{tr("Timeline", "السجل الزمني")}</p>
          <ol className="space-y-2 border-s-2 border-black/10 ps-4 dark:border-white/15">
            {mine.map((x) => <li key={x.id} className="relative text-sm"><span className={`absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${x.kind === "positive" ? "bg-emerald-600" : "bg-rose-600"}`} /><b>{x.day}</b> · {x.category} {x.kind === "concern" && `(${tr(...(SEV[x.severity] as [string, string]))})`} <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${FCLS[x.follow]}`}>{tr(...FOLLOW[x.follow])}</span>{x.restricted ? <i className="block opacity-60">🔒 {tr("Restricted", "مقيّد")}</i> : <span className="block opacity-80" dir="auto">{x.note}{x.action ? ` — ${x.action}` : ""}</span>}</li>)}
            {!mine.length && <li className="text-sm opacity-60">{tr("No entries in this date range.", "لا سجلات في هذه الفترة.")}</li>}
          </ol>
        </div>
        {pts && !!pts.recent.length && <div className={cardCls}><p className="mb-2 text-sm font-bold">{tr("Recent class points", "آخر نقاط الصف")}</p><ul className="text-sm">{pts.recent.map((p, i) => <li key={i}>{p.icon} {p.label} <b>{p.pts > 0 ? "+" : ""}{p.pts}</b> <span className="opacity-60">· {p.by} · {new Date(p.at).toLocaleDateString("en-GB")}</span></li>)}</ul></div>}
      </>)}
    </div>
  );
}

function Editor({ init, cats, students, asAdmin, onClose, onSaved }: { init: Partial<Beh>; cats: Cats; students: { id: string; name: string; cls: string; section: string }[]; asAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const { tr } = useTr();
  const [x, setX] = useState<Partial<Beh> & { points?: boolean }>({ severity: 1, follow: undefined, ...init });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const kind = x.kind === "positive" ? "positive" : "concern";
  const list = cats[kind];
  const save = async () => {
    setBusy(true); setErr("");
    try { await modCall("beh-save", { ...x, followNote: x.followNote, category: x.category || list[0] }, asAdmin); onSaved(); } catch (e) { setErr(modErr(e, tr)); }
    setBusy(false);
  };
  const lab = "block text-sm font-bold";
  return (
    <Modal title={x.id ? tr("Edit entry", "تعديل السجل") : tr("New behaviour entry", "سجل سلوك جديد")} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lab + " sm:col-span-2"}>{tr("Student", "الطالب")}<select className={field + " mt-1"} value={x.student || ""} disabled={!!x.id} onChange={(e) => setX({ ...x, student: e.target.value })} data-testid="beh-e-student"><option value="">—</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.cls} {s.section}</option>)}</select></label>
        <div className={lab}>{tr("Type", "النوع")}<div className="mt-1 flex gap-2">{(["positive", "concern"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setX({ ...x, kind: k, category: "" })} data-testid={`beh-e-${k}`} className={`flex-1 rounded-full border px-3 py-2 text-sm font-extrabold ${kind === k ? (k === "positive" ? "border-emerald-700 bg-emerald-600 text-white" : "border-rose-700 bg-rose-600 text-white") : "border-black/15 dark:border-white/20"}`}>{k === "positive" ? "🌟 " + tr("Positive", "إيجابي") : "⚠ " + tr("Concern", "ملاحظة")}</button>)}</div></div>
        <label className={lab}>{tr("Date", "التاريخ")}<input type="date" className={field + " mt-1"} value={x.day || todayStr()} max={todayStr()} onChange={(e) => setX({ ...x, day: e.target.value })} /></label>
        <label className={lab}>{tr("Category", "الفئة")}<select className={field + " mt-1"} value={x.category || list[0]} onChange={(e) => setX({ ...x, category: e.target.value })} data-testid="beh-e-cat">{list.map((c) => <option key={c}>{c}</option>)}</select></label>
        {kind === "concern" && <label className={lab}>{tr("Severity", "الخطورة")}<select className={field + " mt-1"} value={x.severity || 1} onChange={(e) => setX({ ...x, severity: Number(e.target.value) })} data-testid="beh-e-sev">{[1, 2, 3].map((n) => <option key={n} value={n}>{tr(...(SEV[n] as [string, string]))}</option>)}</select></label>}
        <label className={lab + " sm:col-span-2"}>{tr("What happened", "ما الذي حدث")}<textarea className={field + " mt-1 min-h-24"} value={x.note || ""} maxLength={1500} onChange={(e) => setX({ ...x, note: e.target.value })} dir="auto" data-testid="beh-e-note" /></label>
        <label className={lab + " sm:col-span-2"}>{tr("Action taken", "الإجراء المتخذ")}<input className={field + " mt-1"} value={x.action || ""} maxLength={600} onChange={(e) => setX({ ...x, action: e.target.value })} dir="auto" data-testid="beh-e-action" /></label>
        <label className={lab}>{tr("Follow-up", "المتابعة")}<select className={field + " mt-1"} value={x.follow || (kind === "concern" && (x.severity || 1) >= 2 ? "open" : "none")} onChange={(e) => setX({ ...x, follow: e.target.value as Beh["follow"] })} data-testid="beh-e-follow">{Object.keys(FOLLOW).map((k) => <option key={k} value={k}>{tr(...FOLLOW[k])}</option>)}</select></label>
        <label className={lab}>{tr("Follow-up note", "ملاحظة المتابعة")}<input className={field + " mt-1"} value={x.followNote || ""} maxLength={600} onChange={(e) => setX({ ...x, followNote: e.target.value })} dir="auto" /></label>
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={!!x.sensitive} onChange={(e) => setX({ ...x, sensitive: e.target.checked })} data-testid="beh-e-sensitive" /> 🔒 {tr("Sensitive — only I and the admin can read this note", "حساس — أنا والإدارة فقط نقرأ هذه الملاحظة")}</label>
        {!x.id && <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={!!x.points} onChange={(e) => setX({ ...x, points: e.target.checked })} data-testid="beh-e-points" /> {tr(`Also ${kind === "positive" ? "award +1" : "deduct 1"} class point`, `وأيضًا ${kind === "positive" ? "منح +1" : "خصم 1"} من نقاط الصف`)}</label>}
      </div>
      {err && <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-900">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className={btn} onClick={onClose}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btnCta} onClick={save} disabled={busy || !x.student} data-testid="beh-e-save">{tr("Save entry", "حفظ السجل")}</button></div>
    </Modal>
  );
}
