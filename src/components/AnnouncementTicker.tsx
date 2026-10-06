"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isImmersivePath } from "@/lib/immersive";
import { builtAnnouncements, loadAnnouncementsData, visibleTickerItems, type AnnouncementsData } from "@/lib/announcements";
import { useI18n } from "@/lib/i18n";

/** Scrolling "Announcement" strip above the menu. Messages are managed in Admin → Announcements. */
export function AnnouncementTicker() {
  const pathname = usePathname();
  const { tx, lang } = useI18n();
  const [data, setData] = useState<AnnouncementsData>(builtAnnouncements);

  useEffect(() => {
    let live = true;
    loadAnnouncementsData().then((d) => live && setData(d)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (pathname.startsWith("/admin")) return null;
  if (isImmersivePath(pathname)) return null;
  if (pathname.startsWith("/encyclopedia")) return null;
  const visible = visibleTickerItems(data);
  if (visible.length === 0) return null;

  const items = [...visible, ...visible];
  const textOf = (it: (typeof visible)[number]) => (lang === "ar" ? it.textAr || tx(it.text) : it.text || it.textAr || "");

  return (
    <div className="border-b border-white/10 bg-navy-deep text-sm text-white/90 dark:bg-[#0b1826]" data-testid="announcement-ticker">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <span className="shrink-0 rounded-full border border-sun-border bg-sun px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-navy" data-testid="ticker-label">
          {lang === "ar" ? "إعلان" : "Announcement"}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden" dir="ltr">
          <div className="animate-ticker flex w-max gap-10 whitespace-nowrap">
            {items.map((item, index) => {
              const content = (
                <span className="inline-flex items-center gap-2" dir="auto">
                  <span aria-hidden className="text-sun">
                    •
                  </span>
                  {textOf(item)}
                </span>
              );
              const key = `${item.id}-${index}`;
              const hidden = index >= visible.length;
              if (!item.href) return <span key={key} aria-hidden={hidden || undefined}>{content}</span>;
              return /^https?:\/\//i.test(item.href) ? (
                <a key={key} href={item.href} target="_blank" rel="noopener noreferrer" className="hover:text-sun hover:underline" aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined}>
                  {content}
                </a>
              ) : (
                <Link key={key} href={item.href} className="hover:text-sun hover:underline" aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined}>
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
