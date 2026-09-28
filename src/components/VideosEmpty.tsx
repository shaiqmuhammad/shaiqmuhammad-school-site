"use client";

import { useI18n } from "@/lib/i18n";

export function VideosEmpty() {
  const { t } = useI18n();
  return <p className="text-muted">{t("videos.empty")}</p>;
}

export function WatchOnYouTube({ youtubeId }: { youtubeId: string }) {
  const { t } = useI18n();
  return (
    <a
      href={`https://www.youtube.com/watch?v=${youtubeId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
    >
      {t("videos.watch")} ↗
    </a>
  );
}
