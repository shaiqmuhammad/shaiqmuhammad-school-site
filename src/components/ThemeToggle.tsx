"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4" aria-hidden>
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

/**
 * Light/dark pill (sun/moon icon). `showLabel` always shows the text ("Dark"/"Light");
 * otherwise the text appears from the `sm` breakpoint up and the icon is always visible.
 */
export function ThemeToggle({
  className = "",
  showLabel = false,
  labelClassName = "hidden sm:inline",
}: {
  className?: string;
  showLabel?: boolean;
  /** Visibility classes for the text when `showLabel` is off. */
  labelClassName?: string;
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t, lang } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && (theme === "system" ? resolvedTheme : theme) === "dark";
  const label = isDark ? t("theme.toLight") : t("theme.toDark");
  const text = isDark ? (lang === "ar" ? "فاتح" : "Light") : lang === "ar" ? "داكن" : "Dark";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-primary/40 bg-accent-soft px-2.5 text-sm font-semibold text-primary shadow-sm transition hover:border-primary hover:bg-primary hover:text-primary-foreground ${className}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      <span className={showLabel ? "" : labelClassName}>{mounted ? text : "Dark"}</span>
    </button>
  );
}
