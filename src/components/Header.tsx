"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { encyclopediaLinks, navLinks, siteConfig } from "@/content/site";
import { HadithScrollIcon, QuranBookIcon } from "@/components/EncyclopediaIcons";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  // Admin has its own chrome (with the same language/theme toggles).
  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-card-border bg-header backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full border border-card-border bg-card object-cover shadow-sm"
          />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight text-foreground group-hover:text-primary sm:text-base">
              {siteConfig.name}
            </span>
            <span className="hidden text-xs text-muted sm:block">{t("header.tagline")}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-2.5 py-1.5 text-sm transition ${
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

        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
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
