"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { isMember, vidApi, type VidInfo } from "@/lib/vid";

const ERR: Record<string, [string, string]> = {
  no_links: ["Links aren't allowed in comments.", "الروابط غير مسموحة في التعليقات."],
  slow_down: ["Please slow down and try again later.", "تمهّل وحاول لاحقًا."],
  name_required: ["Please add your name.", "أضف اسمك من فضلك."],
  empty: ["Write a comment first.", "اكتب تعليقًا أولًا."],
};

/** Our own Like / Share / Comment for a video (stored on our server; nothing goes to YouTube). Share copies a link to this site. */
export function VideoEngage({ id }: { id: string }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [info, setInfo] = useState<VidInfo | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [trap, setTrap] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const member = typeof window !== "undefined" && isMember();
  useEffect(() => { let on = true; vidApi.info(id).then((r) => on && setInfo(r)).catch(() => on && setInfo({ likes: 0, liked: false, comments: [], pendingMine: 0 })); return () => { on = false; }; }, [id]);
  const like = async () => { try { const r = await vidApi.like(id); setInfo((i) => (i ? { ...i, liked: r.liked, likes: r.likes } : i)); } catch { /* ignore */ } };
  const share = async () => {
    const url = `${location.origin}/videos/?v=${encodeURIComponent(id)}`;
    try { await navigator.clipboard.writeText(url); } catch { const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch { /* ignore */ } t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    try {
      const r = await vidApi.comment(id, text.trim(), name.trim(), trap);
      setText("");
      setMsg(r.pending ? tr("Thank you! Your comment will appear after the teacher approves it.", "شكرًا! سيظهر تعليقك بعد موافقة المعلم.") : tr("Comment posted ✓", "تم نشر التعليق ✓"));
      vidApi.info(id).then(setInfo).catch(() => undefined);
    } catch (er) { const m = ERR[(er as Error).message]; setMsg(m ? tr(m[0], m[1]) : tr("Couldn't send. Try again.", "تعذّر الإرسال. حاول مجددًا.")); }
  };
  const btn = "inline-flex items-center gap-1.5 rounded-full border border-card-border bg-card-solid px-4 py-1.5 text-sm font-semibold transition hover:-translate-y-0.5";
  return (
    <div className="space-y-3 border-t border-card-border p-4" data-testid="vid-engage">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${btn} ${info?.liked ? "!border-rose-300 !bg-rose-50 text-rose-700 dark:!bg-rose-900/30 dark:text-rose-200" : ""}`} onClick={like} aria-pressed={!!info?.liked} data-testid="vid-like">{info?.liked ? "♥" : "♡"} {tr("Like", "إعجاب")} <b>{info?.likes ?? 0}</b></button>
        <button type="button" className={btn} onClick={share} data-testid="vid-share">🔗 {copied ? tr("Link copied ✓", "تم نسخ الرابط ✓") : tr("Share", "مشاركة")}</button>
        <span className="text-sm opacity-70">💬 {info?.comments.length ?? 0}</span>
      </div>
      <form onSubmit={send} className="space-y-2" data-testid="vid-form">
        {!member && <input className="w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm sm:w-64" placeholder={tr("Your name", "اسمك")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} dir="auto" data-testid="vid-name" />}
        <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
        <div className="flex gap-2"><textarea rows={1} className="min-h-[40px] flex-1 resize-none rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm" placeholder={tr("Write a comment…", "اكتب تعليقًا…")} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} dir="auto" data-testid="vid-text" /><button type="submit" disabled={text.trim().length < 2} className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-navy disabled:opacity-40" data-testid="vid-post">{tr("Post", "نشر")}</button></div>
        {!member && <p className="text-[11px] opacity-60">{tr("Visitor comments are shown after approval. Students and teachers: sign in to the LMS to comment under your name.", "تعليقات الزوار تظهر بعد الموافقة. الطلاب والمعلمون: سجّلوا الدخول للتعليق باسمكم.")}</p>}
        {msg && <p className="text-sm font-semibold" role="status" data-testid="vid-msg">{msg}</p>}
      </form>
      <ul className="space-y-2" data-testid="vid-comments">
        {(info?.comments || []).map((c, i) => (
          <li key={i} className="rounded-2xl bg-black/[0.04] px-3 py-2 text-sm dark:bg-white/5"><b dir="auto">{c.name}</b>{c.role === "teacher" || c.role === "admin" ? <span className="ms-1 rounded-full bg-sun/40 px-1.5 text-[10px] font-bold">{c.role === "admin" ? tr("Admin", "الإدارة") : tr("Teacher", "معلم")}</span> : null}<span className="ms-2 text-[11px] opacity-60">{new Date(c.at).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}</span><p className="whitespace-pre-wrap" dir="auto">{c.text}</p></li>
        ))}
      </ul>
    </div>
  );
}
