"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isImmersivePath } from "@/lib/immersive";
import { announcements } from "@/content/announcements";
import { useI18n } from "@/lib/i18n";

export function AnnouncementTicker() {
  const pathname = usePathname();
  const { t, tx } = useI18n();
  if (pathname.startsWith("/admin")) return null;
  if (isImmersivePath(pathname)) return null;
  if (pathname.startsWith("/encyclopedia")) return null;
  if (announcements.length === 0) return null;

  const items = [...announcements, ...announcements];

  return (
    <div className="border-b border-white/10 bg-navy-deep text-sm text-white/90 dark:bg-[#0b1826]">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <span className="shrink-0 rounded-full border border-sun-border bg-sun px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-navy">
          {t("ticker.label")}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden" dir="ltr">
          <div className="animate-ticker flex w-max gap-10 whitespace-nowrap">
            {items.map((item, index) => {
              const content = (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="text-sun">
                    •
                  </span>
                  {tx(item.text)}
                </span>
              );
              return item.href ? (
                <Link
                  key={`${item.id}-${index}`}
                  href={item.href}
                  className="hover:text-sun hover:underline"
                >
                  {content}
                </Link>
              ) : (
                <span key={`${item.id}-${index}`}>{content}</span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
