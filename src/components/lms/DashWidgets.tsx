"use client";

import { useEffect, useState } from "react";
import { lmsApi } from "@/lib/lms";

export type Tone = "sun" | "teal" | "coral" | "navy" | "sky" | "mint" | "peach";
export type Widget = { icon: string; title: string; value?: string | number; sub?: string; href?: string; tone: Tone; badge?: number };

const TONE: Record<Tone, string> = {
  sun: "bg-sun text-[#1b3a57]",
  teal: "bg-[#24857a] text-white",
  coral: "bg-coral text-[#3b1710]",
  navy: "bg-header text-white dark:bg-[#1f4a73]",
  sky: "bg-[#bfdff3] text-[#1b3a57]",
  mint: "bg-[#cdebe4] text-[#0f4a42]",
  peach: "bg-[#fde0d9] text-[#6b2b1d]",
};

/** Unread message count (polls quietly). Shared by the rail badge and the dashboard cards. */
export function useUnreadMsgs() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => { if (!document.hidden) lmsApi.msgThreads(false).then((r) => setN(r.unread || 0)).catch(() => undefined); };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  return n;
}

/** Horizontal, swipeable card carousel of big colourful widgets (dashboard content). */
export function DashCarousel({ items, testId = "lms-widgets" }: { items: Widget[]; testId?: string }) {
  return (
    <div className="-mx-3 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-3 pb-3 pt-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]" data-testid={testId} role="list">
      {items.map((w) => {
        const inner = (
          <>
            <span className="text-5xl leading-none max-sm:text-4xl" aria-hidden>{w.icon}</span>
            {w.badge ? <span className="absolute end-3 top-3 rounded-full bg-white px-2.5 py-0.5 text-sm font-black text-[#1b3a57] shadow">{w.badge}</span> : null}
            <span className="mt-3 block min-w-0">
              {w.value !== undefined && <span className="block text-3xl font-extrabold leading-none" data-testid="widget-value">{w.value}</span>}
              <span className="mt-1 block text-lg font-extrabold leading-tight">{w.title}</span>
              {w.sub && <span className="mt-0.5 block text-sm font-bold opacity-80" dir="auto">{w.sub}</span>}
            </span>
          </>
        );
        const cls = `relative flex min-h-[158px] w-[200px] shrink-0 snap-start flex-col justify-between rounded-[28px] p-5 shadow-[0_10px_22px_-12px_rgba(23,52,79,0.5)] transition hover:-translate-y-0.5 max-sm:w-[170px] max-sm:min-h-[140px] max-sm:p-4 ${TONE[w.tone]}`;
        return w.href ? <a key={w.title} href={w.href} role="listitem" className={cls} data-testid="widget">{inner}</a> : <div key={w.title} role="listitem" className={cls} data-testid="widget">{inner}</div>;
      })}
    </div>
  );
}
