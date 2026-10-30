"use client";

import { useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, type HwShare as Share } from "@/lib/lms";

/** t328: owner shares a homework with other teachers; "Can correct" lets them grade (they also need the admin's "Correct homework shared with them" permission). */
export function HwShare({ hw, asAdmin = false }: { hw: string; asAdmin?: boolean }) {
  const { tr } = useTr();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<{ share: Share; teachers: { id: string; name: string; permitted: boolean }[]; own: boolean } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => lmsApi.hwShareGet(hw, asAdmin).then(setD).catch((e) => setMsg(lmsErrorText(e, tr)));
  const save = async (share: Share) => { try { await lmsApi.hwShareSet(hw, share, asAdmin); setD((x) => (x ? { ...x, share } : x)); setMsg(tr("Saved ✓", "تم الحفظ ✓")); } catch (e) { setMsg(lmsErrorText(e, tr)); } };
  return (
    <div className="w-full" data-testid="hw-share">
      <button type="button" className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold" onClick={() => { setOpen(!open); if (!d) void load(); }} data-testid="hw-share-btn">👥 {tr("Share with teachers", "مشاركة مع المعلمين")}{d?.share.teachers.length ? ` (${d.share.teachers.length})` : ""}</button>
      {open && d && (d.own ? (
        <div className="mt-2 space-y-2 rounded-xl bg-violet-50 p-3 text-slate-900" data-testid="hw-share-panel">
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={d.share.correct} onChange={(e) => save({ ...d.share, correct: e.target.checked })} data-testid="hw-share-correct" />{tr("Shared teachers can correct it", "يمكن للمعلمين المشاركين التصحيح")}</label>
          <div className="max-h-48 space-y-1 overflow-auto">{d.teachers.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.share.teachers.includes(t.id)} onChange={(e) => save({ ...d.share, teachers: e.target.checked ? [...d.share.teachers, t.id] : d.share.teachers.filter((x) => x !== t.id) })} data-testid="hw-share-teacher" data-name={t.name} />{t.name}{d.share.correct && !t.permitted && <span className="text-[10px] text-amber-800">({tr("needs admin permission to correct", "يحتاج إذن المدير للتصحيح")})</span>}</label>
          ))}</div>
          {msg && <p className="text-xs">{msg}</p>}
        </div>
      ) : <p className="mt-1 text-xs opacity-70" data-testid="hw-share-view">{d.share.correct ? tr("Shared with you — you can correct it.", "مشارك معك — يمكنك التصحيح.") : tr("Shared with you — view only.", "مشارك معك — للعرض فقط.")}</p>)}
    </div>
  );
}
