"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lmsApi, lmsErrorText, type Announcement, type Catalog, type Msg, type MsgContact, type MsgThread } from "@/lib/lms";
import { useTr } from "@/components/lms/useLms";

const ago = (ts: number, ar: boolean) => new Date(ts).toLocaleString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

/** Header icon with unread message count (polls every 60 s). */
export function MsgIcon({ asAdmin = false, href, onClick }: { asAdmin?: boolean; href?: string; onClick?: () => void }) {
  const { tr } = useTr();
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => { if (!document.hidden) lmsApi.msgThreads(asAdmin).then((r) => setN(asAdmin ? r.items.filter((t) => t.mine).reduce((x, t) => x + t.unread, 0) : r.unread)).catch(() => undefined); };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [asAdmin]);
  const label = n ? tr(`${n} unread messages`, `${n} رسائل غير مقروءة`) : tr("Messages", "الرسائل");
  const inner = (
    <>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8 11h8M8 14h5" /></svg>
      {n > 0 && <span className="absolute -end-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white" data-testid="msg-badge">{n > 99 ? "99+" : n}</span>}
    </>
  );
  const cls = "pill-on-navy relative !p-0 inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition hover:scale-105";
  return href ? <a href={href} className={cls} title={label} aria-label={label} data-testid="msg-icon">{inner}</a> : <button type="button" onClick={onClick} className={cls} title={label} aria-label={label} data-testid="msg-icon">{inner}</button>;
}

/** 1:1 messages. Students → their teachers + admin; teachers → their students + admin; admin sees and moderates every thread. */
export function MessagesPanel({ asAdmin = false }: { asAdmin?: boolean }) {
  const { tr, lang } = useTr();
  const ar = lang === "ar";
  const [threads, setThreads] = useState<MsgThread[] | null>(null);
  const [contacts, setContacts] = useState<MsgContact[]>([]);
  const [cur, setCur] = useState<{ thread?: string; with?: string; name: string; canReply: boolean } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const loadThreads = useCallback(() => lmsApi.msgThreads(asAdmin).then((r) => setThreads(r.items)).catch((e) => setErr(lmsErrorText(e, tr))), [asAdmin, tr]);
  useEffect(() => { loadThreads(); lmsApi.msgContacts(asAdmin).then((r) => setContacts(r.items)).catch(() => undefined); }, [asAdmin, loadThreads]);
  const open = useCallback((c: { thread?: string; with?: string; name: string; canReply: boolean }) => {
    setCur(c); setPicking(false);
    lmsApi.msgThread({ thread: c.thread, with: c.with }, asAdmin).then((r) => { setMsgs(r.items); loadThreads(); setTimeout(() => end.current?.scrollIntoView({ block: "end" }), 50); }).catch(() => undefined);
  }, [asAdmin, loadThreads]);
  const send = async () => {
    if (!cur?.with || !text.trim()) return;
    try { await lmsApi.msgSend(cur.with, text.trim(), asAdmin); setText(""); open(cur); } catch (e) { setErr(lmsErrorText(e, tr)); }
  };
  const showList = !cur;
  return (
    <div className="glass flex h-[min(78vh,760px)] overflow-hidden rounded-3xl" data-testid="msg-panel">
      <aside className={`${showList ? "flex" : "hidden md:flex"} w-full flex-col border-e border-black/5 md:w-80 dark:border-white/10`}>
        <div className="flex items-center gap-2 border-b border-black/5 p-3 dark:border-white/10">
          <p className="flex-1 font-extrabold">💬 {tr("Conversations", "المحادثات")}</p>
          <button type="button" className="rounded-full bg-sun px-3 py-1.5 text-xs font-bold text-[#0b1b2b] transition hover:scale-105" onClick={() => setPicking(!picking)} data-testid="msg-new">＋ {tr("New", "جديدة")}</button>
        </div>
        {picking && (
          <div className="border-b border-black/5 p-3 dark:border-white/10">
            <input autoFocus className="w-full rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-white/5" placeholder={tr("Search people…", "ابحث عن شخص…")} value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="mt-2 max-h-56 overflow-y-auto">
              {contacts.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map((c) => (
                <li key={c.id}><button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-sm hover:bg-sun/20" onClick={() => open({ with: c.id, name: c.name, canReply: true })} data-testid="msg-contact">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-header text-[10px] font-bold text-white">{initials(c.name)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span><span className="text-[11px] opacity-60">{c.role === "admin" ? tr("Admin", "الإدارة") : c.role === "teacher" ? tr("Teacher", "معلم") : c.cls}</span>
                </button></li>
              ))}
            </ul>
          </div>
        )}
        <ul className="flex-1 overflow-y-auto">
          {threads === null ? <li className="p-6 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</li>
            : !threads.length ? <li className="p-8 text-center" data-testid="msg-empty"><div className="text-5xl">📭</div><p className="mt-2 font-bold">{tr("No messages yet", "لا رسائل بعد")}</p><p className="text-sm opacity-70">{tr("Tap “New” to say salaam!", "اضغط «جديدة» لإرسال السلام!")}</p></li>
            : threads.map((t) => (
              <li key={t.thread}>
                <button type="button" onClick={() => open({ thread: t.thread, with: t.mine ? t.with : undefined, name: t.mine ? t.withName : t.people.join(" ↔ "), canReply: t.mine })} className={`flex w-full items-center gap-3 px-3 py-3 text-start transition hover:bg-sun/10 ${cur?.thread === t.thread ? "bg-sun/15" : ""}`} data-testid="msg-thread">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#16324b] to-[#24557d] text-xs font-bold text-white">{initials(t.mine ? t.withName : t.people[0])}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><b className="truncate text-sm">{t.mine ? t.withName : t.people.join(" ↔ ")}</b><span className="ms-auto shrink-0 text-[10px] opacity-60">{ago(t.last, ar)}</span></span><span className="block truncate text-xs opacity-70" dir="auto">{t.preview}</span></span>
                  {t.unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{t.unread}</span>}
                </button>
              </li>
            ))}
        </ul>
      </aside>
      <section className={`${showList ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col`}>
        {!cur ? <div className="m-auto p-8 text-center opacity-70"><div className="text-6xl">💌</div><p className="mt-2">{tr("Pick a conversation or start a new one.", "اختر محادثة أو ابدأ واحدة جديدة.")}</p></div> : <>
          <div className="flex items-center gap-2 border-b border-black/5 p-3 dark:border-white/10">
            <button type="button" className="rounded-full px-2 py-1 text-sm md:hidden" onClick={() => setCur(null)} aria-label={tr("Back", "رجوع")}>{ar ? "→" : "←"}</button>
            <b className="truncate">{cur.name}</b>
            {!cur.canReply && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{tr("Moderation view", "عرض الإشراف")}</span>}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-black/[0.02] p-4 dark:bg-white/[0.02]" data-testid="msg-list">
            {msgs.map((m) => (
              <div key={m.id} className={`group flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.mine ? "rounded-ee-md bg-sun text-[#0b1b2b]" : "rounded-es-md bg-white dark:bg-white/10"}`}>
                  <p className="whitespace-pre-wrap" dir="auto">{m.body}</p>
                  <p className="mt-0.5 text-[10px] opacity-60">{ago(m.created, ar)}{asAdmin && <button type="button" className="ms-2 opacity-0 transition group-hover:opacity-100" onClick={() => lmsApi.msgDelete(m.id).then(() => open(cur))} title={tr("Delete", "حذف")}>🗑️</button>}</p>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          {cur.canReply && cur.with && (
            <form className="flex gap-2 border-t border-black/5 p-3 dark:border-white/10" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="min-h-[42px] flex-1 resize-none rounded-2xl border border-black/10 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5" placeholder={tr("Write a message…", "اكتب رسالة…")} data-testid="msg-input" dir="auto" />
              <button type="submit" disabled={!text.trim()} className="rounded-full bg-header px-4 text-sm font-bold text-white transition hover:scale-105 disabled:opacity-50" data-testid="msg-send">{tr("Send", "إرسال")}</button>
            </form>
          )}
        </>}
        {err && <p className="px-3 pb-2 text-sm text-rose-700">{err}</p>}
      </section>
    </div>
  );
}

/** Announcements feed in the student/teacher dashboards. */
export function AnnFeed() {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => { lmsApi.annList().then((r) => setItems(r.items)).catch(() => undefined); }, []);
  if (!items.length) return null;
  return (
    <section className="space-y-2" data-testid="ann-feed">
      {items.slice(0, 3).map((a) => (
        <div key={a.id} className="flex gap-3 rounded-3xl border border-[var(--yellow-border,#f5c84a)] bg-gradient-to-r from-amber-50 to-white p-4 shadow-sm dark:from-amber-900/20 dark:to-transparent">
          <span className="text-2xl" aria-hidden>📣</span>
          <div className="min-w-0"><p className="font-extrabold" dir="auto">{a.title}</p>{a.body && <p className="mt-0.5 whitespace-pre-wrap text-sm opacity-80" dir="auto">{a.body}</p>}<p className="mt-1 text-[11px] opacity-60">{a.by} · {new Date(a.created).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}</p></div>
        </div>
      ))}
      {!items.length && <p>{tr("No announcements", "لا إعلانات")}</p>}
    </section>
  );
}

/** Admin: send a targeted announcement (all / students / teachers / class+section) — also notifies each person. */
export function LmsAnnounceAdmin() {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<Announcement[]>([]);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [f, setF] = useState<{ title: string; body: string; aud: Announcement["aud"]; cls: string; section: string }>({ title: "", body: "", aud: "all", cls: "", section: "" });
  const [msg, setMsg] = useState("");
  const load = useCallback(() => lmsApi.annList(true).then((r) => setItems(r.items)).catch(() => undefined), []);
  useEffect(() => { load(); lmsApi.catalog(true).then(setCat).catch(() => undefined); }, [load]);
  const input = "w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";
  const audLabel = (a: Announcement) => a.aud === "all" ? tr("Everyone", "الجميع") : a.aud === "students" ? tr("All students", "كل الطلاب") : a.aud === "teachers" ? tr("All teachers", "كل المعلمين") : `${a.cls}${a.section ? " · " + a.section : ""}`;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form className="glass space-y-3 rounded-3xl p-5" onSubmit={async (e) => { e.preventDefault(); try { const r = await lmsApi.annSave(f); setMsg(tr(`Sent to ${r.sent} people ✓`, `أُرسل إلى ${r.sent} شخصًا ✓`)); setF({ ...f, title: "", body: "" }); load(); } catch (er) { setMsg(lmsErrorText(er, tr)); } }} data-testid="ann-form">
        <p className="text-lg font-extrabold">📣 {tr("New announcement", "إعلان جديد")}</p>
        <input className={input} placeholder={tr("Title", "العنوان")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required data-testid="ann-title" />
        <textarea className={input} rows={4} placeholder={tr("Message (optional)", "الرسالة (اختياري)")} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          {([["all", tr("Everyone", "الجميع")], ["students", tr("All students", "كل الطلاب")], ["teachers", tr("All teachers", "كل المعلمين")], ["class", tr("A class / section", "صف / شعبة")]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, aud: k })} className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-black/10 transition ${f.aud === k ? "bg-sun text-[#0b1b2b]" : "bg-white/70 dark:bg-white/5"}`} data-testid={`ann-aud-${k}`}>{l}</button>)}
        </div>
        {f.aud === "class" && (
          <div className="grid grid-cols-2 gap-2">
            <select className={input} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value, section: "" })} required><option value="">{tr("Class…", "الصف…")}</option>{(cat?.classes || []).map((c) => <option key={c.name}>{c.name}</option>)}</select>
            <select className={input} value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}><option value="">{tr("All sections", "كل الشعب")}</option>{(cat?.sections || []).filter((s) => s.cls === f.cls).map((s) => <option key={s.name}>{s.name}</option>)}</select>
          </div>
        )}
        <div className="flex items-center gap-3"><button type="submit" className="rounded-full bg-header px-5 py-2 text-sm font-bold text-white transition hover:scale-105" data-testid="ann-send">{tr("Send announcement", "إرسال الإعلان")}</button><span className="text-sm">{msg}</span></div>
      </form>
      <div className="glass rounded-3xl p-5">
        <p className="mb-3 text-lg font-extrabold">{tr("Sent", "المُرسلة")}</p>
        {!items.length ? <p className="py-6 text-center opacity-70">🌤️ {tr("No announcements yet.", "لا إعلانات بعد.")}</p> : (
          <ul className="space-y-2">{items.map((a) => <li key={a.id} className="flex items-start gap-3 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5"><div className="min-w-0 flex-1"><p className="font-bold" dir="auto">{a.title}</p><p className="text-xs opacity-70">{audLabel(a)} · {new Date(a.created).toLocaleString(lang === "ar" ? "ar" : "en-GB")}</p></div><button type="button" className="text-sm opacity-60 hover:opacity-100" onClick={() => lmsApi.annDelete(a.id).then(load)} title={tr("Delete", "حذف")}>🗑️</button></li>)}</ul>
        )}
      </div>
    </div>
  );
}
