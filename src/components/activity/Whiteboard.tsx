"use client";

import { useRef, useState } from "react";
import { actErr, hostChip, saveOptions, useTr, type Tr } from "@/components/activity/common";
import { activityApi, type ActivityItem, type ActivityState, type Who } from "@/lib/activity";

/** t423: live whiteboard — pen / highlighter / eraser / text notes on a 1600×1000 board with ready-made layouts. */
export const WB_W = 1600, WB_H = 1000;
const COLORS = ["#1b3a57", "#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0f172a", "#f5c542"];
const WIDTHS = [3, 6, 12];
export const WB_BGS: [string, string, string][] = [
  ["blank", "Blank", "فارغة"], ["lined", "Lined", "مسطّرة"], ["grid", "Grid", "شبكة"], ["dots", "Dots", "نقاط"],
  ["venn", "Venn", "مخطط فن"], ["tchart", "T-chart", "جدول T"], ["kwl", "K · W · L", "أعرف · أريد · تعلّمت"], ["mind", "Mind map centre", "مركز خريطة ذهنية"], ["four", "4 boxes", "٤ مربعات"],
];
export type WbStroke = { id: string; pid: string; author: string; kind: string; d: ActivityItem["data"] & { text?: string } };

function Background({ bg, tr }: { bg: string; tr: Tr }) {
  const L = "#c7d4e2", T = "#1b3a57";
  const label = (x: number, y: number, t: string) => <text x={x} y={y} textAnchor="middle" fontSize={34} fontWeight={800} fill={T} opacity={0.75}>{t}</text>;
  if (bg === "lined") return <g>{Array.from({ length: 19 }, (_, i) => <line key={i} x1={0} x2={WB_W} y1={60 + i * 50} y2={60 + i * 50} stroke={L} strokeWidth={2} />)}<line x1={120} x2={120} y1={0} y2={WB_H} stroke="#fda4af" strokeWidth={3} /></g>;
  if (bg === "grid") return <g>{Array.from({ length: 33 }, (_, i) => <line key={`v${i}`} x1={i * 50} x2={i * 50} y1={0} y2={WB_H} stroke={L} />)}{Array.from({ length: 21 }, (_, i) => <line key={`h${i}`} y1={i * 50} y2={i * 50} x1={0} x2={WB_W} stroke={L} />)}</g>;
  if (bg === "dots") return <g>{Array.from({ length: 31 * 19 }, (_, k) => <circle key={k} cx={50 + (k % 31) * 50} cy={50 + Math.floor(k / 31) * 50} r={3} fill={L} />)}</g>;
  if (bg === "venn") return <g><circle cx={620} cy={520} r={380} fill="#0284c7" fillOpacity={0.08} stroke="#0284c7" strokeWidth={5} /><circle cx={980} cy={520} r={380} fill="#d97706" fillOpacity={0.08} stroke="#d97706" strokeWidth={5} />{label(450, 110, "A")}{label(1150, 110, "B")}{label(800, 90, tr("Both", "كلاهما"))}</g>;
  if (bg === "tchart") return <g><line x1={800} x2={800} y1={40} y2={960} stroke={T} strokeWidth={6} /><line x1={60} x2={1540} y1={150} y2={150} stroke={T} strokeWidth={6} />{label(430, 115, tr("For / Yes", "مع / نعم"))}{label(1170, 115, tr("Against / No", "ضد / لا"))}</g>;
  if (bg === "kwl") return <g>{[533, 1066].map((x) => <line key={x} x1={x} x2={x} y1={40} y2={960} stroke={T} strokeWidth={5} />)}<line x1={30} x2={1570} y1={150} y2={150} stroke={T} strokeWidth={5} />{label(266, 115, tr("K — I know", "أعرف"))}{label(800, 115, tr("W — I want to know", "أريد أن أعرف"))}{label(1333, 115, tr("L — I learned", "تعلّمت"))}</g>;
  if (bg === "mind") return <g><ellipse cx={800} cy={500} rx={230} ry={120} fill="#1b3a57" stroke="#f5c542" strokeWidth={8} />{[0, 60, 120, 180, 240, 300].map((a) => { const r = (a * Math.PI) / 180; return <line key={a} x1={800 + 240 * Math.cos(r)} y1={500 + 130 * Math.sin(r)} x2={800 + 560 * Math.cos(r)} y2={500 + 400 * Math.sin(r)} stroke={L} strokeWidth={5} strokeDasharray="14 12" />; })}</g>;
  if (bg === "four") return <g><line x1={800} x2={800} y1={30} y2={970} stroke={T} strokeWidth={5} /><line x1={30} x2={1570} y1={500} y2={500} stroke={T} strokeWidth={5} /></g>;
  return null;
}

const pathOf = (pts: number[]) => { let s = ""; for (let i = 0; i + 1 < pts.length; i += 2) s += `${i ? "L" : "M"}${(pts[i] * WB_W).toFixed(1)} ${(pts[i + 1] * WB_H).toFixed(1)}`; return pts.length === 2 ? s + `l0.1 0` : s; };

/** The board art (live and printable share this). `centre` = prompt text drawn in the mind-map centre. */
export function BoardArt({ strokes, bg, names, centre, tr, extra }: { strokes: WbStroke[]; bg: string; names: boolean; centre?: string; tr: Tr; extra?: React.ReactNode }) {
  const firstOf = new Set<string>(); const labelled: WbStroke[] = [];
  if (names) for (const s of strokes) if (s.kind === "stroke" && s.pid !== "host" && !s.d.er && !firstOf.has(s.pid)) { firstOf.add(s.pid); labelled.push(s); }
  return (
    <svg viewBox={`0 0 ${WB_W} ${WB_H}`} className="block h-auto w-full" data-testid="wb-art">
      <rect width={WB_W} height={WB_H} fill="#ffffff" />
      <Background bg={bg} tr={tr} />
      {bg === "mind" && centre && <foreignObject x={590} y={400} width={420} height={200}><div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#f5c542", fontWeight: 800, fontSize: 30, textAlign: "center", lineHeight: 1.15 }} dir="auto">{centre}</div></foreignObject>}
      {strokes.map((s) => s.kind === "note" ? (
        <g key={s.id}>
          <text x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H} fontSize={(s.d.w || 22) * 1.6} fontWeight={700} fill={s.d.c || "#1b3a57"} dominantBaseline="hanging">{s.d.text}</text>
          {names && s.pid !== "host" && <text x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H - 6} fontSize={16} fill="#64748b" fontWeight={600}>{s.author}</text>}
        </g>
      ) : (
        <path key={s.id} d={pathOf(s.d.pts || [])} fill="none" stroke={s.d.er ? "#ffffff" : s.d.c || "#1b3a57"} strokeOpacity={s.d.hl ? 0.35 : 1} strokeWidth={(s.d.w || 4) * (s.d.hl ? 3 : 1) * (s.d.er ? 4 : 1)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {labelled.map((s) => <text key={`n${s.id}`} x={(s.d.pts?.[0] || 0) * WB_W + 8} y={(s.d.pts?.[1] || 0) * WB_H - 10} fontSize={17} fontWeight={700} fill="#475569" stroke="#fff" strokeWidth={4} paintOrder="stroke" data-testid="wb-name">{s.author}</text>)}
      {extra}
    </svg>
  );
}

export const strokesOf = (state: ActivityState): WbStroke[] => state.items.filter((i) => i.kind === "stroke" || i.kind === "note").map((i) => ({ id: i.id, pid: i.pid, author: i.author, kind: i.kind, d: i.data }));

/** Interactive board: draws locally, sends each finished stroke. */
function Board({ code, who, state, reload, canDraw, isHost }: { code: string; who: Who; state: ActivityState; reload: () => void; canDraw: boolean; isHost: boolean }) {
  const { tr } = useTr();
  const o = state.settings.options;
  const [tool, setTool] = useState<"pen" | "hl" | "er" | "text">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [cur, setCur] = useState<number[] | null>(null);
  const [pending, setPending] = useState<WbStroke[]>([]);
  const [err, setErr] = useState("");
  const svgBox = useRef<HTMLDivElement>(null);
  const pt = (e: React.PointerEvent) => { const r = svgBox.current!.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  const send = async (p: Parameters<typeof activityApi.post>[2], local: WbStroke) => {
    setPending((x) => [...x, local]); setErr("");
    try { await activityApi.post(code, who, p); await reload(); } catch (e) { setErr(actErr(e, tr)); }
    setPending((x) => x.filter((s) => s.id !== local.id));
  };
  const down = (e: React.PointerEvent) => {
    if (!canDraw) return;
    e.preventDefault();
    const [x, y] = pt(e);
    if (tool === "text") {
      const t = window.prompt(tr("Text to add on the board:", "النص لإضافته على السبورة:"))?.trim();
      if (t) send({ kind: "note", text: t.slice(0, 200), x, y, c: color, w: width * 3 + 12 }, { id: `tmp${Date.now()}`, pid: "me", author: "", kind: "note", d: { text: t, x, y, c: color, w: width * 3 + 12 } });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setCur([x, y]);
  };
  const move = (e: React.PointerEvent) => {
    if (!cur) return;
    const [x, y] = pt(e); const lx = cur[cur.length - 2], ly = cur[cur.length - 1];
    if (Math.hypot((x - lx) * WB_W, (y - ly) * WB_H) < 4 || cur.length >= 1600) return;
    setCur([...cur, x, y]);
  };
  const up = () => {
    if (!cur) return;
    const pts = cur; setCur(null);
    const d = { pts, c: color, w: width, hl: tool === "hl", er: tool === "er" };
    send({ kind: "stroke", ...d }, { id: `tmp${Date.now()}`, pid: "me", author: "", kind: "stroke", d });
  };
  const all = [...strokesOf(state), ...pending, ...(cur ? [{ id: "cur", pid: "me", author: "", kind: "stroke", d: { pts: cur, c: color, w: width, hl: tool === "hl", er: tool === "er" } }] : [])];
  const btn = (on: boolean) => `${hostChip(on)} !px-3`;
  return (
    <div className="space-y-2" data-testid="wb">
      {canDraw && (
        <div className="glass flex flex-wrap items-center gap-1.5 rounded-2xl p-2" data-focus-keep data-testid="wb-tools">
          <button type="button" className={btn(tool === "pen")} onClick={() => setTool("pen")} data-testid="wb-pen">✏️ {tr("Pen", "قلم")}</button>
          <button type="button" className={btn(tool === "hl")} onClick={() => setTool("hl")}>🖍️ {tr("Highlighter", "محدد")}</button>
          <button type="button" className={btn(tool === "er")} onClick={() => setTool("er")}>🧽 {tr("Eraser", "ممحاة")}</button>
          <button type="button" className={btn(tool === "text")} onClick={() => setTool("text")} data-testid="wb-text">🔤 {tr("Text", "نص")}</button>
          <span className="mx-1 h-6 w-px bg-black/15" aria-hidden />
          {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-sun ring-2 ring-sun" : "border-white"}`} style={{ background: c }} aria-label={c} />)}
          <span className="mx-1 h-6 w-px bg-black/15" aria-hidden />
          {WIDTHS.map((w) => <button key={w} type="button" onClick={() => setWidth(w)} className={btn(width === w)} aria-label={tr(`Thickness ${w}`, `السماكة ${w}`)}><span className="inline-block rounded-full bg-current" style={{ width: w + 4, height: w + 4 }} /></button>)}
          <span className="mx-1 h-6 w-px bg-black/15" aria-hidden />
          <button type="button" className={btn(false)} onClick={() => activityApi.post(code, who, { kind: "undo" }).then(reload).catch((e) => setErr(actErr(e, tr)))} data-testid="wb-undo">↶ {tr("Undo", "تراجع")}</button>
          {isHost && "hostKey" in who && <button type="button" className={btn(false)} onClick={async () => { if (!confirm(tr("Clear the whole board?", "مسح السبورة كلها؟"))) return; await activityApi.moderate(code, who.hostKey, "clear", { kind: "stroke" }).catch(() => undefined); await activityApi.moderate(code, who.hostKey, "clear", { kind: "note" }).catch(() => undefined); reload(); }} data-testid="wb-clear">🗑️ {tr("Clear", "مسح")}</button>}
        </div>
      )}
      <div ref={svgBox} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={`overflow-hidden rounded-[24px] shadow-xl ring-4 ring-[#1b3a57]/80 ${canDraw ? "cursor-crosshair touch-none" : ""}`} data-testid="wb-board">
        <BoardArt strokes={all} bg={String(o.bg || "blank")} names={o.labels !== false && !state.settings.hideNames} centre={state.prompt || state.title} tr={tr} />
      </div>
      {!canDraw && <p className="text-center text-sm font-semibold opacity-80" data-testid="wb-viewonly">👀 {tr("Watching the board — your teacher will let you draw when it's your turn.", "تشاهد السبورة — سيسمح لك المعلم بالرسم عندما يحين دورك.")}</p>}
      {err && <p className="text-sm font-semibold text-rose-700" role="alert">{err}</p>}
    </div>
  );
}

export function WhiteboardStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  return <Board code={code} who={who} state={state} reload={reload} canDraw={!closed && state.settings.options.draw === true} isHost={false} />;
}

export function WhiteboardHost({ code, hostKey, state, reload }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const o = state.settings.options;
  return (
    <div className="space-y-3">
      <Board code={code} who={{ hostKey }} state={state} reload={reload} canDraw isHost />
      <div className="flex flex-wrap items-center gap-2" data-focus-keep>
        <button type="button" className={hostChip(o.draw === true)} onClick={() => saveOptions(code, hostKey, state, { draw: o.draw !== true }).then(reload)} data-testid="wb-draw">🖐️ {o.draw === true ? tr("Students can draw", "يمكن للطلاب الرسم") : tr("Students watch only", "الطلاب يشاهدون فقط")}</button>
        <button type="button" className={hostChip(o.labels !== false)} onClick={() => saveOptions(code, hostKey, state, { labels: o.labels === false }).then(reload)}>🏷️ {tr("Names on the board", "الأسماء على السبورة")}</button>
        <label className="inline-flex items-center gap-1 text-sm font-bold">🧩 {tr("Layout", "القالب")}
          <select className="rounded-full border border-black/10 bg-white px-2 py-1 text-sm text-[#1b2f44]" value={String(o.bg || "blank")} onChange={(e) => saveOptions(code, hostKey, state, { bg: e.target.value }).then(reload)} data-testid="wb-bg">
            {WB_BGS.map(([k, en, ar]) => <option key={k} value={k}>{tr(en, ar)}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs opacity-70">{tr("Tip: works with a finger or Apple Pencil. Save & print keeps the board exactly as drawn.", "نصيحة: يعمل بالإصبع أو قلم آبل. الحفظ والطباعة يحفظان السبورة كما رُسمت تمامًا.")}</p>
    </div>
  );
}

export function WhiteboardOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{tr("Board layout", "قالب السبورة")}</p>
      <div className="flex flex-wrap gap-1.5">
        {WB_BGS.map(([k, en, ar]) => <button key={k} type="button" className={hostChip(String(options.bg || "blank") === k)} onClick={() => setOptions({ ...options, bg: k })} data-testid={`wb-opt-${k}`}>{tr(en, ar)}</button>)}
      </div>
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={options.draw !== false} onChange={(e) => setOptions({ ...options, draw: e.target.checked })} />{tr("Students can draw and write too", "يمكن للطلاب الرسم والكتابة أيضًا")}</label>
    </div>
  );
}
