"use client";

import { useEffect, useState } from "react";
import { exitViewAs, viewAs, type ViewAs } from "@/lib/lms";
import { useTr } from "@/components/lms/useLms";

/** Shown on every /lms page while an admin is viewing as a student/teacher (read-only, this tab only). */
export function ViewAsBanner() {
  const { tr } = useTr();
  const [va, setVa] = useState<ViewAs | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setVa(viewAs()), 50); // after useLmsActor stored ?viewAs=
    return () => clearTimeout(t);
  }, []);
  if (!va) return null;
  return (
    <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-sun px-4 py-2 text-center text-sm font-bold text-header shadow" data-testid="viewas-banner">
      <span>👁 {tr(`Viewing as ${va.name} (read-only)`, `عرض كـ ${va.name} (للعرض فقط)`)}</span>
      <button type="button" className="rounded-full bg-header px-3 py-1 text-white" onClick={() => { exitViewAs(); window.close(); window.location.href = "/admin#students"; }} data-testid="viewas-exit">{tr("Exit", "خروج")}</button>
    </div>
  );
}
