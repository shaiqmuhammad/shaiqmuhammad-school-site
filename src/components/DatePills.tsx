"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";

/** Today's dates for headers: Hijri (Umm al-Qura) and Gregorian, each in its own pill. */
export function useToday() {
  const { lang } = useTr();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the date is only known in the browser
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  const ar = lang === "ar";
  const fmt = (loc: string, o: Intl.DateTimeFormatOptions) => { try { return new Intl.DateTimeFormat(loc, o).format(now); } catch { return ""; } };
  return {
    greg: fmt(ar ? "ar-AE-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    gregShort: fmt(ar ? "ar-AE-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" }),
    hijri: fmt(ar ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-GB-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }),
    hijriShort: fmt(ar ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-GB-u-ca-islamic-umalqura", { day: "numeric", month: "short", year: "numeric" }),
  };
}

const base = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold leading-none sm:text-xs";

export function HijriPill({ tone = "navy", compact = false }: { tone?: "navy" | "light"; compact?: boolean }) {
  const d = useToday();
  const { tr } = useTr();
  if (!d?.hijri) return null;
  return <span className={`${base} ${tone === "navy" ? "bg-[#24857a] text-white ring-1 ring-white/20" : "bg-[#cdebe4] text-[#0f4a42] dark:bg-[#24857a] dark:text-white"}`} title={tr("Hijri date (Umm al-Qura)", "التاريخ الهجري (أم القرى)")} data-testid="date-hijri"><span aria-hidden>🌙</span>{compact ? d.hijriShort : d.hijri}</span>;
}
export function GregPill({ tone = "navy", compact = false }: { tone?: "navy" | "light"; compact?: boolean }) {
  const d = useToday();
  const { tr } = useTr();
  if (!d?.greg) return null;
  return <span className={`${base} ${tone === "navy" ? "bg-sun text-[#0b1b2b]" : "bg-sun/70 text-[#0b1b2b]"}`} title={tr("Today's date", "تاريخ اليوم")} data-testid="date-greg"><span aria-hidden>📅</span>{compact ? d.gregShort : d.greg}</span>;
}
