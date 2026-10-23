"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { modCall } from "@/lib/lmsMods";

type Item = { on: boolean; keepBefore: number; by: string; at: number; isDefault?: boolean };
type Res = { default: string; canSet: boolean; items: Record<string, Item> };
// Batch every badge on the page into one request.
const cache = new Map<string, Promise<Res>>();
let queue: { id: string; asAdmin: boolean; res: (r: Res) => void; rej: (e: unknown) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
function fetchLink(id: string, asAdmin: boolean): Promise<Res> {
  const k = `${asAdmin ? "a" : "u"}|${id}`; const hit = cache.get(k); if (hit) return hit;
  const p = new Promise<Res>((res, rej) => { queue.push({ id, asAdmin, res, rej }); });
  cache.set(k, p);
  if (!timer) timer = setTimeout(() => {
    const q = queue; queue = []; timer = null;
    for (const adm of [true, false]) { const part = q.filter((x) => x.asAdmin === adm); if (!part.length) continue;
      modCall<Res>("trk-link-get", { ids: [...new Set(part.map((x) => x.id))] }, adm).then((r) => part.forEach((x) => x.res(r))).catch((e) => part.forEach((x) => { cache.delete(`${adm ? "a" : "u"}|${x.id}`); x.rej(e); })); }
  }, 30);
  return p;
}

/** 'Linked to Tracker' / 'Practice' badge; with permission, a switch. Server enforces it. */
export function TrkLink({ id, kind = "quiz", asAdmin = false, student = false }: { id: string; kind?: "quiz" | "hw"; asAdmin?: boolean; student?: boolean }) {
  const { tr } = useTr();
  const [it, setIt] = useState<Item | null>(null);
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; fetchLink(id, asAdmin).then((r) => { if (live) { setIt(r.items[id] || null); setCan(!student && r.canSet); } }).catch(() => undefined); return () => { live = false; }; }, [id, asAdmin, student]);
  if (!it) return null;
  const set = async (on: boolean) => {
    let keep = true;
    if (!on) keep = confirm(tr("Switch this to Practice?\n\nOK = keep the scores it has already added to the Assessment Tracker.\nCancel = remove those scores (teacher overrides are never removed).", "التحويل إلى تدريب؟\n\nموافق = الإبقاء على الدرجات التي أُضيفت للمتتبع.\nإلغاء = إزالة تلك الدرجات (لا تُزال تعديلات المعلم)."));
    setBusy(true);
    try { await modCall("trk-link-set", { id, kind, on, keep }, asAdmin); cache.clear(); setIt({ ...it, on, keepBefore: !on && keep ? Date.now() : 0, isDefault: false }); } catch (e) { alert((e as Error).message); }
    setBusy(false);
  };
  const badge = <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${it.on ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" : "bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-white"}`} data-testid="trk-link-badge" data-on={it.on ? "1" : "0"}>{it.on ? `📊 ${tr("Linked to Tracker", "مرتبط بالمتتبع")}` : `✏️ ${tr("Practice", "تدريب")}`}</span>;
  if (!can) return badge;
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px]" title={tr("Link to Assessment Tracker: ON = submissions fill this week's Success Criteria scores. OFF = practice, never in the tracker.", "الربط بمتتبع التقييم")}>
      <input type="checkbox" checked={it.on} disabled={busy} onChange={(e) => set(e.target.checked)} data-testid="trk-link-switch" /> {badge}
    </label>
  );
}
