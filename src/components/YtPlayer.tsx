"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/* Minimal typings for the IFrame API */
type YTPlayer = { playVideo(): void; pauseVideo(): void; seekTo(s: number, a: boolean): void; getCurrentTime(): number; getDuration(): number; mute(): void; unMute(): void; isMuted(): boolean; destroy(): void };
declare global { interface Window { YT?: { Player: new (el: HTMLElement, o: unknown) => YTPlayer; PlayerState: { PLAYING: number; PAUSED: number; ENDED: number } }; onYouTubeIframeAPIReady?: () => void } }

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) apiPromise = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true; s.onerror = () => rej(new Error("yt_api"));
    document.head.appendChild(s);
    setTimeout(() => rej(new Error("yt_timeout")), 8000);
  });
  return apiPromise;
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Branded-free video player: privacy-enhanced embed driven through the IFrame API.
 * - Before play only OUR poster + title + play button show (no YouTube title bar or logo).
 * - The iframe never receives clicks: a full-size layer on top toggles play/pause and our own control bar handles
 *   seek / mute / fullscreen, so nothing on screen can open YouTube.
 * - Solid covers sit over the top (YouTube's title bar) and the bottom (logo / "more videos" strip) while paused.
 */
export function YtPlayer({ id, title, autoPlay = false, className = "" }: { id: string; title?: string; autoPlay?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [started, setStarted] = useState(autoPlay);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!started) return;
    let dead = false;
    loadApi().then(() => {
      if (dead || !host.current || !window.YT) return;
      const el = document.createElement("div");
      host.current.appendChild(el);
      player.current = new window.YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        videoId: id,
        width: "100%", height: "100%",
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, fs: 0, disablekb: 1, playsinline: 1, cc_load_policy: 0, origin: window.location.origin },
        events: {
          onReady: () => { setReady(true); setD(player.current?.getDuration() || 0); player.current?.playVideo(); },
          onStateChange: (e: { data: number }) => { const S = window.YT!.PlayerState; setPlaying(e.data === S.PLAYING); setEnded(e.data === S.ENDED); if (e.data === S.PLAYING) setD(player.current?.getDuration() || 0); },
        },
      });
    }).catch(() => !dead && setFailed(true));
    return () => { dead = true; try { player.current?.destroy(); } catch { /* ignore */ } player.current = null; };
  }, [started, id]);

  useEffect(() => {
    if (!playing) return;
    const i = setInterval(() => setT(player.current?.getCurrentTime() || 0), 300);
    return () => clearInterval(i);
  }, [playing]);

  const toggle = useCallback(() => {
    const p = player.current; if (!p) return;
    if (ended) { p.seekTo(0, true); p.playVideo(); } else if (playing) p.pauseVideo(); else p.playVideo();
  }, [playing, ended]);
  const fs = () => { const el = box.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };

  const showCovers = !playing; // YouTube's own title bar / logo / suggestions only appear when not playing
  return (
    <div ref={box} className={`group relative aspect-video w-full overflow-hidden bg-black text-white ${className}`} data-testid="yt-embed" data-id={id}>
      {!started ? (
        <button type="button" onClick={() => setStarted(true)} className="absolute inset-0 block h-full w-full" aria-label={title ? `Play: ${title}` : "Play video"} data-testid="yt-poster">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />
          {title && <span className="absolute inset-x-0 top-0 line-clamp-2 p-3 text-start text-sm font-bold sm:text-base" dir="auto">{title}</span>}
          <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sun text-2xl text-[#0b1b2b] shadow-xl transition group-hover:scale-110">▶</span>
        </button>
      ) : failed ? (
        <p className="grid h-full place-items-center p-4 text-center text-sm">Video unavailable right now.</p>
      ) : (
        <>
          <div ref={host} className="pointer-events-none absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" />
          {/* full-size click shield: nothing reaches the YouTube iframe */}
          <button type="button" onClick={toggle} className="absolute inset-0 z-10 h-full w-full cursor-pointer" aria-label={playing ? "Pause" : "Play"} data-testid="yt-shield" />
          {/* solid covers while paused: top = YouTube title bar, bottom = logo / suggestions strip */}
          {showCovers && ready && <span className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-black" />}
          {showCovers && ready && <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[22%] min-h-14 bg-black" />}
          {!ready && <span className="absolute inset-0 z-20 grid place-items-center bg-black text-sm opacity-90">…</span>}
          {title && showCovers && ready && <span className="pointer-events-none absolute inset-x-0 top-0 z-30 line-clamp-1 p-3 text-start text-sm font-bold" dir="auto">{title}</span>}
          {showCovers && ready && <span className="pointer-events-none absolute left-1/2 top-1/2 z-30 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sun text-2xl text-[#0b1b2b] shadow-xl">{ended ? "↻" : "▶"}</span>}
          {/* our control bar */}
          <div className={`absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 bg-black px-3 py-2 text-xs transition-opacity ${playing ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100" : "opacity-100"}`} data-testid="yt-controls">
            <button type="button" onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full bg-white/15 hover:bg-white/30" aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
            <span className="tabular-nums" dir="ltr">{fmt(t)}</span>
            <input type="range" min={0} max={Math.max(1, Math.floor(d))} value={Math.floor(t)} onChange={(e) => { const v = Number(e.target.value); setT(v); player.current?.seekTo(v, true); }} className="min-w-0 flex-1 accent-[#f5b800]" aria-label="Seek" dir="ltr" />
            <span className="tabular-nums" dir="ltr">{fmt(d)}</span>
            <button type="button" onClick={() => { const p = player.current; if (!p) return; if (muted) p.unMute(); else p.mute(); setMuted(!muted); }} className="grid h-8 w-8 place-items-center rounded-full bg-white/15 hover:bg-white/30" aria-label={muted ? "Unmute" : "Mute"}>{muted ? "🔇" : "🔊"}</button>
            <button type="button" onClick={fs} className="grid h-8 w-8 place-items-center rounded-full bg-white/15 hover:bg-white/30" aria-label="Fullscreen">⛶</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders trusted HTML (lesson / custom pages) and upgrades `.yt-embed[data-yt]` placeholders to YtPlayer. */
export function RichHtml({ html, className = "", ...rest }: { html: string; className?: string } & Record<string, unknown>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const roots: ReturnType<typeof createRoot>[] = [];
    ref.current?.querySelectorAll<HTMLElement>(".yt-embed[data-yt]").forEach((el) => {
      const r = createRoot(el); roots.push(r);
      r.render(<YtPlayer id={el.dataset.yt || ""} title={el.dataset.title || undefined} />);
    });
    return () => { setTimeout(() => roots.forEach((r) => r.unmount()), 0); };
  }, [html]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} {...rest} />;
}
