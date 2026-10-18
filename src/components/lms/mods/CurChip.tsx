"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { modCall } from "@/lib/lmsMods";
import type { CurUnit } from "@/lib/lmsMods";

const cache = new Map<string, { at: number; p: Promise<CurUnit[]> }>();
/** One cached curriculum read per session (students: own year, assigned work only; staff: per permission). */
function units(asAdmin: boolean): Promise<CurUnit[]> {
  const k = asAdmin ? "a" : "l";
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = modCall<{ items: CurUnit[] }>("cur-list", {}, asAdmin).then((r) => r.items).catch(() => [] as CurUnit[]);
  cache.set(k, { at: Date.now(), p });
  return p;
}

/** "Curriculum unit: …" chip for a homework or assessment (nothing when it is not linked, or the viewer may not see it). */
export function CurChip({ type, id, asAdmin = false }: { type: "hw" | "quiz"; id: string; asAdmin?: boolean }) {
  const { tr } = useTr();
  const [us, setUs] = useState<CurUnit[]>([]);
  useEffect(() => {
    let live = true;
    units(asAdmin).then((all) => { if (live) setUs(all.filter((u) => (u.links || []).some((l) => l.t === type && l.id === id))); });
    return () => { live = false; };
  }, [type, id, asAdmin]);
  if (!us.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5" data-testid="cur-chip">
      {us.map((u) => (
        <a key={u.id} href={`/lms/curriculum?unit=${u.id}#u-${u.id}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-900 hover:underline dark:bg-violet-900/40 dark:text-violet-100" title={`${u.subject} · ${u.yr} · ${u.term}`}>
          📚 <span className="truncate" dir="auto">{tr("Unit", "الوحدة")}: {u.title}</span> <span className="opacity-70">· {u.term}</span>
        </a>
      ))}
    </span>
  );
}
