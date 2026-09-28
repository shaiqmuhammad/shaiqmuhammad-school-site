"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

/** EN ⇄ العربية toggle. Preference is stored in localStorage (shared with /admin). */
export function LanguageToggle({ className = "" }: { className?: string }) {
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
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-card-border bg-card px-2.5 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary ${className}`}
    >
      {isAr ? (
        <span lang="en">EN</span>
      ) : (
        <span lang="ar" dir="rtl">
          عربي
        </span>
      )}
    </button>
  );
}
