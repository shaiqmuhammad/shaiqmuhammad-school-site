"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Card } from "@/components/Card";
import { type ForumData, listVisibleThreads } from "@/lib/forum";
import { submitForumPost } from "@/lib/forumSubmit";
import { useI18n } from "@/lib/i18n";

const fieldCls =
  "w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";

/**
 * Kids forum. Students never post directly: new threads and replies go to the teacher's
 * moderation queue (Worker) and appear here once approved in Admin → Forum.
 */
export function ForumClient({ initial }: { initial: ForumData }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const openedAt = useRef(0);

  useEffect(() => {
    openedAt.current = Date.now();
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) setSelectedId(hash);
  }, []);

  const threads = listVisibleThreads(initial);
  const thread = selectedId ? initial.threads.find((t) => t.id === selectedId && !t.hidden) : undefined;

  function openThread(id: string) {
    setSelectedId(id);
    setStatus(null);
    window.history.replaceState(null, "", `#${id}`);
  }

  function backToList() {
    setSelectedId(null);
    setStatus(null);
    window.history.replaceState(null, "", "/forum");
  }

  function errorText(code: string): string {
    switch (code) {
      case "too_many_posts":
        return tr("You've sent a lot of posts. Please wait a few minutes and try again.", "أرسلت مشاركات كثيرة. انتظر بضع دقائق ثم حاول مجددًا.");
      case "too_many_links":
      case "blocked_words":
      case "all_caps":
      case "repeated_characters":
        return tr("Please write a kind, normal message (no links or shouting).", "اكتب رسالة لطيفة وعادية (بدون روابط أو أحرف كبيرة).");
      case "title_too_short":
        return tr("Please write a longer title.", "اكتب عنوانًا أطول.");
      case "network":
        return tr("Couldn't send — check your internet connection and try again.", "تعذّر الإرسال — تحقّق من الاتصال وحاول مجددًا.");
      default:
        return tr("Sorry, that couldn't be sent. Please try again.", "عذرًا، تعذّر الإرسال. حاول مجددًا.");
    }
  }

  async function send(kind: "thread" | "reply") {
    const author = name.trim().slice(0, 40);
    const t = title.trim().slice(0, 120);
    const b = body.trim().slice(0, 2000);
    if (!author || !b || (kind === "thread" && !t)) {
      setStatus({ kind: "error", text: kind === "thread" ? tr("Please fill in your display name, a title and a message.", "اكتب اسمك المعروض وعنوانًا ورسالة.") : tr("Please fill in your display name and reply.", "اكتب اسمك المعروض وردّك.") });
      return;
    }
    setSending(true);
    const r = await submitForumPost({
      kind,
      threadId: kind === "reply" ? selectedId || undefined : undefined,
      author,
      title: kind === "thread" ? t : undefined,
      body: b,
      website,
      elapsedMs: Date.now() - openedAt.current,
    });
    setSending(false);
    if (!r.ok) {
      setStatus({ kind: "error", text: errorText(r.error) });
      return;
    }
    setTitle("");
    setBody("");
    setStatus({ kind: "ok", text: tr("Thanks! Your post will appear after the teacher approves it.", "شكرًا! ستظهر مشاركتك بعد موافقة المعلم.") });
  }

  const honeypot = (
    <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
      </label>
    </div>
  );

  const statusLine = status && (
    <p
      role="status"
      data-testid="forum-status"
      className={`rounded-xl px-3 py-2 text-sm ${status.kind === "ok" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"}`}
    >
      {status.text}
    </p>
  );

  const nameInput = (
    <input className={fieldCls} placeholder={tr("Display name", "الاسم المعروض")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required data-testid="forum-name" />
  );

  if (thread) {
    const replies = thread.replies.filter((r) => !r.hidden);
    return (
      <div className="space-y-6">
        <button type="button" onClick={backToList} className="text-sm font-semibold text-primary hover:underline">
          <span className="inline-block rtl:rotate-180">←</span> {tr("All threads", "كل المواضيع")}
        </button>
        <Card>
          <h2 className="text-xl font-extrabold">{thread.title}</h2>
          <p className="mt-1 text-xs text-muted">
            {thread.author} · {new Date(thread.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed" dir="auto">{thread.body}</p>
        </Card>
        <div>
          <h3 className="mb-3 text-lg font-extrabold">{tr("Replies", "الردود")} ({replies.length})</h3>
          <ul className="space-y-3">
            {replies.map((r) => (
              <li key={r.id}>
                <Card className="bg-cream/70! dark:bg-white/5!">
                  <p className="text-xs font-bold text-teal-brand">{r.author}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm" dir="auto">{r.body}</p>
                </Card>
              </li>
            ))}
            {replies.length === 0 && <p className="text-sm text-muted">{tr("No replies yet — be the first to encourage kindly.", "لا توجد ردود بعد — كن أول من يشجّع بلطف.")}</p>}
          </ul>
        </div>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            send("reply");
          }}
          className="glass relative space-y-3 rounded-[18px] p-5"
          data-testid="forum-reply-form"
        >
          <h3 className="font-extrabold">{tr("Add a reply", "أضف ردًّا")}</h3>
          <p className="text-xs text-muted">{tr("Replies are checked by the teacher before they appear.", "يراجع المعلم الردود قبل ظهورها.")}</p>
          {honeypot}
          {nameInput}
          <textarea className={fieldCls + " min-h-24"} placeholder={tr("Kind reply…", "ردّ لطيف…")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required data-testid="forum-body" />
          <button type="submit" disabled={sending} className="btn-cta px-5 py-2 text-sm disabled:opacity-60" data-testid="forum-submit">
            {sending ? tr("Sending…", "جارٍ الإرسال…") : tr("Send reply", "إرسال الرد")}
          </button>
          {statusLine}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {threads.map((t) => {
          const replies = t.replies.filter((r) => !r.hidden).length;
          return (
            <li key={t.id}>
              <button type="button" onClick={() => openThread(t.id)} className="group w-full text-start">
                <Card className="transition group-hover:-translate-y-0.5 group-hover:border-sun-border">
                  <h2 className="text-lg font-extrabold group-hover:text-primary">{t.title}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {t.author} · {replies} {lang === "ar" ? "ردود" : replies === 1 ? "reply" : "replies"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted" dir="auto">{t.body}</p>
                </Card>
              </button>
            </li>
          );
        })}
        {threads.length === 0 && <p className="text-sm text-muted">{tr("No threads yet — start the first one below.", "لا توجد مواضيع بعد — ابدأ أول موضوع بالأسفل.")}</p>}
      </ul>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          send("thread");
        }}
        className="glass glass-emph relative space-y-3 rounded-[20px] p-5"
        data-testid="forum-thread-form"
      >
        <h3 className="font-extrabold">{tr("Start a new thread", "ابدأ موضوعًا جديدًا")}</h3>
        <p className="text-xs text-muted">
          {tr("Display name only — no surnames, phones, or addresses. The teacher checks every post before it appears.", "الاسم المعروض فقط — بدون اسم العائلة أو الهاتف أو العنوان. يراجع المعلم كل مشاركة قبل ظهورها.")}
        </p>
        {honeypot}
        {nameInput}
        <input className={fieldCls} placeholder={tr("Thread title", "عنوان الموضوع")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required data-testid="forum-title" />
        <textarea className={fieldCls + " min-h-24"} placeholder={tr("Your kind question or note…", "سؤالك أو ملاحظتك اللطيفة…")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required data-testid="forum-body" />
        <button type="submit" disabled={sending} className="btn-cta px-5 py-2 text-sm disabled:opacity-60" data-testid="forum-submit">
          {sending ? tr("Sending…", "جارٍ الإرسال…") : tr("Send for approval", "إرسال للمراجعة")}
        </button>
        {statusLine}
      </form>
    </div>
  );
}
