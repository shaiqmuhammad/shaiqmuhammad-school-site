"use client";

import { useEffect, useMemo, useState } from "react";
import { rosterIdFor } from "@/components/activity/ClassNames";
import { useTr } from "@/components/lms/useLms";
import { modCall, todayStr } from "@/lib/lmsMods";

type AttStudent = { id: string; status: string };
type AttRoster = { students: AttStudent[] };

/** Today's attendance for the current lesson (or the whole-day register if no period is open). */
async function loadAbsentIds(wanted: string[]): Promise<Set<string>> {
  if (!wanted.length) return new Set();
  const want = new Set(wanted);
  const day = todayStr();
  let period = "Day";
  try {
    const t = await modCall<{ now?: { period?: string } }>("att-times", {}, false);
    if (t.now?.period) period = t.now.period;
  } catch { /* no timetable — use the Day register */ }
  const pull = (p: string) => modCall<AttRoster>("att-roster", { day, period: p }, false);
  const inWanted = (r: AttRoster) => r.students.filter((s) => want.has(s.id));
  try {
    let rows = inWanted(await pull(period));
    const marked = (xs: AttStudent[]) => xs.some((s) => s.status);
    if (!marked(rows) && period !== "Day") {
      const dayRows = inWanted(await pull("Day"));
      if (marked(dayRows)) rows = dayRows;
    }
    if (!marked(rows)) return new Set(); // attendance not taken — show everyone
    return new Set(rows.filter((s) => s.status === "A").map((s) => s.id));
  } catch {
    return new Set();
  }
}

/** Hide students marked absent on today's register from a name list (wheel / randomiser). */
export function useAbsentFilter(allNames: string[]) {
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [include, setInclude] = useState(false);
  const idsKey = allNames.map((n) => rosterIdFor(n) || "").filter(Boolean).sort().join(",");

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    let live = true;
    const tick = () => { loadAbsentIds(ids).then((s) => { if (live) setAbsent(s); }); };
    tick();
    const iv = setInterval(tick, 8000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => { live = false; clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [idsKey]);

  const hidden = useMemo(() => allNames.filter((n) => {
    const id = rosterIdFor(n);
    return !!(id && absent.has(id));
  }), [allNames, absent]);
  const names = include ? allNames : allNames.filter((n) => !hidden.includes(n));
  return { names, hidden: hidden.length, include, setInclude };
}

export function AbsentHiddenNote({ hidden, include, onToggle }: { hidden: number; include: boolean; onToggle: () => void }) {
  const { tr } = useTr();
  if (hidden <= 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold" data-testid="absent-hidden" role="status">
      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100">
        {include
          ? tr(`${hidden} absent shown`, `${hidden} غائبون ظاهرون`)
          : tr(`${hidden} absent hidden`, `${hidden} غائبون مخفيون`)}
      </span>
      <button type="button" className="rounded-full border border-black/15 px-2.5 py-0.5 text-xs font-extrabold dark:border-white/20" onClick={onToggle} data-testid="absent-toggle" aria-pressed={include}>
        {include ? tr("Hide absent", "إخفاء الغائبين") : tr("Show absent", "إظهار الغائبين")}
      </button>
    </p>
  );
}
