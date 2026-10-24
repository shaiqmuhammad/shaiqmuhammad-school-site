"use client";

import { useEffect, useRef, useState } from "react";
import { embed } from "@/lib/yt";
import { mediaUrl, type El, type Slide } from "@/lib/packs";
import { useTr } from "@/components/lms/useLms";

/** t315: one 16:9 white slide. Text size is relative to a 1600px-wide slide (container query units), so slides look the same on phone and desktop. */
export function MediaImg({ id, asAdmin, alt = "" }: { id: string; asAdmin: boolean; alt?: string }) {
  const [u, setU] = useState("");
  useEffect(() => { let on = true; mediaUrl(id, asAdmin).then((x) => on && setU(x)).catch(() => undefined); return () => { on = false; }; }, [id, asAdmin]);
  // eslint-disable-next-line @next/next/no-img-element
  return u ? <img src={u} alt={alt} className="pointer-events-none h-full w-full select-none object-contain" draggable={false} /> : <div className="grid h-full w-full place-items-center bg-slate-100 text-xs text-slate-500">…</div>;
}
export function MediaAudio({ id, asAdmin }: { id: string; asAdmin: boolean }) {
  const [u, setU] = useState("");
  useEffect(() => { let on = true; mediaUrl(id, asAdmin).then((x) => on && setU(x)).catch(() => undefined); return () => { on = false; }; }, [id, asAdmin]);
  return <div className="flex h-full w-full items-center rounded-xl bg-amber-50 px-2"><span className="me-1 text-[2.5cqw]">🎙️</span>{u ? <audio controls src={u} className="h-[70%] w-full" controlsList="nodownload" /> : "…"}</div>;
}

function Body({ e, asAdmin, live }: { e: El; asAdmin: boolean; live: boolean }) {
  const { tr } = useTr();
  switch (e.t) {
    case "text":
      return <div dir="auto" className="h-full w-full overflow-hidden whitespace-pre-wrap break-words leading-snug" style={{ color: e.color, background: e.bg || undefined, fontFamily: e.font, fontSize: `${e.size / 16}cqw`, fontWeight: e.bold ? 800 : 400, fontStyle: e.italic ? "italic" : undefined, textAlign: e.align === "center" ? "center" : e.align === "end" ? "end" : "start", padding: "0.4cqw" }}>{e.text || " "}</div>;
    case "img": return <MediaImg id={e.src} asAdmin={asAdmin} />;
    case "audio": return <MediaAudio id={e.src} asAdmin={asAdmin} />;
    case "yt": return live ? <iframe src={embed(e.vid)} title={e.title || "Video"} className="h-full w-full rounded-lg" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div className="grid h-full w-full place-items-center rounded-lg bg-slate-800 text-[2cqw] text-white">▶ {e.title || "YouTube"}</div>;
    case "act": {
      const src = e.code ? `/join?code=${encodeURIComponent(e.code)}` : `/assessments/${encodeURIComponent(e.quiz || "")}`;
      return live ? <iframe src={src} title={e.label || "Activity"} className="h-full w-full rounded-lg border border-slate-200 bg-white" /> : <div className="grid h-full w-full place-items-center rounded-lg bg-violet-100 text-[2cqw] font-bold text-violet-900">🎲 {e.label || e.code || e.quiz}</div>;
    }
    case "quran": return <div className="grid h-full w-full place-items-center rounded-xl border-2 border-amber-300 bg-amber-50 p-[1cqw] text-center text-[2.2cqw] font-bold text-amber-900">📖 {tr("Surah", "سورة")} {e.surah} · {e.from}–{e.to}{e.memorise ? ` · ${tr("memorise", "احفظ")}` : ""}</div>;
    default: return null;
  }
}

export function Strokes({ e }: { e: Extract<El, { t: "draw" }> }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {e.paths.map((p, i) => <polyline key={i} fill="none" stroke={p.c} strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: `${p.w * 0.5}cqw` }} points={p.d.reduce<string[]>((a, n, j) => (j % 2 ? (a[a.length - 1] += `,${n}`, a) : [...a, String(n)]), []).join(" ")} />)}
    </svg>
  );
}

type Props = {
  slide: Slide; layer?: El[]; asAdmin: boolean; live?: boolean;
  /** which layer the user edits: "t" teacher (slide.els) | "s" student (layer) | null read-only */
  edit?: "t" | "s" | null; selected?: string; onSelect?: (id: string) => void;
  onMove?: (id: string, patch: Partial<El>) => void;
  pen?: { c: string; w: number } | null; onStroke?: (d: number[]) => void;
  className?: string; testId?: string;
};
/** Renders a slide (teacher elements, then the student's layer). Editable elements can be dragged and resized; the pen draws strokes. */
export function SlideView({ slide, layer = [], asAdmin, live = true, edit = null, selected, onSelect, onMove, pen, onStroke, className = "", testId = "slide" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; e: El } | null>(null);
  const [stroke, setStroke] = useState<number[] | null>(null);
  const pt = (ev: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return [Math.round(((ev.clientX - r.left) / r.width) * 1000) / 10, Math.round(((ev.clientY - r.top) / r.height) * 1000) / 10]; };
  const down = (ev: React.PointerEvent, e: El, mode: "move" | "size") => {
    if (pen || !edit || (e.by || "t") !== edit) return;
    ev.stopPropagation(); onSelect?.(e.id);
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const [x, y] = pt(ev); drag.current = { id: e.id, mode, sx: x, sy: y, e };
  };
  const move = (ev: React.PointerEvent) => {
    if (stroke) { const [x, y] = pt(ev); setStroke((s) => (s && s.length < 3900 ? [...s, x, y] : s)); return; }
    const d = drag.current; if (!d) return;
    const [x, y] = pt(ev); const dx = x - d.sx, dy = y - d.sy;
    onMove?.(d.id, d.mode === "move" ? { x: Math.round((d.e.x + dx) * 10) / 10, y: Math.round((d.e.y + dy) * 10) / 10 } : { w: Math.max(3, Math.round((d.e.w + dx) * 10) / 10), h: Math.max(3, Math.round((d.e.h + dy) * 10) / 10) });
  };
  const up = () => { drag.current = null; if (stroke) { if (stroke.length >= 4) onStroke?.(stroke); setStroke(null); } };
  const all = [...slide.els.map((e) => ({ ...e, by: "t" as const })), ...layer.map((e) => ({ ...e, by: "s" as const }))];
  return (
    <div ref={box} className={`relative aspect-video w-full touch-none select-none overflow-hidden rounded-xl shadow-md ring-1 ring-black/10 [container-type:inline-size] ${className}`} style={{ background: slide.bg || "#fff", color: "#1b2f44" }} data-testid={testId}
      onPointerDown={(ev) => { if (pen && edit) { (ev.target as Element).setPointerCapture?.(ev.pointerId); setStroke(pt(ev)); } else onSelect?.(""); }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {all.map((e) => e.t === "draw" ? <Strokes key={e.by + e.id} e={e} /> : (
        <div key={e.by + e.id} className={`absolute ${edit && e.by === edit && !pen ? "cursor-move" : ""} ${selected === e.id && e.by === edit ? "outline outline-2 outline-offset-2 outline-sky-500" : ""}`} style={{ left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${e.h}%` }}
          onPointerDown={(ev) => down(ev, e, "move")} data-testid={`el-${e.t}`}>
          <div className={edit && e.by === edit && !pen && (e.t === "yt" || e.t === "act") ? "pointer-events-none h-full w-full" : "h-full w-full"}><Body e={e} asAdmin={asAdmin} live={live && !(edit && e.by === edit)} /></div>
          {selected === e.id && e.by === edit && !pen && <span className="absolute -bottom-2 -end-2 h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-sky-500" onPointerDown={(ev) => down(ev, e, "size")} data-testid="el-resize" />}
        </div>))}
      {stroke && pen && <Strokes e={{ id: "tmp", t: "draw", x: 0, y: 0, w: 100, h: 100, paths: [{ c: pen.c, w: pen.w, d: stroke }] }} />}
    </div>
  );
}
