"use client";

import { useCallback, useEffect, useState } from "react";
import { mailApi, type ContactMsg, type Folder, type MailItem, type MailMessage, type OutAttachment } from "@/lib/mail";
import { card, inputCls, smallBtn, useTr } from "@/components/lms/useLms";

const when = (v: string | number) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Admin → Mail: contact@ inbox (iCloud IMAP/SMTP via the Worker) + website contact-form messages. */
export function AdminMail() {
  const { tr } = useTr();
  const [ready, setReady] = useState<boolean | null>(null);
  const [view, setView] = useState<"inbox" | "contact">("inbox");
  useEffect(() => { mailApi.status().then((r) => { setReady(r.ready); if (!r.ready) setView("contact"); }).catch(() => setReady(false)); }, []);
  return (
    <div className="space-y-4" data-testid="admin-mail">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold">✉️ {tr("Mail", "البريد")}</h2>
        <span className="text-sm opacity-60">contact@shaiqmuhammad.com</span>
        <span className="flex-1" />
        <button type="button" className={smallBtn} aria-pressed={view === "inbox"} onClick={() => setView("inbox")} data-testid="mail-tab-inbox">📥 {tr("Inbox", "الوارد")}</button>
        <button type="button" className={smallBtn} aria-pressed={view === "contact"} onClick={() => setView("contact")} data-testid="mail-tab-contact">📝 {tr("Contact form", "نموذج التواصل")}</button>
      </div>
      {view === "contact" ? <ContactList /> : ready === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : ready ? <Inbox /> : (
        <p className={card + " border-amber-300 bg-amber-50 dark:bg-amber-900/30"} data-testid="mail-not-ready">
          {tr("Email isn't connected yet. Once the iCloud app password is added, the contact@ inbox appears here (read, reply, compose, attachments) and notifications are emailed automatically. Meanwhile, contact-form messages are saved under “Contact form”.", "البريد غير متصل بعد. بعد إضافة كلمة مرور تطبيق iCloud سيظهر صندوق contact@ هنا وستُرسل الإشعارات تلقائيًا. حتى ذلك الحين تُحفظ رسائل نموذج التواصل في «نموذج التواصل».")}
        </p>
      )}
    </div>
  );
}

function ContactList() {
  const { tr } = useTr();
  const [d, setD] = useState<{ items: ContactMsg[]; unread: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { mailApi.contacts().then(setD).catch(() => setD({ items: [], unread: 0 })); }, []);
  if (!d) return <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>;
  if (!d.items.length) return <p className={card + " opacity-70"}>{tr("No contact-form messages yet.", "لا رسائل بعد.")}</p>;
  return (
    <ul className="space-y-2" data-testid="contact-list">
      {d.items.map((m) => (
        <li key={m.id} className={card + ` space-y-2 py-3 ${m.read ? "" : "border-sky-300 bg-sky-50/60 dark:bg-sky-900/20"}`} data-testid="contact-item">
          <button type="button" className="flex w-full flex-wrap items-baseline gap-2 text-start" onClick={() => { setOpen(open === m.id ? null : m.id); if (!m.read) mailApi.contactRead(m.id).then(setD).catch(() => undefined); }} aria-expanded={open === m.id}>
            {!m.read && <span className="h-2 w-2 rounded-full bg-sky-500" aria-label={tr("unread", "غير مقروءة")} />}
            <b dir="auto">{m.name}</b><span className="text-sm opacity-70" dir="ltr">{m.email}</span>
            <span className="flex-1 truncate font-semibold" dir="auto">{m.subject || tr("(no subject)", "(بدون موضوع)")}</span>
            <span className="text-xs opacity-60">{when(m.created)} {m.emailed ? "· ✉️ " + tr("emailed", "أُرسلت") : ""}</span>
          </button>
          {open === m.id && (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap rounded-xl bg-black/5 p-3 text-sm dark:bg-white/10" dir="auto">{m.message}</p>
              <div className="flex gap-2">
                <a className={smallBtn} href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "Your message"))}`}>↩ {tr("Reply", "رد")}</a>
                <button type="button" className={smallBtn + " text-rose-600"} onClick={() => { if (confirm(tr("Delete this message?", "حذف هذه الرسالة؟"))) mailApi.contactDelete(m.id).then(setD).catch(() => undefined); }}>🗑 {tr("Delete", "حذف")}</button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Inbox() {
  const { tr } = useTr();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [page, setPage] = useState(0);
  const [list, setList] = useState<{ total: number; items: MailItem[] } | null>(null);
  const [msg, setMsg] = useState<MailMessage | null>(null);
  const [compose, setCompose] = useState<null | { to: string; subject: string; text: string; inReplyTo?: string }>(null);
  const [err, setErr] = useState("");
  const loadList = useCallback(() => { mailApi.list(folder, page).then(setList).catch((e) => setErr(String(e.message))); }, [folder, page]);
  useEffect(() => { mailApi.folders().then((r) => setFolders(r.folders)).catch((e) => setErr(String(e.message))); }, []);
  useEffect(() => { loadList(); }, [loadList]);
  const openMsg = (uid: number) => { setMsg(null); mailApi.message(folder, uid).then((m) => { setMsg(m); setList((l) => l && { ...l, items: l.items.map((x) => (x.uid === uid ? { ...x, seen: true } : x)) }); }).catch((e) => setErr(String(e.message))); };
  return (
    <div className="grid gap-3 lg:grid-cols-[13rem_minmax(0,22rem)_1fr]">
      <nav className={card + " space-y-1 p-2"} aria-label={tr("Folders", "المجلدات")}>
        <button type="button" className={smallBtn + " mb-2 w-full justify-center"} onClick={() => setCompose({ to: "", subject: "", text: "" })} data-testid="mail-compose">✏️ {tr("Compose", "رسالة جديدة")}</button>
        {folders.map((f) => (
          <button key={f.path} type="button" onClick={() => { setList(null); setFolder(f.path); setPage(0); setMsg(null); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-start text-sm ${folder === f.path ? "bg-header font-bold text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>
            <span className="truncate">{f.name}</span>{f.unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-xs font-bold text-white">{f.unread}</span>}
          </button>
        ))}
      </nav>
      <section className={card + " p-0"}>
        {err && <p className="px-3 py-2 text-sm text-rose-700" role="alert">{err}</p>}
        {!list ? <p className="p-4 opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : (
          <>
            <ul className="max-h-[70vh] divide-y divide-black/5 overflow-y-auto dark:divide-white/10">
              {list.items.map((m) => (
                <li key={m.uid}>
                  <button type="button" onClick={() => openMsg(m.uid)} className={`block w-full px-3 py-2 text-start hover:bg-black/5 dark:hover:bg-white/5 ${msg?.uid === m.uid ? "bg-sun/20" : ""} ${m.seen ? "" : "font-bold"}`}>
                    <span className="flex gap-2 text-sm"><span className="flex-1 truncate" dir="auto">{m.from}</span><span className="shrink-0 text-xs opacity-60">{when(m.date)}</span></span>
                    <span className="block truncate text-sm" dir="auto">{m.attachments ? "📎 " : ""}{m.subject || tr("(no subject)", "(بدون موضوع)")}</span>
                  </button>
                </li>
              ))}
              {!list.items.length && <li className="p-4 opacity-60">{tr("Empty.", "فارغ.")}</li>}
            </ul>
            <div className="flex items-center justify-between border-t border-black/5 px-3 py-2 text-sm dark:border-white/10">
              <button type="button" className={smallBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
              <span>{page * 30 + 1}–{Math.min(list.total, page * 30 + 30)} / {list.total}</span>
              <button type="button" className={smallBtn} disabled={(page + 1) * 30 >= list.total} onClick={() => setPage(page + 1)}>›</button>
            </div>
          </>
        )}
      </section>
      <section className={card + " min-w-0 space-y-3"}>
        {compose ? <Compose init={compose} onDone={() => { setCompose(null); loadList(); }} /> : !msg ? <p className="opacity-60">{tr("Select a message.", "اختر رسالة.")}</p> : (
          <>
            <h3 className="text-xl font-bold" dir="auto">{msg.subject || tr("(no subject)", "(بدون موضوع)")}</h3>
            <p className="text-sm opacity-80" dir="auto"><b>{msg.from}</b> → {msg.to}{msg.cc ? ` · cc ${msg.cc}` : ""} · {when(msg.date)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallBtn} onClick={() => setCompose({ to: msg.replyTo || msg.fromAddr, subject: msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`, text: `\n\n— ${msg.from} wrote on ${when(msg.date)}:\n> ${(msg.text || "").split("\n").slice(0, 40).join("\n> ")}`, inReplyTo: msg.messageId })} data-testid="mail-reply">↩ {tr("Reply", "رد")}</button>
              <button type="button" className={smallBtn} onClick={() => mailApi.seen(folder, [msg.uid], false).then(loadList)}>● {tr("Mark unread", "غير مقروءة")}</button>
            </div>
            {msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {msg.attachments.map((a) => <button key={a.part} type="button" className={smallBtn} onClick={() => mailApi.part(folder, msg.uid, a.part, a.filename).catch(() => setErr(tr("Download failed", "فشل التنزيل")))}>📎 {a.filename} <span className="opacity-60">{kb(a.size)}</span></button>)}
              </div>
            )}
            {msg.html ? <iframe title={msg.subject} sandbox="" srcDoc={msg.html} className="h-[60vh] w-full rounded-xl border border-black/10 bg-white" /> : <pre className="whitespace-pre-wrap font-sans text-sm" dir="auto">{msg.text}</pre>}
          </>
        )}
      </section>
    </div>
  );
}

function Compose({ init, onDone }: { init: { to: string; subject: string; text: string; inReplyTo?: string }; onDone: () => void }) {
  const { tr } = useTr();
  const [m, setM] = useState({ ...init, cc: "" });
  const [files, setFiles] = useState<OutAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const addFiles = async (list: FileList | null) => {
    for (const f of Array.from(list || []).slice(0, 5)) {
      if (f.size > 5 * 1048576) { setErr(tr(`${f.name} is over 5 MB`, `${f.name} أكبر من 5 ميغابايت`)); continue; }
      const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.readAsDataURL(f); });
      setFiles((x) => [...x, { filename: f.name, contentType: f.type || "application/octet-stream", base64: b64 }]);
    }
  };
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(""); try { await mailApi.send({ ...m, attachments: files }); onDone(); } catch (x) { setErr(String((x as Error).message)); } setBusy(false); }} data-testid="mail-compose-form">
      <h3 className="text-lg font-bold">✏️ {init.inReplyTo ? tr("Reply", "رد") : tr("New message", "رسالة جديدة")} <span className="text-sm font-normal opacity-60">· {tr("from", "من")} contact@shaiqmuhammad.com</span></h3>
      <input className={inputCls} placeholder={tr("To (comma-separated)", "إلى (افصل بفاصلة)")} value={m.to} onChange={(e) => setM({ ...m, to: e.target.value })} required dir="ltr" />
      <input className={inputCls} placeholder="Cc" value={m.cc} onChange={(e) => setM({ ...m, cc: e.target.value })} dir="ltr" />
      <input className={inputCls} placeholder={tr("Subject", "الموضوع")} value={m.subject} onChange={(e) => setM({ ...m, subject: e.target.value })} required />
      <textarea className={inputCls + " min-h-56"} value={m.text} onChange={(e) => setM({ ...m, text: e.target.value })} required dir="auto" />
      <div className="flex flex-wrap items-center gap-2">
        <label className={smallBtn + " cursor-pointer"}>📎 {tr("Attach", "إرفاق")}<input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} /></label>
        {files.map((f, i) => <span key={i} className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">{f.filename} <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={tr("Remove", "إزالة")}>✕</button></span>)}
        <span className="flex-1" />
        <button type="button" className={smallBtn} onClick={onDone}>{tr("Cancel", "إلغاء")}</button>
        <button type="submit" className={smallBtn + " bg-header! text-white!"} disabled={busy}>{busy ? "…" : tr("Send", "إرسال")}</button>
      </div>
      {err && <p className="text-sm text-rose-700" role="alert">{err}</p>}
    </form>
  );
}
