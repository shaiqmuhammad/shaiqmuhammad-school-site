"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isImmersivePath } from "@/lib/immersive";
import { encyclopediaLinks, navLinks, siteConfig } from "@/content/site";
import { useI18n } from "@/lib/i18n";
import { SocialLinks } from "@/components/SocialLinks";

export function Footer() {
  const pathname = usePathname();
  const { t } = useI18n();
  if (pathname.startsWith("/admin")) return null;
  if (isImmersivePath(pathname)) return null;
  if (pathname.startsWith("/encyclopedia")) return null;

  return (
    <footer className="mt-auto bg-footer text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="text-lg font-extrabold text-white">{siteConfig.name}</p>
          <p className="mt-2 text-sm text-white/75">{t("footer.tagline", siteConfig.tagline)}</p>
          <p className="mt-3 text-sm text-white/75">{t("footer.location", siteConfig.location)}</p>
          <SocialLinks className="mt-4" />
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-sun">
            {t("footer.quickLinks")}
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-white/80 hover:text-sun">
                  {t(`nav.${link.href}`, link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-sun">
            {t("header.libraries")}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {encyclopediaLinks.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="text-white/80 hover:text-sun">
                  {t(`enc.${item.id}`, item.label)}
                </Link>
              </li>
            ))}
            <li className="pt-2 text-white/80">
              <a href={`mailto:${siteConfig.email}`} className="hover:text-sun">
                {siteConfig.email}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
        {t("footer.copyright", siteConfig.copyright)}
      </div>
    </footer>
  );
}
