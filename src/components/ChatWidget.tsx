"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSiteSettingsCached, resolveTawkIds } from "@/lib/siteSettings";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>;
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

  useEffect(() => setMounted(true), []);

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

  useEffect(() => {
    if (!propertyId || !widgetId) return;
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
  }, [propertyId, widgetId]);

  if (!mounted) return null;

  if (propertyId && widgetId) {
    return null; // Tawk injects its own floating widget
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[14rem] rounded-2xl border border-card-border bg-white p-3 text-xs shadow-lg">
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
