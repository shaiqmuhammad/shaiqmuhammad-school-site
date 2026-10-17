"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, type LiveActivity } from "@/lib/lms";
import { ACTIVITY_LABELS, type ActivityType } from "@/lib/activity";

/** Student home: activities the teacher started for this student — one tap to join, no code to type. */
export function LiveActivityBanner() {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<LiveActivity[]>([]);
  useEffect(() => {
    const load = () => { if (!document.hidden) lmsApi.actLive().then((r) => setItems(r.items)).catch(() => undefined); };
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!items.length) return null;
  return (
    <div className="space-y-2" data-testid="live-activities">
      {items.map((x) => {
        const l = ACTIVITY_LABELS[x.type as ActivityType];
        return (
          <a key={x.code} href={`/join?code=${x.code}&auto=1`} className="flex items-center gap-3 rounded-3xl bg-sun px-5 py-4 text-[#0b1b2b] shadow-lg transition hover:scale-[1.01]" data-testid="live-activity-join">
            <span className="text-3xl" aria-hidden>{l?.icon || "🎯"}</span>
            <span className="min-w-0 flex-1"><b className="block truncate" dir="auto">{x.title || (l ? (lang === "ar" ? l.ar : l.en) : "")}</b><span className="text-sm opacity-80">{tr(`Started by ${x.teacher} — tap to join`, `بدأه ${x.teacher} — اضغط للانضمام`)}</span></span>
            <span className="rounded-full bg-[#0b1b2b] px-4 py-2 font-extrabold text-sun">{tr("Join", "انضم")} →</span>
          </a>
        );
      })}
    </div>
  );
}
