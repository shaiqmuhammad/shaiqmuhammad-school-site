"use client";

import { useCallback, useEffect, useState } from "react";
import { lmsApi, lmsErrorText, type ParentContact, type ParentMsg, type ParentThread } from "@/lib/lms";
import { useTr } from "@/components/lms/useLms";

const when = (ts: number, ar: boolean) => new Date(ts).toLocaleString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const inp = "w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";

/** Teacher/admin: email parents (by parent name only — the address never leaves the server), see replies, full record. */
export function ParentMailPanel({ asAdmin = false }: { asAdmin?: boolean }) {
  const { tr, lang } = useTr();
  const ar = lang === "ar";
  const [threads, setThreads] = useState<ParentThread[] | null>(null);
  const [contacts, setContacts] = useState<ParentContact[]>([]);
  const [cur, setCur] = useState<ParentThread | null>(null);
  const [msgs, setMsgs] = useState<ParentMsg[]>([]);
  const [compose, setCompose] = useState<ParentContact | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback((sync = false) => lmsApi.parentThreads(sync, asAdmin).then((r) => setThreads(r.items)).catch((e) => { setThreads([]); setErr(lmsErrorText(e, tr)); }), [asAdmin, tr]);
  useEffect(() => { load(true); lmsApi.parentContacts(asAdmin).then((r) => setContacts(r.items)).catch(() => undefined); const t = setInterval(() => { if (!document.hidden) load(true); }, 60_000); return () => clearInterval(t); }, [load, asAdmin]);
  const open = (t: ParentThread) => { setCur(t); setCompose(null); setPreview(""); lmsApi.parentThread(t.thread, asAdmin).then((r) => { setMsgs(r.items); load(); }).catch(() => undefined); };
  const startFor = (c: ParentContact) => { setCompose(c); setCur(null); setSubject(""); setBody(""); setPreview(""); setOk(""); setErr(""); };
  const target = compose || (cur ? contacts.find((c) => c.student === cur.student) || { student: cur.student, studentName: cur.studentName, cls: cur.cls, parentName: cur.parentName, canMail: true } : null);
  const doPreview = async () => { if (!target) return; setErr(""); try { setPreview((await lmsApi.parentPreview(target.student, subject.trim(), body.trim(), asAdmin)).html); } catch (e) { setErr(lmsErrorText(e, tr)); } };
  const doSend = async () => {
    if (!target) return; setBusy(true); setErr("");
    try { await lmsApi.parentSend(target.student, subject.trim(), body.trim(), asAdmin); setOk(tr("Sent ✓", "تم الإرسال ✓")); setPreview(""); setSubject(""); setBody(""); setCompose(null); await load(); }
    catch (e) { setErr(lmsErrorText(e, tr)); }
    setBusy(false);
  };
  const shown = (threads || []).filter((t) => !filter || `${t.studentName} ${t.parentName} ${t.teacherName}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="glass flex h-[min(78vh,760px)] overflow-hidden rounded-3xl" data-testid="parent-panel">
      <aside className={`${cur || compose ? "hidden md:flex" : "flex"} w-full flex-col border-e border-black/5 md:w-80 dark:border-white/10`}>
        <div className="space-y-2 border-b border-black/5 p-3 dark:border-white/10">
          <div className="flex items-center gap-2"><p className="flex-1 font-extrabold">👪 {tr("Parents", "أولياء الأمور")}</p><button type="button" className="rounded-full bg-sun px-3 py-1.5 text-xs font-bold text-[#0b1b2b]" onClick={() => setQ(q ? "" : " ")} data-testid="parent-new">＋ {tr("New", "جديدة")}</button></div>
          <input className={inp} placeholder={tr("Filter by student, parent or teacher…", "تصفية بالطالب أو ولي الأمر أو المعلم…")} value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="parent-filter" />
          {q !== "" && (
            <div><input autoFocus className={inp} placeholder={tr("Find a parent by student or parent name…", "ابحث بالاسم…")} value={q.trim() ? q : ""} onChange={(e) => setQ(e.target.value || " ")} />
              <ul className="mt-1 max-h-48 overflow-y-auto">{contacts.filter((c) => `${c.studentName} ${c.parentName}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50).map((c) => (
                <li key={c.student}><button type="button" disabled={!c.canMail} className="w-full rounded-xl px-2 py-1.5 text-start text-sm hover:bg-sun/20 disabled:opacity-50" onClick={() => { startFor(c); setQ(""); }} data-testid="parent-contact"><b>{c.parentName || tr("Parent", "ولي الأمر")}</b> <span className="opacity-70">· {c.studentName} {c.cls}</span>{!c.canMail && <span className="ms-1 text-[11px]">({tr("no email on file", "لا بريد")})</span>}</button></li>
              ))}</ul></div>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {threads === null ? <li className="p-6 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</li> : !shown.length ? <li className="p-8 text-center" data-testid="parent-empty"><div className="text-5xl">📭</div><p className="mt-2 font-bold">{tr("No parent messages yet", "لا رسائل لأولياء الأمور بعد")}</p></li>
            : shown.map((t) => (
              <li key={t.thread}><button type="button" onClick={() => open(t)} className={`flex w-full items-center gap-3 px-3 py-3 text-start hover:bg-sun/10 ${cur?.thread === t.thread ? "bg-sun/15" : ""}`} data-testid="parent-thread">
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><b className="truncate text-sm">{t.parentName || tr("Parent", "ولي الأمر")} · {t.studentName}</b><span className="ms-auto shrink-0 text-[10px] opacity-60">{when(t.last, ar)}</span></span><span className="block truncate text-xs opacity-70" dir="auto">{asAdmin && <>{t.teacherName}: </>}{t.lastDir === "in" ? "↩ " : "↗ "}{t.preview}</span></span>
                {t.unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{t.unread}</span>}
              </button></li>
            ))}
        </ul>
      </aside>
      <section className={`${cur || compose ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {!target ? <div className="m-auto p-8 text-center opacity-70"><div className="text-6xl">💌</div><p className="mt-2">{tr("Pick a parent conversation or tap New.", "اختر محادثة أو اضغط جديدة.")}</p>{ok && <p className="mt-2 font-bold text-emerald-700" data-testid="parent-ok">{ok}</p>}</div> : <>
          <div className="flex items-center gap-2 border-b border-black/5 p-3 dark:border-white/10"><button type="button" className="rounded-full px-2 py-1 text-sm md:hidden" onClick={() => { setCur(null); setCompose(null); }}>{ar ? "→" : "←"}</button><b className="truncate">{target.parentName || tr("Parent", "ولي الأمر")} · {target.studentName} {target.cls}</b>{asAdmin && cur && <button type="button" className="ms-auto text-xs opacity-60 hover:opacity-100" onClick={() => { if (confirm(tr("Delete this whole record?", "حذف السجل كاملًا؟"))) lmsApi.parentDelete(cur.thread).then(() => { setCur(null); load(); }); }}>🗑️</button>}</div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-black/[0.02] p-4 dark:bg-white/[0.02]" data-testid="parent-list">
            {cur && msgs.map((m) => (<div key={m.id} className={`flex ${m.dir === "out" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.dir === "out" ? "bg-sun text-[#0b1b2b]" : "bg-white dark:bg-white/10"}`}><p className="text-[11px] font-bold opacity-70">{m.dir === "out" ? tr("Sent", "مُرسلة") : tr("Parent reply", "رد ولي الأمر")} · {m.subject}</p><p className="whitespace-pre-wrap" dir="auto">{m.body}</p><p className="mt-0.5 text-[10px] opacity-60">{when(m.created, ar)}</p></div></div>))}
            {preview && <div className="rounded-2xl border border-black/10 bg-white p-2" data-testid="parent-preview"><p className="mb-1 text-xs font-bold">{tr("Preview — this is exactly what the parent receives", "معاينة — هذا ما سيصل ولي الأمر")}</p><iframe title="preview" sandbox="" srcDoc={preview} className="h-72 w-full rounded-xl bg-white" /></div>}
          </div>
          <div className="space-y-2 border-t border-black/5 p-3 dark:border-white/10">
            {err && <p className="text-sm font-bold text-rose-600" data-testid="parent-err">{err}</p>}
            <input className={inp} placeholder={tr("Subject", "الموضوع")} value={subject} onChange={(e) => { setSubject(e.target.value); setPreview(""); }} data-testid="parent-subject" dir="auto" />
            <textarea rows={3} className={inp} placeholder={tr("Message to the parent…", "رسالة إلى ولي الأمر…")} value={body} onChange={(e) => { setBody(e.target.value); setPreview(""); }} data-testid="parent-body" dir="auto" />
            <div className="flex gap-2">
              <button type="button" className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/15" disabled={!subject.trim() || !body.trim()} onClick={doPreview} data-testid="parent-preview-btn">👁 {tr("Preview", "معاينة")}</button>
              <button type="button" className="rounded-full bg-header px-5 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={!preview || busy} onClick={doSend} data-testid="parent-send">{tr("Send to parent", "إرسال إلى ولي الأمر")}</button>
            </div>
            <p className="text-[11px] opacity-60">{tr("Sent from the school address with the school logo. Your own email is never shown; replies come back here.", "تُرسل من عنوان المدرسة بشعارها. لا يظهر بريدك؛ تعود الردود إلى هنا.")}</p>
          </div>
        </>}
      </section>
    </div>
  );
}

/** Read-only record of parent mail about one student (teacher of that class / admin). */
export function ParentLog({ student, asAdmin = false }: { student: string; asAdmin?: boolean }) {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<(ParentMsg & { teacherName: string })[] | null>(null);
  useEffect(() => { lmsApi.parentLog(student, asAdmin).then((r) => setItems(r.items)).catch(() => setItems([])); }, [student, asAdmin]);
  if (!items) return null;
  return <div className="rounded-2xl bg-black/[0.03] p-3 text-sm dark:bg-white/5" data-testid="parent-log"><p className="mb-1 font-bold">👪 {tr("Parent messages about this student", "رسائل أولياء الأمور عن الطالب")}</p>{!items.length ? <p className="opacity-60">{tr("None yet.", "لا شيء بعد.")}</p> : items.map((m) => <p key={m.id} className="border-t border-black/5 py-1 dark:border-white/10"><b>{m.dir === "out" ? `↗ ${m.teacherName}` : "↩ " + tr("Parent", "ولي الأمر")}</b> · {when(m.created, lang === "ar")} — <span dir="auto">{m.subject}: {m.body.slice(0, 160)}</span></p>)}</div>;
}
