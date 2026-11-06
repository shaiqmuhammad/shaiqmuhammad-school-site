"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fieldCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { ChoiceList, actErr, hostChip, saveOptions, useTr } from "@/components/activity/common";
import { activityApi, type ActivityItem, type ActivityState, type Who } from "@/lib/activity";

/** t409: live mind map — a central topic, branches (no parent) and leaves (parent = branch). */
const PAL = ["#0284c7", "#d97706", "#059669", "#e11d48", "#7c3aed", "#0d9488", "#c026d3", "#ea580c", "#4f46e5", "#65a30d"];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
export const colorOf = (i: ActivityItem, byGroup: boolean) => (i.pid === "host" ? "#1b3a57" : PAL[hash(byGroup && i.data.group ? i.data.group : i.pid) % PAL.length]);
const HINTS: [string, string][] = [["Who?", "مَن؟"], ["When?", "متى؟"], ["How?", "كيف؟"], ["Why?", "لماذا؟"]];

export function mapNodes(state: ActivityState) {
  const ideas = state.items.filter((i) => i.kind === "post" && i.data.text !== undefined);
  const ids = new Map(ideas.map((i) => [i.id, i]));
  // t423: every idea must land on the board. A leaf whose parent was deleted becomes a branch;
  // a leaf hanging off another leaf is attached to that leaf's branch (the map is two levels deep).
  const rootOf = (i: ActivityItem): string => {
    let cur = i; const seen = new Set<string>();
    while (cur.data.parent && ids.has(String(cur.data.parent)) && !seen.has(cur.id)) { seen.add(cur.id); cur = ids.get(String(cur.data.parent))!; }
    return cur.id;
  };
  const root = new Map(ideas.map((i) => [i.id, rootOf(i)]));
  const branches = ideas.filter((i) => root.get(i.id) === i.id);
  const leaves = (b: string) => ideas.filter((i) => i.id !== b && root.get(i.id) === b);
  return { ideas, branches, leaves };
}

type Pos = { x: number; y: number };
/** Auto radial layout (0..1), overridden by any teacher-dragged x/y; then overlaps are pushed apart so no idea hides another. */
function layoutMap(state: ActivityState, W: number, H: number) {
  const { branches, leaves } = mapNodes(state);
  const pos = new Map<string, Pos>();
  const fixed = new Set<string>();
  const size = new Map<string, { w: number; h: number }>();
  const est = (i: ActivityItem, br: boolean) => ({ w: Math.min(W * 0.42, String(i.data.text || "").length * (br ? 9 : 7.5) + 70), h: br ? 40 : 32 });
  const n = Math.max(branches.length, 1);
  const twoRings = branches.length > 8;
  branches.forEach((b, k) => {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    const r = twoRings && k % 2 ? 0.36 : 0.25;
    const bp = b.data.x !== undefined ? { x: b.data.x, y: b.data.y ?? 0.5 } : { x: 0.5 + r * Math.cos(a), y: 0.5 + (r + 0.03) * Math.sin(a) };
    if (b.data.x !== undefined) fixed.add(b.id);
    pos.set(b.id, bp); size.set(b.id, est(b, true));
    const ls = leaves(b.id);
    ls.forEach((l, j) => {
      const ring = Math.floor(j / 5), idx = j % 5, inRing = Math.min(5, ls.length - ring * 5);
      const la = a + (idx - (inRing - 1) / 2) * 0.5;
      const d = 0.15 + ring * 0.1;
      if (l.data.x !== undefined) fixed.add(l.id);
      pos.set(l.id, l.data.x !== undefined ? { x: l.data.x, y: l.data.y ?? 0.5 } : { x: bp.x + d * Math.cos(la), y: bp.y + (d + 0.03) * Math.sin(la) });
      size.set(l.id, est(l, false));
    });
  });
  // Relax: push overlapping boxes apart (in pixels), keep inside the board and away from the centre topic.
  const keys = [...pos.keys()];
  const centre = { w: Math.min(W * 0.4, 260), h: 70 };
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let i = 0; i < keys.length; i++) {
      const A = pos.get(keys[i])!, sa = size.get(keys[i])!;
      for (let j = -1; j < keys.length; j++) {
        if (j === i) continue;
        const B = j < 0 ? { x: 0.5, y: 0.5 } : pos.get(keys[j])!, sb = j < 0 ? centre : size.get(keys[j])!;
        const dx = (A.x - B.x) * W, dy = (A.y - B.y) * H;
        const ox = (sa.w + sb.w) / 2 + 6 - Math.abs(dx), oy = (sa.h + sb.h) / 2 + 6 - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          const aFix = fixed.has(keys[i]), bFix = j < 0 || fixed.has(keys[j]);
          if (aFix && bFix && j >= 0) continue;
          const share = aFix || bFix ? 1 : 0.5;
          if (ox / W < oy / H) { const s = (dx >= 0 ? 1 : -1) * (ox / W) * share; if (!aFix) A.x += s; if (!bFix) B.x -= s; }
          else { const s = (dy >= 0 ? 1 : -1) * (oy / H) * share; if (!aFix) A.y += s; if (!bFix) B.y -= s; }
        }
      }
      const mx = sa.w / 2 / W + 0.005, my = sa.h / 2 / H + 0.005;
      A.x = Math.min(1 - mx, Math.max(mx, A.x)); A.y = Math.min(1 - my, Math.max(my, A.y));
    }
    if (!moved) break;
  }
  return { pos, branches, leaves };
}

export function MapBoard({ state, big = false, host, onPick, picked, recallMine }: { state: ActivityState; big?: boolean; host?: { code: string; hostKey: string; reload: () => void }; onPick?: (i: ActivityItem) => void; picked?: string; recallMine?: Record<string, string> }) {
  const { tr } = useTr();
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 900)); ro.observe(el); return () => ro.disconnect();
  }, []);
  const count = mapNodes(state).ideas.length;
  // t423: the board grows with the class so every idea has room.
  const H = Math.min(2400, (big ? 620 : 460) + Math.max(0, count - (W < 600 ? 6 : 12)) * (W < 600 ? 60 : 34));
  const { pos, branches, leaves } = useMemo(() => layoutMap(state, W, H), [state, W, H]);
  const byGroup = state.settings.options.colorBy === "group";
  const at = (id: string) => (drag?.id === id ? drag : pos.get(id) || { x: 0.5, y: 0.5 });
  const move = (e: React.PointerEvent) => {
    if (!drag || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setDrag({ id: drag.id, x: Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width)), y: Math.min(0.97, Math.max(0.03, (e.clientY - r.top) / r.height)) });
  };
  const drop = async () => {
    if (!drag || !host) return setDrag(null);
    const d = drag;
    setDrag(null);
    await activityApi.moderate(host.code, host.hostKey, "move", { id: d.id, x: d.x, y: d.y }).catch(() => undefined);
    host.reload();
  };
  const node = (i: ActivityItem, isBranch: boolean) => {
    const p = at(i.id);
    const c = colorOf(i, byGroup);
    const hiddenText = i.data.hidden ? recallMine?.[i.id] || "❓" : i.data.text;
    return (
      <button
        key={i.id}
        type="button"
        onPointerDown={host ? (e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag({ id: i.id, ...at(i.id) }); } : undefined}
        onClick={() => onPick?.(i)}
        className={`absolute max-w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-3 py-1.5 text-start font-extrabold shadow-lg transition ${isBranch ? (big ? "text-xl" : "text-base") : big ? "text-base" : "text-sm"} ${picked === i.id ? "ring-4 ring-[#f5c542]" : ""} ${i.status === "pending" ? "border-dashed opacity-70" : ""} ${host ? "cursor-grab touch-none" : ""}`}
        style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: isBranch ? c : "white", color: isBranch ? "white" : c, border: `2px solid ${c}` }}
        data-testid={isBranch ? "mm-branch" : "mm-leaf"}
        dir="auto"
      >
        {i.highlight && <span aria-label={tr("Starred", "مميّز")}>⭐ </span>}
        {hiddenText}
        {!i.data.hidden && !state.settings.hideNames && i.pid !== "host" && <span className="ms-1 align-middle text-[10px] font-semibold opacity-70">{i.author}</span>}
        {i.likes > 0 && <span className="ms-1 text-[11px]">♥{i.likes}</span>}
      </button>
    );
  };
  return (
    <div ref={box} onPointerMove={move} onPointerUp={drop} className="relative w-full overflow-hidden rounded-[28px] bg-white shadow-inner ring-1 ring-black/5" style={{ height: H }} data-testid="mindmap-board">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {branches.map((b) => {
          const bp = at(b.id);
          return (
            <g key={b.id}>
              <line x1={50} y1={50} x2={bp.x * 100} y2={bp.y * 100} stroke={colorOf(b, byGroup)} strokeWidth={0.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 5 }} />
              {leaves(b.id).map((l) => { const lp = at(l.id); return <line key={l.id} x1={bp.x * 100} y1={bp.y * 100} x2={lp.x * 100} y2={lp.y * 100} stroke={colorOf(b, byGroup)} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.5 }} />; })}
            </g>
          );
        })}
      </svg>
      <div className={`absolute left-1/2 top-1/2 max-w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1b3a57] px-5 py-3 text-center font-extrabold text-[#f5c542] shadow-xl ring-4 ring-[#f5c542] ${big ? "text-2xl" : "text-lg"}`} dir="auto" data-testid="mm-center">
        {state.prompt || state.title}
      </div>
      {branches.map((b) => node(b, true))}
      {branches.flatMap((b) => leaves(b.id).map((l) => node(l, false)))}
      {!branches.length && <p className="absolute inset-x-0 bottom-4 text-center text-sm text-[#1b2f44]/60">{tr("Branches will grow here…", "ستنمو الفروع هنا…")}</p>}
    </div>
  );
}

export function MindMapStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const { branches } = mapNodes(state);
  const [parent, setParent] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const o = state.settings.options;
  const recall = o.recall === true;
  const mineRecall = Object.fromEntries(state.items.filter((i) => i.kind === "recall" && i.mine).map((i) => [String(i.data.leaf), String(i.data.text || "")]));
  const [leaf, setLeaf] = useState<ActivityItem | null>(null);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true); setErr("");
    try {
      if (leaf) await activityApi.respond(code, who, { leaf: leaf.id, text: t });
      else await activityApi.post(code, who, { text: t, parent, group: String(o.group || "") });
      setText(""); setLeaf(null); reload();
    } catch (e) { setErr(actErr(e, tr)); }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <MapBoard state={state} picked={leaf?.id || parent} recallMine={mineRecall} onPick={(i) => { if (recall && i.data.hidden) { setLeaf(i); setText(mineRecall[i.id] || ""); } else if (!i.data.parent) { setParent(i.id === parent ? "" : i.id); setLeaf(null); } }} />
      {state.items.filter((i) => i.kind === "post").length > 0 && state.settings.likes && (
        <div className="flex flex-wrap gap-2" aria-label={tr("Like ideas", "أعجبني")}>
          {state.items.filter((i) => i.kind === "post" && !i.data.hidden && !i.mine && i.pid !== "host").slice(0, 30).map((i) => (
            <button key={i.id} type="button" className={hostChip(i.liked)} onClick={() => activityApi.like(code, who, i.id).then(reload).catch(() => undefined)} dir="auto">♥ {i.data.text}</button>
          ))}
        </div>
      )}
      {!closed && (
        <div className="glass rounded-3xl p-4">
          {recall && <p className="mb-2 text-sm font-bold">🧩 {tr("Complete the map: tap a ❓ and type the missing idea.", "أكمل الخريطة: اضغط على ❓ واكتب الفكرة الناقصة.")}</p>}
          <p className="mb-2 text-sm opacity-80">
            {leaf ? tr("Your answer for the hidden idea:", "إجابتك للفكرة المخفية:") : parent ? `${tr("Adding an idea to", "إضافة فكرة إلى")} “${branches.find((b) => b.id === parent)?.data.text || ""}”` : tr("Add a new branch — or tap a branch first to add an idea to it.", "أضف فرعًا جديدًا — أو اضغط فرعًا أولًا لإضافة فكرة إليه.")}
          </p>
          {o.hints === true && !leaf && <div className="mb-2 flex flex-wrap gap-1.5">{HINTS.map(([en, ar]) => <button key={en} type="button" className={hostChip(false)} onClick={() => setText((t) => (t ? t : tr(en, ar) + " "))}>{tr(en, ar)}</button>)}</div>}
          <div className="flex gap-2">
            <input className={`${fieldCls} flex-1`} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} dir="auto" placeholder={tr("Type an idea…", "اكتب فكرة…")} data-testid="mm-input" />
            <button type="button" className={primaryBtn} disabled={busy || !text.trim()} onClick={send} data-testid="mm-send">{tr("Add", "أضف")}</button>
          </div>
          {err && <p className="mt-2 text-sm text-rose-700">{err}</p>}
        </div>
      )}
    </div>
  );
}

export function MindMapHost({ code, hostKey, state, reload, big }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const [sel, setSel] = useState<ActivityItem | null>(null);
  const [group, setGroup] = useState("");
  const { ideas } = mapNodes(state);
  const o = state.settings.options;
  const hidden = Array.isArray(o.hidden) ? (o.hidden as string[]) : [];
  const mod = async (action: string, extra: Record<string, unknown> = {}) => { if (!sel) return; await activityApi.moderate(code, hostKey, action, { id: sel.id, ...extra }).catch(() => undefined); setSel(null); reload(); };
  const recallFor = (id: string) => state.items.filter((i) => i.kind === "recall" && i.data.leaf === id);
  return (
    <div className="space-y-3">
      <MapBoard state={state} big={big} host={{ code, hostKey, reload }} picked={sel?.id} onPick={(i) => setSel(sel?.id === i.id ? null : i)} />
      <div className="flex flex-wrap items-center gap-2" data-focus-keep>
        <button type="button" className={hostChip(o.recall === true)} onClick={() => saveOptions(code, hostKey, state, { recall: o.recall !== true }).then(reload)} data-testid="mm-recall">🧩 {tr("Complete-the-map mode", "وضع إكمال الخريطة")}</button>
        <button type="button" className={hostChip(o.hints === true)} onClick={() => saveOptions(code, hostKey, state, { hints: o.hints !== true }).then(reload)}>💡 {tr("Who / When / How / Why hints", "تلميحات: مَن / متى / كيف / لماذا")}</button>
        <button type="button" className={hostChip(o.colorBy === "group")} onClick={() => saveOptions(code, hostKey, state, { colorBy: o.colorBy === "group" ? "student" : "group" }).then(reload)}>🎨 {o.colorBy === "group" ? tr("Colour by group", "لون حسب المجموعة") : tr("Colour by student", "لون حسب الطالب")}</button>
      </div>
      {sel && (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3" data-testid="mm-tools">
          <span className="font-bold" dir="auto">“{sel.data.text}”</span>
          <button type="button" className={hostChip(sel.highlight)} onClick={() => mod("highlight")}>⭐ {tr("Star", "تمييز")}</button>
          {sel.data.parent && <button type="button" className={hostChip(hidden.includes(sel.id))} onClick={() => saveOptions(code, hostKey, state, { hidden: hidden.includes(sel.id) ? hidden.filter((h) => h !== sel.id) : [...hidden, sel.id] }).then(() => { setSel(null); reload(); })}>🙈 {hidden.includes(sel.id) ? tr("Show to students", "إظهار للطلاب") : tr("Hide for recall", "إخفاء للتذكّر")}</button>}
          <select className="rounded-full border border-black/10 bg-white px-2 py-1 text-sm text-[#1b2f44]" value="" onChange={(e) => e.target.value && mod("merge", { into: e.target.value })} aria-label={tr("Merge duplicate into…", "دمج المكرر في…")}>
            <option value="">🔗 {tr("Merge duplicate into…", "دمج المكرر في…")}</option>
            {ideas.filter((i) => i.id !== sel.id).map((i) => <option key={i.id} value={i.id}>{i.data.text}</option>)}
          </select>
          <input className="w-32 rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-[#1b2f44]" placeholder={tr("Group name", "اسم المجموعة")} value={group} onChange={(e) => setGroup(e.target.value)} />
          <button type="button" className={hostChip(false)} onClick={() => mod("regroup", { group })}>🗂️ {tr("Group", "تجميع")}</button>
          <button type="button" className={hostChip(false)} onClick={() => mod("delete")}>🗑️ {tr("Delete", "حذف")}</button>
          {hidden.includes(sel.id) && <span className="text-sm opacity-80">{recallFor(sel.id).length} {tr("answers", "إجابات")}: {recallFor(sel.id).map((r) => `${r.data.text} (${r.author})`).join(" · ")}</span>}
        </div>
      )}
      <p className="text-xs opacity-70">{tr("Tip: drag ideas to arrange them; tap one to star, group, merge or hide it.", "نصيحة: اسحب الأفكار لترتيبها؛ اضغط على فكرة لتمييزها أو تجميعها أو دمجها أو إخفائها.")}</p>
    </div>
  );
}

export function MindMapOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  const starters = Array.isArray(options.starters) ? (options.starters as string[]) : [""];
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{tr("The question / prompt is the central topic. Optional starter branches:", "السؤال هو الموضوع الرئيسي. فروع بداية اختيارية:")}</p>
      <ChoiceList choices={starters} setChoices={(c) => setOptions({ ...options, starters: c })} tr={tr} min={0} max={8} testid="mm-starter" />
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={options.hints === true} onChange={(e) => setOptions({ ...options, hints: e.target.checked })} />{tr("Show Who / When / How / Why hints", "إظهار تلميحات مَن / متى / كيف / لماذا")}</label>
    </div>
  );
}
