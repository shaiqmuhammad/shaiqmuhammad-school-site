"use client";
import { useAdminScope } from "@/components/AdminScope";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/lms/Avatar";
import { DlGate } from "@/components/lms/DlGate";
import { useTr } from "@/components/lms/useLms";
import { clsNum, secLetter } from "@/lib/classFmt";
import { grpLabel, lmsApi, lmsErrorText, stuUi, type LoginCard, type StudentGroup } from "@/lib/lms";
import { qrSvg } from "@/lib/qrLocal";
import { loadNameMode, pickName, type NameMode } from "@/lib/studentName";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
const sc = "rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm dark:border-white/20 dark:bg-black/20";
const urlOf = (t: string) => `${window.location.origin}/lms/qr/?t=${t}`;

/** Student Logins: big cards with username, PIN and a login QR for every student the viewer may see (admin: all; teacher: own classes). */
export function StudentLogins({ asAdmin, perms = [] }: { asAdmin: boolean; perms?: string[] }) {
  const { tr, lang } = useTr();
  const [nameMode, setNameMode] = useState<NameMode>("auto");
  useEffect(() => { loadNameMode(asAdmin).then(setNameMode).catch(() => undefined); }, [asAdmin]);
  const [items, setItems] = useState<LoginCard[] | null>(null);
  const [err, setErr] = useState("");
  const [cls, setCls] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [gsel, setGsel] = useState("");
  const byGroup = !asAdmin;
  useEffect(() => { if (byGroup) lmsApi.grpList(false).then((r) => setGroups(r.items.filter((g) => g.assigned))).catch(() => undefined); }, [byGroup]);
  const canRegen = asAdmin || stuUi(perms, "edit");
  const load = useCallback(() => { lmsApi.loginsList(asAdmin).then((r) => setItems(r.items)).catch((e) => { setItems([]); setErr(lmsErrorText(e, tr)); }); }, [asAdmin, tr]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  const classes = useMemo(() => [...new Set((items || []).map((s) => [s.cls, s.section].join("|")))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [items]);
  const scope = useAdminScope();
  const sids = asAdmin ? scope.studentIds : null;
  const sections = useMemo(() => {
    const ok = (s: LoginCard) => !q || `${s.name} ${s.username}`.toLowerCase().includes(q.toLowerCase());
    const all = (items || []).filter((s) => !sids || sids.has(s.id));
    const out = groups.filter((g) => !gsel || g.id === gsel).map((g) => ({ id: g.id, title: grpLabel(g), students: all.filter((s) => g.students.includes(s.id) && ok(s)) }));
    const inAny = new Set(groups.flatMap((g) => g.students));
    const rest = all.filter((s) => !inAny.has(s.id) && ok(s));
    if (!gsel && rest.length) out.push({ id: "_other", title: tr("Other students", "طلاب آخرون"), students: rest });
    return out;
  }, [items, groups, gsel, q, tr, sids]);
  const list = useMemo(() => byGroup ? [...new Map(sections.flatMap((x) => x.students).map((s) => [s.id, s])).values()] : (items || []).filter((s) => (!sids || sids.has(s.id)) && (!cls || `${s.cls}|${s.section}` === cls || s.cls === cls) && (!q || `${s.name} ${s.username}`.toLowerCase().includes(q.toLowerCase()))), [items, cls, q, byGroup, sections, sids]);
  const classOnly = useMemo(() => [...new Set((items || []).map((s) => s.cls))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [items]);
  const regen = async (s: LoginCard) => {
    if (!confirm(tr(`Make a new QR code for ${s.name}? The old printed QR will stop working.`, `إنشاء رمز QR جديد لـ ${s.name}؟ سيتوقف الرمز المطبوع القديم.`))) return;
    setBusy(s.id);
    try { const r = await lmsApi.loginTokenReset(s.id, asAdmin); setItems((x) => (x || []).map((y) => (y.id === s.id ? { ...y, token: r.token } : y))); } catch (e) { setErr(lmsErrorText(e, tr)); }
    setBusy("");
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { setErr(tr("Allow pop-ups to print.", "اسمح بالنوافذ المنبثقة للطباعة.")); return; }
    const cards = list.map((s) => `<div class="c"><h2 dir="auto">${esc(pickName(s.name, s.nameAr, lang, nameMode))}</h2><p class="k">${esc([clsNum(s.cls), s.section ? secLetter(s.section) : ""].filter(Boolean).join(" · "))}</p><div class="r"><span>User ID</span><b>${esc(s.username)}</b></div><div class="r"><span>PIN</span><b>${esc(s.pin || "—")}</b></div><div class="qr">${qrSvg(urlOf(s.token), 190)}</div><p class="n">Scan to sign in · امسح للدخول</p></div>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Student logins</title><style>body{font-family:system-ui,"Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;margin:12px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.c{border:2px solid #16324f;border-radius:14px;padding:12px;text-align:center;break-inside:avoid}h2{margin:0;font-size:20px;color:#16324f}.k{margin:2px 0 8px;color:#555}.r{display:flex;justify-content:space-between;border-top:1px solid #ddd;padding:5px 4px;font-size:15px}.r b{font-family:monospace;font-size:18px}.qr{margin:8px 0 2px}.n{margin:0;font-size:12px;color:#555}@media print{body{margin:0}}</style></head><body><div class="g">${cards}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
    w.document.close();
  };
  return (
    <div className="space-y-4" data-testid="student-logins">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1"><h2 className="text-2xl font-extrabold tracking-tight">🔑 {tr("Student Logins", "بيانات دخول الطلاب")}</h2><p className="text-sm opacity-70">{tr("Username, PIN and a login QR for each student. Keep these private — anyone with a card can sign in as that student.", "اسم المستخدم والرقم السري ورمز QR لكل طالب. احتفظ بها بسرية — من يملك البطاقة يمكنه الدخول كالطالب.")}</p></div>
        <DlGate kind="export"><button type="button" className={sc + " font-bold"} onClick={print} disabled={!list.length} data-testid="logins-print">🖨 {tr(`Print / PDF (${list.length})`, `طباعة / PDF (${list.length})`)}</button></DlGate>
      </div>
      <div className="flex flex-wrap gap-2">
        {!byGroup && <select className={sc} value={cls} onChange={(e) => setCls(e.target.value)} aria-label={tr("Class", "الصف")} data-testid="logins-class"><option value="">{tr("All classes", "كل الصفوف")}</option>{classOnly.map((c) => <option key={c} value={c}>{clsNum(c)}</option>)}{classes.filter((c) => c.split("|")[1]).map((c) => <option key={c} value={c}>{clsNum(c.split("|")[0])}{secLetter(c.split("|")[1])}</option>)}</select>}
        {byGroup && <div className="flex w-full flex-wrap items-center gap-1.5" data-testid="logins-groups">
          <button type="button" aria-pressed={!gsel} onClick={() => setGsel("")} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${!gsel ? "border-transparent bg-header text-sun" : "border-black/15 bg-white dark:border-white/20 dark:bg-black/20"}`}>{tr("All groups", "كل المجموعات")}</button>
          {groups.map((g) => <button key={g.id} type="button" aria-pressed={gsel === g.id} onClick={() => setGsel(g.id)} data-testid="logins-group-chip" dir="auto" className={`rounded-full border px-3 py-1.5 text-sm font-bold ${gsel === g.id ? "border-transparent bg-header text-sun" : "border-black/15 bg-white dark:border-white/20 dark:bg-black/20"}`}>👥 {grpLabel(g)} ({g.students.length})</button>)}
        </div>}
        <input className={sc + " min-w-[12rem] flex-1"} placeholder={tr("Search name or username…", "ابحث بالاسم أو اسم المستخدم…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="logins-search" />
        <span className="self-center text-sm font-bold" data-testid="logins-count">{list.length}</span>
      </div>
      {err && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm text-rose-800" role="alert">{err}</p>}
      {items === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !list.length ? <p className="rounded-2xl bg-white/70 p-6 text-center opacity-70 dark:bg-white/5" data-testid="logins-empty">{tr("No students to show.", "لا يوجد طلاب.")}</p> : (
        <div className="space-y-6">
          {(byGroup ? sections : [{ id: "_", title: "", students: list }]).map((sec) => (
            <section key={sec.id} data-testid="logins-section">
              {byGroup && <h3 className="mb-3 flex items-center gap-2 text-xl font-extrabold" dir="auto" data-testid="logins-section-title">👥 {sec.title} <span className="rounded-full bg-sun/70 px-2.5 py-0.5 text-sm">{sec.students.length}</span></h3>}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sec.students.map((s) => (
            <article key={sec.id + s.id} className={`rounded-3xl border-2 border-header/80 bg-white p-4 text-center text-[#1b2f44] shadow-sm dark:bg-[#12273b] dark:text-white ${s.disabled ? "opacity-60" : ""}`} data-testid="login-card">
              <div className="flex items-center justify-center gap-2">{s.avatar && <Avatar code={s.avatar} size={36} />}<h3 className="text-lg font-extrabold" dir="auto">{s.name}</h3></div>
              <p className="text-sm opacity-70">{clsNum(s.cls)}{s.section ? secLetter(s.section) : ""}{s.disabled ? ` · ${tr("Blocked", "موقوف")}` : ""}</p>
              <dl className="mt-2 divide-y divide-black/10 rounded-xl bg-black/[0.04] text-start dark:divide-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between gap-2 px-3 py-1.5"><dt className="text-xs font-bold uppercase opacity-60">{tr("User ID", "المعرّف")}</dt><dd className="font-mono text-base font-bold" dir="ltr" data-testid="login-user">{s.username}</dd></div>
                <div className="flex items-center justify-between gap-2 px-3 py-1.5"><dt className="text-xs font-bold uppercase opacity-60">PIN</dt><dd className="font-mono text-xl font-extrabold tracking-widest" dir="ltr" data-testid="login-pin">{s.pin || "—"}</dd></div>
              </dl>
              <div className="mx-auto mt-3 w-fit rounded-2xl bg-white p-2 shadow-inner" data-testid="login-qr" dangerouslySetInnerHTML={{ __html: qrSvg(urlOf(s.token), 200) }} />
              <p className="mt-1 text-xs opacity-60">{tr("Scan to sign in", "امسح للدخول")}</p>
              {canRegen && <button type="button" className="mt-2 rounded-full border border-black/15 px-3 py-1 text-xs font-bold dark:border-white/20" onClick={() => regen(s)} disabled={busy === s.id} data-testid="login-regen">↻ {tr("New QR", "رمز جديد")}</button>}
            </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
