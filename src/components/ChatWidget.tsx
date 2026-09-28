"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadSiteSettingsCached, resolveTawkIds } from "@/lib/siteSettings";

declare global {
  interface Window {
    Tawk_API?: { onLoad?: () => void; hideWidget?: () => void; showWidget?: () => void };
    Tawk_LoadStart?: Date;
  }
}

export function ChatWidget() {
  const pathname = usePathname();
  const [ids, setIds] = useState<{ propertyId: string; widgetId: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSiteSettingsCached()
      .then((s) => {
        if (cancelled) return;
        setIds(resolveTawkIds(s));
      })
      .catch(() => {
        if (!cancelled) setIds(resolveTawkIds(null));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ids?.propertyId || !ids.widgetId) return;
    if (pathname.startsWith("/admin")) return;

    const existing = document.getElementById("tawk-script");
    if (existing) {
      setLoaded(true);
      return;
    }

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    const s = document.createElement("script");
    s.id = "tawk-script";
    s.async = true;
    s.src = `https://embed.tawk.to/${ids.propertyId}/${ids.widgetId}`;
    s.charset = "UTF-8";
    s.setAttribute("crossorigin", "*");
    s.onload = () => setLoaded(true);
    document.body.appendChild(s);
  }, [ids, pathname]);

  if (pathname.startsWith("/admin")) return null;
  if (ids?.propertyId && ids.widgetId) {
    return loaded ? null : null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[14rem] rounded-2xl border border-card-border bg-card p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground">Chat coming soon</p>
      <p className="mt-1 text-muted">
        Live chat will appear here once Tawk.to IDs are set in Admin → Settings (or build env).
      </p>
      <Link href="/contact" className="mt-2 inline-block text-primary hover:underline">
        Contact form →
      </Link>
    </div>
  );
}
