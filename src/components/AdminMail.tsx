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
    <div className="space-y-3" data-testid="admin-mail">
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
  const [compose, setCompose] = useState<null | { key: number; to: string; subject: string; text: string; inReplyTo?: string }>(null);
  const [cMode, setCMode] = useState<"normal" | "min" | "max">("normal");
  const [panel, setPanel] = useState<"normal" | "min" | "max">("normal");
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [err, setErr] = useState("");
  const loadList = useCallback(() => { mailApi.list(folder, page).then(setList).catch((e) => setErr(String(e.message))); }, [folder, page]);
  useEffect(() => { mailApi.folders().then((r) => setFolders(r.folders)).catch((e) => setErr(String(e.message))); }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (panel !== "max") return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel("normal"); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [panel]);
  const openMsg = (uid: number) => { setMsg(null); mailApi.message(folder, uid).then((m) => { setMsg(m); setList((l) => l && { ...l, items: l.items.map((x) => (x.uid === uid ? { ...x, seen: true } : x)) }); }).catch((e) => setErr(String(e.message))); };
  const newCompose = (c: Omit<NonNullable<typeof compose>, "key">) => { setCompose({ ...c, key: Date.now() }); setCMode("normal"); };
  const ctl = "inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10";
  const name = (f: string) => f.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || f;
  const initials = (f: string) => name(f).split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const curFolder = folders.find((f) => f.path === folder);

  const composeWin = compose && (
    cMode === "min" ? (
      <div className="fixed bottom-0 end-4 z-[80] flex w-72 items-center gap-1 rounded-t-2xl bg-header px-3 py-2 text-white shadow-2xl" data-testid="mail-compose-min">
        <button type="button" className="flex-1 truncate text-start text-sm font-semibold" onClick={() => setCMode("normal")}>✏️ {compose.subject || tr("New message", "رسالة جديدة")}</button>
        <button type="button" className={ctl} onClick={() => setCMode("normal")} title={tr("Restore", "استعادة")} aria-label={tr("Restore", "استعادة")}>▴</button>
        <button type="button" className={ctl} onClick={() => setCompose(null)} title={tr("Close", "إغلاق")} aria-label={tr("Close", "إغلاق")}>✕</button>
      </div>
    ) : (
      <div className={cMode === "max" ? "fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" : "fixed bottom-0 end-4 z-[80] w-[min(36rem,calc(100vw-2rem))]"} data-testid="mail-compose-win">
        <div className={`flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-[#0f1a26] ${cMode === "max" ? "h-full max-h-[52rem] w-full max-w-5xl rounded-2xl" : "max-h-[80vh]"}`}>
          <div className="flex items-center gap-1 bg-header px-3 py-2 text-white">
            <b className="flex-1 truncate text-sm">✏️ {compose.inReplyTo ? tr("Reply", "رد") : tr("New message", "رسالة جديدة")}</b>
            <button type="button" className={ctl} onClick={() => setCMode("min")} title={tr("Minimise", "تصغير")} aria-label={tr("Minimise", "تصغير")} data-testid="mail-compose-minimise">—</button>
            <button type="button" className={ctl} onClick={() => setCMode(cMode === "max" ? "normal" : "max")} title={cMode === "max" ? tr("Exit full screen", "إنهاء ملء الشاشة") : tr("Full screen", "ملء الشاشة")} aria-label={tr("Full screen", "ملء الشاشة")}>{cMode === "max" ? "⤡" : "⤢"}</button>
            <button type="button" className={ctl} onClick={() => setCompose(null)} title={tr("Close", "إغلاق")} aria-label={tr("Close", "إغلاق")}>✕</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4"><Compose key={compose.key} init={compose} big={cMode === "max"} onChange={(subject) => setCompose((c) => c && { ...c, subject })} onDone={() => { setCompose(null); loadList(); }} /></div>
        </div>
      </div>
    )
  );

  if (panel === "min") return (
    <>
      <div className={card + " flex items-center gap-3 py-3"} data-testid="mail-panel-min">
        <span className="text-lg">📥</span><b className="flex-1">{tr("Mailbox minimised", "صندوق البريد مصغّر")} {curFolder?.unread ? <span className="ms-2 rounded-full bg-rose-600 px-2 text-xs text-white">{curFolder.unread}</span> : null}</b>
        <button type="button" className={smallBtn} onClick={() => setPanel("normal")} data-testid="mail-panel-restore">▴ {tr("Restore", "استعادة")}</button>
      </div>
      {composeWin}
    </>
  );

  return (
    <>
      <div className={`flex overflow-hidden rounded-3xl border border-black/10 bg-white/80 shadow-sm backdrop-blur dark:border-white/15 dark:bg-white/5 ${panel === "max" ? "fixed inset-0 z-[75] rounded-none" : "h-[calc(100vh-11rem)] min-h-[32rem]"}`} data-testid="mail-panel">
        {/* folders */}
        <nav className={`hidden shrink-0 flex-col border-e border-black/10 p-2 transition-all dark:border-white/10 md:flex ${foldersOpen ? "w-48 xl:w-56" : "w-14"}`} aria-label={tr("Folders", "المجلدات")}>
          <div className="mb-2 flex items-center gap-1">
            <button type="button" className={ctl} onClick={() => setFoldersOpen(!foldersOpen)} aria-expanded={foldersOpen} title={foldersOpen ? tr("Collapse folders", "تصغير المجلدات") : tr("Show folders", "إظهار المجلدات")} data-testid="mail-folders-toggle">☰</button>
            {foldersOpen && <button type="button" className="flex-1 rounded-full bg-sun px-3 py-2 text-sm font-bold text-[#0b1b2b] shadow-sm hover:brightness-105" onClick={() => newCompose({ to: "", subject: "", text: "" })} data-testid="mail-compose">✏️ {tr("Compose", "رسالة جديدة")}</button>}
          </div>
          {!foldersOpen && <button type="button" className={ctl + " mb-2 bg-sun text-[#0b1b2b]"} onClick={() => newCompose({ to: "", subject: "", text: "" })} title={tr("Compose", "رسالة جديدة")}>✏️</button>}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {folders.map((f) => (
              <button key={f.path} type="button" title={f.name} onClick={() => { setList(null); setFolder(f.path); setPage(0); setMsg(null); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm ${folder === f.path ? "bg-header font-bold text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>
                <span aria-hidden>{/inbox/i.test(f.path) ? "📥" : /sent/i.test(f.path) ? "📤" : /draft/i.test(f.path) ? "📝" : /junk|spam/i.test(f.path) ? "⚠️" : /trash|deleted/i.test(f.path) ? "🗑" : /archive/i.test(f.path) ? "🗄" : "📁"}</span>
                {foldersOpen && <span className="flex-1 truncate">{f.name}</span>}
                {foldersOpen && f.unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-xs font-bold text-white">{f.unread}</span>}
              </button>
            ))}
          </div>
        </nav>
        {/* list */}
        <section className={`flex min-w-0 flex-col border-e border-black/10 dark:border-white/10 ${msg ? "hidden lg:flex" : "flex"} w-full lg:w-[19rem] lg:shrink-0 2xl:w-[26rem]`}>
          <div className="flex items-center gap-1 border-b border-black/10 px-3 py-2 dark:border-white/10">
            <select className="rounded-full border border-black/10 bg-transparent px-2 py-1 text-sm md:hidden dark:border-white/15" value={folder} onChange={(e) => { setList(null); setFolder(e.target.value); setPage(0); }} aria-label={tr("Folder", "المجلد")}>{folders.map((f) => <option key={f.path} value={f.path}>{f.name}</option>)}</select>
            <b className="hidden flex-1 truncate md:block">{curFolder?.name || folder}</b><span className="flex-1 md:hidden" />
            <button type="button" className={ctl + " md:hidden"} onClick={() => newCompose({ to: "", subject: "", text: "" })} aria-label={tr("Compose", "رسالة جديدة")}>✏️</button>
            <button type="button" className={ctl} onClick={() => { setList(null); loadList(); }} title={tr("Refresh", "تحديث")} aria-label={tr("Refresh", "تحديث")}>↻</button>
            <button type="button" className={ctl} onClick={() => setPanel("min")} title={tr("Minimise mailbox", "تصغير صندوق البريد")} aria-label={tr("Minimise mailbox", "تصغير صندوق البريد")} data-testid="mail-panel-minimise">—</button>
            <button type="button" className={ctl} onClick={() => setPanel(panel === "max" ? "normal" : "max")} title={panel === "max" ? tr("Exit full screen", "إنهاء ملء الشاشة") : tr("Full screen", "ملء الشاشة")} aria-label={tr("Full screen", "ملء الشاشة")} data-testid="mail-panel-max">{panel === "max" ? "⤡" : "⤢"}</button>
          </div>
          {err && <p className="px-3 py-2 text-sm text-rose-700" role="alert">{err}</p>}
          {!list ? <p className="p-4 opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : (
            <>
              <ul className="min-h-0 flex-1 divide-y divide-black/5 overflow-y-auto dark:divide-white/10" data-testid="mail-list">
                {list.items.map((m) => (
                  <li key={m.uid}>
                    <button type="button" onClick={() => openMsg(m.uid)} className={`flex w-full gap-3 px-4 py-3 text-start transition hover:bg-black/[0.04] dark:hover:bg-white/5 ${msg?.uid === m.uid ? "bg-sun/20" : ""}`} data-testid="mail-row">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${m.seen ? "bg-black/10 dark:bg-white/10" : "bg-header text-white"}`} aria-hidden>{initials(m.from)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2"><span className={`flex-1 truncate ${m.seen ? "" : "font-extrabold"}`} dir="auto">{name(m.from)}</span><span className="shrink-0 text-xs opacity-60">{when(m.date)}</span></span>
                        <span className={`block truncate text-[15px] ${m.seen ? "opacity-80" : "font-semibold"}`} dir="auto">{m.attachments ? "📎 " : ""}{m.subject || tr("(no subject)", "(بدون موضوع)")}</span>
                      </span>
                      {!m.seen && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" aria-label={tr("unread", "غير مقروءة")} />}
                    </button>
                  </li>
                ))}
                {!list.items.length && <li className="p-6 text-center opacity-60">{tr("Nothing here.", "لا يوجد شيء.")}</li>}
              </ul>
              <div className="flex items-center justify-between border-t border-black/10 px-3 py-2 text-sm dark:border-white/10">
                <button type="button" className={ctl} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={tr("Newer", "أحدث")}>‹</button>
                <span className="opacity-70">{list.total ? `${page * 30 + 1}–${Math.min(list.total, page * 30 + 30)} / ${list.total}` : "0"}</span>
                <button type="button" className={ctl} disabled={(page + 1) * 30 >= list.total} onClick={() => setPage(page + 1)} aria-label={tr("Older", "أقدم")}>›</button>
              </div>
            </>
          )}
        </section>
        {/* reading pane */}
        <section className={`min-w-0 flex-1 flex-col ${msg ? "flex" : "hidden lg:flex"}`} data-testid="mail-reader">
          {!msg ? <div className="m-auto text-center opacity-50"><div className="text-5xl">✉️</div><p className="mt-2">{tr("Select a message to read it here.", "اختر رسالة لقراءتها هنا.")}</p></div> : (
            <>
              <div className="space-y-2 border-b border-black/10 px-6 py-4 dark:border-white/10">
                <div className="flex items-start gap-2">
                  <button type="button" className={ctl + " lg:hidden"} onClick={() => setMsg(null)} aria-label={tr("Back", "رجوع")}>‹</button>
                  <h3 className="flex-1 text-2xl font-extrabold leading-snug" dir="auto">{msg.subject || tr("(no subject)", "(بدون موضوع)")}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-header font-bold text-white" aria-hidden>{initials(msg.from)}</span>
                  <div className="min-w-0 flex-1 text-sm"><b dir="auto">{msg.from}</b><div className="truncate opacity-70" dir="auto">{tr("to", "إلى")} {msg.to}{msg.cc ? ` · cc ${msg.cc}` : ""}</div></div>
                  <span className="shrink-0 text-xs opacity-60">{when(msg.date)}</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className={smallBtn} onClick={() => newCompose({ to: msg.replyTo || msg.fromAddr, subject: msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`, text: `\n\n— ${msg.from} wrote on ${when(msg.date)}:\n> ${(msg.text || "").split("\n").slice(0, 40).join("\n> ")}`, inReplyTo: msg.messageId })} data-testid="mail-reply">↩ {tr("Reply", "رد")}</button>
                  <button type="button" className={smallBtn} onClick={() => newCompose({ to: "", subject: msg.subject.startsWith("Fwd:") ? msg.subject : `Fwd: ${msg.subject}`, text: `\n\n---------- Forwarded message ----------\nFrom: ${msg.from}\nDate: ${when(msg.date)}\nSubject: ${msg.subject}\n\n${msg.text || ""}` })}>↪ {tr("Forward", "إعادة توجيه")}</button>
                  <button type="button" className={smallBtn} onClick={() => mailApi.seen(folder, [msg.uid], false).then(loadList)}>● {tr("Mark unread", "غير مقروءة")}</button>
                </div>
                {msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {msg.attachments.map((a) => <button key={a.part} type="button" className={smallBtn} onClick={() => mailApi.part(folder, msg.uid, a.part, a.filename).catch(() => setErr(tr("Download failed", "فشل التنزيل")))}>📎 {a.filename} <span className="opacity-60">{kb(a.size)}</span></button>)}
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {msg.html ? <iframe title={msg.subject} sandbox="" srcDoc={msg.html} className="h-full min-h-[28rem] w-full rounded-xl border border-black/10 bg-white" /> : <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed" dir="auto">{msg.text}</pre>}
              </div>
            </>
          )}
        </section>
      </div>
      {composeWin}
    </>
  );
}

function Compose({ init, onDone, onChange, big }: { init: { to: string; subject: string; text: string; inReplyTo?: string }; onDone: () => void; onChange?: (subject: string) => void; big?: boolean }) {
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
      <p className="text-xs opacity-60">{tr("From", "من")} contact@shaiqmuhammad.com</p>
      <input className={inputCls} placeholder={tr("To (comma-separated)", "إلى (افصل بفاصلة)")} value={m.to} onChange={(e) => setM({ ...m, to: e.target.value })} required dir="ltr" />
      <input className={inputCls} placeholder="Cc" value={m.cc} onChange={(e) => setM({ ...m, cc: e.target.value })} dir="ltr" />
      <input className={inputCls} placeholder={tr("Subject", "الموضوع")} value={m.subject} onChange={(e) => { setM({ ...m, subject: e.target.value }); onChange?.(e.target.value); }} required />
      <textarea className={inputCls + (big ? " min-h-[50vh]" : " min-h-56")} value={m.text} onChange={(e) => setM({ ...m, text: e.target.value })} required dir="auto" />
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
