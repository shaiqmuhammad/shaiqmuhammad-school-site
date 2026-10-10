"use client";

import { useLogoUrl } from "@/components/SiteBrand";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminToolbar } from "@/components/AdminToolbar";
import { MsgIcon } from "@/components/lms/Messages";
import { LmsBell } from "@/components/lms/LmsBell";
import { mailApi } from "@/lib/mail";
import { useI18n } from "@/lib/i18n";

type Tab = "home" | "pages" | "videos" | "quizzes" | "certificate" | "banners" | "announcements" | "teacher" | "forum" | "results" | "activities" | "settings" | "students" | "teachers" | "setup" | "lmshw" | "classes" | "mail" | "homepage" | "staff" | "messages" | "notices";

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

const GROUPS: { id: string; en: string; ar: string; ids: Tab[] }[] = [
  { id: "site", en: "Settings", ar: "إعدادات الموقع", ids: ["homepage", "teacher", "banners", "announcements", "videos", "settings"] },
  { id: "teach", en: "Teaching and Learning", ar: "التعليم والتعلّم", ids: ["setup", "pages", "classes"] },
  { id: "members", en: "Members", ar: "الأعضاء", ids: ["students", "teachers", "staff"] },
  { id: "assess", en: "Assessment", ar: "التقييم", ids: ["quizzes", "lmshw", "certificate", "results"] },
  { id: "tools", en: "Teaching Tools", ar: "أدوات التدريس", ids: ["activities"] },
  { id: "community", en: "Community", ar: "التواصل", ids: ["messages", "notices", "forum", "mail"] },
];
/** Classroom tools listed under Activities in the sidebar (all open the Activities tab). */
const TOOLS: [string, string][] = [["Shared Wall", "الجدار المشترك"], ["Wheel", "العجلة"], ["Randomiser", "الاختيار العشوائي"], ["Word Cloud", "سحابة الكلمات"], ["Poll", "استطلاع"], ["Survey", "استبيان"], ["Think/Pair/Share", "فكّر/زاوج/شارك"], ["Vote", "تصويت"]];
/** Short description under each page title (consistent page header, Arabz Mart style). */
const DESC: Partial<Record<Tab, [string, string]>> = {
  homepage: ["Arrange, show or hide and edit the sections of the public home page.", "رتّب أقسام الصفحة الرئيسية وأظهرها أو أخفها وعدّلها."],
  messages: ["1:1 messages between students, teachers and admin — read and moderate every thread.", "رسائل فردية بين الطلاب والمعلمين والإدارة — اقرأ كل المحادثات وأشرف عليها."],
  notices: ["Announcements for the student and teacher areas, by audience. Each person is notified.", "إعلانات لمنطقة الطلاب والمعلمين حسب الفئة. يُشعَر كل شخص."],
  staff: ["Staff accounts: permissions like teachers, no class teaching required.", "حسابات الموظفين: صلاحيات مثل المعلمين دون تدريس صفوف."],
  pages: ["Lesson and library pages shown on the website.", "صفحات الدروس والمكتبة المعروضة على الموقع."],
  banners: ["Slides at the top of the home page.", "الشرائح أعلى الصفحة الرئيسية."],
  announcements: ["The scrolling ticker and news items.", "الشريط المتحرك والأخبار."],
  teacher: ["Your public About page: profile, experience, education and more.", "صفحة نبذة عني العامة: الملف والخبرات والتعليم وغيرها."],
  videos: ["YouTube videos listed on the website.", "مقاطع يوتيوب المعروضة على الموقع."],
  quizzes: ["Create, enable and host assessments.", "أنشئ التقييمات وفعّلها واستضفها."],
  activities: ["Live classroom activities: wall, wheel, polls, votes and more.", "أنشطة صفية مباشرة: الجدار والعجلة والاستطلاعات والتصويت."],
  lmshw: ["All homework and submissions across classes.", "كل الواجبات والتسليمات في جميع الصفوف."],
  results: ["Assessment results, exports and printouts.", "نتائج التقييمات والتصدير والطباعة."],
  certificate: ["Design of the certificate students receive.", "تصميم الشهادة التي يحصل عليها الطلاب."],
  students: ["Student accounts, PINs, classes and status.", "حسابات الطلاب والأرقام السرية والصفوف والحالة."],
  teachers: ["Teacher accounts, subjects, classes and permissions.", "حسابات المعلمين والمواد والصفوف والصلاحيات."],
  setup: ["Subjects, classes and sections used across the LMS.", "المواد والصفوف والشعب المستخدمة في المنصة."],
  classes: ["Pick a class or section to see students, homework and the Quran map.", "اختر صفًا أو شعبة لعرض الطلاب والواجبات وخريطة القرآن."],
  forum: ["Approve and manage forum posts.", "اعتمد مشاركات المنتدى وأدرها."],
  mail: ["contact@shaiqmuhammad.com inbox and contact-form messages.", "بريد contact@shaiqmuhammad.com ورسائل نموذج التواصل."],
  settings: ["Site settings, integrations and publishing.", "إعدادات الموقع والتكاملات والنشر."],
};
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
  messages: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8 11h8M8 14h5" /></>,
  notices: <><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" /></>,
  staff: <><circle cx="12" cy="7" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0M9 14l3 3 3-3" /></>,
  teachers: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15 4h7v6h-7" /></>,
  setup: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  classes: <><path d="M3 21h18M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>,
  homepage: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
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
/** Data-heavy tabs use the full width of the main area. */
function MailIcon({ unread, onClick, label }: { unread: number; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="pill-on-navy relative !p-0 inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full" data-testid="admin-mail-icon">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
      {unread > 0 && <span className="absolute -end-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white" data-testid="admin-mail-badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
  );
}

const WIDE = ["students", "teachers", "classes", "lmshw", "mail", "home", "homepage"];

export function AdminChrome({ busy, tab, onTab, onHome, refreshing = false, onPublishAll, onLogout, pendingCount = 0, onBell, children }: Props) {
  const { t, lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const logoUrl = useLogoUrl();
  const [collapsed, setCollapsed] = useState(false);
  const [mailUnread, setMailUnread] = useState(0);
  useEffect(() => {
    let on = true;
    const poll = () => mailApi.status().then((r) => { if (on) setMailUnread(r.unread || 0); }).catch(() => undefined);
    poll();
    const t = setInterval(poll, 120000);
    return () => { on = false; clearInterval(t); };
  }, []);
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const homeLabel = tr("Admin home — refresh content", "الرئيسية وتحديث المحتوى");
  const label = (id: Tab) =>
    id === "home" ? tr("Home", "الرئيسية") : id === "announcements" ? tr("Announcements", "الإعلانات") : id === "results" ? tr("Results", "النتائج") : id === "activities" ? tr("Activities", "الأنشطة") : id === "students" ? tr("Students", "الطلاب") : id === "teachers" ? tr("Teachers", "المعلمون") : id === "setup" ? tr("Classes & Subjects", "الصفوف والمواد") : id === "lmshw" ? tr("Homework", "الواجبات") : id === "mail" ? tr("Mail", "البريد") : id === "homepage" ? tr("Homepage", "الصفحة الرئيسية") : id === "classes" ? tr("Classes", "الصفوف") : id === "staff" ? tr("Staff", "الموظفون") : id === "messages" ? tr("Messages", "الرسائل") : id === "notices" ? tr("Class announcements", "إعلانات الصفوف") : id === "pages" ? tr("Learning Pages", "صفحات التعلّم") : t(`admin.tab.${id}`);

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

  // Grouped like the Arabz Mart admin: small uppercase headings; a thin divider in the collapsed rail.
  const navItems = (opts: { rail?: boolean; onPick?: () => void }) =>
    GROUPS.map((g) => (
      <div key={g.id} className={opts.rail ? "pt-2" : "pt-3 first:pt-0"} data-testid="admin-nav-group">
        {opts.rail ? <span aria-hidden className="mx-auto mb-2 block h-px w-8 bg-white/15" /> : <p className="mb-1 px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">{tr(g.en, g.ar)}</p>}
        {g.ids.map((id) => (
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
        ))}
        {g.id === "tools" && !opts.rail && (
          <ul className="ms-11 mt-0.5 space-y-0.5 border-s border-white/10 ps-3 text-xs text-white/65" data-testid="admin-nav-tools">
            {TOOLS.map(([en, ar]) => <li key={en}><button type="button" className="py-0.5 text-start hover:text-sun" onClick={() => { onTab("activities"); opts.onPick?.(); }}>{tr(en, ar)}</button></li>)}
          </ul>
        )}
      </div>
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
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? "mt-3" : "mt-5"}`} aria-label={tr("Admin sections", "أقسام الإدارة")}>
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
          <MsgIcon asAdmin onClick={() => onTab("messages")} />
          <MailIcon unread={mailUnread} onClick={() => onTab("mail")} label={tr("Mailbox", "البريد")} />
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
            <nav className="mt-5 flex-1 overflow-y-auto" aria-label={tr("Admin sections", "أقسام الإدارة")}>
              {navItems({ onPick: () => setDrawer(false) })}
            </nav>
            <div className="space-y-3 pt-4">
              <div className="w-full [&>button]:w-full">{publishBtn()}</div>
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className={`mx-auto px-4 py-6 sm:px-8 lg:py-8 ${WIDE.includes(tab) ? "max-w-none" : collapsed ? "max-w-5xl" : "max-w-4xl"}`}>
          <div className="mb-6 hidden items-center gap-3 rounded-2xl bg-header px-4 py-2.5 text-white shadow-[0_10px_30px_-15px_rgba(10,25,40,0.7)] lg:flex" data-testid="admin-toolbar-wrap">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/70" data-testid="admin-breadcrumb">{tr("Admin", "الإدارة")}{GROUPS.find((g) => g.ids.includes(tab)) ? ` / ${tr(GROUPS.find((g) => g.ids.includes(tab))!.en, GROUPS.find((g) => g.ids.includes(tab))!.ar)}` : ""} / <b className="text-white">{label(tab) || tr("Dashboard", "لوحة التحكم")}</b></p>
            <nav className="flex items-center gap-1" aria-label={tr("Quick links", "روابط سريعة")}>
              {([["quizzes", tr("Assessments", "التقييمات"), "M4 5h16v14H4zM8 9h8M8 13h5"], ["lmshw", tr("Homework", "الواجبات"), "M5 4h11l3 3v13H5zM9 12l2 2 4-4"], ["students", tr("Students", "الطلاب"), "M12 3 2 8l10 5 10-5-10-5Zm-6 7v5c3 2 9 2 12 0v-5"]] as const).map(([k, l, d]) => (
                <button key={k} type="button" onClick={() => onTab(k)} className={`inline-flex h-[34px] items-center gap-1.5 rounded-full px-3 text-xs font-bold transition ${tab === k ? "bg-sun text-[#0b1b2b]" : "bg-white/10 hover:bg-white/20"}`} title={l} data-testid={`admin-quick-${k}`}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
                  <span className="hidden xl:inline">{l}</span>
                </button>
              ))}
            </nav>
            <span className="h-6 w-px bg-white/20" aria-hidden />
            <MsgIcon asAdmin onClick={() => onTab("messages")} />
          <MailIcon unread={mailUnread} onClick={() => onTab("mail")} label={tr(`Mailbox${mailUnread ? ` (${mailUnread} unread)` : ""}`, `البريد${mailUnread ? ` (${mailUnread} غير مقروءة)` : ""}`)} />
            <AdminToolbar variant="navy" onLogout={onLogout} bell={<LmsBell asAdmin testId="admin-bell" variant={"navy"} extra={onBell ? { count: pendingCount, label: tr(`${pendingCount} forum post${pendingCount === 1 ? "" : "s"} waiting for approval`, `${pendingCount} مشاركة في المنتدى بانتظار الموافقة`), onClick: onBell } : undefined} />} />
          </div>
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <h1 className="text-lg font-extrabold">{label(tab)}</h1>
            {publishBtn()}
          </div>
          {tab !== "home" && (
            <header className="admin-page-head mb-5 flex flex-wrap items-end gap-3 border-b border-black/5 pb-4 dark:border-white/10" data-testid="admin-page-header">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary/80">{(() => { const g = GROUPS.find((x) => x.ids.includes(tab)); return g ? tr(g.en, g.ar) : ""; })()}</p>
                <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight sm:text-[1.75rem]" data-testid="admin-page-title">{label(tab)}</h1>
                {DESC[tab] && <p className="mt-1 max-w-3xl text-sm text-muted">{tr(DESC[tab]![0], DESC[tab]![1])}</p>}
              </div>
            </header>
          )}
          <div className="admin-tab">{children}</div>
        </div>
      </main>
    </div>
  );
}
