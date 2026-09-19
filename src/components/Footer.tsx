import Link from "next/link";
import { navLinks, siteConfig } from "@/content/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-card-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-foreground">{siteConfig.name}</p>
          <p className="mt-2 text-sm text-muted">{siteConfig.tagline}</p>
          <p className="mt-3 text-sm text-muted">{siteConfig.location}</p>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Quick links
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted hover:text-primary">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/login" className="text-muted hover:text-primary">
                Login
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Contact
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>{siteConfig.address}</li>
            <li>
              <a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} className="hover:text-primary">
                {siteConfig.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${siteConfig.email}`} className="hover:text-primary">
                {siteConfig.email}
              </a>
            </li>
            <li>
              <a href={`https://${siteConfig.domain}`} className="hover:text-primary">
                {siteConfig.domain}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-card-border py-4 text-center text-xs text-muted">
        {siteConfig.copyright}
      </div>
    </footer>
  );
}
