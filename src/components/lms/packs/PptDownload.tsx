"use client";

import { useState } from "react";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { lp, type Slide } from "@/lib/packs";
import type { PptxPack } from "./pptxExport";

/** t645: “Download PPT” — every slide of the pack as a .pptx file (made in the browser). Pass `pack` (with slides) or `id` to fetch it. */
export function PptDownload({ pack, id, asAdmin, className, compact }: { pack?: PptxPack & { slides?: Slide[] }; id?: string; asAdmin: boolean; className: string; compact?: boolean }) {
  const { tr } = useTr();
  const { actor } = useLmsActor();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const go = async () => {
    if (busy) return;
    setErr(""); setBusy("…");
    try {
      const p = pack?.slides ? pack : id ? (await lp.get(id, asAdmin)).pack : pack;
      if (!p?.slides?.length) { setErr(tr("This lesson has no slides yet.", "لا توجد شرائح في هذا الدرس بعد.")); return; }
      const { exportPackPptx } = await import("./pptxExport");
      await exportPackPptx(p, asAdmin, (i, n) => setBusy(`${i}/${n}`));
    } catch {
      setErr(tr("Couldn't make the PowerPoint. Try again.", "تعذّر إنشاء ملف PowerPoint. حاول مرة أخرى."));
    } finally { setBusy(""); }
  };
  const label = tr("Download PPT", "تنزيل PowerPoint");
  // t661: admin always; teachers only with the "Download PPT" permission (Admin → Teachers).
  if (!(asAdmin || actor?.role === "admin" || (actor?.role === "teacher" && (actor.perms || []).includes("pptDownload")))) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => void go()} disabled={!!busy} title={tr("Download all slides as a PowerPoint file", "تنزيل كل الشرائح كملف PowerPoint")} aria-label={label} data-testid="lp-ppt-download">
        ⬇ {busy ? `${tr("Making PPT", "جارٍ إنشاء PowerPoint")} ${busy}` : compact ? "PPT" : label}
      </button>
      {err && <span className="text-xs font-bold text-rose-700" role="alert" data-testid="lp-ppt-error">{err}</span>}
    </>
  );
}
