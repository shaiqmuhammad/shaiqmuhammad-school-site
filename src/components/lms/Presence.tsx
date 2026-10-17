"use client";
import { useState } from "react";
import { useTr } from "@/components/lms/useLms";

/** Green dot when seen in the last ~2.5 minutes, otherwise grey with "last seen". */
export function isOnline(seen: number | undefined, now: number) {
  return !!seen && now - seen < 150_000;
}
export function lastSeenText(seen: number | undefined, now: number, tr: (en: string, ar: string) => string) {
  if (!seen) return tr("Never seen", "لم يظهر بعد");
  const m = Math.max(0, Math.round((now - seen) / 60_000));
  if (m < 3) return tr("Online now", "متصل الآن");
  if (m < 60) return tr(`Last seen ${m} min ago`, `آخر ظهور قبل ${m} د`);
  const h = Math.round(m / 60);
  if (h < 48) return tr(`Last seen ${h} h ago`, `آخر ظهور قبل ${h} س`);
  return tr(`Last seen ${Math.round(h / 24)} d ago`, `آخر ظهور قبل ${Math.round(h / 24)} يوم`);
}
export function PresenceDot({ seen, now, label = false, className = "" }: { seen?: number; now?: number; label?: boolean; className?: string }) {
  const { tr } = useTr();
  const [t0] = useState(() => Date.now());
  const n = now ?? t0;
  const on = isOnline(seen, n);
  const text = lastSeenText(seen, n, tr);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={text} data-testid="presence" data-online={on ? "1" : "0"}>
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-[#0b1b2b] ${on ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
      {label ? <span className="text-[11px] opacity-70">{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  );
}
