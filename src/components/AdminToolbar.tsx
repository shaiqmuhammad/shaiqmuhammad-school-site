"use client";

import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

const SITE = "https://www.shaiqmuhammad.com";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
    {children}
  </svg>
);

/**
 * Compact round icon toolbar: [bell] · light/dark · EN/ع · View website · Log out (confirm).
 * "glass" for the light admin main area, "navy" for the dark top bars.
 */
export function AdminToolbar({ onLogout, variant = "glass", className = "", pending = 0, onBell }: { onLogout: () => void; variant?: "glass" | "navy"; className?: string; pending?: number; onBell?: () => void }) {
  const { lang, toggleLang } = useI18n();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard for theme/lang
  useEffect(() => setMounted(true), []);
  const ar = mounted && lang === "ar";
  const tr = (en: string, a: string) => (ar ? a : en);
  const dark = mounted && (theme === "system" ? resolvedTheme : theme) === "dark";
  const btn = `inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
    variant === "navy" ? "pill-on-navy !p-0" : "glass text-heading hover:ring-2 hover:ring-[var(--yellow-border)]"
  }`;
  const site = tr("View website", "عرض الموقع");
  const themeL = dark ? tr("Light mode", "الوضع الفاتح") : tr("Dark mode", "الوضع الداكن");
  const langL = ar ? "English" : "العربية";
  const out = tr("Log out", "تسجيل الخروج");
  const bellL = pending > 0 ? tr(`${pending} forum post${pending === 1 ? "" : "s"} waiting for approval`, `${pending} مشاركة بانتظار الموافقة`) : tr("No forum posts waiting", "لا توجد مشاركات بانتظار الموافقة");
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="toolbar" aria-label={tr("Quick actions", "إجراءات سريعة")} data-testid="admin-toolbar">
      {onBell && (
        <button type="button" className={btn + " relative"} title={bellL} aria-label={bellL} data-testid="admin-bell" onClick={onBell}>
          <Svg><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Svg>
          {pending > 0 && (
            <span data-testid="admin-bell-badge" className="absolute -end-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white dark:ring-navy">
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </button>
      )}
      <button type="button" className={btn} title={themeL} aria-label={themeL} data-testid="tb-theme" onClick={() => setTheme(dark ? "light" : "dark")}>
        {dark ? (
          <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
        ) : (
          <Svg><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" /></Svg>
        )}
      </button>
      <button type="button" className={btn} title={langL} aria-label={langL} data-testid="tb-lang" onClick={toggleLang}>
        {ar ? <span lang="en">EN</span> : <span lang="ar" className="text-sm">ع</span>}
      </button>
      <a href={SITE} target="_blank" rel="noopener noreferrer" className={btn} title={site} aria-label={site} data-testid="tb-site">
        <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></Svg>
      </a>
      <button type="button" className={btn} title={out} aria-label={out} data-testid="tb-logout" onClick={() => { if (window.confirm(tr("Log out now?", "تسجيل الخروج الآن؟"))) onLogout(); }}>
        <span className="rtl:-scale-x-100 inline-flex">
          <Svg><path d="M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7" /><path d="M13 4v16" /><path d="M16 12h6M19 9l3 3-3 3" /><circle cx="10.5" cy="12" r=".6" fill="currentColor" /></Svg>
        </span>
      </button>
    </div>
  );
}
