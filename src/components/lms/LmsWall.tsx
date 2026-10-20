"use client";

import { refreshDl, useDl } from "@/lib/dl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession, setWallAdmin, type WallClass, type WallGroupInter, type WallPost } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";

const pill = "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm font-bold transition hover:bg-white disabled:opacity-50 dark:border-white/15 dark:bg-white/10";

/** Shrink a picture in the browser to a small JPEG (the wall keeps pictures under ~200 KB). */
/** Phone photos (3–12 MB JPEG/HEIC): decode with the browser, resize to max 1600px and re-encode as JPEG under ~850 KB. */
async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions); } catch { /* fall back to <img> (Safari decodes HEIC there) */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("decode")); img.src = url; });
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
async function shrink(file: File): Promise<string> {
  const bmp = await decode(file);
  let max = 1600;
  for (let pass = 0; pass < 3; pass++, max = Math.round(max * 0.75)) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.58]) { const u = c.toDataURL("image/jpeg", q); if (u.startsWith("data:image/jpeg") && u.length < 880_000) return u; }
  }
  throw new Error("too_big");
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

function Composer({ targets, onDone }: { targets: WallClass[]; onDone: () => void }) {
  const aud = targets.map((t) => t.key);
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
      mr.onstop = async () => { st.getTracks().forEach((t) => t.stop()); const d = await toDataUrl(new Blob(chunks.current, { type: (mr.mimeType || "audio/mp4").replace(/\s+/g, "") })); setAudio(d.length > 880_000 ? "" : d); if (d.length > 880_000) setErr(tr("Recording too long (max about 90 seconds).", "التسجيل طويل (الحد الأقصى نحو 90 ثانية).")); };
      mr.start(); setRec(mr); setTimeout(() => mr.state === "recording" && mr.stop(), 90_000);
    } catch { setErr(tr("Microphone not available.", "الميكروفون غير متاح.")); }
  };
  const send = async () => {
    setBusy(true); setErr("");
    try { await lmsApi.wallPost(aud.length === 1 ? aud[0] : aud, text, image || undefined, audio || undefined); setText(""); setImage(""); setAudio(""); onDone(); }
    catch (e) { const c = (e as { code?: string }).code; setErr(c === "too_large" ? tr("The picture/recording is too large to post. Try a shorter recording or another picture.", "الصورة/التسجيل كبير جدًا. جرّب تسجيلًا أقصر أو صورة أخرى.") : c === "bad_media" ? tr("This file type can't be posted. Use a photo (JPEG/PNG) or an audio recording.", "لا يمكن نشر هذا النوع من الملفات.") : c === "network" ? tr("Couldn't reach the server — check the connection and try again.", "تعذر الاتصال — تحقق من الشبكة وحاول مجددًا.") : lmsErrorText(e, tr)); }
    setBusy(false);
  };
  return (
    <div className="glass rounded-3xl p-4" data-testid="wall-composer">
      <p className="mb-2 text-sm font-bold" data-testid="wall-audience">👥 {tr("Posting to", "النشر إلى")}: <span className="font-extrabold" dir="auto">{targets.map((t) => t.label).join(" · ")}</span>{targets.length > 1 && <span className="ms-1 text-xs font-semibold opacity-70">({tr("shown once to students in several of these groups", "يظهر مرة واحدة للطالب في أكثر من مجموعة")})</span>}</p>
      <textarea className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 dark:border-white/15 dark:bg-white/5" rows={3} maxLength={1500} placeholder={tr("Write a message to the class…", "اكتب رسالة للصف…")} value={text} onChange={(e) => setText(e.target.value)} dir="auto" data-testid="wall-text" />
      {image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={image} alt="" className="mt-2 max-h-40 rounded-xl" />}
      {audio && <audio controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} src={audio} className="mt-2 w-full" />}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={pill + " cursor-pointer"}>🖼 {tr("Picture", "صورة")}<input type="file" accept="image/*" className="hidden" data-testid="wall-image" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setErr(""); setBusy(true); try { setImage(await shrink(f)); } catch (er) { setImage(""); setErr((er as Error).message === "too_big" ? tr("This picture is too large even after shrinking. Please choose another one.", "الصورة كبيرة جدًا حتى بعد التصغير. اختر صورة أخرى.") : tr("This picture format can't be opened on this device (e.g. HEIC). Choose a JPEG/PNG photo, or set the camera to Most Compatible.", "لا يمكن فتح صيغة هذه الصورة على هذا الجهاز (مثل HEIC). اختر صورة JPEG/PNG أو اضبط الكاميرا على الأكثر توافقًا.")); } setBusy(false); }} /></label>
        {rec ? <button type="button" className={pill + " !bg-rose-100 !text-rose-800"} onClick={() => { rec.stop(); setRec(null); }} data-testid="wall-rec-stop">⏹ {tr("Stop", "إيقاف")}</button> : <button type="button" className={pill} onClick={startRec} data-testid="wall-rec">🎙 {tr("Record audio", "تسجيل صوتي")}</button>}
        <label className={pill + " cursor-pointer"}>🎵 {tr("Audio file", "ملف صوتي")}<input type="file" accept="audio/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const d = await toDataUrl(f); if (d.length > 880_000) setErr(tr("Audio file too large (max ~600 KB).", "الملف كبير (الحد نحو 600 ك.ب).")); else setAudio(d); } e.target.value = ""; }} /></label>
        <span className="flex-1" />
        <button type="button" className="rounded-full bg-sun px-5 py-2 font-extrabold text-[#0b1b2b] disabled:opacity-50" disabled={busy || !aud.length || (!text.trim() && !image && !audio)} onClick={send} data-testid="wall-send">{busy ? "…" : tr("Post", "نشر")}</button>
      </div>
      {err && <p className="mt-2 text-sm text-rose-700" role="alert">{err}</p>}
    </div>
  );
}

/** One group's likes and comments on a post (a like/comment made in Group A's wall never shows on Group B's). */
function Interactions({ g, label, mod, run }: { g: WallGroupInter; label?: string; mod: boolean; run: (f: () => Promise<unknown>) => Promise<void> }) {
  const { tr } = useTr();
  const [c, setC] = useState("");
  const badge = label ? <span className="rounded-full bg-sun/50 px-2 py-0.5 text-[11px] font-bold" dir="auto" data-testid="wall-inter-group">{label}</span> : null;
  return (
    <section className={label ? "mt-3 rounded-2xl border border-black/5 p-2.5 dark:border-white/10" : ""} data-testid="wall-inter" data-key={g.key}>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {badge}
        <button type="button" className={pill + (g.liked ? " !bg-rose-100 !text-rose-700" : "")} onClick={() => run(() => lmsApi.wallLike(g.post, g.key))} aria-pressed={g.liked} data-testid="wall-like">{g.liked ? "❤️" : "🤍"} <span data-testid="wall-like-count">{g.likes}</span></button>
        {label && <span className="text-xs opacity-60">{tr(`${g.comments.length} comment(s) in this group`, `${g.comments.length} تعليق في هذه المجموعة`)}</span>}
      </div>
      {g.comments.length > 0 && <ul className="mt-3 space-y-1.5 border-t border-black/5 pt-3 dark:border-white/10">
        {g.comments.map((m) => <li key={m.id} className="flex items-start gap-2 rounded-2xl bg-black/[0.04] px-3 py-1.5 text-sm dark:bg-white/5" data-testid="wall-comment"><span className="min-w-0 flex-1">{badge && <span className="me-1">{badge}</span>}<b dir="auto">{m.name}</b>{m.role !== "student" && <span className="ms-1 rounded bg-sun/70 px-1 text-[10px] font-bold">{m.role === "admin" ? tr("Admin", "الإدارة") : tr("Teacher", "معلم")}</span>} <span dir="auto">{m.text}</span></span>
          {mod && <button type="button" className="text-xs text-rose-700" aria-label={tr("Delete comment", "حذف التعليق")} onClick={() => run(() => lmsApi.wallMod("delcom", m.id))} data-testid="wall-del-comment">✕</button>}</li>)}
      </ul>}
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (c.trim()) run(async () => { await lmsApi.wallComment(g.post, c, g.key); setC(""); }); }}>
        <input className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-white/5" placeholder={label ? tr(`Comment in ${label}…`, `تعليق في ${label}…`) : tr("Write a comment…", "اكتب تعليقًا…")} value={c} onChange={(e) => setC(e.target.value)} maxLength={400} dir="auto" data-testid="wall-comment-input" />
        <button type="submit" className={pill} disabled={!c.trim()} data-testid="wall-comment-send">{tr("Send", "إرسال")}</button>
      </form>
    </section>
  );
}

function PostCard({ p, mod, reload, labels, sel, labelOf }: { p: WallPost; mod: boolean; reload: () => void; labels?: string[]; sel: string[]; labelOf?: (k: string) => string }) {
  const { tr, lang } = useTr();
  // Only the selected groups' interactions; a single wall shows its own as before.
  const all = p.groups?.length ? p.groups : [{ key: p.keys?.[0] || "", post: p.id, likes: p.likes, liked: p.liked, comments: p.comments }];
  const groups = all.filter((g) => !g.key || sel.includes(g.key));
  const [err, setErr] = useState("");
  const run = async (f: () => Promise<unknown>): Promise<void> => { setErr(""); try { await f(); reload(); } catch (e) { setErr(lmsErrorText(e, tr)); } };
  return (
    <article className={`glass rounded-3xl p-4 ${p.pinned ? "ring-2 ring-sun" : ""}`} data-testid="wall-post">
      <header className="flex items-center gap-2 text-sm">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-header text-xs font-bold text-white">{p.name.slice(0, 1)}</span>
        <b dir="auto">{p.name}</b>{p.pinned && <span title={tr("Pinned", "مثبّت")}>📌</span>}
        {!!labels?.length && <span className="flex flex-wrap gap-1" data-testid="wall-post-groups">{labels.map((l) => <span key={l} className="rounded-full bg-sun/50 px-2 py-0.5 text-[11px] font-bold" dir="auto">{l}</span>)}</span>}
        <span className="ms-auto text-xs opacity-60">{new Date(p.at).toLocaleString(lang === "ar" ? "ar" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" })}</span>
      </header>
      {p.text && <p className="mt-2 whitespace-pre-wrap" dir="auto">{p.text}</p>}
      <Media id={p.id} image={p.hasImage} audio={p.hasAudio} />
      {mod && <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={pill} onClick={() => run(() => lmsApi.wallMod(p.pinned ? "unpin" : "pin", p.id))} data-testid="wall-pin">📌 {p.pinned ? tr("Unpin", "إلغاء التثبيت") : tr("Pin", "تثبيت")}</button>
        <button type="button" className={pill + " !text-rose-700"} onClick={() => { if (confirm(tr("Delete this post and its comments?", "حذف المنشور وتعليقاته؟"))) run(() => lmsApi.wallMod("delete", p.id)); }} data-testid="wall-delete">🗑 {tr("Delete", "حذف")}</button>
      </div>}
      {groups.map((g) => <Interactions key={g.key} g={g} label={groups.length > 1 ? labelOf?.(g.key) || g.key : undefined} mod={mod} run={run} />)}
      {err && <p className="mt-1 text-sm text-rose-700" role="alert">{err}</p>}
    </article>
  );
}

/** Class Wall: the teacher posts to groups; students of those groups see, like and comment; teachers moderate. */
export function LmsWallPage() {
  const { tr } = useTr();
  return (
    <AssessmentShell title={tr("Class Wall", "جدار الصف")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <WallBoard />
    </AssessmentShell>
  );
}

/**
 * The wall itself (LMS page, and the admin "Class Wall" tab with asAdmin). One picker only: each group appears once,
 * and several groups can be selected — posts and the student list then combine all selected groups (de-duplicated).
 */
export function WallBoard({ asAdmin = false }: { asAdmin?: boolean }) {
  const { tr } = useTr();
  setWallAdmin(asAdmin);
  const [on, setOn] = useState<boolean | null>(null);
  const [classes, setClasses] = useState<WallClass[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [posts, setPosts] = useState<WallPost[] | null>(null);
  const [mod, setMod] = useState(false);
  const [err, setErr] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOn(asAdmin ? !!getServerSession() : !!lmsSession()), [asAdmin]);
  useEffect(() => {
    if (!on) return;
    lmsApi.wallClasses().then((r) => {
      // Defensive de-duplication by key (and by label for the same kind), so a name can never be listed twice.
      const seen = new Set<string>();
      const items = r.items.filter((c) => { const k = c.key, l = `${c.group ? "g" : "c"}|${c.label.trim().toLowerCase()}`; if (seen.has(k) || seen.has(l)) return false; seen.add(k); seen.add(l); return true; });
      setClasses(items); setCanPost(r.canPost); setSel((s) => (s.length ? s : items[0] ? [items[0].key] : [])); if (!items.length) setPosts([]);
    }).catch((e) => setErr(lmsErrorText(e, tr)));
  }, [on, tr]);
  const selKey = sel.join(",");
  const load = useCallback(() => { const keys = selKey ? selKey.split(",") : []; if (keys.length) lmsApi.wallList(keys.length === 1 ? keys[0] : keys).then((r) => { setPosts(r.posts); setMod(r.canModerate); }).catch((e) => setErr(lmsErrorText(e, tr))); }, [selKey, tr]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(() => !document.hidden && load(), 20_000);
    return () => clearInterval(t);
  }, [load]);
  const toggle = (c: WallClass) => {
    setPosts(null);
    // Groups can be combined; an older class wall is shown on its own.
    if (!c.group) { setSel([c.key]); return; }
    setSel((s) => { const g = s.filter((k) => classes.find((x) => x.key === k)?.group); return g.includes(c.key) ? (g.length > 1 ? g.filter((k) => k !== c.key) : g) : [...g, c.key]; });
  };
  const selected = classes.filter((c) => sel.includes(c.key));
  const groupsSel = selected.filter((c) => c.group);
  const members = (() => { const m = new Map<string, string>(); for (const g of groupsSel) for (const x of g.members || []) m.set(x.id, x.name); return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)); })();
  const labelOf = (k: string) => classes.find((c) => c.key === k)?.label || k;
  return (
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-3 py-6 sm:px-6" data-testid="lms-wall">
        {on === false ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in first.", "سجّل الدخول أولًا.")} {!asAdmin && <a className="font-bold underline" href="/lms/login">{tr("Sign in", "دخول")}</a>}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="me-auto text-2xl font-extrabold">🧱 {tr("Class Wall", "جدار الصف")}</h1>
              {classes.length > 1 && <>
                <p className="w-full text-xs opacity-70">{tr("Tap groups to combine them (select several).", "اضغط على المجموعات لدمجها (اختر أكثر من واحدة).")}</p>
                <div className="flex w-full flex-wrap gap-1.5" data-testid="wall-class" role="group" aria-label={tr("Groups", "المجموعات")}>{classes.map((c) => { const onSel = sel.includes(c.key); return <button key={c.key} type="button" aria-pressed={onSel} data-testid="wall-class-tab" dir="auto" onClick={() => toggle(c)} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${onSel ? "border-transparent bg-header text-sun" : "border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/10"}`}>{onSel && c.group ? "✓ " : ""}{c.label}{c.group && typeof c.count === "number" ? <span className="ms-1 text-xs opacity-70">({c.count})</span> : null}</button>; })}</div>
              </>}
              {classes.length === 1 && <span className="rounded-full bg-sun/70 px-3 py-1 text-sm font-bold" dir="auto">{classes[0].label}</span>}
            </div>
            {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
            {groupsSel.length > 0 && groupsSel.every((g) => g.members) && (
              <section className="glass rounded-3xl p-4" data-testid="wall-members">
                <p className="mb-2 text-sm font-bold">🧑‍🎓 {groupsSel.length > 1 ? tr(`Students in the ${groupsSel.length} selected groups (${members.length})`, `طلاب المجموعات المختارة (${members.length})`) : tr(`Students in this group (${members.length})`, `طلاب هذه المجموعة (${members.length})`)}</p>
                <div className="flex flex-wrap gap-1.5">{members.map((m) => <span key={m.id} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-sm dark:bg-white/10" dir="auto" data-testid="wall-member">{m.name}</span>)}</div>
              </section>
            )}
            {canPost && groupsSel.length > 0 && <Composer key={selKey} targets={groupsSel} onDone={load} />}
            {posts === null ? <p className="p-8 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
              : !classes.length ? <p className="glass rounded-3xl p-8 text-center opacity-80">{tr("No class wall available for you yet.", "لا يوجد جدار صف متاح لك بعد.")}</p>
              : !posts.length ? <p className="glass rounded-3xl p-8 text-center opacity-80">{tr("No posts yet.", "لا توجد منشورات بعد.")}</p>
              : posts.map((p) => <PostCard key={p.id} p={p} mod={mod} reload={load} sel={sel} labelOf={labelOf} labels={sel.length > 1 || (p.keys?.length || 0) > 1 ? (p.keys || []).map(labelOf) : undefined} />)}
          </>
        )}
      </div>
  );
}
