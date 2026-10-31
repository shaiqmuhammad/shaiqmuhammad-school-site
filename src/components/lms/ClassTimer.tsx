"use client";
import { useEffect, useRef, useState } from "react";
import { lmsSession } from "@/lib/lms";
import { cachedSiteSound, sfx } from "@/lib/actSound";
import { useTr } from "@/components/lms/useLms";

/** t380: teacher Timer / Stopwatch — floating glass widget, client-only. Stores timestamps (not a ticking count) in localStorage. */
type St = { mode: "timer" | "stopwatch"; open: boolean; big: boolean; corner: "br" | "bl" | "tr" | "tl"; end: number | null; left: number; total: number; swStart: number | null; swAcc: number; laps: number[]; done: boolean };
const KEY = "sm-class-timer";
const DEF: St = { mode: "timer", open: false, big: false, corner: "br", end: null, left: 0, total: 0, swStart: null, swAcc: 0, laps: [], done: false };
const load = (): St => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEF; } };
export function openClassTimer(mode: "timer" | "stopwatch") { window.dispatchEvent(new CustomEvent("sm-timer-open", { detail: mode })); }
const fmt = (ms: number, cs = false) => { const t = Math.max(0, ms); const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${cs ? "." + String(Math.floor((t % 1000) / 10)).padStart(2, "0") : ""}`; };

export function ClassTimer() {
  const { tr } = useTr();
  const [st, setSt] = useState<St>(DEF);
  const [now, setNow] = useState(0);
  const [ok, setOk] = useState(false);
  const [cm, setCm] = useState(1); const [cs, setCs] = useState(0);
  const lastTick = useRef(-1);
  const title = useRef("");
  const save = (n: St) => { setSt(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* */ } };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOk(lmsSession()?.user.role === "teacher"); setSt(load()); setNow(Date.now()); cachedSiteSound();
    const on = (e: Event) => { const n = { ...load(), open: true, mode: (e as CustomEvent).detail as St["mode"] }; save(n); };
    const sync = (e: StorageEvent) => { if (e.key === KEY) setSt(load()); };
    window.addEventListener("sm-timer-open", on); window.addEventListener("storage", sync);
    return () => { window.removeEventListener("sm-timer-open", on); window.removeEventListener("storage", sync); };
  }, []);
  const running = st.mode === "timer" ? !!st.end : !!st.swStart;
  useEffect(() => { if (!running && !st.done) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [running, st.done]);
  const left = st.end ? st.end - now : st.left;
  // last-10-second ticks, finish chime, tab title + desktop notification
  useEffect(() => {
    if (st.mode !== "timer" || !st.end) return;
    const sec = Math.ceil(left / 1000);
    if (sec <= 10 && sec > 0 && sec !== lastTick.current) { lastTick.current = sec; sfx("tick"); }
    if (left <= 0) {
      sfx("chime"); lastTick.current = -1;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      save({ ...st, end: null, left: 0, done: true });
      if (!title.current) title.current = document.title;
      document.title = "⏰ " + tr("Time's up!", "انتهى الوقت!");
      try { if ("Notification" in window && Notification.permission === "granted") new Notification(tr("Time's up!", "انتهى الوقت!"), { body: tr("Class timer finished", "انتهى مؤقت الصف") }); } catch { /* */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  useEffect(() => { if (st.mode === "timer" && st.end && !st.done) { if (!title.current) title.current = document.title; document.title = `⏱ ${fmt(left)}`; } else if (!st.done && title.current) { document.title = title.current; title.current = ""; } });
  if (!ok || !st.open) return null;
  const startT = (ms?: number) => { const l = ms ?? (st.left > 0 ? st.left : cm * 60000 + cs * 1000); if (l <= 0) return; sfx("start"); try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => undefined); } catch { /* */ } save({ ...st, end: Date.now() + l, left: l, total: ms ?? (st.total || l), done: false }); setNow(Date.now()); };
  const pauseT = () => save({ ...st, end: null, left: Math.max(0, left) });
  const resetT = () => { if (title.current) { document.title = title.current; title.current = ""; } save({ ...st, end: null, left: 0, total: 0, done: false }); };
  const sw = st.swAcc + (st.swStart ? now - st.swStart : 0);
  const pos = { br: "bottom-28 end-3", bl: "bottom-28 start-[5.25rem]", tr: "top-20 end-3", tl: "top-20 start-[5.25rem]" }[st.corner];
  const pct = st.mode === "timer" && st.total ? Math.max(0, Math.min(1, left / st.total)) : 0;
  const drag = (e: React.PointerEvent) => {
    const up = (ev: PointerEvent) => { window.removeEventListener("pointerup", up); const r = ev.clientX > innerWidth / 2 ? "r" : "l", t = ev.clientY > innerHeight / 2 ? "b" : "t"; save({ ...load(), corner: `${t}${r}` as St["corner"] }); };
    e.preventDefault(); window.addEventListener("pointerup", up);
  };
  const btn = "rounded-full px-3 py-1.5 text-sm font-extrabold shadow-sm transition hover:scale-105";
  return (
    <div className={`fixed ${pos} z-[2500] ${st.big ? "w-[min(92vw,26rem)]" : "w-56"} overflow-hidden rounded-3xl border border-white/50 text-[#1b2f44] shadow-[0_12px_40px_rgba(11,27,43,0.35)] backdrop-blur-xl`} style={{ background: st.done ? "linear-gradient(150deg,#fecaca,#fde68aee)" : st.mode === "timer" ? "linear-gradient(150deg,#bae6fdee,#ddd6fecc)" : "linear-gradient(150deg,#bbf7d0ee,#fde68acc)" }} data-testid="class-timer" role="region" aria-label={st.mode === "timer" ? tr("Timer", "المؤقت") : tr("Stopwatch", "ساعة الإيقاف")}>
      <div className="flex cursor-grab touch-none items-center gap-1 bg-[#1b3a57]/90 px-3 py-1.5 text-white" onPointerDown={drag} title={tr("Drag to a corner", "اسحب إلى زاوية")}>
        <span className="flex-1 text-xs font-extrabold uppercase tracking-wider text-[#f5c542]">{st.mode === "timer" ? "⏱ " + tr("Timer", "المؤقت") : "⏲ " + tr("Stopwatch", "ساعة الإيقاف")}</span>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} className="rounded-full px-1.5 text-sm" onClick={() => save({ ...st, mode: st.mode === "timer" ? "stopwatch" : "timer" })} aria-label={tr("Switch", "تبديل")} data-testid="timer-switch">⇄</button>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} className="rounded-full px-1.5 text-sm" onClick={() => save({ ...st, big: !st.big })} aria-label={st.big ? tr("Make small", "تصغير") : tr("Make big", "تكبير")} data-testid="timer-size">{st.big ? "▭" : "⛶"}</button>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} className="rounded-full px-1.5 text-sm" onClick={() => { resetT(); save({ ...load(), open: false, end: null, left: 0, done: false, swStart: null, swAcc: 0, laps: [] }); }} aria-label={tr("Close", "إغلاق")} data-testid="timer-close">✕</button>
      </div>
      <div className="p-3">
        {st.mode === "timer" ? (<>
          <p className={`text-center font-mono font-black tabular-nums ${st.big ? "text-7xl" : "text-4xl"} ${left <= 10000 && st.end ? "text-rose-600" : "text-[#1b3a57]"}`} data-testid="timer-display">{st.done ? tr("Time's up!", "انتهى الوقت!") : fmt(left > 0 ? left : st.end ? 0 : cm * 60000 + cs * 1000)}</p>
          {st.total > 0 && <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60"><div className="h-full rounded-full bg-gradient-to-r from-[#f5c542] to-[#f97316] transition-all" style={{ width: `${pct * 100}%` }} /></div>}
          {!st.end && st.left <= 0 && (<>
            <div className="mt-2 flex flex-wrap justify-center gap-1">{[1, 2, 3, 5, 10].map((m) => <button key={m} type="button" className={`${btn} bg-white/80`} onClick={() => startT(m * 60000)} data-testid={`timer-preset-${m}`}>{m}′</button>)}</div>
            {st.big && <div className="mt-2 flex items-center justify-center gap-1 text-sm font-bold"><input type="number" min={0} max={180} value={cm} onChange={(e) => setCm(Math.max(0, Number(e.target.value)))} className="w-16 rounded-xl border border-black/10 bg-white px-2 py-1 text-center" aria-label={tr("Minutes", "دقائق")} data-testid="timer-min" />:<input type="number" min={0} max={59} value={cs} onChange={(e) => setCs(Math.min(59, Math.max(0, Number(e.target.value))))} className="w-16 rounded-xl border border-black/10 bg-white px-2 py-1 text-center" aria-label={tr("Seconds", "ثوانٍ")} data-testid="timer-sec" /></div>}
          </>)}
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {st.end ? <button type="button" className={`${btn} bg-amber-400`} onClick={pauseT} data-testid="timer-pause">⏸ {tr("Pause", "إيقاف")}</button> : !st.done && <button type="button" className={`${btn} bg-[#1b3a57] text-[#f5c542]`} onClick={() => startT()} data-testid="timer-start">▶ {st.left > 0 ? tr("Resume", "استئناف") : tr("Start", "ابدأ")}</button>}
            <button type="button" className={`${btn} bg-white/80`} onClick={resetT} data-testid="timer-reset">↺ {tr("Reset", "إعادة")}</button>
          </div>
        </>) : (<>
          <p className={`text-center font-mono font-black tabular-nums text-[#1b3a57] ${st.big ? "text-6xl" : "text-3xl"}`} data-testid="sw-display">{fmt(sw, true)}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {st.swStart ? <button type="button" className={`${btn} bg-amber-400`} onClick={() => save({ ...st, swStart: null, swAcc: sw })} data-testid="sw-pause">⏸ {tr("Pause", "إيقاف")}</button> : <button type="button" className={`${btn} bg-[#1b3a57] text-[#f5c542]`} onClick={() => { sfx("start"); save({ ...st, swStart: Date.now() }); setNow(Date.now()); }} data-testid="sw-start">▶ {tr("Start", "ابدأ")}</button>}
            <button type="button" disabled={!st.swStart} className={`${btn} bg-white/80 disabled:opacity-50`} onClick={() => save({ ...st, laps: [sw, ...st.laps].slice(0, 30) })} data-testid="sw-lap">🏁 {tr("Lap", "لفة")}</button>
            <button type="button" className={`${btn} bg-white/80`} onClick={() => save({ ...st, swStart: null, swAcc: 0, laps: [] })} data-testid="sw-reset">↺ {tr("Reset", "إعادة")}</button>
          </div>
          {st.laps.length > 0 && <ol className={`mt-2 space-y-0.5 overflow-y-auto rounded-2xl bg-white/60 px-3 py-1.5 font-mono text-xs ${st.big ? "max-h-40" : "max-h-20"}`} data-testid="sw-laps">{st.laps.map((l, i) => <li key={i} className="flex justify-between"><span>#{st.laps.length - i}</span><span>{fmt(l, true)}</span></li>)}</ol>}
        </>)}
      </div>
    </div>
  );
}
