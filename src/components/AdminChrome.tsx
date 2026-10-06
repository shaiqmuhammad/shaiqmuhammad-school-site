"use client";

import Link from "next/link";
import { useLogoUrl } from "@/components/SiteBrand";
import { useEffect, useRef, type ReactNode } from "react";
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
  const label = (id: Tab) =>
    id === "home" ? tr("Home", "الرئيسية") : id === "banners" ? tr("Announcements", "الإعلانات") : t(`admin.tab.${id}`);
  const tabStrip = useRef<HTMLElement>(null);
  // Phones: keep the current tab visible in the scrollable strip.
  useEffect(() => {
    tabStrip.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab, lang]);

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
      <img src={logoUrl} alt="" width={96} height={96} className={`${size} rounded-full border-2 border-sun bg-white object-cover ${refreshing ? "animate-pulse" : ""}`} />
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
    <div className="admin-calm min-h-screen lg:flex">
      {/* Sidebar (lg+) */}
      <aside className="hidden bg-header text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:px-5 lg:py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {logo("h-24 w-24")}
          <div>
            <p className="font-extrabold leading-tight text-white">Shaiq Muhammad — Admin</p>
            <p className="text-xs text-white/70">{t("admin.title")}</p>
          </div>
        </div>
        <nav className="mt-8 flex-1 space-y-0.5 overflow-y-auto" aria-label={tr("Admin sections", "أقسام الإدارة")}>
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className="nav-link-navy block w-full px-4 py-2 text-start text-sm transition"
            >
              {label(id)}
            </button>
          ))}
        </nav>
        <div className="space-y-3 pt-6">
          <div className="w-full [&>button]:w-full">{publishBtn}</div>
          <div className="flex items-center justify-center gap-2">
            <LanguageToggle variant="navy" />
            <ThemeToggle variant="navy" />
          </div>
          <div className="flex justify-center gap-4 text-sm">
            <Link href="/" className="font-semibold text-sun hover:underline">{t("admin.viewSite")}</Link>
            <button type="button" onClick={onLogout} className="text-white/75 hover:text-white">{t("admin.logout")}</button>
          </div>
        </div>
      </aside>

      {/* Top bar (phones / tablets) */}
      <header className="sticky top-0 z-30 bg-header text-white shadow-[0_6px_20px_-10px_rgba(10,25,40,0.6)] lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          {logo("h-12 w-12")}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-white">Shaiq Muhammad — Admin</p>
            <div className="flex gap-3 text-xs">
              <Link href="/" className="font-semibold text-sun">{t("admin.viewSite")}</Link>
              <button type="button" onClick={onLogout} className="text-white/75">{t("admin.logout")}</button>
            </div>
          </div>
          <LanguageToggle variant="navy" className="px-2.5" />
          <ThemeToggle variant="navy" />
        </div>
        <nav ref={tabStrip} className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" aria-label={tr("Admin sections", "أقسام الإدارة")}>
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className="pill-on-navy shrink-0 px-3 py-1.5 text-sm"
            >
              {label(id)}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 lg:py-10">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <h1 className="text-lg font-extrabold">{label(tab)}</h1>
            {publishBtn}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
