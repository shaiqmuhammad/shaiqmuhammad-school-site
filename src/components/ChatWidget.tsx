"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isImmersivePath } from "@/lib/immersive";
import { loadSiteSettingsCached, resolveTawkIds } from "@/lib/siteSettings";
import { lmsSession } from "@/lib/lms";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown> & { hideWidget?: () => void; showWidget?: () => void };
    Tawk_LoadStart?: Date;
  }
}

/**
 * Free live chat via Tawk.to.
 * IDs from NEXT_PUBLIC_TAWK_* env (preferred) OR public/content/settings.json via Admin → Settings.
 * Without IDs, shows a discreet “Chat coming soon” fallback.
 */
export function ChatWidget() {
  const [mounted, setMounted] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [widgetId, setWidgetId] = useState("");

  const pathname = usePathname() || "";
  // Admin and signed-in LMS pages: load Tawk for the visitor monitor but keep the bubble hidden.
  const [lmsUser, setLmsUser] = useState<ReturnType<typeof lmsSession>>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLmsUser(lmsSession()); }, [pathname]);
  const isLms = /^\/lms(\/|$)/.test(pathname);
  const tracked = /^\/admin(\/|$)/.test(pathname) || (isLms && !!lmsUser);
  // Fully off on assessment / join / activity / QR screens (and LMS when nobody is signed in).
  const immersive = !tracked && isImmersivePath(pathname);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Hide the bubble on tracked (admin/LMS) and immersive screens; show it on public pages.
  useEffect(() => {
    const hide = immersive || tracked;
    const api = (window.Tawk_API = window.Tawk_API || {}) as Record<string, unknown> & { hideWidget?: () => void; showWidget?: () => void; setAttributes?: (a: Record<string, string>, cb?: (e?: unknown) => void) => void; addEvent?: (n: string, m?: Record<string, string>, cb?: () => void) => void };
    const apply = () => {
      try {
        if (hide) api.hideWidget?.(); else api.showWidget?.();
        // Visitor attributes for signed-in LMS users only (no PIN / token / sensitive data).
        if (tracked && isLms && lmsUser) api.setAttributes?.({ name: String(lmsUser.user.name || ""), role: String(lmsUser.user.role || ""), class: [(lmsUser.user as { cls?: string }).cls, (lmsUser.user as { section?: string }).section].filter(Boolean).join(" ") }, () => undefined);
        if (tracked) api.addEvent?.("page", { title: document.title.slice(0, 60), path: pathname.slice(0, 60) }, () => undefined);
      } catch {
        // widget not ready yet
      }
    };
    apply();
    api.onLoad = apply;
  }, [immersive, tracked, isLms, lmsUser, pathname]);

  useEffect(() => {
    let cancelled = false;
    loadSiteSettingsCached()
      .then((settings) => {
        if (cancelled) return;
        const ids = resolveTawkIds(settings);
        setPropertyId(ids.propertyId);
        setWidgetId(ids.widgetId);
      })
      .catch(() => {
        if (cancelled) return;
        const ids = resolveTawkIds(null);
        setPropertyId(ids.propertyId);
        setWidgetId(ids.widgetId);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Tawk only on normal pages: never on assessment screens (it is loaded later if the visitor moves on).
  useEffect(() => {
    if (!propertyId || !widgetId || immersive) return;
    if (document.getElementById("tawk-script")) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const s = document.createElement("script");
    s.id = "tawk-script";
    s.async = true;
    s.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    s.charset = "UTF-8";
    s.setAttribute("crossorigin", "*");
    document.body.appendChild(s);
  }, [propertyId, widgetId, immersive]);

  if (!mounted || immersive) return null;

  if (propertyId && widgetId) {
    return null; // Tawk injects its own floating widget
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[14rem] rounded-2xl border border-card-border bg-card p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground">Chat coming soon</p>
      <p className="mt-1 text-muted">
        Live chat will be available here soon. Meanwhile{" "}
        <Link href="/contact" className="font-medium text-primary hover:underline">
          contact us
        </Link>
        .
      </p>
    </div>
  );
}
