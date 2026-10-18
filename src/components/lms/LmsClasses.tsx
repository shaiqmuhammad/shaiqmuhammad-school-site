"use client";

import { dlGrant } from "@/lib/dl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { PresenceDot } from "@/components/lms/Presence";
import { Avatar } from "@/components/lms/Avatar";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession, type PointCat, type PointRow, type RosterStudent, type StudentGroup } from "@/lib/lms";

const pill = "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm font-bold transition hover:bg-white dark:border-white/15 dark:bg-white/10";
const inp = "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";
const DAY = 86400000;

function Gate({ title, children }: { title: string; children: React.ReactNode }) {
  const { tr } = useTr();
  const [on, setOn] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOn(!!lmsSession()), []);
  return (
    <AssessmentShell title={title} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
        {on === false ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in as a teacher.", "سجّل الدخول كمعلم.")} <a className="font-bold underline" href="/lms/login">{tr("Login", "تسجيل الدخول")}</a></p> : on && children}
      </div>
    </AssessmentShell>
  );
}

function Modal({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-end bg-black/50 p-0 sm:place-items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={label}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 text-heading shadow-2xl dark:bg-[#13202e] dark:text-white sm:rounded-3xl">{children}</div>
    </div>
  );
}

/** Teacher: "My classes" as ClassDojo-style student cards; tap a card to award or deduct points. */
export function LmsClassesPage() {
  const { tr, lang } = useTr();
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [cats, setCats] = useState<PointCat[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [view, setView] = useState<string>(""); // "cls|sec" | "g:<id>" | ""
  const [award, setAward] = useState<RosterStudent[] | null>(null); // students receiving
  const [whole, setWhole] = useState(false);
  const [editCats, setEditCats] = useState(false);
  const [editGrp, setEditGrp] = useState<StudentGroup | "new" | null>(null);
  const [emailFor, setEmailFor] = useState<RosterStudent | null>(null);
  const [toast, setToast] = useState("");
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [lastBatch, setLastBatch] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    lmsApi.classRoster().then((r) => { setRoster(r.students); setCanManage(r.canManage); }).catch((e) => setErr(lmsErrorText(e, tr)));
    lmsApi.pcatList().then((r) => setCats(r.items)).catch(() => undefined);
    lmsApi.grpList().then((r) => setGroups(r.items)).catch(() => undefined);
  }, [tr]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const classes = useMemo(() => [...new Set((roster || []).map((s) => (s.section ? `${s.cls}|${s.section}` : s.cls)))], [roster]);
  const shown = useMemo(() => {
    const all = roster || [];
    if (view.startsWith("g:")) { const g = groups.find((x) => x.id === view.slice(2)); return all.filter((s) => g?.students.includes(s.id)); }
    if (!view) return all;
    const [c, sec] = view.split("|");
    return all.filter((s) => s.cls === c && (!sec || s.section === sec));
  }, [roster, view, groups]);

  const give = async (c: PointCat) => {
    const who = award || [];
    try {
      const r = await lmsApi.ptsAward(c.id, who.map((s) => s.id));
      setLastBatch(r.batch);
      setFlash(Object.fromEntries(who.map((s) => [s.id, c.pts])));
      setRoster((rs) => (rs || []).map((s) => (who.some((w) => w.id === s.id) ? { ...s, points: s.points + c.pts } : s)));
      setToast(`${c.icon} ${c.label} ${c.pts > 0 ? "+" : ""}${c.pts} → ${who.length === 1 ? who[0].name : tr(`${who.length} students`, `${who.length} طلاب`)}`);
      setTimeout(() => setFlash({}), 1400);
    } catch (e) { setErr(lmsErrorText(e, tr)); }
    setAward(null); setWhole(false);
  };
  const undo = async () => { try { const r = await lmsApi.ptsUndo(); setToast(tr(`Undid last award (${r.removed})`, `تم التراجع (${r.removed})`)); setLastBatch(""); load(); } catch (e) { setErr(lmsErrorText(e, tr)); } };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); }, [toast]);

  const label = (v: string) => (v.includes("|") ? v.replace("|", " · ") : v);
  const maxPts = Math.max(1, ...shown.map((s) => s.points));
  return (
    <Gate title={tr("My classes", "صفوفي")}>
      <div className="space-y-5" data-testid="lms-classes">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="me-auto text-2xl font-extrabold">{tr("My classes", "صفوفي")}</h1>
          <button type="button" className={pill} onClick={() => setEditCats(true)} data-testid="cls-cats">🏷 {tr("Skills", "المهارات")}</button>
          <button type="button" className={pill} onClick={undo} data-testid="cls-undo">↶ {tr("Undo last", "تراجع")}</button>
          <a className={pill} href="/lms/points" data-testid="cls-reports">📊 {tr("Points report", "تقرير النقاط")}</a>
          {canManage && <a className={pill} href="/lms/students">👥 {tr("Manage students", "إدارة الطلاب")}</a>}
          <button type="button" disabled={!shown.length} className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] disabled:opacity-50" onClick={() => { setWhole(true); setAward(shown); }} data-testid="cls-whole">⭐ {tr("Whole class", "كل الصف")}</button>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="cls-tabs">
          <button type="button" aria-pressed={!view} onClick={() => setView("")} className={`${pill} ${!view ? "!bg-header !text-sun" : ""}`}>{tr("All", "الكل")} ({roster?.length ?? 0})</button>
          {classes.map((c) => <button key={c} type="button" aria-pressed={view === c} onClick={() => setView(c)} className={`${pill} ${view === c ? "!bg-header !text-sun" : ""}`} data-testid="cls-tab">{label(c)}</button>)}
          {groups.map((g) => <button key={g.id} type="button" aria-pressed={view === "g:" + g.id} onClick={() => setView("g:" + g.id)} className={`${pill} ${view === "g:" + g.id ? "!bg-header !text-sun" : ""}`} data-testid="cls-group-tab">👥 {g.name}</button>)}
          <button type="button" className={pill} onClick={() => setEditGrp("new")} data-testid="cls-new-group">＋ {tr("Group", "مجموعة")}</button>
          {view.startsWith("g:") && <button type="button" className={pill} onClick={() => setEditGrp(groups.find((g) => g.id === view.slice(2)) || null)}>✎ {tr("Edit group", "تعديل المجموعة")}</button>}
        </div>
        {err && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm text-rose-800">{err}</p>}
        {roster === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !shown.length ? <p className="glass rounded-3xl p-8 text-center opacity-80">{tr("No students here yet.", "لا يوجد طلاب هنا بعد.")}</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" data-testid="cls-grid">
            {shown.map((s) => (
              <li key={s.id} className="group relative" data-testid="cls-card">
                <button type="button" onClick={() => { setWhole(false); setAward([s]); }} className="glass relative flex w-full flex-col items-center gap-2 rounded-3xl p-4 pt-5 text-center transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun" aria-label={tr(`Award points to ${s.name}`, `منح نقاط لـ ${s.name}`)}>
                  <span className="relative"><Avatar code={s.avatar} size={72} className="ring-4 ring-white shadow dark:ring-white/10" /><PresenceDot seen={s.seen} className="absolute bottom-1 end-0" /></span>
                  <span className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight" dir="auto" data-testid="cls-name">{s.name}</span>
                  <span className={`rounded-full px-3 py-0.5 text-sm font-extrabold ${s.points < 0 ? "bg-rose-100 text-rose-800" : "bg-sun/80 text-[#0b1b2b]"}`} data-testid="cls-points">{s.points}</span>
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-black/10"><span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(0, Math.round((s.points / maxPts) * 100))}%` }} /></span>
                  {flash[s.id] !== undefined && <span className={`pointer-events-none absolute -top-2 end-3 rounded-full px-2 py-0.5 text-sm font-extrabold text-white shadow ${flash[s.id] > 0 ? "bg-emerald-500" : "bg-rose-500"}`}>{flash[s.id] > 0 ? "+" : ""}{flash[s.id]}</span>}
                </button>
                <div className="absolute start-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
                  <button type="button" title={tr("New avatar", "صورة جديدة")} aria-label={tr("New avatar", "صورة جديدة")} className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-xs shadow dark:bg-[#13202e]" onClick={() => lmsApi.userAvatar(s.id).then((r) => setRoster((rs) => (rs || []).map((x) => (x.id === s.id ? { ...x, avatar: r.avatar } : x))))} data-testid="cls-reroll">🎲</button>
                  <button type="button" title={tr("Email parent report", "إرسال تقرير لولي الأمر")} aria-label={tr("Email report", "إرسال تقرير")} className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-xs shadow dark:bg-[#13202e]" onClick={() => setEmailFor(s)} data-testid="cls-email">✉️</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {award && (
        <Modal onClose={() => { setAward(null); setWhole(false); }} label={tr("Award points", "منح نقاط")}>
          <div className="mb-4 flex items-center gap-3">
            {award.length === 1 ? <Avatar code={award[0].avatar} size={52} /> : <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-sun text-2xl">⭐</span>}
            <div><p className="text-lg font-extrabold" dir="auto">{whole || award.length > 1 ? tr(`Whole class (${award.length})`, `كل الصف (${award.length})`) : award[0].name}</p><p className="text-xs opacity-70">{tr("Tap a skill", "اختر مهارة")}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2" data-testid="award-cats">
            {cats.map((c) => <button key={c.id} type="button" onClick={() => give(c)} className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-start text-sm font-bold ring-1 transition hover:scale-[1.03] ${c.pts > 0 ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`} data-testid="award-cat"><span className="text-2xl">{c.icon || "⭐"}</span><span className="min-w-0 flex-1 truncate">{c.label}</span><span className="font-extrabold">{c.pts > 0 ? "+" : ""}{c.pts}</span></button>)}
          </div>
        </Modal>
      )}
      {editCats && <CatEditor cats={cats} onClose={() => { setEditCats(false); lmsApi.pcatList().then((r) => setCats(r.items)); }} />}
      {editGrp && <GroupEditor group={editGrp === "new" ? null : editGrp} roster={roster || []} onClose={(changed) => { setEditGrp(null); if (changed) { if (editGrp !== "new" && changed === "deleted") setView(""); load(); } }} />}
      {emailFor && <EmailReport student={emailFor} onClose={() => setEmailFor(null)} lang={lang} />}
      {toast && (
        <div className="fixed inset-x-0 bottom-5 z-[2100] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full bg-header px-5 py-2.5 text-sm font-semibold text-white shadow-2xl" role="status" data-testid="cls-toast">
          <span className="truncate">{toast}</span>{lastBatch && <button type="button" className="font-extrabold text-sun underline" onClick={undo}>{tr("Undo", "تراجع")}</button>}
        </div>
      )}
    </Gate>
  );
}

function CatEditor({ cats, onClose }: { cats: PointCat[]; onClose: () => void }) {
  const { tr } = useTr();
  const [list, setList] = useState(cats);
  const [draft, setDraft] = useState({ label: "", pts: 1, icon: "⭐" });
  const reload = () => lmsApi.pcatList().then((r) => setList(r.items));
  return (
    <Modal onClose={onClose} label={tr("Skills", "المهارات")}>
      <h2 className="mb-3 text-lg font-extrabold">{tr("Skills & behaviour", "المهارات والسلوك")}</h2>
      <ul className="space-y-2" data-testid="cat-list">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input className={inp + " !w-12 text-center"} defaultValue={c.icon} maxLength={4} aria-label="icon" onBlur={(e) => e.target.value !== c.icon && lmsApi.pcatSave({ ...c, icon: e.target.value }).then(reload)} />
            <input className={inp} defaultValue={c.label} aria-label="label" onBlur={(e) => e.target.value.trim() && e.target.value !== c.label && lmsApi.pcatSave({ ...c, label: e.target.value }).then(reload)} data-testid="cat-label" />
            <select className={inp + " !w-20"} defaultValue={c.pts} aria-label="points" onChange={(e) => lmsApi.pcatSave({ ...c, pts: Number(e.target.value) }).then(reload)}>{[-5, -3, -2, -1, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n > 0 ? "+" : ""}{n}</option>)}</select>
            <button type="button" className="text-rose-600" aria-label={tr("Delete", "حذف")} onClick={() => lmsApi.pcatDelete(c.id).then(reload)}>🗑</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2 border-t border-black/10 pt-3 dark:border-white/15">
        <input className={inp + " !w-12 text-center"} value={draft.icon} maxLength={4} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} aria-label="icon" />
        <input className={inp} placeholder={tr("New skill, e.g. Kindness", "مهارة جديدة")} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} data-testid="cat-new-label" />
        <select className={inp + " !w-20"} value={draft.pts} onChange={(e) => setDraft({ ...draft, pts: Number(e.target.value) })}>{[-5, -3, -2, -1, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n > 0 ? "+" : ""}{n}</option>)}</select>
        <button type="button" className="rounded-full bg-sun px-3 py-2 text-sm font-bold text-[#0b1b2b]" disabled={!draft.label.trim()} onClick={() => lmsApi.pcatSave(draft).then(() => { setDraft({ label: "", pts: 1, icon: "⭐" }); reload(); })} data-testid="cat-add">＋</button>
      </div>
      <button type="button" className="mt-4 w-full rounded-full bg-header py-2 text-sm font-bold text-white" onClick={onClose}>{tr("Done", "تم")}</button>
    </Modal>
  );
}

function GroupEditor({ group, roster, onClose }: { group: StudentGroup | null; roster: RosterStudent[]; onClose: (changed?: "saved" | "deleted") => void }) {
  const { tr } = useTr();
  const [name, setName] = useState(group?.name || "");
  const [sel, setSel] = useState<string[]>(group?.students || []);
  const [q, setQ] = useState("");
  const list = roster.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal onClose={() => onClose()} label={tr("Group", "مجموعة")}>
      <h2 className="mb-3 text-lg font-extrabold">{group ? tr("Edit group", "تعديل المجموعة") : tr("New group", "مجموعة جديدة")}</h2>
      <input className={inp} placeholder={tr("Group name", "اسم المجموعة")} value={name} onChange={(e) => setName(e.target.value)} data-testid="grp-name" />
      <input className={inp + " mt-2"} placeholder={tr("Search students…", "ابحث عن طالب…")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2 dark:border-white/15">
        {list.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.includes(s.id)} onChange={() => setSel(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])} data-testid="grp-pick" /><Avatar code={s.avatar} size={24} /><span dir="auto">{s.name}</span><span className="opacity-60">{[s.cls, s.section].filter(Boolean).join(" · ")}</span></label>)}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] disabled:opacity-50" disabled={!name.trim()} onClick={() => lmsApi.grpSave({ id: group?.id, name: name.trim(), students: sel }).then(() => onClose("saved"))} data-testid="grp-save">{tr("Save", "حفظ")} ({sel.length})</button>
        {group && <button type="button" className="rounded-full px-3 py-2 text-sm text-rose-600" onClick={() => { if (confirm(tr("Delete this group?", "حذف هذه المجموعة؟"))) lmsApi.grpDelete(group.id).then(() => onClose("deleted")); }} data-testid="grp-delete">🗑 {tr("Delete", "حذف")}</button>}
      </div>
    </Modal>
  );
}

/** Confirm preview, then send the tokenised read-only parent report. Nothing is sent without this explicit click. */
function EmailReport({ student, onClose }: { student: RosterStudent; onClose: () => void; lang: string }) {
  const { tr } = useTr();
  const [kind, setKind] = useState<"points" | "quran">("points");
  const [pv, setPv] = useState<{ to: string; subject: string; paragraphs: string[]; url: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPv(null); setMsg(""); lmsApi.reportEmail(student.id, kind, true).then(setPv).catch((e) => setMsg(lmsErrorText(e, tr))); }, [student.id, kind, tr]);
  const send = async () => { setBusy(true); try { await lmsApi.reportEmail(student.id, kind, false); setMsg(tr("Sent ✓", "تم الإرسال ✓")); } catch (e) { setMsg(lmsErrorText(e, tr)); } setBusy(false); };
  const masked = (m: string) => m.replace(/^(.).*(@.*)$/, "$1•••$2");
  return (
    <Modal onClose={onClose} label={tr("Email report", "إرسال تقرير")}>
      <h2 className="mb-1 text-lg font-extrabold">✉️ {tr("Email report to parent", "إرسال تقرير لولي الأمر")}</h2>
      <p className="mb-3 text-sm opacity-75" dir="auto">{student.name}</p>
      <div className="mb-3 flex gap-2">{(["points", "quran"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`${pill} ${kind === k ? "!bg-header !text-sun" : ""}`} data-testid={`rep-kind-${k}`}>{k === "points" ? tr("Points & behaviour", "النقاط والسلوك") : tr("Quran learning", "تعلّم القرآن")}</button>)}</div>
      {pv ? (
        <div className="space-y-2 rounded-2xl bg-black/5 p-3 text-sm dark:bg-white/10" data-testid="rep-preview">
          <p><b>{tr("To:", "إلى:")}</b> <span dir="ltr">{masked(pv.to)}</span></p>
          <p><b>{tr("From:", "من:")}</b> info@shaiqmuhammad.com</p>
          <p><b>{tr("Subject:", "الموضوع:")}</b> {pv.subject}</p>
          <div className="rounded-xl bg-white p-3 text-heading dark:bg-[#0f1a26] dark:text-white">{pv.paragraphs.map((p, i) => <p key={i} className="mb-1">{p}</p>)}<p className="mt-2 text-xs opacity-70">🔗 {tr("A private read-only link (no login) · contact@shaiqmuhammad.com", "رابط خاص للقراءة فقط (بدون تسجيل دخول)")}</p></div>
          <a className="text-xs underline" href={pv.url} target="_blank" rel="noopener">{tr("Preview the report page", "معاينة صفحة التقرير")}</a>
        </div>
      ) : <p className="text-sm opacity-70">{msg || tr("Loading preview…", "جارٍ تحميل المعاينة…")}</p>}
      {pv && <p className="mt-2 text-sm" role="status">{msg}</p>}
      <div className="mt-4 flex gap-2"><button type="button" disabled={!pv || busy} onClick={() => { if (confirm(tr("Send this email to the parent now?", "إرسال هذا البريد لولي الأمر الآن؟"))) send(); }} className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] disabled:opacity-50" data-testid="rep-send">{tr("Send email", "إرسال")}</button><button type="button" className={pill} onClick={onClose}>{tr("Close", "إغلاق")}</button></div>
    </Modal>
  );
}

/* ---------- Points report page ---------- */
const RANGES: [string, string, string, number][] = [["7", "Last 7 days", "آخر 7 أيام", 7], ["30", "Last 30 days", "آخر 30 يومًا", 30], ["90", "Last 90 days", "آخر 90 يومًا", 90], ["all", "All time", "كل الوقت", 0], ["custom", "Custom", "مخصص", -1]];

export function PointsCharts({ rows, days }: { rows: { at: number; pts: number }[]; days: number }) {
  const { tr } = useTr();
  const span = Math.max(7, Math.min(days || 60, 60));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: span }, (_, i) => ({ t: today.getTime() - (span - 1 - i) * DAY, pos: 0, neg: 0 }));
  for (const r of rows) { const b = buckets[Math.floor((r.at - buckets[0].t) / DAY)]; if (b) { if (r.pts > 0) b.pos += r.pts; else b.neg += r.pts; } }
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.pos, -b.neg)));
  const w = 600, h = 140, bw = w / span;
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" role="img" aria-label={tr("Points per day", "النقاط في اليوم")} data-testid="pts-chart">
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="currentColor" strokeOpacity=".2" />
      {buckets.map((b, i) => <g key={b.t}><rect x={i * bw + 1} width={Math.max(1, bw - 2)} y={h / 2 - (b.pos / max) * (h / 2 - 4)} height={(b.pos / max) * (h / 2 - 4)} rx="2" fill="#10b981" /><rect x={i * bw + 1} width={Math.max(1, bw - 2)} y={h / 2} height={(-b.neg / max) * (h / 2 - 4)} rx="2" fill="#f43f5e" /></g>)}
      <text x="0" y={h + 12} fontSize="10" fill="currentColor" opacity=".6">{new Date(buckets[0].t).toLocaleDateString()}</text>
      <text x={w} y={h + 12} fontSize="10" fill="currentColor" opacity=".6" textAnchor="end">{new Date(buckets[span - 1].t).toLocaleDateString()}</text>
    </svg>
  );
}

export function LmsPointsPage() {
  const { tr, lang } = useTr();
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [rows, setRows] = useState<PointRow[] | null>(null);
  const [view, setView] = useState("");
  const [range, setRange] = useState("30");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [stu, setStu] = useState("");
  const [log, setLog] = useState<{ id: string; student: string; kind: string; to: string; by: string; at: number; ok: boolean }[]>([]);
  useEffect(() => { lmsApi.classRoster().then((r) => setRoster(r.students)).catch(() => undefined); lmsApi.grpList().then((r) => setGroups(r.items)).catch(() => undefined); lmsApi.reportLog().then((r) => setLog(r.items)).catch(() => undefined); }, []);
  const days = range === "custom" ? 0 : Number(RANGES.find((r) => r[0] === range)?.[3] || 0);
  const ids = useMemo(() => {
    if (stu) return [stu];
    if (view.startsWith("g:")) return groups.find((g) => g.id === view.slice(2))?.students || [];
    if (!view) return [];
    const [c, s] = view.split("|");
    return roster.filter((x) => x.cls === c && (!s || x.section === s)).map((x) => x.id);
  }, [stu, view, groups, roster]);
  useEffect(() => {
    const f = range === "custom" ? (from ? new Date(from).getTime() : 0) : days ? Date.now() - days * DAY : 0;
    const t = range === "custom" && to ? new Date(to).getTime() + DAY : undefined;
    lmsApi.ptsList({ students: ids.length ? ids : undefined, from: f, to: t }).then((r) => setRows(view.startsWith("g:") && !ids.length ? [] : r.items)).catch(() => setRows([]));
  }, [ids, range, from, to, days, view]);
  const classes = [...new Set(roster.map((s) => (s.section ? `${s.cls}|${s.section}` : s.cls)))];
  const list = rows || [];
  const pos = list.filter((r) => r.pts > 0).reduce((a, r) => a + r.pts, 0), neg = list.filter((r) => r.pts < 0).reduce((a, r) => a + r.pts, 0);
  const per = new Map<string, { name: string; total: number }>();
  for (const r of list) { const e = per.get(r.student) || { name: r.name, total: 0 }; e.total += r.pts; per.set(r.student, e); }
  const board = [...per.entries()].sort((a, b) => b[1].total - a[1].total);
  const byLabel = new Map<string, number>();
  for (const r of list) byLabel.set(r.label, (byLabel.get(r.label) || 0) + r.pts);
  const topMax = Math.max(1, ...board.map((b) => Math.abs(b[1].total)));
  const fmt = (n: number) => new Date(n).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  return (
    <Gate title={tr("Points report", "تقرير النقاط")}>
      <div className="space-y-5" data-testid="lms-points">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <h1 className="me-auto text-2xl font-extrabold">📊 {tr("Points report", "تقرير النقاط")}</h1>
          <a className={pill} href="/lms/classes">← {tr("My classes", "صفوفي")}</a>
          <button type="button" className={pill} onClick={() => window.print()} data-testid="pts-print">🖨 {tr("Print / PDF", "طباعة / PDF")}</button>
        </div>
        <div className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 print:hidden">
          <select className={inp + " !w-auto"} value={view} onChange={(e) => { setView(e.target.value); setStu(""); }} data-testid="pts-view"><option value="">{tr("All my students", "كل طلابي")}</option>{classes.map((c) => <option key={c} value={c}>{c.replace("|", " · ")}</option>)}{groups.map((g) => <option key={g.id} value={"g:" + g.id}>👥 {g.name}</option>)}</select>
          <select className={inp + " !w-auto"} value={stu} onChange={(e) => setStu(e.target.value)} data-testid="pts-student"><option value="">{tr("Any student", "أي طالب")}</option>{roster.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <div className="flex flex-wrap gap-1.5" data-testid="pts-range">{RANGES.map((r) => <button key={r[0]} type="button" aria-pressed={range === r[0]} onClick={() => setRange(r[0])} className={`${pill} !py-1 ${range === r[0] ? "!bg-header !text-sun" : ""}`}>{tr(r[1], r[2])}</button>)}</div>
          {range === "custom" && <><input type="date" className={inp + " !w-auto"} value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" className={inp + " !w-auto"} value={to} onChange={(e) => setTo(e.target.value)} /></>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[[tr("Net points", "الصافي"), pos + neg, "text-heading"], [tr("Positive", "إيجابية"), `+${pos}`, "text-emerald-600"], [tr("Deductions", "خصومات"), neg, "text-rose-600"], [tr("Entries", "السجلات"), list.length, "text-heading"]].map(([l, v, c], i) => <div key={i} className="glass rounded-3xl p-4"><p className="text-xs font-semibold uppercase opacity-60">{l}</p><p className={`text-3xl font-extrabold ${c}`} data-testid={`pts-stat-${i}`}>{v}</p></div>)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass rounded-3xl p-5"><h2 className="mb-2 font-extrabold">{tr("Points per day", "النقاط يوميًا")}</h2><PointsCharts rows={list} days={days} /></section>
          <section className="glass rounded-3xl p-5"><h2 className="mb-2 font-extrabold">{tr("By skill", "حسب المهارة")}</h2>
            <ul className="space-y-1.5 text-sm">{[...byLabel.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => <li key={l} className="flex items-center gap-2"><span className="w-28 truncate">{l}</span><span className="h-3 flex-1 overflow-hidden rounded-full bg-black/10"><span className={`block h-full ${v < 0 ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${Math.round((Math.abs(v) / Math.max(1, ...[...byLabel.values()].map(Math.abs))) * 100)}%` }} /></span><b className="w-10 text-end">{v}</b></li>)}{!byLabel.size && <li className="opacity-60">{tr("No points yet.", "لا توجد نقاط بعد.")}</li>}</ul></section>
        </div>
        <section className="glass rounded-3xl p-5"><h2 className="mb-2 font-extrabold">🏆 {tr("Totals per student", "المجموع لكل طالب")}</h2>
          <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="pts-board">{board.map(([id, b], i) => <li key={id} className="flex items-center gap-2 text-sm"><span className="w-6 text-center font-bold opacity-60">{i + 1}</span><span className="w-40 truncate" dir="auto">{b.name}</span><span className="h-3 flex-1 overflow-hidden rounded-full bg-black/10"><span className={`block h-full ${b.total < 0 ? "bg-rose-500" : "bg-sun"}`} style={{ width: `${Math.round((Math.abs(b.total) / topMax) * 100)}%` }} /></span><b className="w-10 text-end">{b.total}</b></li>)}{!board.length && <li className="opacity-60">{tr("Nothing in this range.", "لا شيء في هذا النطاق.")}</li>}</ul></section>
        <section className="glass rounded-3xl p-5"><h2 className="mb-2 font-extrabold">{tr("History", "السجل")}</h2>
          <div className="max-h-96 overflow-y-auto"><table className="w-full text-sm" data-testid="pts-history"><thead><tr className="text-start text-xs uppercase opacity-60"><th className="py-1 text-start">{tr("When", "متى")}</th><th className="text-start">{tr("Student", "الطالب")}</th><th className="text-start">{tr("Skill", "المهارة")}</th><th className="text-end">{tr("Pts", "نقاط")}</th><th className="text-start ps-3">{tr("By", "بواسطة")}</th></tr></thead>
            <tbody>{list.slice(0, 300).map((r) => <tr key={r.id} className="border-t border-black/5 dark:border-white/10"><td className="py-1 whitespace-nowrap">{fmt(r.at)}</td><td dir="auto">{r.name}</td><td>{r.icon} {r.label}</td><td className={`text-end font-bold ${r.pts < 0 ? "text-rose-600" : "text-emerald-600"}`}>{r.pts > 0 ? "+" : ""}{r.pts}</td><td className="ps-3 opacity-70">{r.by}</td></tr>)}</tbody></table></div></section>
        {log.length > 0 && <section className="glass rounded-3xl p-5 print:hidden"><h2 className="mb-2 font-extrabold">✉️ {tr("Parent reports sent", "التقارير المرسلة")}</h2><ul className="space-y-1 text-sm" data-testid="rep-log">{log.slice(0, 30).map((l) => <li key={l.id}>{fmt(l.at)} · <b dir="auto">{l.student}</b> · {l.kind === "quran" ? tr("Quran", "القرآن") : tr("Points", "النقاط")} · {l.by} · {l.ok ? "✓" : "✗"}</li>)}</ul></section>}
      </div>
    </Gate>
  );
}

/* ---------- Teacher: results of their assessments ---------- */
export function LmsResultsPage() {
  const { tr, lang } = useTr();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof lmsApi.assessResults>>["items"] | null>(null);
  const [quiz, setQuiz] = useState("");
  const [mode, setMode] = useState("");
  useEffect(() => { lmsApi.assessResults().then((r) => setRows(r.items)).catch(() => setRows([])); }, []);
  const quizzes = [...new Set((rows || []).map((r) => r.quizTitle))];
  const list = (rows || []).filter((r) => (!quiz || r.quizTitle === quiz) && (!mode || r.kind === mode));
  const fmt = (n: number) => new Date(n).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const xlsx = async () => {
    if (!(await dlGrant("export"))) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Results");
    ws.columns = [["Assessment", 30], ["Mode", 11], ["Student", 24], ["Score", 8], ["Max", 8], ["%", 7], ["Correct", 9], ["Wrong", 8], ["Rank", 7], ["Finished", 20]].map(([header, width]) => ({ header: String(header), width: Number(width) }));
    list.forEach((r) => ws.addRow([r.quizTitle, r.kind, r.name, r.score, r.maxScore, r.percentage, r.correct, r.wrong, r.rank ?? "", new Date(r.finishedAt).toISOString().slice(0, 16).replace("T", " ")]));
    ws.getRow(1).font = { bold: true };
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-assessment-results.xlsx"; a.click();
  };
  return (
    <Gate title={tr("Assessment results", "نتائج التقييمات")}>
      <div className="space-y-4" data-testid="lms-results">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <h1 className="me-auto text-2xl font-extrabold">🏅 {tr("Assessment results", "نتائج التقييمات")}</h1>
          <select className={inp + " !w-auto"} value={quiz} onChange={(e) => setQuiz(e.target.value)}><option value="">{tr("All assessments", "كل التقييمات")}</option>{quizzes.map((q) => <option key={q}>{q}</option>)}</select>
          <select className={inp + " !w-auto"} value={mode} onChange={(e) => setMode(e.target.value)}><option value="">{tr("Individual + group", "فردي + جماعي")}</option><option value="individual">{tr("Individual", "فردي")}</option><option value="group">{tr("Group", "جماعي")}</option></select>
          <button type="button" className={pill} onClick={xlsx} disabled={!list.length} data-testid="res-xlsx">⬇ Excel</button>
          <button type="button" className={pill} onClick={() => window.print()}>🖨 PDF</button>
        </div>
        {rows === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !list.length ? <p className="glass rounded-3xl p-8 text-center opacity-80">{tr("No results yet.", "لا توجد نتائج بعد.")}</p> : (
          <div className="glass overflow-x-auto rounded-3xl p-2"><table className="w-full text-sm" data-testid="res-table"><thead><tr className="text-xs uppercase opacity-60">{["Assessment", "Mode", "Student", "Score", "%", "Rank", "Finished"].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{list.map((r) => <tr key={r.id} className="border-t border-black/5 dark:border-white/10"><td className="px-3 py-1.5">{r.quizTitle}</td><td className="px-3">{r.kind === "group" ? tr("Group", "جماعي") : tr("Individual", "فردي")}</td><td className="px-3" dir="auto">{r.name}</td><td className="px-3">{r.score}/{r.maxScore}</td><td className="px-3 font-bold">{r.percentage}%</td><td className="px-3">{r.rank ?? "—"}</td><td className="px-3 whitespace-nowrap">{fmt(r.finishedAt)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </Gate>
  );
}
