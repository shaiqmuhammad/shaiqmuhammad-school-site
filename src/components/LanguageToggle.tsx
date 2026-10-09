"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

/** EN ⇄ العربية pill (globe + label). Preference is stored in localStorage (shared with /admin). */
export function LanguageToggle({ className = "", variant = "default", compact = false }: { className?: string; variant?: "default" | "navy"; /** Small round button showing just "ع" / "EN". */ compact?: boolean }) {
  const { lang, toggleLang, t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAr = mounted && lang === "ar";

  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label={t("lang.switch")}
      title={t("lang.switch")}
      data-testid="language-toggle"
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 text-sm ${compact ? "w-9 rounded-full !px-0 font-bold" : "px-3"} ${variant === "navy" ? "pill-on-navy" : "pill"} ${className}`}
    >
      {!compact && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
      </svg>}
      {isAr ? (
        <span lang="en">EN</span>
      ) : (
        <span lang="ar" dir="rtl">
          {compact ? "ع" : "عربي"}
        </span>
      )}
    </button>
  );
}
