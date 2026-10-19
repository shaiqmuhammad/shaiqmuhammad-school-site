"use client";

import { useTr } from "@/components/lms/useLms";
import { grpLabel } from "@/lib/lms";
import { WhoPicker, useWho } from "@/components/lms/WhoPicker";
import { lmsSession } from "@/lib/lms";

/** Activity launchers: pick participants from the shared picker (Student groups + Classes & sections). Emits student ids. */
export function AudiencePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { tr } = useTr();
  const role = typeof window === "undefined" ? "" : lmsSession()?.user.role || "";
  const data = useWho(false);
  if (role !== "teacher" || !data) return null;
  return (
    <fieldset className="rounded-2xl border border-card-border p-3" data-testid="audience">
      <legend className="px-1 text-sm font-semibold">{tr("Participants (auto-joined, no code needed)", "المشاركون (ينضمون تلقائيًا بلا رمز)")} · <span data-testid="aud-count">{value.length}</span></legend>
      <WhoPicker students={data.students} groups={data.groups} value={value} onChange={onChange} />
    </fieldset>
  );
}

/** Wheel / Randomiser: fill the names box from a group or class/section (teacher's groups only). */
export function RosterLoader({ onNames }: { onNames: (names: string[]) => void }) {
  const { tr } = useTr();
  const role = typeof window === "undefined" ? "" : lmsSession()?.user.role || "";
  const data = useWho(false);
  if (role !== "teacher" || !data) return null;
  const byId = new Map(data.students.map((s) => [s.id, s.name]));
  const names = (ids: string[]) => ids.map((id) => byId.get(id)).filter((x): x is string => !!x);
  const opts = new Map<string, string[]>();
  data.groups.forEach((g) => opts.set(`g:${g.id}`, names(g.students)));
  return (
    <select className="mt-3 w-full rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-black/30" value="" onChange={(e) => { const n = opts.get(e.target.value); if (n) onNames(n); }} aria-label={tr("Load names from my groups", "تحميل الأسماء من مجموعاتي")} data-testid="roster-loader">
      <option value="">{tr("Load names from my groups…", "تحميل الأسماء من مجموعاتي…")}</option>
      {data.groups.map((g) => <option key={g.id} value={`g:${g.id}`}>{grpLabel(g)} ({opts.get(`g:${g.id}`)?.length})</option>)}
    </select>
  );
}
