"use client";

import { refreshDl, useDl } from "@/lib/dl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession, type WallPost } from "@/lib/lms";

const pill = "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm font-bold transition hover:bg-white disabled:opacity-50 dark:border-white/15 dark:bg-white/10";

/** Shrink a picture in the browser to a small JPEG (the wall keeps pictures under ~200 KB). */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 960 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.78, 0.6, 0.45]) { const u = c.toDataURL("image/jpeg", q); if (u.length < 300_000) return u; }
  return c.toDataURL("image/jpeg", 0.35);
}
const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

function Media({ id, image, audio }: { id: string; image: boolean; audio: boolean }) {
  const [m, setM] = useState<{ image: string; audio: string } | null>(null);
  const dl = useDl();
  useEffect(() => { if (image || audio) lmsApi.wallMedia(id).then(setM).catch(() => undefined); }, [id, image, audio]);
  if (!m) return null;
  return (
    <div className="mt-3 space-y-2">
      {m.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.image} alt="" className="max-h-96 w-full rounded-2xl object-contain bg-black/5" />}
      {m.audio && <audio controls src={m.audio} className="w-full" controlsList={dl.audio ? undefined : "nodownload"} onContextMenu={dl.audio ? undefined : (e) => e.preventDefault()} />}
      {m.audio && dl.audio && <button type="button" className={pill} data-testid="wall-audio-download" onClick={() => lmsApi.wallMedia(id, true).then((r) => { const a = document.createElement("a"); a.href = r.audio; a.download = `wall-audio-${id}.webm`; document.body.appendChild(a); a.click(); a.remove(); }).catch(() => { alert("Downloads are switched off for your account. / التنزيل غير مفعّل لحسابك."); refreshDl(); })}>⬇ Download</button>}
    </div>
  );
}

function Composer({ wkey, onDone }: { wkey: string; onDone: () => void }) {
  const { tr } = useTr();
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [audio, setAudio] = useState("");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chunks = useRef<Blob[]>([]);
  const startRec = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(st, { audioBitsPerSecond: 24000 });
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => { st.getTracks().forEach((t) => t.stop()); const d = await toDataUrl(new Blob(chunks.current, { type: mr.mimeType })); setAudio(d.length > 880_000 ? "" : d); if (d.length > 880_000) setErr(tr("Recording too long (max about 90 seconds).", "التسجيل طويل (الحد الأقصى نحو 90 ثانية).")); };
      mr.start(); setRec(mr); setTimeout(() => mr.state === "recording" && mr.stop(), 90_000);
    } catch { setErr(tr("Microphone not available.", "الميكروفون غير متاح.")); }
  };
  const send = async () => {
    setBusy(true); setErr("");
    try { await lmsApi.wallPost(wkey, text, image || undefined, audio || undefined); setText(""); setImage(""); setAudio(""); onDone(); }
    catch (e) { setErr(lmsErrorText(e, tr)); }
    setBusy(false);
  };
  return (
    <div className="glass rounded-3xl p-4" data-testid="wall-composer">
      <textarea className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 dark:border-white/15 dark:bg-white/5" rows={3} maxLength={1500} placeholder={tr("Write a message to the class…", "اكتب رسالة للصف…")} value={text} onChange={(e) => setText(e.target.value)} dir="auto" data-testid="wall-text" />
      {image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={image} alt="" className="mt-2 max-h-40 rounded-xl" />}
      {audio && <audio controls src={audio} className="mt-2 w-full" />}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={pill + " cursor-pointer"}>🖼 {tr("Picture", "صورة")}<input type="file" accept="image/*" className="hidden" data-testid="wall-image" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await shrink(f).catch(() => "")); e.target.value = ""; }} /></label>
        {rec ? <button type="button" className={pill + " !bg-rose-100 !text-rose-800"} onClick={() => { rec.stop(); setRec(null); }} data-testid="wall-rec-stop">⏹ {tr("Stop", "إيقاف")}</button> : <button type="button" className={pill} onClick={startRec} data-testid="wall-rec">🎙 {tr("Record audio", "تسجيل صوتي")}</button>}
        <label className={pill + " cursor-pointer"}>🎵 {tr("Audio file", "ملف صوتي")}<input type="file" accept="audio/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const d = await toDataUrl(f); if (d.length > 880_000) setErr(tr("Audio file too large (max ~600 KB).", "الملف كبير (الحد نحو 600 ك.ب).")); else setAudio(d); } e.target.value = ""; }} /></label>
        <span className="flex-1" />
        <button type="button" className="rounded-full bg-sun px-5 py-2 font-extrabold text-[#0b1b2b] disabled:opacity-50" disabled={busy || (!text.trim() && !image && !audio)} onClick={send} data-testid="wall-send">{busy ? "…" : tr("Post", "نشر")}</button>
      </div>
      {err && <p className="mt-2 text-sm text-rose-700" role="alert">{err}</p>}
    </div>
  );
}

function PostCard({ p, mod, reload }: { p: WallPost; mod: boolean; reload: () => void }) {
  const { tr, lang } = useTr();
  const [c, setC] = useState("");
  const [err, setErr] = useState("");
  const run = async (f: () => Promise<unknown>) => { setErr(""); try { await f(); reload(); } catch (e) { setErr(lmsErrorText(e, tr)); } };
  return (
    <article className={`glass rounded-3xl p-4 ${p.pinned ? "ring-2 ring-sun" : ""}`} data-testid="wall-post">
      <header className="flex items-center gap-2 text-sm">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-header text-xs font-bold text-white">{p.name.slice(0, 1)}</span>
        <b dir="auto">{p.name}</b>{p.pinned && <span title={tr("Pinned", "مثبّت")}>📌</span>}
        <span className="ms-auto text-xs opacity-60">{new Date(p.at).toLocaleString(lang === "ar" ? "ar" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" })}</span>
      </header>
      {p.text && <p className="mt-2 whitespace-pre-wrap" dir="auto">{p.text}</p>}
      <Media id={p.id} image={p.hasImage} audio={p.hasAudio} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={pill + (p.liked ? " !bg-rose-100 !text-rose-700" : "")} onClick={() => run(() => lmsApi.wallLike(p.id))} aria-pressed={p.liked} data-testid="wall-like">{p.liked ? "❤️" : "🤍"} {p.likes}</button>
        {mod && <>
          <button type="button" className={pill} onClick={() => run(() => lmsApi.wallMod(p.pinned ? "unpin" : "pin", p.id))} data-testid="wall-pin">📌 {p.pinned ? tr("Unpin", "إلغاء التثبيت") : tr("Pin", "تثبيت")}</button>
          <button type="button" className={pill + " !text-rose-700"} onClick={() => { if (confirm(tr("Delete this post and its comments?", "حذف المنشور وتعليقاته؟"))) run(() => lmsApi.wallMod("delete", p.id)); }} data-testid="wall-delete">🗑 {tr("Delete", "حذف")}</button>
        </>}
      </div>
      {p.comments.length > 0 && <ul className="mt-3 space-y-1.5 border-t border-black/5 pt-3 dark:border-white/10">
        {p.comments.map((m) => <li key={m.id} className="flex items-start gap-2 rounded-2xl bg-black/[0.04] px-3 py-1.5 text-sm dark:bg-white/5" data-testid="wall-comment"><span className="min-w-0 flex-1"><b dir="auto">{m.name}</b>{m.role !== "student" && <span className="ms-1 rounded bg-sun/70 px-1 text-[10px] font-bold">{m.role === "admin" ? tr("Admin", "الإدارة") : tr("Teacher", "معلم")}</span>} <span dir="auto">{m.text}</span></span>
          {mod && <button type="button" className="text-xs text-rose-700" aria-label={tr("Delete comment", "حذف التعليق")} onClick={() => run(() => lmsApi.wallMod("delcom", m.id))} data-testid="wall-del-comment">✕</button>}</li>)}
      </ul>}
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (c.trim()) run(async () => { await lmsApi.wallComment(p.id, c); setC(""); }); }}>
        <input className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-white/5" placeholder={tr("Write a comment…", "اكتب تعليقًا…")} value={c} onChange={(e) => setC(e.target.value)} maxLength={400} dir="auto" data-testid="wall-comment-input" />
        <button type="submit" className={pill} disabled={!c.trim()} data-testid="wall-comment-send">{tr("Send", "إرسال")}</button>
      </form>
      {err && <p className="mt-1 text-sm text-rose-700" role="alert">{err}</p>}
    </article>
  );
}

/** Class Wall: the teacher posts to a class; students of that class see, like and comment; teachers moderate. */
export function LmsWallPage() {
  const { tr } = useTr();
  const [on, setOn] = useState<boolean | null>(null);
  const [classes, setClasses] = useState<{ key: string; label: string }[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [key, setKey] = useState("");
  const [posts, setPosts] = useState<WallPost[] | null>(null);
  const [mod, setMod] = useState(false);
  const [err, setErr] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOn(!!lmsSession()), []);
  useEffect(() => {
    if (!on) return;
    lmsApi.wallClasses().then((r) => { setClasses(r.items); setCanPost(r.canPost); setKey((k) => k || r.items[0]?.key || ""); if (!r.items.length) setPosts([]); }).catch((e) => setErr(lmsErrorText(e, tr)));
  }, [on, tr]);
  const load = useCallback(() => { if (key) lmsApi.wallList(key).then((r) => { setPosts(r.posts); setMod(r.canModerate); }).catch((e) => setErr(lmsErrorText(e, tr))); }, [key, tr]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(() => !document.hidden && load(), 20_000);
    return () => clearInterval(t);
  }, [load]);
  return (
    <AssessmentShell title={tr("Class Wall", "جدار الصف")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-3 py-6 sm:px-6" data-testid="lms-wall">
        {on === false ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in first.", "سجّل الدخول أولًا.")} <a className="font-bold underline" href="/lms/login">{tr("Sign in", "دخول")}</a></p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="me-auto text-2xl font-extrabold">🧱 {tr("Class Wall", "جدار الصف")}</h1>
              {classes.length > 1 && <select className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5" value={key} onChange={(e) => { setPosts(null); setKey(e.target.value); }} data-testid="wall-class">{classes.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>}
              {classes.length === 1 && <span className="rounded-full bg-sun/70 px-3 py-1 text-sm font-bold">{classes[0].label}</span>}
            </div>
            {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
            {canPost && key && <Composer wkey={key} onDone={load} />}
            {posts === null ? <p className="p-8 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
              : !classes.length ? <p className="glass rounded-3xl p-8 text-center opacity-80">{tr("No class wall available for you yet.", "لا يوجد جدار صف متاح لك بعد.")}</p>
              : !posts.length ? <p className="glass rounded-3xl p-8 text-center opacity-80">{tr("No posts yet.", "لا توجد منشورات بعد.")}</p>
              : posts.map((p) => <PostCard key={p.id} p={p} mod={mod} reload={load} />)}
          </>
        )}
      </div>
    </AssessmentShell>
  );
}
