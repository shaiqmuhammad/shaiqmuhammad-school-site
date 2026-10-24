"use client";

import { useCallback, useEffect, useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { lmsSession } from "@/lib/lms";
import { modCall } from "@/lib/lmsMods";

/** t304: per-user menu layout, saved on the server (and cached locally so the menu doesn't jump on load). */
export type MenuPref = { order: string[]; hidden: string[] };
export type UiPrefs = { rail?: MenuPref; tiles?: MenuPref };
const key = () => `sm-ui-${lmsSession()?.user.id || "x"}`;
let mem: UiPrefs | null = null;
const subs = new Set<(p: UiPrefs) => void>();

export function useUiPrefs() {
  const [p, setP] = useState<UiPrefs>(() => mem || {});
  useEffect(() => {
    if (!mem) { try { mem = JSON.parse(localStorage.getItem(key()) || "{}"); } catch { mem = {}; } }
    setP(mem!);
    const f = (x: UiPrefs) => setP(x); subs.add(f);
    if (lmsSession()) modCall<{ prefs: UiPrefs }>("ui-prefs", {}, false).then((r) => { mem = r.prefs || {}; try { localStorage.setItem(key(), JSON.stringify(mem)); } catch { /* */ } subs.forEach((s) => s(mem!)); }).catch(() => undefined);
    return () => { subs.delete(f); };
  }, []);
  const save = useCallback(async (part: keyof UiPrefs, v: MenuPref | null) => {
    const next = { ...(mem || {}) }; if (v) next[part] = v; else delete next[part];
    mem = next; try { localStorage.setItem(key(), JSON.stringify(next)); } catch { /* */ }
    subs.forEach((s) => s(next));
    await modCall("ui-prefs", { save: next }, false).catch(() => undefined);
  }, []);
  return { prefs: p, save };
}

/** Apply a saved order / hidden list to items with ids (new items keep their default place at the end of known ones). */
export function applyPref<T extends { id: string }>(items: T[], pref: MenuPref | undefined, locked: string[] = []): T[] {
  if (!pref) return items;
  const idx = (id: string) => { const i = pref.order.indexOf(id); return i < 0 ? 1000 + items.findIndex((x) => x.id === id) : i; };
  return [...items].filter((x) => locked.includes(x.id) || !pref.hidden.includes(x.id)).sort((a, b) => idx(a.id) - idx(b.id));
}

/** Side panel to reorder (↑ ↓) and show/hide menu items. */
export function MenuEditor({ title, items, pref, locked = [], onSave, onClose, tr }: { title: string; items: { id: string; label: string; icon?: string }[]; pref?: MenuPref; locked?: string[]; onSave: (p: MenuPref | null) => void; onClose: () => void; tr: (en: string, ar: string) => string }) {
  const [order, setOrder] = useState<string[]>(() => applyPref(items, pref ? { ...pref, hidden: [] } : undefined).map((x) => x.id));
  const [hidden, setHidden] = useState<string[]>(pref?.hidden || []);
  const mv = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= order.length) return; const o = [...order]; [o[i], o[j]] = [o[j], o[i]]; setOrder(o); };
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[3000] flex justify-end bg-black/40" onClick={onClose} role="presentation">
        <div className="flex h-full w-full max-w-sm flex-col bg-white text-[#1b2f44] shadow-2xl dark:bg-[#10202f] dark:text-white" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} data-testid="menu-editor">
          <div className="flex items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10"><h2 className="flex-1 text-lg font-extrabold">✏️ {title}</h2><button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-black/5 dark:bg-white/10" onClick={onClose} aria-label={tr("Close", "إغلاق")} data-testid="menu-editor-close">✕</button></div>
          <p className="px-4 pt-2 text-xs opacity-70">{tr("Move items up or down, or hide the ones you don't use. Saved for your account on every device.", "حرّك العناصر للأعلى أو للأسفل أو أخفِ ما لا تستخدمه. يُحفظ لحسابك على كل الأجهزة.")}</p>
          <ul className="flex-1 space-y-1 overflow-y-auto p-3">
            {order.map((id, i) => { const it = items.find((x) => x.id === id); if (!it) return null; const off = hidden.includes(id); return (
              <li key={id} className={`flex items-center gap-2 rounded-2xl px-2 py-1.5 ${off ? "opacity-50" : "bg-black/[0.03] dark:bg-white/5"}`} data-testid="menu-item" data-id={id}>
                <span className="text-xl" aria-hidden>{it.icon}</span><span className="flex-1 text-sm font-bold" dir="auto">{it.label}</span>
                <button type="button" className="h-8 w-8 rounded-full bg-black/5 dark:bg-white/10" onClick={() => mv(i, -1)} aria-label={tr("Move up", "للأعلى")} data-testid="menu-up">↑</button>
                <button type="button" className="h-8 w-8 rounded-full bg-black/5 dark:bg-white/10" onClick={() => mv(i, 1)} aria-label={tr("Move down", "للأسفل")} data-testid="menu-down">↓</button>
                {!locked.includes(id) && <button type="button" className="h-8 w-8 rounded-full bg-black/5 dark:bg-white/10" aria-pressed={!off} onClick={() => setHidden(off ? hidden.filter((x) => x !== id) : [...hidden, id])} aria-label={off ? tr("Show", "إظهار") : tr("Hide", "إخفاء")} data-testid="menu-eye">{off ? "🙈" : "👁"}</button>}
              </li>
            ); })}
          </ul>
          <div className="flex gap-2 border-t border-black/10 p-3 dark:border-white/10">
            <button type="button" className="flex-1 rounded-full bg-sun px-4 py-2 font-bold text-[#0b1b2b]" onClick={() => { onSave({ order, hidden }); onClose(); }} data-testid="menu-save">{tr("Save", "حفظ")}</button>
            <button type="button" className="rounded-full border border-black/15 px-4 py-2 font-bold dark:border-white/20" onClick={() => { onSave(null); onClose(); }} data-testid="menu-reset">{tr("Reset", "إعادة ضبط")}</button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
