"use client";

import { useState } from "react";
import { fieldCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { actErr, hostChip, saveOptions, useTr } from "@/components/activity/common";
import { activityApi, type ActivityState, type Who } from "@/lib/activity";

/** t409: Compare & contrast — Venn or two columns; cards go to only A, only B or both. */
export type Zone = "a" | "b" | "both";
export type CmpCard = { text: string; zone: Zone; why?: string };
export const cmpCards = (s: ActivityState): CmpCard[] => (Array.isArray(s.settings.options.cards) ? (s.settings.options.cards as CmpCard[]) : []);
const ZONES: Zone[] = ["a", "both", "b"];

export function zoneLabel(s: ActivityState, z: Zone, tr: (e: string, a: string) => string) {
  const o = s.settings.options;
  return z === "a" ? `${tr("Only", "فقط")} ${String(o.a || "A")}` : z === "b" ? `${tr("Only", "فقط")} ${String(o.b || "B")}` : tr("Both", "كلاهما");
}

/** Where each teacher card sits: the student's own placement, or the class majority (vote / host board). */
export function placements(s: ActivityState, mineOnly: boolean) {
  const out = new Map<number, { zone: Zone; votes: Record<Zone, number>; by: string[] }>();
  for (const i of s.items) {
    if (i.kind !== "place" || (mineOnly && !i.mine)) continue;
    const c = Number(i.data.card), z = i.data.zone as Zone;
    const e = out.get(c) || { zone: z, votes: { a: 0, b: 0, both: 0 }, by: [] };
    e.votes[z]++; e.by.push(i.author);
    e.zone = (Object.entries(e.votes).sort((x, y) => y[1] - x[1])[0][0]) as Zone;
    out.set(c, e);
  }
  return out;
}

export function teamOf(s: ActivityState, pid: string) {
  const k = s.participants.findIndex((p) => p.id === pid);
  return k < 0 ? 0 : k % Math.max(2, Number(s.settings.options.teams) || 2);
}

function Board({ state, big, mineOnly, onDrop, onPickZone }: { state: ActivityState; big?: boolean; mineOnly: boolean; onDrop?: (card: number | string, z: Zone) => void; onPickZone?: (z: Zone) => void }) {
  const { tr } = useTr();
  const o = state.settings.options;
  const cards = cmpCards(state);
  const place = placements(state, mineOnly);
  const check = o.check === true;
  const venn = o.layout !== "columns";
  const own = state.items.filter((i) => i.kind === "post" && i.data.zone);
  const inZone = (z: Zone) => [
    ...cards.map((c, k) => ({ c, k, p: place.get(k) })).filter((x) => x.p?.zone === z).map(({ c, k, p }) => {
      const ok = c.zone === z;
      return (
        <div key={`c${k}`} className={`rounded-xl px-2.5 py-1.5 text-sm font-bold shadow ${check ? (ok ? "bg-emerald-500 text-white" : "animate-[shake_.5s_ease-in-out_2] bg-rose-500 text-white") : "bg-white text-[#1b2f44]"}`} data-testid={check ? (ok ? "cmp-ok" : "cmp-wrong") : "cmp-card"} dir="auto">
          {c.text}
          {!mineOnly && p && p.by.length > 1 && <span className="ms-1 text-[10px] opacity-75">×{p.by.length}</span>}
          {check && !ok && c.why && <p className="mt-0.5 text-[11px] font-semibold opacity-95">💡 {c.why}</p>}
        </div>
      );
    }),
    ...own.filter((i) => i.data.zone === z).map((i) => (
      <div key={i.id} className="rounded-xl border-2 border-dashed border-[#f5c542] bg-white/95 px-2.5 py-1.5 text-sm font-bold text-[#1b2f44]" dir="auto">
        {i.data.text}{!state.settings.hideNames && <span className="ms-1 text-[10px] font-semibold opacity-60">{i.author}</span>}
      </div>
    )),
  ];
  const zoneBox = (z: Zone, cls: string) => (
    <div
      key={z}
      className={`flex flex-col items-center gap-1.5 p-3 ${cls}`}
      onDragOver={(e) => onDrop && e.preventDefault()}
      onDrop={(e) => { const d = e.dataTransfer.getData("text/plain"); if (onDrop && d !== "") onDrop(/^\d+$/.test(d) ? Number(d) : d, z); }}
      onClick={() => onPickZone?.(z)}
      data-testid={`cmp-zone-${z}`}
    >
      <p className={`font-extrabold ${big ? "text-lg" : "text-sm"} ${z === "both" && !venn ? "text-[#1b3a57]" : "text-white"}`} {...(venn ? { "data-venn-label": z } : {})} style={venn ? { color: "#ffffff", textShadow: "0 1px 3px rgba(0,0,0,.55)" } : undefined} data-testid={`cmp-label-${z}`}>{zoneLabel(state, z, tr)}</p>
      <div className="flex flex-wrap justify-center gap-1.5">{inZone(z)}</div>
    </div>
  );
  if (!venn) return <div className="grid grid-cols-3 gap-2 rounded-[28px] bg-white p-2 shadow-inner" data-testid="cmp-board">{zoneBox("a", "rounded-3xl bg-sky-600/90 min-h-60")}{zoneBox("both", "rounded-3xl bg-[#f5c542] min-h-60")}{zoneBox("b", "rounded-3xl bg-rose-600/90 min-h-60")}</div>;
  return (
    <div className={`relative w-full overflow-hidden rounded-[28px] bg-white shadow-inner ${big ? "h-[560px]" : "h-[420px]"}`} data-testid="cmp-board">
      <div className="absolute left-[4%] top-[6%] h-[88%] w-[56%] rounded-full bg-sky-500/70 mix-blend-multiply" aria-hidden />
      <div className="absolute right-[4%] top-[6%] h-[88%] w-[56%] rounded-full bg-rose-500/70 mix-blend-multiply" aria-hidden />
      <div className="absolute inset-y-[10%] left-[6%] w-[30%]">{zoneBox("a", "h-full justify-center")}</div>
      <div className="absolute inset-y-[10%] left-[37%] w-[26%]">{zoneBox("both", "h-full justify-center")}</div>
      <div className="absolute inset-y-[10%] right-[6%] w-[30%]">{zoneBox("b", "h-full justify-center")}</div>
    </div>
  );
}

export function CompareStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const cards = cmpCards(state);
  const mine = placements(state, true);
  const [pick, setPick] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const o = state.settings.options;
  const place = async (card: number | string, zone: Zone) => {
    setErr("");
    try {
      if (typeof card === "number") await activityApi.respond(code, who, { card, zone });
      else await activityApi.post(code, who, { text: card, zone });
      setPick(null); setText(""); reload();
    } catch (e) { setErr(actErr(e, tr)); }
  };
  const meId = state.me.id;
  return (
    <div className="space-y-4">
      {o.play === "team" && <p className="glass rounded-2xl px-4 py-2 font-bold">🏁 {tr("Your team", "فريقك")}: {["🔵", "🔴", "🟢", "🟡"][teamOf(state, meId)]} {tr(`Team ${teamOf(state, meId) + 1}`, `الفريق ${teamOf(state, meId) + 1}`)}</p>}
      <Board state={state} mineOnly={o.play !== "vote"} onDrop={closed ? undefined : place} onPickZone={closed || pick === null ? undefined : (z) => place(pick, z)} />
      {!closed && (
        <div className="glass space-y-3 rounded-3xl p-4">
          <p className="text-sm opacity-80">{tr("Drag a card into the diagram — or tap a card, then tap where it goes.", "اسحب بطاقة إلى المخطط — أو اضغط البطاقة ثم المكان المناسب.")}</p>
          <div className="flex flex-wrap gap-2">
            {cards.map((c, k) => (
              <button key={k} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(k))} onClick={() => setPick(pick === k ? null : k)} className={`rounded-xl px-3 py-2 text-sm font-bold shadow ${pick === k ? "bg-[#f5c542] text-[#1b3a57]" : mine.has(k) ? "bg-emerald-100 text-emerald-900" : "bg-white text-[#1b2f44]"}`} dir="auto" data-testid="cmp-pick">
                {mine.has(k) ? "✓ " : ""}{c.text}
              </button>
            ))}
          </div>
          {pick !== null && <div className="flex flex-wrap gap-2">{ZONES.map((z) => <button key={z} type="button" className={hostChip(false)} onClick={() => place(pick, z)} data-testid={`cmp-put-${z}`}>{zoneLabel(state, z, tr)}</button>)}</div>}
          {o.own !== false && (
            <div className="flex flex-wrap gap-2">
              <input className={`${fieldCls} min-w-40 flex-1`} value={text} maxLength={80} onChange={(e) => setText(e.target.value)} dir="auto" placeholder={tr("Or type your own idea…", "أو اكتب فكرتك…")} data-testid="cmp-own" />
              {ZONES.map((z) => <button key={z} type="button" disabled={!text.trim()} className={primaryBtn} onClick={() => place(text.trim(), z)}>{zoneLabel(state, z, tr)}</button>)}
            </div>
          )}
          {err && <p className="text-sm text-rose-700">{err}</p>}
        </div>
      )}
    </div>
  );
}

export function CompareHost({ code, hostKey, state, reload, big }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const o = state.settings.options;
  const cards = cmpCards(state);
  const set = (p: Record<string, unknown>) => saveOptions(code, hostKey, state, p).then(reload);
  const nTeams = Math.max(2, Number(o.teams) || 2);
  const score = Array.from({ length: nTeams }, () => 0);
  for (const i of state.items) if (i.kind === "place" && cards[Number(i.data.card)]?.zone === i.data.zone) score[teamOf(state, i.pid)]++;
  return (
    <div className="space-y-3">
      <Board state={state} big={big} mineOnly={false} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={hostChip(o.check === true)} onClick={() => set({ check: o.check !== true })} data-testid="cmp-check">✅ {tr("Check answers", "تحقّق من الإجابات")}</button>
        <button type="button" className={hostChip(o.layout === "columns")} onClick={() => set({ layout: o.layout === "columns" ? "venn" : "columns" })}>{o.layout === "columns" ? "▥ " + tr("Two columns", "عمودان") : "◎ " + tr("Venn", "مخطط فن")}</button>
        {(["individual", "team", "vote"] as const).map((m) => <button key={m} type="button" className={hostChip((o.play || "individual") === m)} onClick={() => set({ play: m })}>{m === "individual" ? "👤 " + tr("Individual", "فردي") : m === "team" ? "🏁 " + tr("Team race", "سباق الفرق") : "🗳️ " + tr("Class vote", "تصويت الصف")}</button>)}
      </div>
      {o.play === "team" && <div className="flex flex-wrap gap-2" data-testid="cmp-teams">{score.map((s, k) => <span key={k} className="rounded-full bg-[#1b3a57] px-4 py-1.5 font-extrabold text-[#f5c542]">{["🔵", "🔴", "🟢", "🟡"][k]} {tr(`Team ${k + 1}`, `الفريق ${k + 1}`)}: {s}</span>)}</div>}
    </div>
  );
}

export function CompareOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  const cards = Array.isArray(options.cards) ? (options.cards as CmpCard[]) : [{ text: "", zone: "a" as Zone }];
  const setCard = (k: number, p: Partial<CmpCard>) => setOptions({ ...options, cards: cards.map((c, j) => (j === k ? { ...c, ...p } : c)) });
  const inp = "min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-2">
        <input className={inp} placeholder={tr("A (e.g. Fajr)", "أ (مثل: الفجر)")} value={String(options.a || "")} onChange={(e) => setOptions({ ...options, a: e.target.value })} dir="auto" data-testid="cmp-a" />
        <input className={inp} placeholder={tr("B (e.g. Maghrib)", "ب (مثل: المغرب)")} value={String(options.b || "")} onChange={(e) => setOptions({ ...options, b: e.target.value })} dir="auto" data-testid="cmp-b" />
      </div>
      <div className="flex flex-wrap gap-3">
        {(["venn", "columns"] as const).map((l) => <label key={l} className="inline-flex items-center gap-1.5"><input type="radio" checked={(options.layout || "venn") === l} onChange={() => setOptions({ ...options, layout: l })} />{l === "venn" ? tr("Venn", "مخطط فن") : tr("Two columns", "عمودان")}</label>)}
        {(["individual", "team", "vote"] as const).map((m) => <label key={m} className="inline-flex items-center gap-1.5"><input type="radio" checked={(options.play || "individual") === m} onChange={() => setOptions({ ...options, play: m })} />{m === "individual" ? tr("Individual", "فردي") : m === "team" ? tr("Team race", "سباق الفرق") : tr("Class vote", "تصويت الصف")}</label>)}
      </div>
      <p className="font-bold">{tr("Cards and their correct place (optional reason shown when wrong):", "البطاقات ومكانها الصحيح (وسبب اختياري يظهر عند الخطأ):")}</p>
      {cards.map((c, k) => (
        <div key={k} className="flex flex-wrap gap-1.5">
          <input className={inp} value={c.text} placeholder={tr("Card text", "نص البطاقة")} onChange={(e) => setCard(k, { text: e.target.value })} dir="auto" data-testid="cmp-card-text" />
          <select className="rounded-xl border border-black/10 bg-white px-2" value={c.zone} onChange={(e) => setCard(k, { zone: e.target.value as Zone })}><option value="a">{tr("Only A", "أ فقط")}</option><option value="both">{tr("Both", "كلاهما")}</option><option value="b">{tr("Only B", "ب فقط")}</option></select>
          <input className={inp} value={c.why || ""} placeholder={tr("Why (optional)", "السبب (اختياري)")} onChange={(e) => setCard(k, { why: e.target.value })} dir="auto" />
          <button type="button" className="px-2" onClick={() => setOptions({ ...options, cards: cards.filter((_, j) => j !== k) })} aria-label={tr("Remove card", "حذف البطاقة")}>✕</button>
        </div>
      ))}
      {cards.length < 24 && <button type="button" className={hostChip(false)} onClick={() => setOptions({ ...options, cards: [...cards, { text: "", zone: "a" }] })}>＋ {tr("Add card", "إضافة بطاقة")}</button>}
    </div>
  );
}
