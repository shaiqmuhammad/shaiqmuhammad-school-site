"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lp, packParts, PART_LABEL, partText, type Pack, type Part } from "@/lib/packs";

const GROUPS: { part: Part; en: string; ar: string }[] = [
  // t650: lessons stay with the teacher; students only get Tasks, Homework and Quran Homework.
  { part: "activity", en: "Tasks", ar: "المهام" },
  { part: "homework", en: "Homework", ar: "الواجبات" },
];

/** Assigned Lesson Builder work, split onto the page that matches each slide type. */
export function PackDash() {
  const { tr } = useTr();
  const [items, setItems] = useState<Pack[] | null>(null);
  useEffect(() => { lp.list(false).then((r) => setItems(r.items || [])).catch(() => setItems([])); }, []);
  const waiting = (x: Pack) => x.subStatus !== "submitted" && x.subStatus !== "approved";
  const groups = GROUPS.map((g) => ({ ...g, items: (items || []).filter((x) => waiting(x) && packParts(x).includes(g.part)).slice(0, 6) })).filter((g) => g.items.length);
  if (!groups.length) return null;
  return (
    <section className="space-y-3" data-testid="lp-dash">
      {groups.map((g) => (
        <div key={g.part} className="rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-100/90 via-white/80 to-sky-100/80 p-4 text-[#1b2f44] shadow-lg backdrop-blur-md">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold">{PART_LABEL[g.part][0]} {tr(g.en, g.ar)}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((x) => {
              const many = packParts(x).length > 1;
              const href = x.hw ? `/lms/homework?id=${encodeURIComponent(x.hw)}${many ? `&part=${g.part}` : ""}` : `/lms/material?open=${encodeURIComponent(x.id)}&part=${g.part}`;
              const [en, ar] = partText(g.part, true);
              return (
                <li key={x.id + g.part}><a href={href} className="flex items-center gap-3 rounded-2xl bg-white/85 p-3 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md" data-testid="lp-dash-item" data-part={g.part}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl shadow-inner ${PART_LABEL[g.part][3]}`}>{PART_LABEL[g.part][0]}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-extrabold" dir="auto">{x.title || tr(en, ar)}</span><span className="text-xs opacity-70">{tr(en, ar)}{x.due ? ` · ${tr("due", "التسليم")} ${new Date(x.due).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}` : ""}</span></span>
                  <span className="rounded-full bg-[#1b3a57] px-3 py-1 text-xs font-extrabold text-[#f5c542]">▶ {tr("Start", "ابدأ")}</span>
                </a></li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
