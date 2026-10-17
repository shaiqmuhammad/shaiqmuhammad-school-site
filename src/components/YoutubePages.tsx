"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { YoutubeLibrary } from "@/components/YoutubeLibrary";
import { RichHtml } from "@/components/YtPlayer";
import { renderMarkdownLite } from "@/lib/markdownLite";
import { useI18n } from "@/lib/i18n";
import { ytApi, type PageRow } from "@/lib/yt";

/** /videos/playlist?p=<slug>: one admin-published playlist as its own page. */
export function PlaylistPage() {
  const sp = useSearchParams();
  const slug = sp.get("p") || "";
  const raw = sp.get("l") || "";
  const { lang } = useI18n();
  const [pl, setPl] = useState<{ id: string; title: string } | null | undefined>(undefined);
  useEffect(() => {
    if (raw) ytApi.channel().then((c) => { const f = c.playlists.find((x) => x.id === raw); setPl(f ? { id: f.id, title: f.title } : null); }).catch(() => setPl(null));
    else ytApi.playlistBySlug(slug).then(setPl).catch(() => setPl(null));
  }, [slug, raw]);
  return (
    <>
      <PageHero eyebrow={lang === "ar" ? "الفيديوهات" : "Videos"} title={pl?.title || (lang === "ar" ? "قائمة تشغيل" : "Playlist")} subtitle="" />
      <Section>{pl === undefined ? null : pl === null ? <p className="text-muted">{lang === "ar" ? "هذه الصفحة غير موجودة." : "This page doesn't exist."}</p> : <YoutubeLibrary playlistId={pl.id} />}</Section>
    </>
  );
}

/** /p?s=<slug>: a custom page created in Admin → Pages & menu. */
export function CustomPage() {
  const slug = useSearchParams().get("s") || "";
  const { lang } = useI18n();
  const [pg, setPg] = useState<PageRow | null | undefined>(undefined);
  useEffect(() => { ytApi.page(slug).then((r) => setPg(r.page)).catch(() => setPg(null)); }, [slug]);
  const title = pg ? (lang === "ar" && pg.titleAr ? pg.titleAr : pg.title) : "";
  const body = pg ? (lang === "ar" && pg.bodyAr ? pg.bodyAr : pg.body) : "";
  return (
    <>
      <PageHero eyebrow="" title={pg === undefined ? "…" : pg ? title : lang === "ar" ? "غير موجودة" : "Not found"} subtitle="" />
      <Section>
        {pg === null && <p className="text-muted">{lang === "ar" ? "هذه الصفحة غير موجودة." : "This page doesn't exist."}</p>}
        {pg && <RichHtml className="prose-lesson max-w-3xl leading-relaxed" dir="auto" data-testid="custom-page" html={renderMarkdownLite(body)} />}
      </Section>
    </>
  );
}
