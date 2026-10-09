"use client";

import { useLogoUrl } from "@/components/SiteBrand";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminToolbar } from "@/components/AdminToolbar";
import { LmsBell } from "@/components/lms/LmsBell";
import { useI18n } from "@/lib/i18n";

type Tab = "home" | "pages" | "videos" | "quizzes" | "certificate" | "banners" | "announcements" | "teacher" | "forum" | "results" | "activities" | "settings" | "students" | "teachers" | "setup" | "lmshw" | "mail";

type Props = {
  busy: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onHome: () => void;
  refreshing?: boolean;
  onPublishAll: () => void;
  onLogout: () => void;
  /** Forum posts waiting for approval (bell badge). */
  pendingCount?: number;
  onBell?: () => void;
  children: ReactNode;
};

const ORDER: Tab[] = ["quizzes", "results", "activities", "pages", "videos", "announcements", "banners", "forum", "certificate", "teacher", "settings", "students", "teachers", "setup", "lmshw", "mail"];
const LMS_IDS: Partial<Record<Tab, string>> = { students: "admin-nav-lms-students", teachers: "admin-nav-lms-teachers", setup: "admin-nav-lms-setup", lmshw: "admin-nav-lms-homework" };
const COLLAPSE_KEY = "sm-admin-sidebar-collapsed";

/** Small line icons for the sidebar rail (24px grid, currentColor). */
const ICONS: Record<Tab, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  quizzes: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  results: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  activities: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M7 9h4M7 12h7" /></>,
  pages: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" /></>,
  videos: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4.5-2.5z" /></>,
  announcements: <><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M16 8a5 5 0 0 1 0 8" /></>,
  banners: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /></>,
  forum: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  certificate: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5L8 21l4-2 4 2-1-7.5" /></>,
  teacher: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  students: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2.5 9 2.5 12 0v-5" /></>,
  teachers: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15 4h7v6h-7" /></>,
  setup: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  lmshw: <><path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h5M8 8h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

const Icon = ({ children, className = "h-5 w-5 shrink-0" }: { children: ReactNode; className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);

/**
 * Calm admin shell. Large screens: sidebar that collapses to a 64px icon rail (remembered on this device).
 * Phones / tablets: compact top bar with a menu button that slides the same menu in as a drawer.
 * The round logo is the "home" button: it returns to the dashboard and re-fetches published content.
 */
export function AdminChrome({ busy, tab, onTab, onHome, refreshing = false, onPublishAll, onLogout, pendingCount = 0, onBell, children }: Props) {
  const { t, lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const logoUrl = useLogoUrl();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const homeLabel = tr("Admin home — refresh content", "الرئيسية وتحديث المحتوى");
  const label = (id: Tab) =>
    id === "home" ? tr("Home", "الرئيسية") : id === "announcements" ? tr("Announcements", "الإعلانات") : id === "results" ? tr("Results", "النتائج") : id === "activities" ? tr("Activities", "الأنشطة") : id === "students" ? tr("Students", "الطلاب") : id === "teachers" ? tr("Teachers", "المعلمون") : id === "setup" ? tr("Classes & Subjects", "الصفوف والمواد") : id === "lmshw" ? tr("Homework", "الواجبات") : id === "mail" ? tr("Mail", "البريد") : t(`admin.tab.${id}`);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the saved preference after hydration
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // storage unavailable
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // storage unavailable
      }
      return !c;
    });

  // Drawer: Escape closes, focus moves into it.
  useEffect(() => {
    if (!drawer) return;
    drawerRef.current?.querySelector<HTMLElement>('[aria-current="page"], button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

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
      <img src={logoUrl} alt="" width={96} height={96} className={`${size} rounded-full border-2 border-sun bg-white object-cover transition-all ${refreshing ? "animate-pulse" : ""}`} />
      <span className="sr-only">{homeLabel}</span>
    </button>
  );

  const badge = (n: number, testId?: string) =>
    n > 0 ? (
      <span data-testid={testId} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-extrabold leading-none text-white ring-2 ring-navy">
        {n > 99 ? "99+" : n}
      </span>
    ) : null;
  /** Same look as the public site header brand; the whole block is the admin "home" (dashboard + refresh). */
  const brand = (
    <button
      type="button"
      onClick={onHome}
      aria-label={homeLabel}
      title={homeLabel}
      data-testid="admin-sidebar-brand"
      className={`group flex items-center gap-2 rounded-full text-start outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${collapsed ? "" : "min-w-0 flex-1"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" width={40} height={40} data-testid="admin-logo-home" className={`h-10 w-10 shrink-0 rounded-full border-2 border-sun bg-white object-cover shadow-sm ${refreshing ? "animate-pulse" : ""}`} />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-base font-extrabold tracking-tight text-white group-hover:text-sun">Shaiq Muhammad</span>
          <span className="block truncate text-xs text-white/70">{tr("Admin", "الإدارة")}</span>
        </span>
      )}
    </button>
  );

  const publishLabel = busy ? t("admin.publishing") : t("admin.publishAll");
  const publishBtn = (iconOnly = false) => (
    <button
      type="button"
      disabled={busy}
      onClick={onPublishAll}
      aria-label={iconOnly ? publishLabel : undefined}
      title={iconOnly ? publishLabel : undefined}
      data-testid={iconOnly ? "admin-publish-icon" : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60 ${iconOnly ? "h-10 w-10" : "px-4 py-2"}`}
    >
      {iconOnly ? (
        <Icon className="h-5 w-5">
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M5 20h14" />
        </Icon>
      ) : (
        publishLabel
      )}
    </button>
  );

  const navItems = (opts: { rail?: boolean; onPick?: () => void }) =>
    ORDER.map((id) => (
      <button
        key={id}
        type="button"
        onClick={() => { onTab(id); opts.onPick?.(); }}
        aria-current={tab === id ? "page" : undefined}
        aria-label={opts.rail ? label(id) : undefined}
        title={opts.rail ? label(id) : undefined}
        data-testid={LMS_IDS[id] || `admin-nav-${id}`}
        className={`nav-link-navy relative flex w-full items-center gap-3 py-2 text-start text-sm transition ${opts.rail ? "justify-center px-0" : "px-4"}`}
      >
        <Icon>{ICONS[id]}</Icon>
        {opts.rail ? (
          id === "forum" && pendingCount > 0 ? <span className="absolute end-0.5 top-0.5">{badge(pendingCount)}</span> : null
        ) : (
          <span className="inline-flex items-center gap-2">{label(id)}{id === "forum" ? badge(pendingCount) : null}</span>
        )}
      </button>
    ));

  const collapseLabel = collapsed ? tr("Expand menu", "توسيع القائمة") : tr("Collapse menu", "تصغير القائمة");

  return (
    <div className="admin-calm min-h-screen lg:flex">
      {/* Sidebar (lg+): full width or a 64px icon rail */}
      <aside
        className={`hidden bg-header text-white transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0 lg:flex-col lg:pb-6 lg:pt-3 ${collapsed ? "lg:w-16 lg:px-2" : "lg:w-64 lg:px-4"}`}
        data-testid="admin-sidebar"
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div className={`flex items-center ${collapsed ? "justify-center" : ""}`}>{brand}</div>
        <nav className={`flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden ${collapsed ? "mt-4" : "mt-6"}`} aria-label={tr("Admin sections", "أقسام الإدارة")}>
          {navItems({ rail: collapsed })}
        </nav>
        <div className={`space-y-3 pt-4 ${collapsed ? "flex flex-col items-center" : ""}`}>
          <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
            {collapsed ? publishBtn(true) : <div className="min-w-0 flex-1 [&>button]:w-full">{publishBtn()}</div>}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapseLabel}
              title={collapseLabel}
              aria-expanded={!collapsed}
              data-testid="admin-sidebar-toggle"
              className="pill-on-navy h-8 w-8 shrink-0 justify-center"
            >
              <Icon className={`h-4 w-4 transition ${collapsed ? "rotate-180 rtl:rotate-0" : "rtl:rotate-180"}`}>
                <path d="M15 6l-6 6 6 6" />
              </Icon>
            </button>
          </div>
        </div>
      </aside>

      {/* Top bar (phones / tablets) with a slide-in drawer */}
      <header className="sticky top-0 z-30 bg-header text-white shadow-[0_6px_20px_-10px_rgba(10,25,40,0.6)] lg:hidden">
        <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label={tr("Open admin menu", "فتح قائمة الإدارة")}
            aria-expanded={drawer}
            aria-controls="admin-drawer"
            data-testid="admin-menu-button"
            className="pill-on-navy h-9 w-9 shrink-0 justify-center"
          >
            <Icon className="h-5 w-5"><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
          </button>
          {logo("h-9 w-9")}
          <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-white">{label(tab)}</p>
          <AdminToolbar variant="navy" onLogout={onLogout} bell={<LmsBell asAdmin testId="admin-bell" variant={"navy"} extra={onBell ? { count: pendingCount, label: tr(`${pendingCount} forum post${pendingCount === 1 ? "" : "s"} waiting for approval`, `${pendingCount} مشاركة في المنتدى بانتظار الموافقة`), onClick: onBell } : undefined} />} />
        </div>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" data-testid="admin-drawer-wrap">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label={tr("Close menu", "إغلاق القائمة")} onClick={() => setDrawer(false)} tabIndex={-1} />
          <div
            id="admin-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={tr("Admin sections", "أقسام الإدارة")}
            data-testid="admin-drawer"
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-header px-4 py-5 text-white shadow-2xl"
          >
            <div className="flex items-center gap-3">
              {logo("h-12 w-12")}
              <p className="min-w-0 flex-1 truncate text-sm font-extrabold">Shaiq Muhammad — Admin</p>
              <button type="button" onClick={() => setDrawer(false)} aria-label={tr("Close menu", "إغلاق القائمة")} className="pill-on-navy h-9 w-9 justify-center">
                <Icon className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" /></Icon>
              </button>
            </div>
            <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto" aria-label={tr("Admin sections", "أقسام الإدارة")}>
              {navItems({ onPick: () => setDrawer(false) })}
            </nav>
            <div className="space-y-3 pt-4">
              <div className="w-full [&>button]:w-full">{publishBtn()}</div>
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className={`mx-auto px-4 py-6 sm:px-8 lg:py-10 ${collapsed ? "max-w-5xl" : "max-w-4xl"}`}>
          <div className="mb-4 hidden justify-end lg:flex" data-testid="admin-toolbar-wrap">
            <AdminToolbar onLogout={onLogout} bell={<LmsBell asAdmin testId="admin-bell" variant={"glass"} extra={onBell ? { count: pendingCount, label: tr(`${pendingCount} forum post${pendingCount === 1 ? "" : "s"} waiting for approval`, `${pendingCount} مشاركة في المنتدى بانتظار الموافقة`), onClick: onBell } : undefined} />} />
          </div>
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <h1 className="text-lg font-extrabold">{label(tab)}</h1>
            {publishBtn()}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
