"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_WHATSAPP_NUMBER, loadSiteSettingsCached, whatsappLink } from "@/lib/siteSettings";

const GREETING = "Assalamu alaikum, I have a question about the lessons.";

/** Current WhatsApp number: default at build time, then the value from settings.json (Admin → Settings). */
function useWhatsAppNumber(): string {
  const [number, setNumber] = useState(DEFAULT_WHATSAPP_NUMBER);
  useEffect(() => {
    let cancelled = false;
    loadSiteSettingsCached()
      .then((s) => {
        if (!cancelled) setNumber(s.whatsappNumber);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return number;
}

export function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.04 3C8.86 3 3.02 8.83 3.02 16c0 2.3.6 4.54 1.75 6.52L3 29l6.66-1.74A13 13 0 0 0 16.04 29C23.2 29 29 23.17 29 16S23.2 3 16.04 3Zm0 23.8c-2 0-3.95-.54-5.65-1.56l-.4-.24-3.95 1.03 1.05-3.850-.26-.4A10.77 10.77 0 0 1 5.2 16c0-5.96 4.86-10.8 10.84-10.8 5.97 0 10.8 4.84 10.8 10.8 0 5.970-4.84 10.8-10.8 10.8Zm5.93-8.08c-.32-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.74.16-.22.33-.85 1.06-1.04 1.28-.19.22-.38.24-.7.08-.33-.16-1.38-.51-2.62-1.62-.97-.86-1.62-1.93-1.81-2.25-.19-.33-.02-.5.14-.66.15-.15.33-.38.49-.57.16-.19.22-.33.33-.54.11-.22.05-.41-.03-.57-.08-.16-.74-1.78-1.01-2.44-.27-.64-.54-.55-.74-.56h-.63c-.22 0-.57.08-.87.41-.3.33-1.14 1.11-1.14 2.71s1.17 3.15 1.33 3.36c.16.22 2.3 3.5 5.56 4.91.78.34 1.39.54 1.86.69.78.25 1.49.21 2.05.13.63-.09 1.93-.79 2.2-1.55.27-.76.27-1.41.19-1.55-.08-.13-.3-.21-.62-.37Z" />
    </svg>
  );
}

/** Inline WhatsApp link (Contact page, footer). Hidden if the number is cleared in Admin → Settings. */
export function WhatsAppLink({ className = "", showNumber = true }: { className?: string; showNumber?: boolean }) {
  const number = useWhatsAppNumber();
  const href = whatsappLink(number, GREETING);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${className}`}>
      <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
      {showNumber ? `WhatsApp ${number}` : "WhatsApp"}
    </a>
  );
}

/** Floating green button, bottom-left so it never overlaps the Tawk / chat bubble on the right. */
export function WhatsAppButton() {
  const pathname = usePathname();
  const number = useWhatsAppNumber();
  const href = whatsappLink(number, GREETING);
  if (!href || pathname.startsWith("/admin")) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with the teacher on WhatsApp"
      title="Chat on WhatsApp"
      className="fixed bottom-4 left-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 hover:bg-[#1ebe5b] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40"
    >
      <WhatsAppIcon className="h-8 w-8" />
    </a>
  );
}
