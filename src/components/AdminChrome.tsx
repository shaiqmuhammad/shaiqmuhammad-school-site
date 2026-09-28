"use client";

import Link from "next/link";
import { useLogoUrl } from "@/components/SiteBrand";
import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";

type Tab = "home" | "pages" | "videos" | "quizzes" | "certificate" | "banners" | "teacher" | "forum" | "settings";

type Props = {
  busy: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onHome: () => void;
  refreshing?: boolean;
  onPublishAll: () => void;
  onLogout: () => void;
  children: ReactNode;
};

const ORDER: Tab[] = ["home", "quizzes", "pages", "videos", "banners", "forum", "certificate", "teacher", "settings"];

/**
 * Calm admin shell: sidebar on large screens, compact top bar + scrollable tab strip on phones.
 * The round logo is the "home" button: it returns to the dashboard and re-fetches published content.
 */
export function AdminChrome({ busy, tab, onTab, onHome, refreshing = false, onPublishAll, onLogout, children }: Props) {
  const { t, lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const logoUrl = useLogoUrl();
  const homeLabel = tr("Admin home — refresh content", "الرئيسية وتحديث المحتوى");
  const label = (id: Tab) => (id === "home" ? tr("Home", "الرئيسية") : t(`admin.tab.${id}`));

  const logo = (size: string) => (
    <button
      type="button"
      onClick={onHome}
      aria-label={homeLabel}
      title={homeLabel}
      data-testid="admin-logo-home"
      className="relative shrink-0 rounded-full outline-none transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-primary/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" width={96} height={96} className={`${size} rounded-full bg-card object-cover ${refreshing ? "animate-pulse" : ""}`} />
      <span className="sr-only">{homeLabel}</span>
    </button>
  );

  const publishBtn = (
    <button
      type="button"
      disabled={busy}
      onClick={onPublishAll}
      className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
    >
      {busy ? t("admin.publishing") : t("admin.publishAll")}
    </button>
  );

  return (
    <div className="admin-calm min-h-screen bg-background lg:flex">
      {/* Sidebar (lg+) */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-e lg:border-card-border/60 lg:px-5 lg:py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {logo("h-24 w-24")}
          <div>
            <p className="font-semibold leading-tight">Shaiq Muhammad — Admin</p>
            <p className="text-xs text-muted">{t("admin.title")}</p>
          </div>
        </div>
        <nav className="mt-8 flex-1 space-y-0.5 overflow-y-auto" aria-label={tr("Admin sections", "أقسام الإدارة")}>
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`block w-full rounded-lg px-3 py-2 text-start text-sm transition ${tab === id ? "bg-accent-soft font-semibold text-primary" : "text-muted hover:text-foreground"}`}
            >
              {label(id)}
            </button>
          ))}
        </nav>
        <div className="space-y-3 pt-6">
          <div className="w-full [&>button]:w-full">{publishBtn}</div>
          <div className="flex items-center justify-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          <div className="flex justify-center gap-4 text-sm">
            <Link href="/" className="text-primary hover:underline">{t("admin.viewSite")}</Link>
            <button type="button" onClick={onLogout} className="text-muted hover:text-foreground">{t("admin.logout")}</button>
          </div>
        </div>
      </aside>

      {/* Top bar (phones / tablets) */}
      <header className="sticky top-0 z-30 border-b border-card-border/60 bg-background/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          {logo("h-12 w-12")}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Shaiq Muhammad — Admin</p>
            <div className="flex gap-3 text-xs">
              <Link href="/" className="text-primary">{t("admin.viewSite")}</Link>
              <button type="button" onClick={onLogout} className="text-muted">{t("admin.logout")}</button>
            </div>
          </div>
          <LanguageToggle className="px-2.5" />
          <ThemeToggle />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" aria-label={tr("Admin sections", "أقسام الإدارة")}>
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${tab === id ? "bg-accent-soft font-semibold text-primary" : "text-muted"}`}
            >
              {label(id)}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 lg:py-10">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <h1 className="text-lg font-semibold">{label(tab)}</h1>
            {publishBtn}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
