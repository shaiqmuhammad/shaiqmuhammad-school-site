"use client";

import { useI18n } from "@/lib/i18n";

export function VideosEmpty() {
  const { t } = useI18n();
  return <p className="text-muted">{t("videos.empty")}</p>;
}
