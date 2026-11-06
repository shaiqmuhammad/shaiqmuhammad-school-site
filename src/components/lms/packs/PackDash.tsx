"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { LB_ICON, lp, TYPE_LABEL, type Pack } from "@/lib/packs";

/** t429: student dashboard — lessons and activities assigned from the Lesson Builder, one tap to open and start. */
export function PackDash() {
  const { tr } = useTr();
  const [items, setItems] = useState<Pack[] | null>(null);
  useEffect(() => { lp.list(false).then((r) => setItems(r.items || [])).catch(() => setItems([])); }, []);
  const list = (items || []).filter((x) => x.type === "activity" || x.type === "homework").sort((a, b) => (a.type === "activity" ? -1 : 0) - (b.type === "activity" ? -1 : 0) || (b.assignAt || b.updated) - (a.assignAt || a.updated)).slice(0, 6);
  if (!list.length) return null;
  return (
    <section className="rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-100/90 via-white/80 to-sky-100/80 p-4 text-[#1b2f44] shadow-lg backdrop-blur-md" data-testid="lp-dash">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">{LB_ICON} {tr("My Lessons and Activities", "دروسي وأنشطتي")}</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((x) => <li key={x.id}><a href={x.hw ? `/lms/homework?id=${encodeURIComponent(x.hw)}` : `/lms/material?open=${encodeURIComponent(x.id)}`} className="flex items-center gap-3 rounded-2xl bg-white/85 p-3 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md" data-testid="lp-dash-item">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-2xl text-white shadow-inner">{TYPE_LABEL[x.type][0]}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-extrabold" dir="auto">{x.title || tr(TYPE_LABEL[x.type][1], TYPE_LABEL[x.type][2])}</span><span className="text-xs opacity-70">{tr(TYPE_LABEL[x.type][1], TYPE_LABEL[x.type][2])}{x.due ? ` · ${tr("due", "التسليم")} ${new Date(x.due).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}` : ""}</span></span>
          <span className="rounded-full bg-[#1b3a57] px-3 py-1 text-xs font-extrabold text-[#f5c542]">▶ {tr("Start", "ابدأ")}</span></a></li>)}
      </ul>
    </section>
  );
}
