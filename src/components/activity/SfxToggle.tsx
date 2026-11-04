"use client";
import { useEffect, useState } from "react";
import { setSfxMuted, sfxMuted } from "@/lib/sfx";
import { useI18n } from "@/lib/i18n";

/** t420: 🔊/🔇 toggle shared by every page that plays sounds. */
export function SfxToggle({ className = "" }: { className?: string }) {
  const { lang } = useI18n();
  const [muted, setMuted] = useState(false);
  useEffect(() => { const s = () => setMuted(sfxMuted()); s(); window.addEventListener("sm-sfx", s); return () => window.removeEventListener("sm-sfx", s); }, []);
  const label = muted ? (lang === "ar" ? "الصوت مغلق" : "Sound off") : (lang === "ar" ? "الصوت يعمل" : "Sound on");
  return (
    <button type="button" className={`rounded-full bg-header px-3 py-1.5 text-sm font-bold text-sun ${className}`} onClick={() => setSfxMuted(!muted)} aria-pressed={!muted} title={label} data-testid="sfx-toggle">
      {muted ? "🔇" : "🔊"} {label}
    </button>
  );
}
