"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { smallBtn, useTr } from "@/components/lms/useLms";
import { LB_AR as LB_AR_P, LB_EN as LB_EN_P, lp, uid, type El, type Pack, type Slide } from "@/lib/packs";
import { SlideView } from "./SlideView";
import { qrSvg } from "@/lib/qrLocal";
import { AddTools, ElProps, withId, type Pen } from "./Tools";

/** t315: student view of a pack — teacher slides + the student's own layer (type, draw, picture, record), auto-saved.
 *  Live packs follow the teacher's slide. `review` = teacher looking at one student's copy (read-only). */
export function PackPlayer({ id, asAdmin = false, review, preview = false, locked = false, onWork, autoFull = false }: { autoFull?: boolean; id: string; asAdmin?: boolean; review?: { student: string }; preview?: boolean; locked?: boolean; onWork?: () => void }) {
  const { tr } = useTr();
  const [pack, setPack] = useState<Pack | null>(null);
  const [work, setWork] = useState<Slide[]>([]);
  const [cur, setCur] = useState(0);
  const [seen, setSeen] = useState<number[]>([0]);
  const [sel, setSel] = useState("");
  const [pen, setPen] = useState<Pen>(null);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [full, setFull] = useState(!!autoFull); // t396: opened from the list → full screen (document fullscreen from the click, else full-window)
  const box = useRef<HTMLElement | null>(null);
  // t389: real full screen (Fullscreen API; Esc exits). Falls back to a full-window overlay where the API is missing (e.g. iPhone).
  const toggleFull = async () => {
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => undefined); return; }
    if (full) { setFull(false); return; }
    const el = box.current;
    if (el?.requestFullscreen) { try { await el.requestFullscreen(); setFull(true); return; } catch { /* fall back */ } }
    setFull(true);
  };
  useEffect(() => { const f = () => { if (!document.fullscreenElement) setFull(false); }; document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  useEffect(() => { if (!full) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) setFull(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [full]);
  const student = !review && !preview && !asAdmin;
  const load = useCallback(() => (review ? lp.work(id, review.student, asAdmin).then((r) => { setPack(r.pack || null); setWork(r.work || []); }) : lp.get(id, asAdmin).then((r) => { setPack(r.pack); setWork(r.work || []); })).catch((e) => setMsg(String((e as Error).message))), [id, asAdmin, review]);
  useEffect(() => { load(); }, [load]);
  // Live: follow the teacher's slide.
  const live = pack?.mode === "live" && student;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { lp.live(id, 0, false, false).then((r) => { if (typeof r.live === "number") { setWaiting(r.live < 0); if (r.live >= 0) setCur(r.live); } }).catch(() => undefined); }, 3000);
    return () => clearInterval(t);
  }, [live, id]);
  useEffect(() => { setSeen((s) => (s.includes(cur) ? s : [...s, cur])); if (student) setDirty(true); }, [cur, student]);
  const slides = pack?.slides || [];
  const layer = (work[cur]?.els || []) as El[];
  const setLayer = (fn: (els: El[]) => El[]) => { setWork((w) => { const n = [...w]; while (n.length < slides.length) n.push({ id: uid("s"), bg: "", els: [] }); n[cur] = { ...(n[cur] || { id: uid("s"), bg: "" }), els: fn((n[cur]?.els || []) as El[]) }; return n; }); setDirty(true); };
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || !student || locked) return;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => { lp.workSave(id, work, seen).then(() => { setDirty(false); setMsg(tr("Saved ✓", "تم الحفظ ✓")); onWork?.(); }).catch((e) => setMsg(String((e as Error).message) === "already_submitted" ? tr("Handed in — wait for your teacher.", "تم التسليم — انتظر معلمك.") : tr("Couldn't save — try again.", "تعذّر الحفظ."))); }, 1500);
    return () => { if (t.current) clearTimeout(t.current); };
  }, [dirty, work, seen, id, student, locked, tr, onWork]);
  // t429: arrows / PageUp / PageDown / Space move between slides (not while typing or with an item selected).
  const nSlides = pack?.slides?.length || 0;
  useEffect(() => {
    if (live) return;
    const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (t?.closest?.("input,textarea,select,[contenteditable=true],[contenteditable='']") || sel) return; if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !pen)) { e.preventDefault(); setCur((c) => Math.min(nSlides - 1, c + 1)); } else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); } else if (e.key === "Home") setCur(0); else if (e.key === "End") setCur(Math.max(0, nSlides - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [live, sel, pen, nSlides]);
  const doPrint = () => { setPrinting(true); document.body.classList.add("lp-printing"); setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove("lp-printing"); setPrinting(false); }, 400); }, 1500); };
  if (!pack) return <p className="text-sm opacity-70" data-testid="lp-player">{msg || "…"}</p>;
  if (!slides.length) return null;
  const s = slides[Math.min(cur, slides.length - 1)];
  const editable = (student || preview) && !locked && !review; // t429: preview = try it without saving or assigning
  const go = (d: number) => { setCur((c) => Math.max(0, Math.min(slides.length - 1, c + d))); setSel(""); };
  const draw = () => layer.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined;
  const selEl = layer.find((e) => e.id === sel);
  const staffView = !!review || preview || asAdmin;
  const qr = typeof window !== "undefined" ? qrSvg(`${location.origin}/lms/material?open=${encodeURIComponent(id)}`, 96) : "";
  return (
    <section ref={box} className={`space-y-2 ${full ? "fixed inset-0 z-[2147483000] flex flex-col overflow-hidden bg-gradient-to-br from-[#0f2438] via-[#1b3a57] to-[#0f2438] p-2 sm:p-3" : "rounded-3xl border border-white/60 bg-gradient-to-br from-sky-100/85 via-white/80 to-violet-100/80 p-3 text-[#1b2f44] shadow-lg backdrop-blur-md sm:p-4"}`} data-testid="lp-player">
      <div className={`flex flex-wrap items-center gap-2 text-sm font-bold ${full ? "text-white" : ""}`}>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 tabular-nums" data-testid="lp-player-count">{cur + 1} / {slides.length}</span>
        {full && <span className="truncate font-extrabold text-[#f5c542]" dir="auto">{pack.title}</span>}
        {live && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-900" data-testid="lp-following">📡 {tr("Following your teacher", "تتابع معلمك")}</span>}
        {pack.topic?.title && !full && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900" dir="auto">🎯 {pack.topic.title}</span>}
        <span className="flex-1" />
        {staffView && <button type="button" className={smallBtn} onClick={doPrint} disabled={printing} title={tr("Colourful printable with QR code", "نسخة ملوّنة للطباعة مع رمز QR")} data-testid="lp-print">🖨 {printing ? "…" : tr("Print / PDF", "طباعة / PDF")}</button>}
        <button type="button" className={smallBtn} onClick={toggleFull} title={tr("Full screen (Esc to exit)", "ملء الشاشة (Esc للخروج)")} data-testid="lp-full">{full ? "✕" : "⛶"} {full ? tr("Exit", "خروج") : tr("Full screen", "ملء الشاشة")}</button>
      </div>
      {editable && <AddTools compact={full} add={(e) => { const el = withId({ ...e, ...(e.t === "text" ? { y: Math.min(80, 40 + layer.filter((x) => x.t === "text").length * 8) } : {}), by: "s" } as Omit<El, "id">); setLayer((l) => [...l, el]); setSel(el.id); }} pen={pen} setPen={setPen} asAdmin={asAdmin} teacher={false} onErr={setMsg}
        onUndoStroke={() => { const d = draw(); if (d) setLayer((l) => l.map((e) => (e === d ? { ...d, paths: d.paths.slice(0, -1) } : e))); }} onClearDraw={() => { const d = draw(); if (d) setLayer((l) => l.filter((e) => e !== d)); }} />}
      <div className={`relative ${full ? "flex min-h-0 flex-1 items-center justify-center" : ""}`}
        onPointerDown={(ev) => { if (!pen && ev.pointerType !== "mouse") swipe.current = { x: ev.clientX, y: ev.clientY }; }}
        onPointerUp={(ev) => { const st = swipe.current; swipe.current = null; if (!st || live || pen) return; const dx = ev.clientX - st.x, dy = ev.clientY - st.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 === (document.dir !== "rtl") ? 1 : -1); }}>
        <div className="lb-fit relative w-full" style={full ? { maxWidth: "calc((100dvh - 7.5rem) * 16 / 9)" } : undefined}>
          <SlideView slide={s} layer={layer} asAdmin={asAdmin} edit={editable ? "s" : null} selected={sel} onSelect={setSel} pen={editable ? pen : null}
            onMove={(eid, q) => setLayer((l) => l.map((e) => (e.id === eid ? ({ ...e, ...q } as El) : e)))} onDelete={editable ? (eid) => { setLayer((l) => l.filter((e) => e.id !== eid)); setSel(""); } : undefined}
            onStroke={(d) => setLayer((l) => { const dr = l.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined; const path = { c: pen!.c, w: pen!.w, d }; return dr ? l.map((e) => (e === dr ? { ...dr, paths: [...dr.paths, path] } : e)) : [...l, { id: uid(), t: "draw", x: 0, y: 0, w: 100, h: 100, by: "s", paths: [path] } as El]; })} testId="lp-player-slide" />
          {!live && cur > 0 && <button type="button" onClick={() => go(-1)} className="absolute start-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-[#1b3a57]/55 text-xl font-black text-white shadow-lg ring-1 ring-white/40 backdrop-blur transition hover:scale-105 hover:bg-[#1b3a57]/85 sm:-start-5" aria-label={tr("Previous slide", "الشريحة السابقة")} data-testid="lp-prev"><span className="rtl:rotate-180">‹</span></button>}
          {!live && cur < slides.length - 1 && <button type="button" onClick={() => go(1)} className="absolute end-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-[#1b3a57]/55 text-xl font-black text-white shadow-lg ring-1 ring-white/40 backdrop-blur transition hover:scale-105 hover:bg-[#1b3a57]/85 sm:-end-5" aria-label={tr("Next slide", "الشريحة التالية")} data-testid="lp-next"><span className="rtl:rotate-180">›</span></button>}
          {live && waiting && <div className="absolute inset-0 z-20 grid place-items-center rounded-xl bg-gradient-to-br from-[#1b3a57]/90 to-[#24507a]/90 text-center text-white backdrop-blur" data-testid="lp-waiting"><div><div className="mx-auto mb-3 h-14 w-14 animate-spin rounded-full border-4 border-[#f5c542]/30 border-t-[#f5c542]" /><p className="text-xl font-extrabold text-[#f5c542]">{tr("Get ready!", "استعد!")}</p><p className="text-sm opacity-90">{tr("Your teacher will start the slides in a moment.", "سيبدأ معلمك الشرائح بعد قليل.")}</p></div></div>}
        </div>
      </div>
      {selEl && editable && !full && <ElProps e={selEl} set={(q) => setLayer((l) => l.map((e) => (e.id === sel ? ({ ...e, ...q } as El) : e)))} del={() => { setLayer((l) => l.filter((e) => e.id !== sel)); setSel(""); }} front={() => setLayer((l) => [...l.filter((e) => e.id !== sel), selEl])} back={() => setLayer((l) => [selEl, ...l.filter((e) => e.id !== sel)])} />}
      {!live && slides.length > 1 && <div className="flex justify-center gap-1.5 py-1">{slides.map((_, i) => <button key={i} type="button" aria-label={String(i + 1)} onClick={() => { setCur(i); setSel(""); }} className={`h-2.5 rounded-full transition-all ${i === cur ? "w-6 bg-[#f5c542]" : seen.includes(i) ? "w-2.5 bg-sky-300" : "w-2.5 bg-slate-300"}`} />)}</div>}
      {msg && <p className={`text-xs font-semibold ${full ? "text-white" : "opacity-70"}`} role="status" data-testid="lp-player-msg">{msg}</p>}
      {printing && <div className="lp-print" data-testid="lp-print-box">
        {slides.map((sl, i) => <div key={sl.id} className="lp-print-slide rounded-2xl border-4 p-2" style={{ borderColor: ["#1b3a57", "#7c3aed", "#d97706", "#059669", "#e11d48", "#0284c7"][i % 6] }}>
          <div className="mb-1 flex items-center gap-3"><div className="flex-1"><p className="text-lg font-extrabold text-[#1b3a57]" dir="auto">{pack.title}</p><p className="text-xs text-slate-600">{tr(LB_EN_P, LB_AR_P)} · {review ? tr("Student work", "عمل الطالب") : tr("Slides", "الشرائح")} · {i + 1}/{slides.length}{pack.topic?.title ? ` · ${pack.topic.title}` : ""}</p></div><span dangerouslySetInnerHTML={{ __html: qr }} /></div>
          <SlideView slide={sl} layer={(work[i]?.els || []) as El[]} asAdmin={asAdmin} live={false} testId="lp-print-slide" />
        </div>)}
      </div>}
    </section>
  );
}
