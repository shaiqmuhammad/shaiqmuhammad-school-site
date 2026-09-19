"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>;
    Tawk_LoadStart?: Date;
  }
}

/**
 * Free live chat via Tawk.to.
 * Set NEXT_PUBLIC_TAWK_PROPERTY_ID and NEXT_PUBLIC_TAWK_WIDGET_ID in env, then rebuild.
 * Without IDs, shows a discreet Contact fallback — no fake backend.
 */
export function ChatWidget() {
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim() || "";
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim() || "";
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

    return () => {
      // leave script in place across SPA navigations
    };
  }, [propertyId, widgetId]);

  if (!mounted) return null;

  if (propertyId && widgetId) {
    return null; // Tawk injects its own floating widget
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[14rem] rounded-2xl border border-card-border bg-card p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground">Chat coming soon</p>
      <p className="mt-1 text-muted">
        Live chat activates when Tawk.to IDs are set. Meanwhile{" "}
        <Link href="/contact" className="font-medium text-primary hover:underline">
          contact us
        </Link>
        .
      </p>
    </div>
  );
}
