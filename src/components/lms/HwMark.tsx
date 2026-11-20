"use client";
/** t682: photo work + teacher annotation (pen, highlighter, typed text, correction-code stamps, Next Steps). */
import { useEffect, useRef, useState } from "react";
import { AudioClip, AudioRecorder } from "@/components/lms/Audio";
import { hwCorrectionPdf } from "@/components/lms/hwCorrectionPdf";
import { smallBtn, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, type Submission } from "@/lib/lms";
import { DEFAULT_CODES, NEXT_STEPS, emptyAnnot, emptyPage, pageOf, shrinkHwPhoto, type CorrCode, type HwAnnot, type HwPage, type HwPhoto, type HwStamp, type HwStroke, type HwText } from "@/lib/hwMark";

const PENS = ["#e11d48", "#ea580c", "#ca8a04", "#059669", "#0284c7", "#7c3aed", "#0f172a", "#ffffff"];
const toolBtn = (on: boolean) => `inline-flex min-h-11 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-extrabold shadow-sm transition active:scale-95 motion-reduce:transform-none ${on ? "bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md" : "bg-white/90 text-[#1b2f44] ring-1 ring-black/10 hover:bg-white dark:bg-white/10 dark:text-white dark:ring-white/15"}`;

function uid() { return Math.random().toString(36).slice(2, 9); }

/** Student: take / attach oriented photos of written work (up to 6). */
export function HwPhotoBox({ hwId, photos, locked, asAdmin = false, onChange }: { hwId: string; photos: HwPhoto[]; locked: boolean; asAdmin?: boolean; onChange: () => void }) {
  const { tr } = useTr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = async (list: FileList | null) => {
    if (!list?.length || locked || busy) return;
    setErr("");
    setBusy(true);
    try {
      for (const f of Array.from(list).slice(0, 6 - photos.length)) {
        if (!/^image\//.test(f.type) && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)) continue;
        const { blob, w, h } = await shrinkHwPhoto(f);
        await lmsApi.photoUpload(hwId, blob, w, h, asAdmin);
      }
      onChange();
    } catch (e) {
      setErr(lmsErrorText(e, tr) || tr("Could not use that photo. Try another one.", "تعذّر استخدام هذه الصورة. جرّب صورة أخرى."));
    }
    setBusy(false);
  };
  return (
    <div className="space-y-2" data-testid="hw-photos">
      <p className="text-sm font-extrabold">📷 {tr("Photos of my work", "صور عملي")}</p>
      {!!photos.length && <div className="grid gap-3 sm:grid-cols-2">{photos.map((p) => (
        <figure key={p.id} className="light-island relative overflow-hidden rounded-3xl bg-black/5 ring-1 ring-black/10 dark:bg-white/5" style={{ aspectRatio: `${Math.max(1, p.w)} / ${Math.max(1, p.h)}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <HwImg id={p.id} asAdmin={asAdmin} className="h-full w-full object-contain" />
          {!locked && <button type="button" className="absolute end-2 top-2 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow" data-testid="hw-photo-del" onClick={async () => { if (!confirm(tr("Remove this photo?", "إزالة هذه الصورة؟"))) return; await lmsApi.photoDelete(p.id, asAdmin).catch(() => undefined); onChange(); }}>✕</button>}
        </figure>
      ))}</div>}
      {!locked && photos.length < 6 && (
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-3xl bg-gradient-to-br from-amber-300 to-orange-500 px-4 py-3 text-sm font-extrabold text-[#1b2f44] shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
          📷 {busy ? tr("Adding…", "جارٍ الإضافة…") : tr("Photograph my work", "صوّر عملي")}
          <input type="file" accept="image/*" capture="environment" multiple className="hidden" data-testid="hw-photo-input" disabled={busy} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {err && <p className="text-sm font-bold text-rose-700" role="alert">{err}</p>}
    </div>
  );
}

function HwImg({ id, asAdmin, className, alt = "", token }: { id: string; asAdmin?: boolean; className?: string; alt?: string; token?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (token) { setSrc(lmsApi.qrAudioUrl(token, id)); return; }
    let live = true, url = ""; lmsApi.audioUrl(id, !!asAdmin).then((r) => { if (live) { url = r.url; setSrc(r.url); } else URL.revokeObjectURL(r.url); }).catch(() => undefined); return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id, asAdmin, token]);
  if (!src) return <div className="grid h-full min-h-32 place-items-center text-sm opacity-60">…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

/** Overlay + tools. `edit` = teacher can mark; otherwise the student (or QR view) only sees the marks. */
export function HwAnnotate({
  photos, annot, codes, edit, asAdmin = false, subId, audioId, onSaved, onCodes, token, pdfMeta,
}: {
  photos: HwPhoto[];
  annot: HwAnnot | null;
  codes: CorrCode[];
  edit: boolean;
  asAdmin?: boolean;
  subId: string;
  audioId?: string;
  onSaved?: (a: HwAnnot) => void;
  onCodes?: (c: CorrCode[]) => void;
  token?: string;
  pdfMeta?: { title: string; student: string; cls?: string; section?: string; teacher?: string; date?: number; hwId?: string; studentId?: string };
}) {
  const { tr, lang } = useTr();
  const [tab, setTab] = useState(photos[0]?.id || "");
  const [tool, setTool] = useState<"pen" | "hi" | "text" | "stamp" | "move">("pen");
  const [color, setColor] = useState("#e11d48");
  const [width, setWidth] = useState(4);
  const [code, setCode] = useState<CorrCode | null>(codes[0] || null);
  const [draft, setDraft] = useState<HwAnnot>(() => annot || emptyAnnot());
  const [nextOpen, setNextOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [codesOpen, setCodesOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stroke = useRef<number[] | null>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const [sel, setSel] = useState<{ k: "text" | "stamp"; id: string } | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the open photo / marks in sync when the submission reloads
  useEffect(() => { if (photos.length && !photos.some((p) => p.id === tab)) setTab(photos[0].id); }, [photos, tab]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- teacher/student view follows the saved annotation
  useEffect(() => { setDraft(annot || emptyAnnot()); }, [annot]);
  const page = pageOf(draft, tab);
  const setPage = (p: HwPage) => setDraft((d) => ({ ...d, pages: { ...d.pages, [tab]: p } }));
  const toggleNext = (t: string) => setDraft((d) => ({ ...d, next: d.next.includes(t) ? d.next.filter((n) => n !== t) : [...d.next, t] }));
  const pt = (ev: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return [0, 0];
    return [((ev.clientX - r.left) / r.width) * 100, ((ev.clientY - r.top) / r.height) * 100];
  };
  const down = (ev: React.PointerEvent) => {
    if (!edit) return;
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    const [x, y] = pt(ev);
    if (tool === "pen" || tool === "hi") { stroke.current = [x, y]; setLive([x, y]); }
    else if (tool === "text") {
      const t: HwText = { id: uid(), x, y, text: "", c: color, size: 18 };
      setPage({ ...page, texts: [...page.texts, t] });
      setSel({ k: "text", id: t.id });
    } else if (tool === "stamp" && code) {
      const s: HwStamp = { id: uid(), x, y, code: code.id, en: code.en, ar: code.ar, color: code.color };
      setPage({ ...page, stamps: [...page.stamps, s] });
      setSel({ k: "stamp", id: s.id });
    }
  };
  const move = (ev: React.PointerEvent) => {
    if (!edit) return;
    const [x, y] = pt(ev);
    if ((tool === "pen" || tool === "hi") && stroke.current) {
      const d = stroke.current.concat(x, y);
      stroke.current = d;
      setLive(d);
      return;
    }
    if (tool === "move" && sel && ev.buttons) {
      if (sel.k === "text") setPage({ ...page, texts: page.texts.map((t) => t.id === sel.id ? { ...t, x, y } : t) });
      else setPage({ ...page, stamps: page.stamps.map((t) => t.id === sel.id ? { ...t, x, y } : t) });
    }
  };
  const up = () => {
    if (stroke.current && stroke.current.length >= 4) {
      const s: HwStroke = { c: color, w: tool === "hi" ? Math.max(14, width * 4) : width, d: stroke.current, tool: tool === "hi" ? "hi" : "pen" };
      setPage({ ...page, strokes: [...page.strokes, s] });
    }
    stroke.current = null;
    setLive(null);
  };
  const save = async (done: boolean) => {
    setBusy(true); setMsg("");
    try {
      const body: HwAnnot = { ...draft, done: done || draft.done, at: Date.now() };
      const r = await lmsApi.annotSave(subId, body, done, asAdmin);
      setDraft(r.annot);
      onSaved?.(r.annot);
      setMsg(done ? tr("✅ Correction sent. The student can see your marks.", "✅ تم إرسال التصحيح. يمكن للطالب رؤية علاماتك.") : tr("Saved ✓", "تم الحفظ ✓"));
    } catch (e) { setMsg(lmsErrorText(e, tr)); }
    setBusy(false);
  };
  const photo = photos.find((p) => p.id === tab);
  const palette = codes.length ? codes : DEFAULT_CODES;
  if (!photos.length) return null;
  return (
    <div className="space-y-3" data-testid="hw-mark">
      {photos.length > 1 && <div className="flex flex-wrap gap-2">{photos.map((p, i) => <button key={p.id} type="button" className={toolBtn(tab === p.id)} onClick={() => setTab(p.id)}>🖼️ {i + 1}</button>)}</div>}
      {photo && (
        <div
          ref={box}
          className="light-island relative mx-auto w-full max-h-[75vh] touch-none overflow-hidden rounded-3xl bg-slate-200/80 shadow-lg ring-1 ring-black/10 dark:bg-slate-800"
          style={{ aspectRatio: `${Math.max(1, photo.w)} / ${Math.max(1, photo.h)}`, maxWidth: "100%" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          data-testid="hw-mark-stage"
        >
          <HwImg id={photo.id} asAdmin={asAdmin} token={token} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {page.strokes.map((s, i) => <polyline key={i} fill="none" points={toPts(s.d)} stroke={s.c} strokeWidth={(s.w / 400) * (100 / Math.max(photo.w / photo.h, 1))} strokeLinecap="round" strokeLinejoin="round" opacity={s.tool === "hi" ? 0.4 : 1} vectorEffect="non-scaling-stroke" />)}
            {live && <polyline fill="none" points={toPts(live)} stroke={color} strokeWidth={(tool === "hi" ? Math.max(14, width * 4) : width) / 4} strokeLinecap="round" strokeLinejoin="round" opacity={tool === "hi" ? 0.4 : 1} vectorEffect="non-scaling-stroke" />}
          </svg>
          {page.texts.map((t) => (
            <div key={t.id} className={`absolute -translate-x-1/2 -translate-y-1/2 ${edit ? "cursor-move" : ""}`} style={{ left: `${t.x}%`, top: `${t.y}%`, color: t.c, fontSize: t.size, fontWeight: 800 }} onPointerDown={(e) => { if (!edit) return; e.stopPropagation(); setSel({ k: "text", id: t.id }); setTool("move"); }}>
              {edit && sel?.k === "text" && sel.id === t.id ? (
                <input autoFocus className="min-w-24 rounded-xl bg-white/95 px-2 py-1 font-extrabold shadow ring-2 ring-sky-400" style={{ color: t.c, fontSize: t.size }} value={t.text} dir="auto" onChange={(e) => setPage({ ...page, texts: page.texts.map((x) => x.id === t.id ? { ...x, text: e.target.value } : x) })} onPointerDown={(e) => e.stopPropagation()} data-testid="hw-mark-text" />
              ) : <span className="rounded-md bg-white/70 px-1 dark:bg-black/40" dir="auto">{t.text || (edit ? "…" : "")}</span>}
            </div>
          ))}
          {page.stamps.map((s) => (
            <button key={s.id} type="button" className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl px-2 py-1 text-xs font-black text-white shadow-md ${edit ? "cursor-grab" : ""}`} style={{ left: `${s.x}%`, top: `${s.y}%`, background: s.color }} title={lang === "ar" ? s.ar : s.en} onPointerDown={(e) => { if (!edit) return; e.stopPropagation(); setSel({ k: "stamp", id: s.id }); setTool("move"); }} data-testid="hw-stamp">{(lang === "ar" ? s.ar : s.en).slice(0, 12)}</button>
          ))}
        </div>
      )}
      {edit && (
        <>
          <div className="flex flex-wrap gap-2" data-testid="hw-mark-tools">
            {([["pen", "✏️", "Pen", "قلم"], ["hi", "🟨", "Highlight", "تظليل"], ["text", "🔤", "Type", "كتابة"], ["stamp", "🏷️", "Code", "رمز"], ["move", "✋", "Move", "تحريك"]] as const).map(([k, ic, en, ar]) => <button key={k} type="button" className={toolBtn(tool === k)} onClick={() => setTool(k)} data-testid={`hw-tool-${k}`}>{ic} {tr(en, ar)}</button>)}
            <button type="button" className={toolBtn(false)} onClick={() => setPage({ ...page, strokes: page.strokes.slice(0, -1) })} data-testid="hw-mark-undo">↩ {tr("Undo stroke", "تراجع عن الخط")}</button>
          </div>
          {(tool === "pen" || tool === "hi" || tool === "text") && <div className="flex flex-wrap items-center gap-2">{PENS.map((c) => <button key={c} type="button" className={`h-9 w-9 rounded-full shadow ring-2 ${color === c ? "ring-sky-500 scale-110" : "ring-black/10"}`} style={{ background: c }} aria-label={c} onClick={() => setColor(c)} />)}<label className="text-xs font-bold">{tr("Size", "الحجم")}<input type="range" min={2} max={14} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="ms-2 align-middle" /></label></div>}
          {tool === "stamp" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2" data-testid="hw-codes">{palette.map((c) => <button key={c.id} type="button" className={`rounded-2xl px-3 py-2 text-xs font-black text-white shadow ${code?.id === c.id ? "ring-4 ring-white/80" : ""}`} style={{ background: c.color }} onClick={() => { setCode(c); setTool("stamp"); }}>{lang === "ar" ? c.ar : c.en}</button>)}</div>
              <button type="button" className={smallBtn} onClick={() => setCodesOpen(!codesOpen)} data-testid="hw-codes-edit">➕ {tr("My correction codes", "رموز التصحيح")}</button>
              {codesOpen && <CodesEditor list={palette} asAdmin={asAdmin} onSave={(c) => { onCodes?.(c); setCode(c[0] || null); }} />}
            </div>
          )}
          <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-sky-50 p-3 ring-1 ring-black/5 dark:from-emerald-900/20 dark:to-sky-900/20" data-testid="hw-next-steps">
            <button type="button" className={toolBtn(nextOpen)} onClick={() => setNextOpen(!nextOpen)}>💬 {tr("Next Steps — ready-made comments", "الخطوات التالية — تعليقات جاهزة")}</button>
            {nextOpen && <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              <p className="text-xs font-extrabold uppercase tracking-wide opacity-70">{tr("Appreciative", "تشجيع")}</p>
              {NEXT_STEPS.filter((x) => x.g === "up").map((x) => <NextChip key={x.en} en={x.en} ar={x.ar} on={draft.next.includes(lang === "ar" ? x.ar : x.en)} onToggle={toggleNext} />)}
              <p className="pt-1 text-xs font-extrabold uppercase tracking-wide opacity-70">{tr("Constructive", "بنّاء")}</p>
              {NEXT_STEPS.filter((x) => x.g === "next").map((x) => <NextChip key={x.en} en={x.en} ar={x.ar} on={draft.next.includes(lang === "ar" ? x.ar : x.en)} onToggle={toggleNext} />)}
            </div>}
            {!!draft.next.length && <ul className="mt-2 list-disc ps-5 text-sm font-semibold">{draft.next.map((n) => <li key={n} dir="auto">{n}</li>)}</ul>}
          </div>
          {audioId && <AudioClip id={audioId} asAdmin={asAdmin} label={"🎙️ " + tr("Voice feedback", "تعليق صوتي")} testId="mark-fb-clip" />}
          <AudioRecorder big autoSave light label={tr("Record voice feedback (up to 3 minutes)", "سجّل تعليقًا صوتيًا (حتى 3 دقائق)")} savedText={tr("Saved — the student will hear it.", "تم الحفظ — سيسمعه الطالب.")} testId="mark-fb-rec" onSave={async (b) => { await lmsApi.audioUpload({ sub: subId }, b, asAdmin); }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallBtn} disabled={busy} onClick={() => save(false)} data-testid="hw-mark-save">{busy ? "…" : tr("Save marks", "حفظ العلامات")}</button>
            <button type="button" className="rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-2 text-sm font-extrabold text-white shadow-md" disabled={busy} onClick={() => save(true)} data-testid="hw-mark-send">✅ {tr("Send correction", "إرسال التصحيح")}</button>
          </div>
          {msg && <p className="text-sm font-bold" role="status">{msg}</p>}
        </>
      )}
      {!edit && !!draft.next.length && (
        <div className="rounded-3xl bg-emerald-50 p-3 text-[#1b2f44] ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-50" data-testid="hw-next-view">
          <p className="font-extrabold">💬 {tr("Next Steps", "الخطوات التالية")}</p>
          <ul className="mt-1 list-disc ps-5 font-semibold">{draft.next.map((n) => <li key={n} dir="auto">{n}</li>)}</ul>
        </div>
      )}
      {(draft.done || !edit) && (
        <button type="button" className={smallBtn} data-testid="hw-pdf" onClick={async () => {
          try {
            let tok = token || "";
            if (!tok && pdfMeta?.hwId && pdfMeta.studentId) {
              const r = await lmsApi.qrLinks(pdfMeta.hwId, {}, !!asAdmin).catch(() => null);
              tok = r?.links.find((l) => l.student === pdfMeta.studentId)?.token || "";
            }
            await hwCorrectionPdf(photos, draft, async (id) => tok ? lmsApi.qrAudioUrl(tok, id) : (await lmsApi.audioUrl(id, !!asAdmin)).url, {
              title: pdfMeta?.title || "", student: pdfMeta?.student || "", cls: pdfMeta?.cls, section: pdfMeta?.section, teacher: pdfMeta?.teacher || draft.by, date: pdfMeta?.date || draft.at || Date.now(), next: draft.next, token: tok || undefined, origin: typeof location !== "undefined" ? location.origin : "",
            }, lang === "ar" ? "ar" : "en");
          } catch { /* keep the page usable if a photo fails to load */ }
        }}>🖨️ {tr("Download / print PDF", "تنزيل / طباعة PDF")}</button>
      )}
    </div>
  );
}

function NextChip({ en, ar, on, onToggle }: { en: string; ar: string; on: boolean; onToggle: (t: string) => void }) {
  const { tr, lang } = useTr();
  const t = lang === "ar" ? ar : en;
  return <button type="button" className={`block w-full rounded-2xl px-3 py-2 text-start text-sm font-semibold ${on ? "bg-emerald-600 text-white" : "bg-white/80 hover:bg-white dark:bg-white/10"}`} onClick={() => onToggle(t)} aria-pressed={on}>{on ? "✓ " : ""}{tr(en, ar)}</button>;
}

function CodesEditor({ list, asAdmin, onSave }: { list: CorrCode[]; asAdmin: boolean; onSave: (c: CorrCode[]) => void }) {
  const { tr } = useTr();
  const [rows, setRows] = useState(list);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 rounded-2xl bg-white/80 p-3 ring-1 ring-black/10 dark:bg-white/10" data-testid="hw-codes-form">
      {rows.map((r, i) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2">
          <input className="h-9 w-14 rounded-lg" type="color" value={r.color} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} />
          <input className="min-w-28 flex-1 rounded-xl bg-white px-2 py-1 text-sm font-bold ring-1 ring-black/10 dark:bg-black/30" value={r.en} dir="auto" onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, en: e.target.value } : x))} placeholder="English" />
          <input className="min-w-28 flex-1 rounded-xl bg-white px-2 py-1 text-sm font-bold ring-1 ring-black/10 dark:bg-black/30" value={r.ar} dir="rtl" onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ar: e.target.value } : x))} placeholder="العربية" />
          <button type="button" className="text-xs font-bold text-rose-700" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className={smallBtn} onClick={() => setRows([...rows, { id: uid(), en: "New", ar: "جديد", color: "#0284c7" }])}>+ {tr("Add a code", "إضافة رمز")}</button>
        <button type="button" className={smallBtn} disabled={busy} onClick={async () => { setBusy(true); try { const r = await lmsApi.corrCodesSave(rows.filter((x) => x.en.trim() || x.ar.trim()), asAdmin); onSave(r.codes); } finally { setBusy(false); } }}>{tr("Save codes", "حفظ الرموز")}</button>
      </div>
    </div>
  );
}

function toPts(d: number[]) {
  const out: string[] = [];
  for (let i = 0; i + 1 < d.length; i += 2) out.push(`${d[i]},${d[i + 1]}`);
  return out.join(" ");
}

/** Student-facing marked work (photos + overlay + Next Steps). */
export function HwMarkedWork({ sub, asAdmin = false, token, pdfMeta }: { sub: Pick<Submission, "photos" | "annot" | "id">; asAdmin?: boolean; token?: string; pdfMeta?: { title: string; student: string; cls?: string; section?: string; teacher?: string; date?: number; hwId?: string; studentId?: string } }) {
  const photos = sub.photos || [];
  if (!photos.length) return null;
  return <HwAnnotate photos={photos} annot={sub.annot || emptyAnnot()} codes={DEFAULT_CODES} edit={false} asAdmin={asAdmin} subId={sub.id} token={token} pdfMeta={pdfMeta} />;
}
