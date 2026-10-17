"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { YtPlayer } from "@/components/YtPlayer";
import { thumb, ytApi, type YtPlaylist, type YtVideo } from "@/lib/yt";

/** Videos page: every upload and playlist of the channel, played in-page (privacy-enhanced embed, no links out). */
export function YoutubeLibrary({ playlistId, fallback }: { playlistId?: string; fallback?: React.ReactNode }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [all, setAll] = useState<YtVideo[] | null>(null);
  const [lists, setLists] = useState<YtPlaylist[]>([]);
  const [pl, setPl] = useState(playlistId || "");
  const [vids, setVids] = useState<YtVideo[] | null>(null);
  const [cur, setCur] = useState<YtVideo | null>(null);
  const [q, setQ] = useState("");
  const [failed, setFailed] = useState(false);
  const player = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ytApi.channel().then((c) => { setAll(c.videos); setLists(c.playlists); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (!pl) { // eslint-disable-next-line react-hooks/set-state-in-effect
      setVids(all);
      return;
    }
    setVids(null);
    ytApi.playlist(pl).then((r) => setVids(r.videos)).catch(() => setVids([]));
  }, [pl, all]);

  const shown = useMemo(() => (vids || []).filter((v) => !q || v.title.toLowerCase().includes(q.toLowerCase())), [vids, q]);
  const play = (v: YtVideo) => { setCur(v); setTimeout(() => player.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  if (failed && fallback) return <>{fallback}</>;
  if (failed) return <p className="text-muted">{tr("Videos are temporarily unavailable. Please try again soon.", "المقاطع غير متاحة مؤقتًا. حاول لاحقًا.")}</p>;
  return (
    <div className="space-y-6" data-testid="yt-library">
      {cur && (
        <div ref={player} className="glass overflow-hidden rounded-3xl" data-testid="yt-player">
          <YtPlayer key={cur.id} id={cur.id} title={cur.title} autoPlay />
          <div className="flex items-start gap-3 p-4"><h2 className="min-w-0 flex-1 text-lg font-bold" dir="auto">{cur.title}</h2><button type="button" className="btn-glass px-3 py-1 text-sm" onClick={() => setCur(null)}>✕ {tr("Close", "إغلاق")}</button></div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!playlistId && (
          <>
            <button type="button" onClick={() => setPl("")} aria-pressed={!pl} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${!pl ? "border-sun-border bg-sun text-navy" : "border-card-border bg-card-solid"}`} data-testid="yt-all">{tr("All videos", "كل المقاطع")}{all ? ` (${all.length})` : ""}</button>
            {lists.map((p) => <button key={p.id} type="button" onClick={() => setPl(p.id)} aria-pressed={pl === p.id} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${pl === p.id ? "border-sun-border bg-sun text-navy" : "border-card-border bg-card-solid"}`} data-testid="yt-playlist-chip" dir="auto">▶ {p.title}</button>)}
          </>
        )}
        <input className="ms-auto min-w-[10rem] rounded-full border border-card-border bg-card-solid px-4 py-1.5 text-sm" placeholder={tr("Search videos…", "ابحث في المقاطع…")} value={q} onChange={(e) => setQ(e.target.value)} dir="auto" data-testid="yt-search" />
      </div>
      {vids === null ? <p className="py-10 text-center text-muted">{tr("Loading videos…", "جارٍ تحميل المقاطع…")}</p> : !shown.length ? <p className="py-10 text-center text-muted">{tr("No videos found.", "لا توجد مقاطع.")}</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="yt-grid">
          {shown.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => play(v)} className="group block w-full overflow-hidden rounded-2xl border border-card-border bg-card-solid text-start transition hover:-translate-y-0.5 hover:shadow-lg" data-testid="yt-video">
                <span className="relative block aspect-video bg-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb(v.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25"><span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-xl text-[#0b1b2b] opacity-0 shadow transition group-hover:opacity-100">▶</span></span>
                  {v.duration && <span className="absolute bottom-1.5 end-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">{v.duration}</span>}
                </span>
                <span className="block p-3"><span className="line-clamp-2 text-sm font-semibold leading-snug" dir="auto">{v.title}</span>{v.published && <span className="mt-1 block text-xs opacity-60">{v.published}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
