"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ytApi, type YtPlaylist } from "@/lib/yt";

const hq = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Playlist cards: a video thumbnail from the playlist as background, dark gradient, title + count. Opens our own playlist page. */
export function PlaylistCards({ lists }: { lists: YtPlaylist[] }) {
  const { lang } = useI18n();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let on = true; let i = 0;
    const worker = async () => { while (on && i < lists.length) { const p = lists[i++]; try { const r = await ytApi.playlist(p.id); if (on && r.videos[0]) setThumbs((t) => ({ ...t, [p.id]: r.videos[0].id })); } catch { /* keep placeholder */ } } };
    for (let k = 0; k < 4; k++) void worker();
    return () => { on = false; };
  }, [lists]);
  if (!lists.length) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="yt-cards">
      {lists.map((p) => (
        <li key={p.id}>
          <a href={`/videos/playlist?l=${encodeURIComponent(p.id)}`} className="group relative flex aspect-[16/9] w-full items-end overflow-hidden rounded-3xl border border-card-border bg-gradient-to-br from-[#16324b] to-[#24557d] shadow-sm transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun" data-testid="yt-card">
            {thumbs[p.id] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={hq(thumbs[p.id])} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" aria-hidden />
            <span className="relative block w-full p-4 text-white">
              <span className="line-clamp-2 text-lg font-extrabold leading-snug drop-shadow" dir="auto">{p.title}</span>
              <span className="mt-1 flex items-center gap-2 text-xs font-semibold text-white/85"><span className="rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold text-[#0b1b2b]">▶ {p.count || (lang === "ar" ? "قائمة" : "Playlist")}</span><span className="opacity-0 transition group-hover:opacity-100">{lang === "ar" ? "افتح ←" : "Open →"}</span></span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
