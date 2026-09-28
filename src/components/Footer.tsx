"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { encyclopediaLinks, navLinks, siteConfig } from "@/content/site";
import { WhatsAppLink } from "@/components/WhatsApp";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const pathname = usePathname();
  const { t } = useI18n();
  if (pathname.startsWith("/admin")) return null;
  if (pathname.startsWith("/encyclopedia")) return null;

  return (
    <footer className="mt-auto border-t border-card-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-foreground">{siteConfig.name}</p>
          <p className="mt-2 text-sm text-muted">{t("footer.tagline", siteConfig.tagline)}</p>
          <p className="mt-3 text-sm text-muted">{t("footer.location", siteConfig.location)}</p>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
            {t("footer.quickLinks")}
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted hover:text-primary">
                  {t(`nav.${link.href}`, link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
            {t("header.libraries")}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {encyclopediaLinks.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="text-muted hover:text-primary">
                  {t(`enc.${item.id}`, item.label)}
                </Link>
              </li>
            ))}
            <li className="pt-2 text-muted">
              <a href={`mailto:${siteConfig.email}`} className="hover:text-primary">
                {siteConfig.email}
              </a>
            </li>
            <li className="text-muted">
              <WhatsAppLink className="hover:text-primary" />
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-card-border py-4 text-center text-xs text-muted">
        {t("footer.copyright", siteConfig.copyright)}
      </div>
    </footer>
  );
}
