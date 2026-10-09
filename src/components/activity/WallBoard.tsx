"use client";

import { useState } from "react";
import { fieldCls, ghostBtn, primaryBtn } from "@/components/assessment/AssessmentShell";
import { activityApi, ActivityError, compressImage, type ActivityItem, type ActivityState, type Who } from "@/lib/activity";
import { useI18n } from "@/lib/i18n";

const COLOR_CLS: Record<string, string> = {
  "": "bg-white/85 dark:bg-[#132a40]/85",
  yellow: "bg-amber-100 dark:bg-amber-900/45",
  teal: "bg-teal-100 dark:bg-teal-900/45",
  rose: "bg-rose-100 dark:bg-rose-900/45",
  sky: "bg-sky-100 dark:bg-sky-900/45",
  violet: "bg-violet-100 dark:bg-violet-900/45",
  lime: "bg-lime-100 dark:bg-lime-900/45",
};
const SWATCH: Record<string, string> = { "": "bg-white", yellow: "bg-amber-300", teal: "bg-teal-400", rose: "bg-rose-400", sky: "bg-sky-400", violet: "bg-violet-400", lime: "bg-lime-400" };

export function errorText(e: unknown, tr: (en: string, ar: string) => string): string {
  const c = e instanceof ActivityError ? e.code : "";
  const map: Record<string, [string, string]> = {
    slow_down: ["Slow down a little and try again.", "تمهّل قليلًا ثم حاول مجددًا."],
    closed: ["Posting is closed.", "النشر مغلق."],
    language: ["Please use kind words.", "من فضلك استخدم كلمات طيبة."],
    image_too_large: ["That picture is too large.", "الصورة كبيرة جدًا."],
    images_full: ["This wall has reached its picture limit.", "وصل الجدار إلى حد الصور."],
    full: ["This activity is full.", "هذا النشاط ممتلئ."],
    empty: ["Write something first.", "اكتب شيئًا أولًا."],
    removed: ["You have been removed by the teacher.", "لقد أزالك المعلم."],
    network: ["No connection — try again.", "لا يوجد اتصال — حاول مرة أخرى."],
    no_images: ["Pictures are turned off.", "الصور متوقفة."],
  };
  const m = map[c];
  return m ? tr(m[0], m[1]) : tr("Something went wrong.", "حدث خطأ ما.");
}

/** Post box for the wall (students and teacher). Pictures are shrunk in the browser to ≤200 KB. */
export function WallComposer({ code, who, state, onPosted, stage, kind }: { code: string; who: Who; state: ActivityState; onPosted: () => void; stage?: string; kind?: string }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const isHost = "hostKey" in who;
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [image, setImage] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const allowImages = isHost || state.settings.allowImages;
  const allowLinks = isHost || state.settings.allowLinks;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const yt = /youtu\.?be/.test(link) ? link : "";
      const r = await activityApi.post(code, who, { text, link: yt ? "" : link, youtube: yt, image, stage, kind });
      setText("");
      setLink("");
      setImage("");
      setMore(false);
      setMsg(r.status === "pending" ? tr("Sent! Your teacher will approve it soon.", "تم الإرسال! سيوافق عليه المعلم قريبًا.") : tr("Posted!", "تم النشر!"));
      onPosted();
    } catch (err) {
      setMsg(errorText(err, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-3xl p-4 sm:p-5" data-testid="wall-composer">
      <label className="sr-only" htmlFor={`wall-text-${code}`}>{tr("Your post", "مشاركتك")}</label>
      <textarea
        id={`wall-text-${code}`}
        className={fieldCls + " mt-0 min-h-24 resize-y text-lg"}
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        placeholder={isHost ? tr("Post to the wall as the teacher…", "انشر على الجدار بصفتك المعلم…") : tr("Share your idea…", "شارك فكرتك…")}
        data-testid="wall-text"
      />
      {image && (
        <div className="relative mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="max-h-40 rounded-2xl" />
          <button type="button" onClick={() => setImage("")} className="absolute -end-2 -top-2 h-8 w-8 rounded-full bg-rose-600 text-white" aria-label={tr("Remove picture", "إزالة الصورة")}>✕</button>
        </div>
      )}
      {more && allowLinks && (
        <input className={fieldCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder={tr("Link or YouTube URL (optional)", "رابط أو رابط يوتيوب (اختياري)")} inputMode="url" dir="ltr" data-testid="wall-link" />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {allowImages && (
          <label className={ghostBtn + " cursor-pointer"} data-testid="wall-picture-label">
            🖼️ {tr("Picture", "صورة")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid="wall-picture"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setImage(await compressImage(f));
                } catch {
                  setMsg(tr("Couldn't use that picture.", "تعذر استخدام هذه الصورة."));
                }
              }}
            />
          </label>
        )}
        {allowLinks && !more && (
          <button type="button" className={ghostBtn} onClick={() => setMore(true)}>🔗 {tr("Link / YouTube", "رابط / يوتيوب")}</button>
        )}
        <button type="submit" className={`${primaryBtn} ms-auto`} disabled={busy || (!text.trim() && !image && !link.trim())} data-testid="wall-submit">
          {busy ? "…" : tr("Post", "انشر")}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm font-semibold" role="status">{msg}</p>}
    </form>
  );
}

function linkHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function PostCard({ item, code, who, state, onChanged, big }: { item: ActivityItem; code: string; who: Who; state: ActivityState; onChanged: () => void; big?: boolean }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const isHost = "hostKey" in who;
  const hostKey = isHost ? who.hostKey : "";
  const [comment, setComment] = useState("");
  const [colors, setColors] = useState(false);
  const mod = async (action: string, extra: Record<string, unknown> = {}) => {
    await activityApi.moderate(code, hostKey, action, { id: item.id, ...extra }).catch(() => undefined);
    onChanged();
  };
  const canLike = isHost || (state.settings.likes && !item.mine);
  const iconBtn = "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm hover:bg-black/5 dark:hover:bg-white/10";

  return (
    <article
      className={`mb-4 break-inside-avoid rounded-3xl border p-4 shadow-sm backdrop-blur ${COLOR_CLS[item.color] ?? COLOR_CLS[""]} ${
        item.highlight ? "border-sun ring-4 ring-sun/60" : "border-black/5 dark:border-white/10"
      } ${item.status === "pending" ? "opacity-70 outline-2 outline-dashed outline-amber-500" : ""}`}
      data-testid="wall-post"
    >
      <header className="flex items-center gap-2 text-sm">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${item.pid === "host" ? "bg-header text-sun" : "bg-sun text-navy"}`} aria-hidden>
          {item.pid === "host" ? "★" : (item.author || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="font-bold">{item.pid === "host" ? tr("Teacher", "المعلم") : item.author}</span>
        {item.pinned > 0 && <span title={tr("Pinned", "مثبت")} aria-label={tr("Pinned", "مثبت")}>📌</span>}
        {item.status === "pending" && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">{tr("Waiting for approval", "بانتظار الموافقة")}</span>}
      </header>
      {item.data.text && <p className={`mt-2 whitespace-pre-wrap break-words ${big ? "text-xl" : "text-base"} leading-relaxed`} dir="auto">{item.data.text}</p>}
      {item.img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={activityApi.imgUrl(code, item.img)} alt="" loading="lazy" className="mt-3 w-full rounded-2xl" />
      )}
      {item.data.youtube && (
        <div className="mt-3 aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${item.data.youtube}?rel=0`}
            title="YouTube"
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}
      {item.data.link && (
        <a href={item.data.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 flex items-center gap-2 rounded-2xl bg-black/5 px-3 py-2 text-sm font-semibold underline-offset-2 hover:underline dark:bg-white/10" dir="ltr">
          🔗 {linkHost(item.data.link)}
        </a>
      )}
      {item.comments.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {item.comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-2xl bg-header/90 px-3 py-2 text-sm text-white">
              <span aria-hidden>💬</span>
              <span className="flex-1" dir="auto">{c.text}</span>
              {isHost && (
                <button type="button" className="text-white/70 hover:text-white" aria-label={tr("Delete comment", "حذف التعليق")} onClick={() => mod("delete-comment", { commentId: c.id })}>✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <footer className="mt-3 flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={!canLike || item.status !== "approved"}
          onClick={async () => {
            await activityApi.like(code, who, item.id).catch(() => undefined);
            onChanged();
          }}
          aria-pressed={item.liked}
          aria-label={item.liked ? tr("Unlike", "إلغاء الإعجاب") : tr("Like", "أعجبني")}
          className={`${iconBtn} gap-1 font-bold ${item.liked ? "text-rose-600" : ""} disabled:opacity-60`}
          data-testid="wall-like"
        >
          {item.liked ? "♥" : "♡"} <span className="tabular-nums">{item.likes}</span>
        </button>
        {isHost && (
          <>
            {item.status === "pending" ? (
              <button type="button" className={`${iconBtn} bg-emerald-600 font-bold text-white hover:bg-emerald-700`} onClick={() => mod("approve")} data-testid="wall-approve">
                ✓ {tr("Approve", "موافقة")}
              </button>
            ) : (
              <button type="button" className={iconBtn} onClick={() => mod("hide")} title={tr("Hide from students", "إخفاء عن الطلاب")} aria-label={tr("Hide from students", "إخفاء عن الطلاب")}>🙈</button>
            )}
            <button type="button" className={iconBtn} onClick={() => mod(item.pinned ? "unpin" : "pin")} title={item.pinned ? tr("Unpin", "إلغاء التثبيت") : tr("Pin to top", "تثبيت بالأعلى")} aria-label={item.pinned ? tr("Unpin", "إلغاء التثبيت") : tr("Pin to top", "تثبيت بالأعلى")}>📌</button>
            <button type="button" className={iconBtn} onClick={() => mod(item.highlight ? "unhighlight" : "highlight")} title={tr("Highlight", "تمييز")} aria-label={tr("Highlight", "تمييز")}>⭐</button>
            <button type="button" className={iconBtn} onClick={() => setColors((v) => !v)} title={tr("Colour", "اللون")} aria-label={tr("Colour", "اللون")}>🎨</button>
            <button
              type="button"
              className={`${iconBtn} text-rose-600`}
              onClick={() => confirm(tr("Delete this post?", "حذف هذه المشاركة؟")) && mod("delete")}
              title={tr("Delete", "حذف")}
              aria-label={tr("Delete", "حذف")}
              data-testid="wall-delete"
            >
              🗑
            </button>
          </>
        )}
      </footer>
      {isHost && colors && (
        <div className="mt-2 flex gap-2">
          {Object.keys(SWATCH).map((c) => (
            <button key={c || "none"} type="button" className={`h-7 w-7 rounded-full border border-black/20 ${SWATCH[c]}`} aria-label={c || tr("No colour", "بلا لون")} onClick={() => { setColors(false); mod("color", { color: c }); }} />
          ))}
        </div>
      )}
      {isHost && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!comment.trim()) return;
            await activityApi.comment(code, hostKey, item.id, comment).catch(() => undefined);
            setComment("");
            onChanged();
          }}
        >
          <input className="min-w-0 flex-1 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-black/20" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={tr("Teacher comment…", "تعليق المعلم…")} maxLength={500} />
          <button type="submit" className="rounded-full bg-header px-3 py-1.5 text-sm font-bold text-sun">{tr("Send", "إرسال")}</button>
        </form>
      )}
    </article>
  );
}

/** The live wall: pinned posts first, then newest first, in a masonry of cards. */
export function WallBoard({ code, who, state, onChanged, big = false, filter }: { code: string; who: Who; state: ActivityState; onChanged: () => void; big?: boolean; filter?: (i: ActivityItem) => boolean }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const posts = state.items
    .filter((i) => i.kind === "post" || i.kind === "share")
    .filter((i) => (filter ? filter(i) : true))
    .sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || b.created - a.created);
  if (!posts.length) {
    return <p className="glass rounded-3xl px-6 py-10 text-center text-lg opacity-80" data-testid="wall-empty">{tr("No posts yet — be the first!", "لا توجد مشاركات بعد — كن الأول!")}</p>;
  }
  return (
    <div className={`gap-4 ${big ? "columns-1 sm:columns-2 lg:columns-3 2xl:columns-4" : "columns-1 sm:columns-2 lg:columns-3"}`} data-testid="wall-board">
      {posts.map((p) => (
        <PostCard key={p.id} item={p} code={code} who={who} state={state} onChanged={onChanged} big={big} />
      ))}
    </div>
  );
}
