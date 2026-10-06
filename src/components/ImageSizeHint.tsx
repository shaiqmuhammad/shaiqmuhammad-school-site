"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * Admin upload guidance: the recommended size (derived from how the image actually renders on the
 * site) plus a live check of the chosen image's pixel size/ratio. Works for URLs and data: URLs.
 */
export function ImageSizeHint({ src, recommendEn, recommendAr, minWidth, ratio, ratioLabel, testId }: {
  src?: string;
  recommendEn: string;
  recommendAr: string;
  /** Smallest width (px) that still looks sharp on retina screens. */
  minWidth: number;
  /** Target width/height ratio, e.g. 21 / 9. */
  ratio: number;
  ratioLabel: string;
  testId?: string;
}) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setSize({ src, w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = src;
    return () => { alive = false; };
  }, [src]);

  const cur = src && size && size.src === src ? size : null;
  const warn: string[] = [];
  if (cur && cur.w && cur.h) {
    if (cur.w < minWidth) warn.push(tr(`Only ${cur.w} px wide — ${minWidth} px or wider looks sharper.`, `العرض ${cur.w} بكسل فقط — ${minWidth} بكسل أو أكثر أوضح.`));
    const r = cur.w / cur.h;
    if (Math.abs(r - ratio) / ratio > 0.12) warn.push(tr(`Shape is ${r.toFixed(2)}:1, not ${ratioLabel} — parts will be cropped.`, `النسبة ${r.toFixed(2)}:1 وليست ${ratioLabel} — سيُقص جزء من الصورة.`));
  }

  return (
    <div className="space-y-1" data-testid={testId}>
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs leading-relaxed">{tr(recommendEn, recommendAr)}</p>
      {cur && <p className="text-xs text-muted">{tr(`Current image: ${cur.w} × ${cur.h} px`, `الصورة الحالية: ${cur.w} × ${cur.h} بكسل`)}</p>}
      {warn.map((w) => <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}
    </div>
  );
}
