"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isImmersivePath } from "@/lib/immersive";
import { useState } from "react";
import { encyclopediaLinks, navLinks, siteConfig } from "@/content/site";
import { HadithScrollIcon, QuranBookIcon } from "@/components/EncyclopediaIcons";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";
import { useLogoUrl } from "@/components/SiteBrand";

/** Bright "Join" pill: students tap it to join a live class assessment with the teacher's code. */
function JoinButton({ lang }: { lang: string }) {
  const ar = lang === "ar";
  return (
    <Link
      href="/join"
      data-testid="header-join"
      aria-label={ar ? "انضم إلى اختبار الصف" : "Join a class assessment"}
      title={ar ? "انضم إلى اختبار الصف" : "Join a class assessment"}
      className="relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 text-sm font-bold text-[#2a1400] shadow-md shadow-orange-500/30 ring-2 ring-amber-300/70 transition hover:scale-105 hover:from-amber-300 hover:to-orange-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 dark:ring-amber-400/50 sm:px-4 lg:px-3 xl:px-4"
    >
      <span className="absolute -end-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
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
  const { t, lang } = useI18n();
  const logoUrl = useLogoUrl();

  // Admin has its own chrome (with the same language/theme toggles).
  if (pathname.startsWith("/admin")) {
    return null;
  }
  // Assessment player / group screens are full-screen.
  if (isImmersivePath(pathname)) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-card-border bg-header backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 lg:gap-2 lg:px-4 xl:gap-4 xl:px-6">
        <Link href="/" className="group flex min-w-0 items-center gap-2 sm:shrink-0 sm:gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 shrink-0 rounded-full border border-card-border bg-card object-cover shadow-sm sm:h-10 sm:w-10"
          />
          <span className="min-w-0 leading-tight max-[374px]:sr-only">
            <span className="block text-[13px] font-semibold tracking-tight text-foreground group-hover:text-primary sm:whitespace-nowrap sm:text-base">
              {siteConfig.name}
            </span>
            <span className="hidden whitespace-nowrap text-xs text-muted sm:block lg:hidden xl:block">{t("header.tagline")}</span>
          </span>
        </Link>

        <nav className="hidden items-center lg:flex xl:gap-1" aria-label="Primary">
          {navLinks.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition xl:px-2.5 ${
                  active
                    ? "bg-accent-soft font-medium text-primary"
                    : "text-foreground/80 hover:bg-accent-soft hover:text-primary"
                }`}
              >
                {t(`nav.${link.href}`, link.label)}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageToggle className="max-sm:px-2.5" />
          <ThemeToggle labelClassName="hidden sm:inline lg:hidden xl:inline" />
          <JoinButton lang={lang} />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-card-border lg:hidden"
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
        <nav id="mobile-nav" className="border-t border-card-border bg-card px-4 py-3 lg:hidden" aria-label="Mobile">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-card-border bg-accent-soft/50 p-2">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {lang === "ar" ? "اللغة والمظهر" : "Language & theme"}
            </span>
            <LanguageToggle />
            <ThemeToggle showLabel />
          </div>
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-accent-soft hover:text-primary"
                >
                  {t(`nav.${link.href}`, link.label)}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-card-border pt-2">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {t("header.libraries")}
              </p>
            </li>
            {encyclopediaLinks.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gold-soft hover:text-primary"
                >
                  {item.id === "quran" ? <QuranBookIcon className="h-4 w-4" /> : <HadithScrollIcon className="h-4 w-4" />}
                  {t(`enc.${item.id}`, item.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
