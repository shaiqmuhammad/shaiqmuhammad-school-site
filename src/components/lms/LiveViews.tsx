"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTr } from "@/components/lms/useLms";
import type { LiveMember, LiveViewMode } from "@/lib/lms";

export const VIEW_CARDS: { id: LiveViewMode; icon: string; en: string; ar: string; hint: string; hintAr: string; color: string }[] = [
  { id: "teach", icon: "📚", en: "Teaching", ar: "تعليم", hint: "Slides large, teacher floats, students in a strip", hintAr: "الشرائح كبيرة، فيديو المعلم صغير، والطلاب في شريط", color: "#60a5fa" },
  { id: "lecture", icon: "🎙️", en: "Lecture", ar: "محاضرة", hint: "Teacher large, slides beside, students as thumbnails", hintAr: "المعلم كبير والشرائح بجانبه، والطلاب صور مصغرة", color: "#a78bfa" },
  { id: "gallery", icon: "👥", en: "Video chat", ar: "محادثة فيديو", hint: "Everyone in an equal grid", hintAr: "الجميع في شبكة متساوية", color: "#34d399" },
  { id: "speaker", icon: "⭐", en: "Speaker", ar: "المتحدث", hint: "The speaker or raised hand is large", hintAr: "المتحدث أو من رفع يده يظهر كبيراً", color: "#f5c542" },
  { id: "board", icon: "🖍️", en: "Whiteboard", ar: "السبورة", hint: "Board fills the screen, videos minimised", hintAr: "السبورة تملأ الشاشة والفيديو مصغر", color: "#fb7185" },
  { id: "discuss", icon: "💬", en: "Discussion", ar: "نقاش", hint: "Video grid with chat open", hintAr: "شبكة الفيديو مع الدردشة مفتوحة", color: "#22d3ee" },
];

export function presentLayout(mode: LiveViewMode, presenting: boolean): "full" | "side" | "compact" | "board" {
  // A Library pack must take the teaching stage even if the room is still on the default whiteboard view.
  if (presenting) return mode === "lecture" ? "side" : "full";
  if (mode === "board") return "board";
  if (mode === "teach") return "full";
  if (mode === "lecture") return "side";
  return "compact";
}

/** Whiteboard fills the stage only when no lesson pack is on screen. */
export function boardFillsStage(mode: LiveViewMode, present?: { packId?: string; tool?: string } | null): boolean {
  if (present?.packId) return false;
  return mode === "board" || present?.tool === "board";
}

export function useActiveSpeaker(
  members: LiveMember[],
  remotes: Record<string, MediaStream>,
  localStream: MediaStream | null,
  selfId: string,
): string {
  const [loud, setLoud] = useState("");
  const key = members.map((m) => `${m.id}:${m.hand}:${m.present}`).join("|") + ":" + Object.keys(remotes).sort().join(",") + (localStream ? ":loc" : "");
  useEffect(() => {
    const raised = members.find((m) => m.hand && m.present)?.id;
    if (raised) { setLoud(raised); return; }
    let ctx: AudioContext | null = null;
    let timer = 0;
    const sources: { id: string; an: AnalyserNode }[] = [];
    try {
      ctx = new AudioContext();
      const add = (id: string, stream?: MediaStream | null) => {
        if (!stream || !ctx) return;
        const tracks = stream.getAudioTracks().filter((t) => t.readyState !== "ended");
        if (!tracks.length) return;
        const src = ctx.createMediaStreamSource(new MediaStream(tracks));
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0.6;
        src.connect(an);
        sources.push({ id, an });
      };
      for (const m of members) {
        if (!m.present) continue;
        if (m.id === selfId) add(m.id, localStream);
        else add(m.id, remotes[`${m.id}:mic`] || remotes[`${m.id}:camera`]);
      }
      const buf = new Uint8Array(256);
      let last = "";
      let hold = 0;
      timer = window.setInterval(() => {
        let best = "";
        let peak = 12;
        for (const s of sources) {
          s.an.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i];
          const avg = sum / buf.length;
          if (avg > peak) { peak = avg; best = s.id; }
        }
        const now = Date.now();
        if (best) { last = best; hold = now + 1500; setLoud(best); }
        else if (now > hold) setLoud(last);
      }, 200);
    } catch { /* no audio analysis */ }
    return () => { clearInterval(timer); void ctx?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, selfId]);
  const hand = members.find((m) => m.hand && m.present)?.id;
  if (hand) return hand;
  if (loud && members.some((m) => m.id === loud && m.present)) return loud;
  return members.find((m) => m.role === "teacher" && m.present)?.id || members.find((m) => m.present)?.id || selfId;
}

export function LiveViewPicker({
  mode, follow, canPush, onMode, onFollow, onClose,
}: {
  mode: LiveViewMode;
  follow: boolean;
  canPush: boolean;
  onMode: (m: LiveViewMode) => void;
  onFollow?: (on: boolean) => void;
  onClose: () => void;
}) {
  const { tr } = useTr();
  return (
    <div className="absolute end-0 top-full z-[90] mt-2 w-[min(94vw,22rem)] rounded-3xl border border-white/20 bg-white p-3 text-[#1b3a57] shadow-2xl ring-1 ring-black/10 dark:bg-slate-900 dark:text-white" data-testid="live-view-picker" role="dialog" aria-label={tr("Classroom view", "عرض الصف")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-black">{tr("Classroom view", "عرض الصف")}</p>
        <button type="button" className="rounded-full px-2 text-lg leading-none" onClick={onClose} aria-label={tr("Close", "إغلاق")}>✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {VIEW_CARDS.map((c) => {
          const on = mode === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onMode(c.id)}
              title={tr(c.hint, c.hintAr)}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${on ? "ring-2 ring-offset-2 dark:ring-offset-slate-900" : "opacity-90"}`}
              style={{ background: on ? c.color : `linear-gradient(180deg, ${c.color}33, ${c.color}14)`, borderColor: `${c.color}99`, ["--tw-ring-color" as string]: c.color }}
              data-testid={`live-view-${c.id}`}
              aria-pressed={on}
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/90 text-2xl shadow-inner dark:bg-white/20" aria-hidden>{c.icon}</span>
              <span className="text-xs font-black leading-tight">{tr(c.en, c.ar)}</span>
            </button>
          );
        })}
      </div>
      {canPush && onFollow && (
        <div className="mt-3 flex flex-col gap-1.5">
          <button type="button" className={`rounded-2xl px-3 py-2 text-left text-sm font-bold ${follow ? "bg-emerald-200 text-[#10331c] dark:bg-emerald-800 dark:text-emerald-50" : "bg-black/5 dark:bg-white/10"}`} onClick={() => onFollow(true)} data-testid="live-view-push">
            📡 {tr("Push this view to everyone", "أرسل هذا العرض للجميع")}
          </button>
          <button type="button" className={`rounded-2xl px-3 py-2 text-left text-sm font-bold ${!follow ? "bg-amber-200 text-[#3b2a00] dark:bg-amber-800 dark:text-amber-50" : "bg-black/5 dark:bg-white/10"}`} onClick={() => onFollow(false)} data-testid="live-view-free">
            🙋 {tr("Let students choose their own", "دع الطلاب يختارون بأنفسهم")}
          </button>
        </div>
      )}
    </div>
  );
}

export function VideoDock({ children }: { children: ReactNode }) {
  const { tr } = useTr();
  const [min, setMin] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest("button, video, select, a")) return;
    drag.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos({ x: Math.max(8, drag.current.x + (e.clientX - drag.current.px)), y: Math.max(8, drag.current.y + (e.clientY - drag.current.py)) });
  };
  return (
    <div
      className="fixed z-[70] max-w-[min(100vw-16px,420px)] rounded-3xl bg-white/95 p-2 shadow-2xl ring-2 ring-indigo-200 transition duration-300 dark:bg-slate-900/95 dark:ring-indigo-700"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => { drag.current = null; }}
      data-testid="live-video-dock"
      data-focus-keep
    >
      <div className="mb-1 flex cursor-grab items-center justify-between gap-2 active:cursor-grabbing">
        <p className="text-xs font-black text-[#1b3a57] dark:text-white">{tr("Class video", "فيديو الصف")}</p>
        <button type="button" className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold dark:bg-white/10" onClick={() => setMin((v) => !v)} data-testid="live-video-dock-toggle">{min ? tr("Show", "إظهار") : tr("Minimise", "تصغير")}</button>
      </div>
      {!min && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function Strip({ children, testId }: { children: ReactNode; testId: string }) {
  if (!children) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 transition-all duration-300 [scrollbar-width:thin]" data-testid={testId}>
      {children}
    </div>
  );
}

export function RoomStage({
  mode, presenting, presentSlot, screen, teacher, teacherHero, students, thumbs, gallery, featured, others,
}: {
  mode: LiveViewMode;
  presenting: boolean;
  presentSlot: ReactNode;
  screen?: ReactNode;
  teacher: ReactNode;
  teacherHero: ReactNode;
  students: ReactNode;
  thumbs: ReactNode;
  gallery: ReactNode;
  featured: ReactNode;
  others: ReactNode;
}) {
  const { tr } = useTr();
  const boardOrSlides = presentSlot || (mode === "board" ? (
    <div className="flex min-h-[40vh] flex-1 items-center justify-center rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5 dark:bg-slate-800">
      <p className="font-bold opacity-70">{tr("Present a lesson pack to fill the whiteboard.", "اعرض حزمة درس لتملأ السبورة.")}</p>
    </div>
  ) : null);
  const teachMain = boardOrSlides || screen || teacherHero;

  return (
    <div className="live-stage flex min-h-0 flex-1 flex-col gap-3" data-testid={`live-stage-${mode}`} data-view={mode}>
      {mode === "teach" && (
        <>
          <div className="min-h-0 flex-1">{teachMain}</div>
          {screen && boardOrSlides ? <Strip testId="live-screen-strip">{screen}</Strip> : null}
          <Strip testId="live-student-strip">{students}</Strip>
          <VideoDock>{(boardOrSlides || screen) ? teacher : null}</VideoDock>
        </>
      )}
      {mode === "lecture" && (
        <>
          <div className={`flex min-h-0 flex-1 flex-col gap-3 ${presenting || screen ? "lg:flex-row" : ""}`}>
            <div className={`flex min-h-[220px] flex-col gap-2 ${presenting || screen ? "lg:w-[42%] lg:shrink-0" : "flex-1"}`}>{teacherHero}{presenting ? screen : null}</div>
            {(presenting || screen) && <div className="min-h-0 flex-1">{presenting ? presentSlot : screen}</div>}
          </div>
          <div className="hidden sm:block"><Strip testId="live-student-thumbs">{thumbs}</Strip></div>
        </>
      )}
      {mode === "gallery" && (
        <>
          {presentSlot && <div className="max-h-[28vh] overflow-auto lg:max-h-[32vh]">{presentSlot}</div>}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{gallery}</div>
        </>
      )}
      {mode === "speaker" && (
        <>
          {presentSlot && <div className="max-h-[22vh] overflow-auto">{presentSlot}</div>}
          <div className="min-h-0 flex-1">{featured}</div>
          <Strip testId="live-speaker-strip">{others}</Strip>
        </>
      )}
      {mode === "board" && (
        <>
          <div className="flex min-h-0 flex-1 flex-col">{boardOrSlides}</div>
          <VideoDock>{teacher}{students}{screen}</VideoDock>
        </>
      )}
      {mode === "discuss" && (
        <>
          {presentSlot && <div className="max-h-[24vh] overflow-auto">{presentSlot}</div>}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3">{gallery}</div>
        </>
      )}
    </div>
  );
}
