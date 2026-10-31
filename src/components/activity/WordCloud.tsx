"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fieldCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { actErr, useTr } from "@/components/activity/common";
import { activityApi, type ActivityState, type Who } from "@/lib/activity";


export type CloudWord = { word: string; count: number; ids: string[] };

/** Groups word items case-insensitively (Arabic stays as typed). */
export function cloudWords(state: ActivityState): CloudWord[] {
  const map = new Map<string, CloudWord>();
  for (const i of state.items) {
    if (i.kind !== "word" || !i.data.word) continue;
    const key = i.data.word.toLocaleLowerCase();
    const w = map.get(key) || { word: i.data.word, count: 0, ids: [] };
    w.count++;
    w.ids.push(i.id);
    map.set(key, w);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

const HEX = ["#0284c7", "#d97706", "#059669", "#e11d48", "#7c3aed", "#0d9488", "#1b3a57", "#c026d3", "#ea580c", "#4f46e5"];
type Placed = { w: CloudWord; x: number; y: number; size: number; rot: boolean; color: string; bw: number; bh: number };

/** t370: a real packed word cloud — bigger = more frequent, varied colours, some words turned 90°, spiral placement. */
function layout(words: CloudWord[], W: number, H: number, big: boolean): Placed[] {
  if (typeof document === "undefined" || !W) return [];
  const cv = document.createElement("canvas").getContext("2d");
  if (!cv) return [];
  const max = words[0]?.count || 1, min = words[words.length - 1]?.count || 1;
  const lo = big ? 20 : 15, hi = Math.min(big ? 96 : 64, W / 5);
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const out: Placed[] = [];
  const hit = (b: { x: number; y: number; w: number; h: number }) => b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H || boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  words.slice(0, 120).forEach((w, i) => {
    const k = max > min ? (w.count - min) / (max - min) : 0.55;
    let size = lo + Math.sqrt(k) * (hi - lo);
    for (let attempt = 0; attempt < 4; attempt++, size *= 0.8) {
      cv.font = `800 ${size}px system-ui, sans-serif`;
      const tw = cv.measureText(w.word).width + 8, th = size * 1.1;
      const rot = i > 0 && i % 3 === 1 && tw < H * 0.8;
      const bw = rot ? th : tw, bh = rot ? tw : th;
      for (let t = 0; t < 2400; t++) {
        const ang = t * 0.35, rad = 2.2 * Math.sqrt(t) * 3;
        const cx = W / 2 + rad * Math.cos(ang) * (W / H > 1 ? 1.4 : 1), cy = H / 2 + rad * Math.sin(ang);
        const b = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
        if (!hit(b)) { boxes.push(b); out.push({ w, x: cx, y: cy, size, rot, color: HEX[i % HEX.length], bw, bh }); return; }
      }
    }
  });
  return out;
}

export function Cloud({ words, big = false, onDelete }: { words: CloudWord[]; big?: boolean; onDelete?: (w: CloudWord) => void }) {
  const { tr } = useTr();
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, [words.length > 0]);
  const H = Math.max(big ? 420 : 260, Math.min(big ? 640 : 420, W * 0.6));
  const placed = useMemo(() => layout(words, W, H, big), [words, W, H, big]);
  if (!words.length) return <p className="glass rounded-3xl px-6 py-12 text-center text-lg opacity-80" data-testid="cloud-empty">{tr("No words yet…", "لا توجد كلمات بعد…")}</p>;
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-[28px] bg-white shadow-inner ring-1 ring-black/5" style={{ height: H }} data-testid="word-cloud">
      {placed.map((p) => (
        <span key={p.w.word} className="group absolute flex items-center justify-center whitespace-nowrap font-extrabold leading-none transition-all duration-500" style={{ left: p.x, top: p.y, fontSize: p.size, color: p.color, transform: `translate(-50%, -50%)${p.rot ? " rotate(-90deg)" : ""}` }} dir="auto" data-testid="cloud-word" data-count={p.w.count} title={`${p.w.word} × ${p.w.count}`}>
          {p.w.word}
          {onDelete && (
            <button type="button" className="ms-1 rounded-full bg-rose-600 px-1.5 text-xs leading-5 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100" style={{ fontSize: 12 }} onClick={() => onDelete(p.w)} aria-label={tr(`Delete ${p.w.word}`, `حذف ${p.w.word}`)} data-testid="cloud-delete">✕</button>
          )}
        </span>
      ))}
    </div>
  );
}

export function WordCloudStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const max = Number(state.settings.options.maxPerStudent) || 3;
  const mine = state.items.filter((i) => i.kind === "word" && i.mine).length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-5">
      {!closed && mine < max && (
        <form
          className="glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim() || busy) return;
            setBusy(true);
            setMsg("");
            try {
              await activityApi.respond(code, who, { word: text.trim() });
              setText("");
              reload();
            } catch (err) {
              setMsg(actErr(err, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input className={fieldCls + " mt-0 flex-1 text-xl"} value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder={tr("1–3 words", "١–٣ كلمات")} dir="auto" autoComplete="off" data-testid="word-input" aria-label={tr("Your word", "كلمتك")} />
          <button type="submit" className={primaryBtn} disabled={busy || !text.trim() || words > 3} data-testid="word-submit">
            {tr("Send", "أرسل")}
          </button>
        </form>
      )}
      <p className="text-sm font-semibold opacity-80" data-testid="word-left">
        {mine >= max ? tr("Thanks! You've sent all your words.", "شكرًا! أرسلت كل كلماتك.") : tr(`${max - mine} of ${max} left`, `بقي ${max - mine} من ${max}`)}
        {words > 3 && <span className="ms-2 text-rose-600">{tr("Max 3 words", "٣ كلمات كحد أقصى")}</span>}
      </p>
      {msg && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert">{msg}</p>}
      <Cloud words={cloudWords(state)} />
    </div>
  );
}

export function WordCloudHost({ code, hostKey, state, reload, big }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const words = cloudWords(state);
  const total = state.items.filter((i) => i.kind === "word").length;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold opacity-80" data-testid="cloud-stats">
        {tr(`${total} entries · ${words.length} different words`, `${total} مشاركة · ${words.length} كلمة مختلفة`)}
      </p>
      <Cloud
        words={words}
        big={big}
        onDelete={async (w) => {
          for (const id of w.ids) await activityApi.moderate(code, hostKey, "delete", { id }).catch(() => undefined);
          reload();
        }}
      />
    </div>
  );
}

export function WordCloudOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold">
      {tr("Entries per student", "عدد المشاركات لكل طالب")}
      <select className="rounded-full border border-black/10 bg-white px-3 py-1.5 dark:border-white/15 dark:bg-black/30" value={Number(options.maxPerStudent) || 3} onChange={(e) => setOptions({ ...options, maxPerStudent: Number(e.target.value) })} data-testid="wc-max">
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}
