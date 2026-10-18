"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/Card";
import { CardCarousel } from "@/components/CardCarousel";
import { YtPlayer } from "@/components/YtPlayer";
import { useI18n } from "@/lib/i18n";
import { thumb, ytApi, type YtVideo } from "@/lib/yt";

/** Homepage videos slider: newest visible uploads of the YouTube channel (same feed as /videos), played in a pop-up with our own player. */
export function HomeVideos({ count, heading }: { count: number; heading: ReactNode }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [vids, setVids] = useState<YtVideo[] | null>(null);
  const [cur, setCur] = useState<YtVideo | null>(null);
  useEffect(() => { ytApi.channel().then((c) => setVids(c.videos)).catch(() => setVids([])); }, []);
  useEffect(() => {
    if (!cur) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setCur(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cur]);
  const list = (vids || []).slice(0, count || 9);
  return (
    <section className="band-cream border-y border-sun-border/30" data-testid="home-videos">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        {vids === null || list.length === 0 ? (
          <>
            <div className="mb-6">{heading}</div>
            <p className="text-sm text-muted">{vids === null ? tr("Loading videos…", "جارٍ تحميل المقاطع…") : tr("No videos yet. Check back soon.", "لا توجد مقاطع بعد. عد قريبًا.")}</p>
          </>
        ) : (
          <CardCarousel label="Video lessons" labelAr="دروس الفيديو" testId="home-videos-carousel" moreHref="/videos" moreTestId="home-videos-more" heading={heading}>
            {list.map((v) => (
              <button key={v.id} type="button" onClick={() => setCur(v)} className="group block h-full w-full text-start" data-testid="home-video">
                <Card className="h-full overflow-hidden p-0! transition group-hover:-translate-y-0.5 group-hover:border-sun-border">
                  <div className="relative aspect-video overflow-hidden bg-accent-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(v.id)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                    <span className="absolute inset-0 grid place-items-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-xl text-[#0b1b2b] shadow">▶</span></span>
                    {v.duration && <span className="absolute bottom-1.5 end-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">{v.duration}</span>}
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 font-semibold group-hover:text-primary" dir="auto">{v.title}</h3>
                    {v.published && <p className="mt-1 text-xs text-muted">{v.published}</p>}
                  </div>
                </Card>
              </button>
            ))}
          </CardCarousel>
        )}
      </div>
      {cur && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label={cur.title} onClick={() => setCur(null)} data-testid="home-video-modal">
          <div className="glass w-full max-w-3xl overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <YtPlayer key={cur.id} id={cur.id} title={cur.title} autoPlay />
            <div className="flex items-start gap-3 p-4">
              <h3 className="min-w-0 flex-1 text-lg font-bold" dir="auto">{cur.title}</h3>
              <Link href={`/videos?v=${cur.id}`} className="btn-glass px-3 py-1 text-sm">{tr("Open in Videos", "افتح في الفيديوهات")}</Link>
              <button type="button" className="btn-glass px-3 py-1 text-sm" onClick={() => setCur(null)} data-testid="home-video-close">✕ {tr("Close", "إغلاق")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
