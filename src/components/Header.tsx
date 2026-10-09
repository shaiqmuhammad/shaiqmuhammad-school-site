"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isImmersivePath } from "@/lib/immersive";
import { useEffect, useRef, useState } from "react";
import { navLinks, resourceLinks, siteConfig, type ResourceLink } from "@/content/site";
import { HadithScrollIcon, QuranBookIcon } from "@/components/EncyclopediaIcons";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";
import { useLogoUrl } from "@/components/SiteBrand";
import { LmsHeaderButton } from "@/components/lms/LmsEntry";

const samePath = (pathname: string, href: string) => pathname.replace(/\/$/, "") === href || pathname.startsWith(href + "/");

function ResourceIcon({ kind, className = "h-4 w-4 shrink-0" }: { kind: ResourceLink["kind"]; className?: string }) {
  if (kind === "quran") return <QuranBookIcon className={className} />;
  if (kind === "hadith") return <HadithScrollIcon className={className} />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {kind === "videos" ? (
        <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" /></>
      ) : (
        <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" /></>
      )}
    </svg>
  );
}

const menuItemCls =
  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-heading transition hover:bg-sun hover:text-navy focus-visible:bg-sun focus-visible:text-navy focus-visible:outline-none aria-[current=page]:bg-sun aria-[current=page]:text-navy";

/** Desktop "Students Resources" dropdown: hover, click/tap or keyboard (Enter/Space/↓ opens, ↑/↓ move, Escape closes). */
function ResourcesMenu({ label, groupLabel, active, t }: { label: string; groupLabel: string; active: boolean; t: (key: string, fallback?: string) => string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hoverOpenedAt = useRef(0);
  const pathname = usePathname() || "";
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const links = () => [...(ref.current?.querySelectorAll<HTMLAnchorElement>("[data-menu-item]") ?? [])];
  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = links();
    const idx = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "Escape") { setOpen(false); ref.current?.querySelector("button")?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (!open) { setOpen(true); setTimeout(() => links()[0]?.focus(), 0); } else items[(idx + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp" && open) { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
  };
  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => { if (!open) hoverOpenedAt.current = Date.now(); setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={onKeyDown}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="resources-menu"
        aria-current={active ? "page" : undefined}
        aria-label={active ? `${groupLabel}: ${label}` : undefined}
        // A mouse click right after hovering opened the menu keeps it open instead of toggling it shut.
        onClick={() => { if (Date.now() - hoverOpenedAt.current < 600) { hoverOpenedAt.current = 0; setOpen(true); } else setOpen((v) => !v); }}
        className="nav-link-navy inline-flex items-center gap-1 whitespace-nowrap px-2 py-1.5 text-sm transition xl:px-2.5"
        data-testid="nav-resources"
      >
        {label}
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 opacity-70 transition ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute start-0 top-full z-50 pt-2">
          <ul id="resources-menu" className="glass glass-emph w-64 rounded-2xl bg-card-solid p-1.5 text-foreground shadow-xl" data-testid="resources-menu">
            {resourceLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} data-menu-item onClick={() => setOpen(false)} aria-current={samePath(pathname, item.href) ? "page" : undefined} className={menuItemCls}>
                  <ResourceIcon kind={item.kind} />
                  {t(item.key, item.label)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Bright "Join" pill: students tap it to join a live class assessment with the teacher's code. */
function JoinButton({ lang }: { lang: string }) {
  const ar = lang === "ar";
  return (
    <Link
      href="/join"
      data-testid="header-join"
      aria-label={ar ? "انضم إلى اختبار الصف" : "Join a class assessment"}
      title={ar ? "انضم إلى اختبار الصف" : "Join a class assessment"}
      className="btn-cta relative h-9 shrink-0 px-2.5 text-sm ring-2 ring-sun/30 hover:scale-105 sm:px-4 lg:px-3 xl:px-4"
    >
      <span className="absolute -end-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-coral ring-2 ring-navy" />
      </span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      <span>{ar ? "انضم" : "Join"}</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [resOpen, setResOpen] = useState(() => resourceLinks.some((r) => samePath(pathname || "", r.href)));
  const { t, lang } = useI18n();
  const logoUrl = useLogoUrl();

  // Admin has its own chrome (with the same language/theme toggles).
  if (pathname.startsWith("/admin")) {
    return null;
  }
  // Assessment player / group screens are full-screen.
  if (isImmersivePath(pathname)) return null;

  return (
    <header className="sticky top-0 z-50 bg-header text-white shadow-[0_6px_20px_-10px_rgba(10,25,40,0.6)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 lg:gap-2 lg:px-4 xl:gap-4 xl:px-6">
        <Link href="/" className="group flex min-w-0 items-center gap-2 sm:shrink-0 sm:gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 shrink-0 rounded-full border-2 border-sun bg-white object-cover shadow-sm sm:h-10 sm:w-10"
          />
          <span className="min-w-0 leading-tight max-[374px]:sr-only">
            <span className="block text-[13px] font-extrabold tracking-tight text-white group-hover:text-sun sm:whitespace-nowrap sm:text-base">
              {siteConfig.name}
            </span>
            <span className="hidden whitespace-nowrap text-xs text-white/70 sm:block lg:hidden xl:block">{t("header.tagline")}</span>
          </span>
        </Link>

        <nav className="hidden items-center lg:flex xl:gap-1" aria-label="Primary">
          {navLinks.map((link) => {
            if (link.menu) {
              const current = resourceLinks.find((r) => samePath(pathname, r.href));
              const group = t("nav.resources", link.label);
              return <ResourcesMenu key={link.href} label={current ? t(current.key, current.label) : group} groupLabel={group} active={!!current} t={t} />;
            }
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className="nav-link-navy whitespace-nowrap px-2 py-1.5 text-sm transition xl:px-2.5"
              >
                {t(`nav.${link.href}`, link.label)}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageToggle variant="navy" className="max-sm:px-2.5" />
          <ThemeToggle variant="navy" labelClassName="hidden sm:inline lg:hidden xl:inline" />
          <LmsHeaderButton />
          <JoinButton lang={lang} />
          <button
            type="button"
            className="pill-on-navy h-9 w-9 justify-center lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t("header.menu")}
            onClick={() => setOpen((v) => !v)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-white/10 bg-background px-4 py-3 text-foreground lg:hidden" aria-label="Mobile">
          <div className="glass mb-3 flex flex-wrap items-center gap-2 rounded-2xl p-2">
            <span className="eyebrow px-1">
              {lang === "ar" ? "اللغة والمظهر" : "Language & theme"}
            </span>
            <LanguageToggle />
            <ThemeToggle showLabel />
          </div>
          <div className="mb-3">
            <LmsHeaderButton mobile onPick={() => setOpen(false)} />
          </div>
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) =>
              link.menu ? (() => {
                const current = resourceLinks.find((r) => samePath(pathname, r.href));
                const group = t("nav.resources", link.label);
                return (
                <li key={link.href}>
                  <button
                    type="button"
                    aria-expanded={resOpen}
                    aria-controls="mobile-resources"
                    aria-current={current ? "page" : undefined}
                    aria-label={current ? `${group}: ${t(current.key, current.label)}` : undefined}
                    onClick={() => setResOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-full px-4 py-2 text-start text-sm font-semibold text-heading hover:bg-cream aria-[current=page]:bg-sun aria-[current=page]:text-navy dark:hover:bg-white/10"
                    data-testid="mobile-nav-resources"
                  >
                    {current ? t(current.key, current.label) : group}
                    <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 opacity-70 transition ${resOpen ? "rotate-180" : ""}`} aria-hidden>
                      <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
                    </svg>
                  </button>
                  {resOpen && (
                    <ul id="mobile-resources" className="glass glass-emph mx-2 mb-1 mt-1 flex flex-col gap-0.5 rounded-2xl p-1.5" data-testid="mobile-resources">
                      {resourceLinks.map((item) => (
                        <li key={item.href}>
                          <Link href={item.href} onClick={() => setOpen(false)} aria-current={samePath(pathname, item.href) ? "page" : undefined} className={menuItemCls}>
                            <ResourceIcon kind={item.kind} />
                            {t(item.key, item.label)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
                );
              })() : (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={(link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)) ? "page" : undefined}
                    className="block rounded-full px-4 py-2 text-sm font-semibold text-heading hover:bg-cream aria-[current=page]:bg-sun aria-[current=page]:text-navy dark:hover:bg-white/10"
                  >
                    {t(`nav.${link.href}`, link.label)}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
