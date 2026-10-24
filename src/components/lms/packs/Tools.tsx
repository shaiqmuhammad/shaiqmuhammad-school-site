"use client";

import { useEffect, useState } from "react";
import { AudioRecorder } from "@/components/lms/Audio";
import { inputCls, smallBtn, useTr } from "@/components/lms/useLms";
import { FONTS, mediaUpload, uid, ytId, type El } from "@/lib/packs";
import { thumb, ytApi, type YtVideo } from "@/lib/yt";

/** t321: colourful toolbar buttons (each tool has its own colour). */
const TB: Record<string, string> = { sky: "bg-sky-100 text-sky-900 ring-sky-300 hover:bg-sky-200", violet: "bg-violet-100 text-violet-900 ring-violet-300 hover:bg-violet-200", rose: "bg-rose-100 text-rose-900 ring-rose-300 hover:bg-rose-200", orange: "bg-orange-100 text-orange-900 ring-orange-300 hover:bg-orange-200", red: "bg-red-100 text-red-900 ring-red-300 hover:bg-red-200", indigo: "bg-indigo-100 text-indigo-900 ring-indigo-300 hover:bg-indigo-200", emerald: "bg-emerald-100 text-emerald-900 ring-emerald-300 hover:bg-emerald-200" };
const tb = (c: string) => `inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ring-1 shadow-sm transition hover:-translate-y-0.5 active:translate-y-0 ${TB[c]}`;
const COLORS = ["#1b2f44", "#000000", "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0284c7", "#7c3aed", "#db2777", "#ffffff"];
export type Pen = { c: string; w: number } | null;
type Add = (e: Omit<El, "id">) => void;

/** t315: "add" toolbar shared by the teacher editor and the student player. Teachers also get YouTube, activities and the Quran block. */
export function AddTools({ add, pen, setPen, onUndoStroke, onClearDraw, asAdmin, teacher, onErr }: { add: Add; pen: Pen; setPen: (p: Pen) => void; onUndoStroke: () => void; onClearDraw: () => void; asAdmin: boolean; teacher: boolean; onErr: (m: string) => void }) {
  const { tr } = useTr();
  const [panel, setPanel] = useState<"" | "yt" | "act" | "quran" | "rec">("");
  const [busy, setBusy] = useState(false);
  const pic = async (f: File | undefined) => { if (!f) return; setBusy(true); try { add({ t: "img", src: await mediaUpload(f, asAdmin), x: 25, y: 15, w: 50, h: 60 } as Omit<El, "id">); } catch (e) { onErr(String((e as Error).message)); } setBusy(false); };
  const b = (on: boolean, c = "sky") => `${tb(c)} ${on ? "!bg-[#1b2f44] !text-white !ring-[#1b2f44]" : ""}`;
  return (
    <div className="space-y-2" data-testid="lp-tools">
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/80 p-2 shadow-sm ring-1 ring-black/5" data-testid="lp-toolbar">
        <button type="button" className={tb("sky")} onClick={() => add({ t: "text", text: tr("Type here", "اكتب هنا"), color: "#1b2f44", font: "Nunito", size: 40, x: 10, y: 10, w: 50, h: 14 } as Omit<El, "id">)} data-testid="lp-add-text">🔤 {tr("Text", "نص")}</button>
        <label className={tb("violet")} data-testid="lp-add-pic">🖼️ {busy ? "…" : tr("Picture", "صورة")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { pic(e.target.files?.[0]); e.target.value = ""; }} data-testid="lp-pic-input" /></label>
        <button type="button" className={b(panel === "rec", "rose")} onClick={() => setPanel(panel === "rec" ? "" : "rec")} data-testid="lp-add-audio">🎙️ {tr("Record audio", "تسجيل صوت")}</button>
        <button type="button" className={b(!!pen, "orange")} onClick={() => setPen(pen ? null : { c: "#e11d48", w: 0.5 })} data-testid="lp-pen">✏️ {pen ? tr("Drawing — tap to stop", "الرسم — اضغط للإيقاف") : tr("Draw", "رسم")}</button>
        {teacher && <>
          <button type="button" className={b(panel === "yt", "red")} onClick={() => setPanel(panel === "yt" ? "" : "yt")} data-testid="lp-add-yt">▶️ YouTube</button>
          <button type="button" className={b(panel === "act", "indigo")} onClick={() => setPanel(panel === "act" ? "" : "act")} data-testid="lp-add-act">🎲 {tr("Activity", "نشاط")}</button>
          <button type="button" className={tb("emerald")} onClick={() => add({ t: "quran", surah: 1, from: 1, to: 7, memoAudio: true, x: 20, y: 30, w: 60, h: 30 } as Omit<El, "id">)} data-testid="lp-add-quran">📖 {tr("Quran", "القرآن")}</button>
        </>}
      </div>
      {pen && <div className="flex flex-wrap items-center gap-1.5" data-testid="lp-pen-bar">
        {COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setPen({ ...pen, c })} className={`h-7 w-7 rounded-full border-2 ${pen.c === c ? "border-sky-500" : "border-black/10"}`} style={{ background: c }} />)}
        <select className="rounded-lg border border-black/15 bg-white px-2 py-1 text-sm" value={pen.w} onChange={(e) => setPen({ ...pen, w: Number(e.target.value) })} aria-label={tr("Pen size", "حجم القلم")}>{[0.25, 0.5, 1, 2, 4].map((w) => <option key={w} value={w}>{w <= 0.25 ? tr("Fine", "رفيع") : w <= 0.5 ? tr("Medium", "متوسط") : w <= 1 ? tr("Thick", "سميك") : w <= 2 ? tr("Marker", "قلم عريض") : tr("Highlighter", "تظليل")}</option>)}</select>
        <button type="button" className={smallBtn} onClick={onUndoStroke} data-testid="lp-undo-stroke">↶ {tr("Undo line", "تراجع")}</button>
        <button type="button" className={smallBtn} onClick={onClearDraw} data-testid="lp-clear-draw">🧽 {tr("Clear drawing", "مسح الرسم")}</button>
      </div>}
      {panel === "rec" && <AudioRecorder label={tr("Record (up to 3 minutes)", "سجّل (حتى 3 دقائق)")} testId="lp-rec" onSave={async (blob) => { const id = await mediaUpload(blob, asAdmin); add({ t: "audio", src: id, x: 30, y: 75, w: 40, h: 12 } as Omit<El, "id">); setPanel(""); }} />}
      {panel === "yt" && <YtPick onPick={(vid, title) => { add({ t: "yt", vid, title, x: 15, y: 12, w: 70, h: 76 } as Omit<El, "id">); setPanel(""); }} />}
      {panel === "act" && <ActPick onPick={(v) => { add({ t: "act", ...v, x: 10, y: 10, w: 80, h: 80 } as Omit<El, "id">); setPanel(""); }} />}
    </div>
  );
}

/** Videos from the school channel (no links out), or any YouTube link pasted in — always shown in the privacy-enhanced player. */
function YtPick({ onPick }: { onPick: (id: string, title: string) => void }) {
  const { tr } = useTr();
  const [list, setList] = useState<YtVideo[] | null>(null);
  const [q, setQ] = useState("");
  const [link, setLink] = useState("");
  useEffect(() => { ytApi.channel().then((r) => setList(r.videos)).catch(() => setList([])); }, []);
  const vids = (list || []).filter((v) => !q || v.title.toLowerCase().includes(q.toLowerCase())).slice(0, 24);
  return (
    <div className="space-y-2 rounded-2xl border border-black/10 bg-white p-3" data-testid="lp-yt-panel">
      <div className="flex gap-2"><input className={inputCls + " !mt-0"} value={link} onChange={(e) => setLink(e.target.value)} placeholder={tr("Paste a YouTube link", "الصق رابط YouTube")} data-testid="lp-yt-link" /><button type="button" className={smallBtn} disabled={!ytId(link)} onClick={() => onPick(ytId(link), "")} data-testid="lp-yt-add">{tr("Add", "إضافة")}</button></div>
      <p className="text-xs font-bold opacity-70">{tr("Or pick from my YouTube channel", "أو اختر من قناتي")}</p>
      <input className={inputCls + " !mt-0"} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search my videos…", "ابحث في فيديوهاتي…")} data-testid="lp-yt-search" />
      <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
        {list === null ? <p className="text-sm">…</p> : vids.map((v) => (
          <button key={v.id} type="button" className="overflow-hidden rounded-xl border border-black/10 text-start text-xs hover:ring-2 hover:ring-sun" onClick={() => onPick(v.id, v.title)} data-testid="lp-yt-video">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(v.id)} alt="" className="aspect-video w-full object-cover" /><span className="line-clamp-2 p-1 font-semibold">{v.title}</span>
          </button>))}
      </div>
    </div>
  );
}

function ActPick({ onPick }: { onPick: (v: { code?: string; quiz?: string; label: string }) => void }) {
  const { tr } = useTr();
  const [code, setCode] = useState("");
  const [quizzes, setQuizzes] = useState<{ slug: string; title: string }[]>([]);
  const [quiz, setQuiz] = useState("");
  useEffect(() => { fetch("/content/quizzes.json").then((r) => r.json()).then((j) => setQuizzes(((Array.isArray(j) ? j : j.quizzes || []) as { slug: string; title: string }[]).filter((x) => x.slug))).catch(() => undefined); }, []);
  return (
    <div className="space-y-2 rounded-2xl border border-black/10 bg-white p-3" data-testid="lp-act-panel">
      <label className="block text-sm font-bold">{tr("Live activity or assessment code (word cloud, poll, survey, vote, think-pair-share, wheel, quiz…)", "رمز نشاط أو تقييم مباشر")}
        <div className="flex gap-2"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="ABCDE" data-testid="lp-act-code" /><button type="button" className={smallBtn + " mt-1"} disabled={code.length < 4} onClick={() => onPick({ code, label: `${tr("Activity", "نشاط")} ${code}` })} data-testid="lp-act-add">{tr("Add", "إضافة")}</button></div></label>
      <label className="block text-sm font-bold">{tr("Or a self-paced assessment", "أو تقييم ذاتي")}
        <div className="flex gap-2"><select className={inputCls} value={quiz} onChange={(e) => setQuiz(e.target.value)} data-testid="lp-act-quiz"><option value="">{tr("Pick an assessment…", "اختر تقييمًا…")}</option>{quizzes.map((x) => <option key={x.slug} value={x.slug}>{x.title}</option>)}</select>
          <button type="button" className={smallBtn + " mt-1"} disabled={!quiz} onClick={() => onPick({ quiz, label: quizzes.find((x) => x.slug === quiz)?.title || quiz })} data-testid="lp-act-quiz-add">{tr("Add", "إضافة")}</button></div></label>
    </div>
  );
}

/** Properties of the selected element (text style, layering, delete). */
export function ElProps({ e, set, del, front, back }: { e: El; set: (p: Partial<El>) => void; del: () => void; front: () => void; back: () => void }) {
  const { tr } = useTr();
  return (
    <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50/60 p-3 text-sm" data-testid="lp-props">
      {e.t === "text" && <>
        <textarea className={inputCls + " !mt-0 min-h-20"} dir="auto" value={e.text} onChange={(ev) => set({ text: ev.target.value } as Partial<El>)} data-testid="lp-text-edit" />
        <div className="flex flex-wrap items-center gap-1.5">
          <select className="rounded-lg border border-black/15 bg-white px-2 py-1" value={e.font} onChange={(ev) => set({ font: ev.target.value } as Partial<El>)} aria-label={tr("Font", "الخط")} data-testid="lp-font">{FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select>
          <select className="rounded-lg border border-black/15 bg-white px-2 py-1" value={e.size} onChange={(ev) => set({ size: Number(ev.target.value) } as Partial<El>)} aria-label={tr("Size", "الحجم")} data-testid="lp-size">{[16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 120].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <label className="flex items-center gap-1">{tr("Colour", "اللون")}<input type="color" value={e.color} onChange={(ev) => set({ color: ev.target.value } as Partial<El>)} data-testid="lp-color" /></label>
          <label className="flex items-center gap-1">{tr("Fill", "الخلفية")}<input type="color" value={e.bg || "#ffffff"} onChange={(ev) => set({ bg: ev.target.value } as Partial<El>)} /></label>
          <button type="button" className={smallBtn + (e.bold ? " !bg-header !text-sun" : "")} onClick={() => set({ bold: !e.bold } as Partial<El>)} aria-label="Bold"><b>B</b></button>
          <button type="button" className={smallBtn + (e.italic ? " !bg-header !text-sun" : "")} onClick={() => set({ italic: !e.italic } as Partial<El>)} aria-label="Italic"><i>I</i></button>
          {(["start", "center", "end"] as const).map((al) => <button key={al} type="button" className={smallBtn + ((e.align || "start") === al ? " !bg-header !text-sun" : "")} onClick={() => set({ align: al } as Partial<El>)}>{al === "start" ? "⇤" : al === "center" ? "↔" : "⇥"}</button>)}
        </div>
      </>}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={smallBtn} onClick={front}>⬆ {tr("Bring forward", "للأمام")}</button>
        <button type="button" className={smallBtn} onClick={back}>⬇ {tr("Send back", "للخلف")}</button>
        <button type="button" className={smallBtn + " !text-rose-700"} onClick={del} data-testid="lp-el-delete">🗑 {tr("Delete", "حذف")}</button>
      </div>
    </div>
  );
}
export const withId = (e: Omit<El, "id">): El => ({ ...(e as El), id: uid() });
