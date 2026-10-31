"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lmsSession } from "@/lib/lms";
import { cachedSiteSound, sfx } from "@/lib/actSound";
import { useTr } from "@/components/lms/useLms";

/** t380: teacher Timer / Stopwatch — floating glass widget, client-only. Stores timestamps (not a ticking count) in localStorage. */
type St = { mode: "timer" | "stopwatch"; open: boolean; big: boolean; corner: "br" | "bl" | "tr" | "tl"; end: number | null; left: number; total: number; swStart: number | null; swAcc: number; laps: number[]; done: boolean; w?: number };
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
  // t382: pop-out window that stays on top of other apps (Document Picture-in-Picture, Chrome/Edge 116+).
  const [pip, setPip] = useState<Window | null>(null);
  const [pipMsg, setPipMsg] = useState("");
  useEffect(() => () => { try { pip?.close(); } catch { /* */ } }, [pip]);
  const popOut = async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window>; window?: Window | null } }).documentPictureInPicture;
    if (!dpip) { setPipMsg(tr("Pop-out needs Chrome or Edge (version 116 or newer).", "النافذة العائمة تحتاج كروم أو إيدج (116 أو أحدث).")); return; }
    try {
      if (dpip.window) { dpip.window.focus(); return; }
      const w = await dpip.requestWindow({ width: 360, height: 260 });
      for (const el of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) w.document.head.appendChild(el.cloneNode(true));
      w.document.documentElement.className = document.documentElement.className.replace(/\bdark\b/, "");
      w.document.body.style.margin = "0";
      w.document.title = tr("Class timer", "مؤقت الصف");
      w.addEventListener("pagehide", () => setPip(null));
      setPip(w); setPipMsg("");
    } catch { setPipMsg(tr("The browser blocked the pop-out window.", "منع المتصفح النافذة العائمة.")); }
  };
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
  // The pop-out window is visible, so tick from it (the minimised main page is throttled by the browser).
  useEffect(() => { if (!running && !st.done) return; const w = pip || window; const t = w.setInterval(() => setNow(Date.now()), 200); return () => w.clearInterval(t); }, [running, st.done, pip]);
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
  useEffect(() => { if (st.mode === "timer" && st.end && !st.done && left > 0) { if (!title.current) title.current = document.title; document.title = `⏱ ${fmt(left)}`; } else if (!st.done && title.current) { document.title = title.current; title.current = ""; } });
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
  // t383: free resize (size remembered), digits scale with the widget; colours shift orange → red in the last 10 s.
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const W = Math.round(Math.min(vw - 24, st.big ? Math.max(640, st.w || 400) : st.w || (vw < 640 ? 300 : 400)));
  const last = st.mode === "timer" && !!st.end && left <= 10000;
  const bg = st.done ? "linear-gradient(145deg,rgba(239,68,68,0.85),rgba(244,63,94,0.7))" : last ? (left <= 5000 ? "linear-gradient(145deg,rgba(239,68,68,0.82),rgba(249,115,22,0.7))" : "linear-gradient(145deg,rgba(249,115,22,0.8),rgba(251,191,36,0.7))") : st.mode === "timer" ? "linear-gradient(145deg,rgba(45,212,191,0.72),rgba(139,92,246,0.68))" : "linear-gradient(145deg,rgba(251,191,36,0.75),rgba(236,72,153,0.68))";
  const glow = st.done || last ? "0 0 40px rgba(239,68,68,0.55), 0 12px 40px rgba(11,27,43,0.35)" : st.mode === "timer" ? "0 0 36px rgba(45,212,191,0.45), 0 12px 40px rgba(11,27,43,0.3)" : "0 0 36px rgba(236,72,153,0.4), 0 12px 40px rgba(11,27,43,0.3)";
  const resize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); const x0 = e.clientX, w0 = W, rightDock = st.corner.endsWith("r");
    const mv = (ev: PointerEvent) => { const d = (ev.clientX - x0) * (rightDock ? -1 : 1); const nw = Math.max(240, Math.min(window.innerWidth - 24, w0 + d)); setSt((o) => ({ ...o, w: nw, big: false })); };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); setSt((o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* */ } return o; }); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const digit = pip ? { fontSize: st.mode === "timer" ? "min(27vw, 42vh)" : "min(17vw, 34vh)", lineHeight: 1, color: "#fff", textShadow: "0 3px 18px rgba(0,0,0,0.35)" } : { fontSize: Math.round(W * (st.mode === "timer" ? 0.24 : 0.15)), lineHeight: 1.05, color: "#fff", textShadow: "0 3px 18px rgba(0,0,0,0.35)" };
  const ui = (
    <div className={`${pip ? "relative flex h-screen w-screen flex-col" : `fixed ${pos} z-[2500]`} overflow-hidden rounded-[2rem] border border-white/60 text-[#1b2f44] backdrop-blur-xl transition-[background,box-shadow] duration-500`} style={{ background: bg, boxShadow: glow, ...(pip ? {} : { width: W }) }} data-testid="class-timer" role="region" aria-label={st.mode === "timer" ? tr("Timer", "المؤقت") : tr("Stopwatch", "ساعة الإيقاف")}>
      <div className="flex cursor-grab touch-none items-center gap-1 bg-[#1b3a57]/90 px-3 py-1.5 text-white" onPointerDown={pip ? undefined : drag} title={tr("Drag to a corner", "اسحب إلى زاوية")}>
        <span className="flex-1 text-xs font-extrabold uppercase tracking-wider text-[#f5c542]">{st.mode === "timer" ? "⏱ " + tr("Timer", "المؤقت") : "⏲ " + tr("Stopwatch", "ساعة الإيقاف")}</span>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} className="rounded-full px-1.5 text-sm" onClick={() => save({ ...st, mode: st.mode === "timer" ? "stopwatch" : "timer" })} aria-label={tr("Switch", "تبديل")} data-testid="timer-switch">⇄</button>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} className="rounded-full px-1.5 text-sm" onClick={() => save({ ...st, big: !st.big })} hidden={!!pip} aria-label={st.big ? tr("Make small", "تصغير") : tr("Make big", "تكبير")} data-testid="timer-size">{st.big ? "▭" : "⛶"}</button>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} className="rounded-full px-1.5 text-sm" onClick={() => (pip ? pip.close() : popOut())} title={pip ? tr("Back to the page", "العودة إلى الصفحة") : tr("Pop out (stays on top)", "نافذة عائمة (فوق التطبيقات)")} aria-label={pip ? tr("Back to the page", "العودة إلى الصفحة") : tr("Pop out (stays on top)", "نافذة عائمة")} data-testid="timer-popout">{pip ? "↩" : "⧉"}</button>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} className="rounded-full px-1.5 text-sm" onClick={() => { try { pip?.close(); } catch { /* */ } resetT(); save({ ...load(), open: false, end: null, left: 0, done: false, swStart: null, swAcc: 0, laps: [] }); }} aria-label={tr("Close", "إغلاق")} data-testid="timer-close">✕</button>
      </div>
      {pipMsg && !pip && <p className="bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900" role="status" data-testid="timer-pip-msg">{pipMsg}</p>}
      <div className={pip ? "flex flex-1 flex-col justify-center p-3" : "p-3"}>
        {st.mode === "timer" ? (<>
          <p className={`text-center font-mono font-black tabular-nums `} style={digit} data-testid="timer-display">{st.done ? tr("Time's up!", "انتهى الوقت!") : fmt(left > 0 ? left : st.end ? 0 : cm * 60000 + cs * 1000)}</p>
          {st.total > 0 && <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60"><div className="h-full rounded-full bg-gradient-to-r from-[#f5c542] to-[#f97316] transition-all" style={{ width: `${pct * 100}%` }} /></div>}
          {!st.end && st.left <= 0 && (<>
            <div className="mt-2 flex flex-wrap justify-center gap-1">{[1, 2, 3, 5, 10].map((m) => <button key={m} type="button" className={`${btn} bg-white/80`} onClick={() => startT(m * 60000)} data-testid={`timer-preset-${m}`}>{m}′</button>)}</div>
            {<div className="mt-2 flex items-center justify-center gap-1 text-sm font-bold"><input type="number" min={0} max={180} value={cm} onChange={(e) => setCm(Math.max(0, Number(e.target.value)))} className="w-16 rounded-xl border border-black/10 bg-white px-2 py-1 text-center" aria-label={tr("Minutes", "دقائق")} data-testid="timer-min" />:<input type="number" min={0} max={59} value={cs} onChange={(e) => setCs(Math.min(59, Math.max(0, Number(e.target.value))))} className="w-16 rounded-xl border border-black/10 bg-white px-2 py-1 text-center" aria-label={tr("Seconds", "ثوانٍ")} data-testid="timer-sec" /></div>}
          </>)}
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {st.end ? <button type="button" className={`${btn} bg-amber-400`} onClick={pauseT} data-testid="timer-pause">⏸ {tr("Pause", "إيقاف")}</button> : !st.done && <button type="button" className={`${btn} bg-[#1b3a57] text-[#f5c542]`} onClick={() => startT()} data-testid="timer-start">▶ {st.left > 0 ? tr("Resume", "استئناف") : tr("Start", "ابدأ")}</button>}
            <button type="button" className={`${btn} bg-white/80`} onClick={resetT} data-testid="timer-reset">↺ {tr("Reset", "إعادة")}</button>
          </div>
        </>) : (<>
          <p className={`text-center font-mono font-black tabular-nums`} style={digit} data-testid="sw-display">{fmt(sw, true)}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {st.swStart ? <button type="button" className={`${btn} bg-amber-400`} onClick={() => save({ ...st, swStart: null, swAcc: sw })} data-testid="sw-pause">⏸ {tr("Pause", "إيقاف")}</button> : <button type="button" className={`${btn} bg-[#1b3a57] text-[#f5c542]`} onClick={() => { sfx("start"); save({ ...st, swStart: Date.now() }); setNow(Date.now()); }} data-testid="sw-start">▶ {tr("Start", "ابدأ")}</button>}
            <button type="button" disabled={!st.swStart} className={`${btn} bg-white/80 disabled:opacity-50`} onClick={() => save({ ...st, laps: [sw, ...st.laps].slice(0, 30) })} data-testid="sw-lap">🏁 {tr("Lap", "لفة")}</button>
            <button type="button" className={`${btn} bg-white/80`} onClick={() => save({ ...st, swStart: null, swAcc: 0, laps: [] })} data-testid="sw-reset">↺ {tr("Reset", "إعادة")}</button>
          </div>
          {st.laps.length > 0 && <ol className={`mt-2 space-y-0.5 overflow-y-auto rounded-2xl bg-white/60 px-3 py-1.5 font-mono text-xs ${st.big ? "max-h-40" : "max-h-20"}`} data-testid="sw-laps">{st.laps.map((l, i) => <li key={i} className="flex justify-between"><span>#{st.laps.length - i}</span><span>{fmt(l, true)}</span></li>)}</ol>}
        </>)}
      </div>
      {!pip && <span onPointerDown={resize} className={`absolute bottom-1 ${st.corner.endsWith("r") ? "start-1 cursor-nesw-resize" : "end-1 cursor-nwse-resize"} grid h-6 w-6 touch-none place-items-center rounded-full bg-white/40 text-xs text-white`} title={tr("Drag to resize", "اسحب لتغيير الحجم")} aria-hidden data-testid="timer-resize">⤡</span>}
    </div>
  );
  if (pip) return <>{createPortal(ui, pip.document.body)}<button type="button" onClick={() => pip.close()} className="fixed bottom-28 end-3 z-[2500] rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-extrabold text-[#f5c542] shadow-lg" data-testid="timer-pip-placeholder">⧉ {tr("Timer is in the pop-out window — tap to bring back", "المؤقت في النافذة العائمة — اضغط لإرجاعه")}</button></>;
  return ui;
}
