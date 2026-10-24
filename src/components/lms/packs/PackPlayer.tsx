"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { smallBtn, useTr } from "@/components/lms/useLms";
import { lp, uid, type El, type Pack, type Slide } from "@/lib/packs";
import { SlideView } from "./SlideView";
import { AddTools, ElProps, withId, type Pen } from "./Tools";

/** t315: student view of a pack — teacher slides + the student's own layer (type, draw, picture, record), auto-saved.
 *  Live packs follow the teacher's slide. `review` = teacher looking at one student's copy (read-only). */
export function PackPlayer({ id, asAdmin = false, review, preview = false, locked = false, onWork }: { id: string; asAdmin?: boolean; review?: { student: string }; preview?: boolean; locked?: boolean; onWork?: () => void }) {
  const { tr } = useTr();
  const [pack, setPack] = useState<Pack | null>(null);
  const [work, setWork] = useState<Slide[]>([]);
  const [cur, setCur] = useState(0);
  const [seen, setSeen] = useState<number[]>([0]);
  const [sel, setSel] = useState("");
  const [pen, setPen] = useState<Pen>(null);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [full, setFull] = useState(false);
  const student = !review && !preview && !asAdmin;
  const load = useCallback(() => (review ? lp.work(id, review.student, asAdmin).then((r) => { setPack(r.pack || null); setWork(r.work || []); }) : lp.get(id, asAdmin).then((r) => { setPack(r.pack); setWork(r.work || []); })).catch((e) => setMsg(String((e as Error).message))), [id, asAdmin, review]);
  useEffect(() => { load(); }, [load]);
  // Live: follow the teacher's slide.
  const live = pack?.mode === "live" && student;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { lp.live(id, 0, false, false).then((r) => { if (typeof r.live === "number" && r.live >= 0) setCur(r.live); }).catch(() => undefined); }, 3000);
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
  if (!pack) return <p className="text-sm opacity-70" data-testid="lp-player">{msg || "…"}</p>;
  if (!slides.length) return null;
  const s = slides[Math.min(cur, slides.length - 1)];
  const editable = student && !locked;
  const draw = () => layer.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined;
  const selEl = layer.find((e) => e.id === sel);
  return (
    <section className={`space-y-2 ${full ? "fixed inset-0 z-[2147483000] overflow-auto bg-slate-900/95 p-3" : "rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5 sm:p-4"}`} data-testid="lp-player">
      <div className={`flex flex-wrap items-center gap-2 text-sm font-bold ${full ? "text-white" : ""}`}>
        <span data-testid="lp-player-count">{tr(`Slide ${cur + 1} of ${slides.length}`, `الشريحة ${cur + 1} من ${slides.length}`)}</span>
        {live && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-900" data-testid="lp-following">📡 {tr("Following your teacher", "تتابع معلمك")}</span>}
        {pack.topic?.title && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900" dir="auto">🎯 {pack.topic.title}</span>}
        <span className="flex-1" />
        <button type="button" className={smallBtn} onClick={() => setFull(!full)} data-testid="lp-full">{full ? "✕" : "⛶"} {full ? tr("Close", "إغلاق") : tr("Full screen", "ملء الشاشة")}</button>
      </div>
      {editable && <AddTools add={(e) => { const el = withId({ ...e, ...(e.t === "text" ? { y: Math.min(80, 40 + layer.filter((x) => x.t === "text").length * 8) } : {}), by: "s" } as Omit<El, "id">); setLayer((l) => [...l, el]); setSel(el.id); }} pen={pen} setPen={setPen} asAdmin={false} teacher={false} onErr={setMsg}
        onUndoStroke={() => { const d = draw(); if (d) setLayer((l) => l.map((e) => (e === d ? { ...d, paths: d.paths.slice(0, -1) } : e))); }} onClearDraw={() => { const d = draw(); if (d) setLayer((l) => l.filter((e) => e !== d)); }} />}
      <SlideView slide={s} layer={layer} asAdmin={asAdmin} edit={editable ? "s" : null} selected={sel} onSelect={setSel} pen={editable ? pen : null}
        onMove={(eid, q) => setLayer((l) => l.map((e) => (e.id === eid ? ({ ...e, ...q } as El) : e)))}
        onStroke={(d) => setLayer((l) => { const dr = l.find((e) => e.t === "draw") as Extract<El, { t: "draw" }> | undefined; const path = { c: pen!.c, w: pen!.w, d }; return dr ? l.map((e) => (e === dr ? { ...dr, paths: [...dr.paths, path] } : e)) : [...l, { id: uid(), t: "draw", x: 0, y: 0, w: 100, h: 100, by: "s", paths: [path] } as El]; })} testId="lp-player-slide" />
      {selEl && editable && <ElProps e={selEl} set={(q) => setLayer((l) => l.map((e) => (e.id === sel ? ({ ...e, ...q } as El) : e)))} del={() => { setLayer((l) => l.filter((e) => e.id !== sel)); setSel(""); }} front={() => setLayer((l) => [...l.filter((e) => e.id !== sel), selEl])} back={() => setLayer((l) => [selEl, ...l.filter((e) => e.id !== sel)])} />}
      {!live && <div className="flex items-center justify-between gap-2">
        <button type="button" className={smallBtn} disabled={cur === 0} onClick={() => { setCur(cur - 1); setSel(""); }} data-testid="lp-prev">← {tr("Back", "السابق")}</button>
        <div className="flex gap-1">{slides.map((_, i) => <button key={i} type="button" aria-label={String(i + 1)} onClick={() => setCur(i)} className={`h-2.5 w-2.5 rounded-full ${i === cur ? "bg-header" : seen.includes(i) ? "bg-sky-300" : "bg-slate-300"}`} />)}</div>
        <button type="button" className={smallBtn} disabled={cur >= slides.length - 1} onClick={() => { setCur(cur + 1); setSel(""); }} data-testid="lp-next">{tr("Next", "التالي")} →</button>
      </div>}
      {msg && <p className={`text-xs font-semibold ${full ? "text-white" : "opacity-70"}`} role="status" data-testid="lp-player-msg">{msg}</p>}
    </section>
  );
}
