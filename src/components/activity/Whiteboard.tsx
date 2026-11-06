"use client";

import { useRef, useState } from "react";
import { qrSvg } from "@/lib/qrLocal";
import { actErr, hostChip, saveOptions, useTr, type Tr } from "@/components/activity/common";
import { activityApi, compressImage, type ActivityItem, type ActivityState, type Who } from "@/lib/activity";

/** t423: live whiteboard — pen / highlighter / eraser / text notes on a 1600×1000 board with ready-made layouts. */
export const WB_W = 1600, WB_H = 1000;
const COLORS = ["#1b3a57", "#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0f172a", "#f5c542", "#db2777", "#0891b2", "#65a30d", "#ffffff"];
const WB_FONTS = ["Nunito", "Amiri", "Tajawal", "Georgia", "Comic Sans MS", "Courier New", "Arial"];
type Tool = "pen" | "pencil" | "brush" | "hl" | "er" | "text" | "line" | "arrow" | "rect" | "ellipse" | "tri";
const WIDTHS = [3, 6, 12, 20];
export const WB_BGS: [string, string, string][] = [
  ["blank", "Blank", "فارغة"], ["lined", "Lined", "مسطّرة"], ["grid", "Grid", "شبكة"], ["dots", "Dots", "نقاط"],
  ["venn", "Venn", "مخطط فن"], ["tchart", "T-chart", "جدول T"], ["kwl", "K · W · L", "أعرف · أريد · تعلّمت"], ["mind", "Mind map centre", "مركز خريطة ذهنية"], ["four", "4 boxes", "٤ مربعات"],
  ["music", "Handwriting lines", "أسطر الخط"], ["iso", "Isometric dots", "نقاط متساوية"], ["cornell", "Cornell notes", "ملاحظات كورنيل"], ["timeline", "Timeline", "خط زمني"], ["flow", "Flow chart", "مخطط انسيابي"], ["venn3", "Venn (3)", "مخطط فن (٣)"],
];
export type WbStroke = { id: string; pid: string; author: string; kind: string; d: ActivityItem["data"] & { text?: string; h?: number; src?: string } };

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
  if (bg === "music") return <g>{Array.from({ length: 9 }, (_, i) => { const y = 90 + i * 105; return <g key={i}><line x1={40} x2={1560} y1={y} y2={y} stroke={L} strokeWidth={2} /><line x1={40} x2={1560} y1={y + 35} y2={y + 35} stroke="#93c5fd" strokeWidth={2} strokeDasharray="10 8" /><line x1={40} x2={1560} y1={y + 70} y2={y + 70} stroke="#1b3a57" strokeOpacity={0.5} strokeWidth={2.5} /></g>; })}</g>;
  if (bg === "iso") return <g>{Array.from({ length: 34 * 23 }, (_, k) => { const r = Math.floor(k / 34), c = k % 34; return <circle key={k} cx={20 + c * 48 + (r % 2 ? 24 : 0)} cy={20 + r * 42} r={3} fill={L} />; })}</g>;
  if (bg === "cornell") return <g><line x1={430} x2={430} y1={150} y2={780} stroke={T} strokeWidth={5} /><line x1={30} x2={1570} y1={150} y2={150} stroke={T} strokeWidth={5} /><line x1={30} x2={1570} y1={780} y2={780} stroke={T} strokeWidth={5} />{label(230, 115, tr("Cues", "إشارات"))}{label(1000, 115, tr("Notes", "ملاحظات"))}{label(800, 830, tr("Summary", "الخلاصة"))}</g>;
  if (bg === "timeline") return <g><line x1={80} x2={1520} y1={500} y2={500} stroke={T} strokeWidth={8} /><path d="M1520 470 L1570 500 L1520 530 Z" fill={T} />{[200, 480, 760, 1040, 1320].map((x) => <g key={x}><circle cx={x} cy={500} r={18} fill="#f5c542" stroke={T} strokeWidth={5} /><line x1={x} x2={x} y1={x % 560 === 200 ? 300 : 520} y2={x % 560 === 200 ? 480 : 700} stroke={L} strokeWidth={4} strokeDasharray="10 8" /></g>)}</g>;
  if (bg === "flow") return <g>{[160, 620, 1080].map((x, i) => <g key={x}><rect x={x} y={380} width={360} height={240} rx={30} fill={["#0284c7", "#7c3aed", "#059669"][i]} fillOpacity={0.08} stroke={["#0284c7", "#7c3aed", "#059669"][i]} strokeWidth={5} />{i < 2 && <path d={`M${x + 370} 500 H${x + 450} M${x + 430} 480 L${x + 455} 500 L${x + 430} 520`} stroke={T} strokeWidth={6} fill="none" />}</g>)}</g>;
  if (bg === "venn3") return <g><circle cx={640} cy={400} r={300} fill="#0284c7" fillOpacity={0.08} stroke="#0284c7" strokeWidth={5} /><circle cx={960} cy={400} r={300} fill="#d97706" fillOpacity={0.08} stroke="#d97706" strokeWidth={5} /><circle cx={800} cy={640} r={300} fill="#059669" fillOpacity={0.08} stroke="#059669" strokeWidth={5} />{label(480, 160, "A")}{label(1120, 160, "B")}{label(800, 975, "C")}</g>;
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
      <defs><marker id="wb-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke" /></marker></defs>
      <rect width={WB_W} height={WB_H} fill="#ffffff" />
      <Background bg={bg} tr={tr} />
      {bg === "mind" && centre && <foreignObject x={590} y={400} width={420} height={200}><div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#f5c542", fontWeight: 800, fontSize: 30, textAlign: "center", lineHeight: 1.15 }} dir="auto">{centre}</div></foreignObject>}
      {strokes.map((s) => s.kind === "pic" ? (
        <image key={s.id} href={s.d.src} x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H} width={(s.d.w || 0.4) * WB_W} height={(s.d.h || 0.4) * WB_H} preserveAspectRatio="xMidYMid meet" data-testid="wb-pic" />
      ) : s.kind === "note" ? (
        <g key={s.id}>
          {s.d.bg && <rect x={(s.d.x || 0) * WB_W - 8} y={(s.d.y || 0) * WB_H - 6} width={String(s.d.text || "").length * (s.d.w || 22) * 0.95 + 16} height={(s.d.w || 22) * 1.6 * 1.25 + 8} rx={10} fill={s.d.bg} />}
          <text x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H} fontSize={(s.d.w || 22) * 1.6} fontWeight={700} fill={s.d.c || "#1b3a57"} fontFamily={s.d.f || undefined} dominantBaseline="hanging">{s.d.text}</text>
          {names && s.pid !== "host" && <text x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H - 6} fontSize={16} fill="#64748b" fontWeight={600}>{s.author}</text>}
        </g>
      ) : (
        <path key={s.id} d={pathOf(s.d.pts || []) + (s.d.cl ? "Z" : "")} fill={s.d.fill && s.d.cl ? s.d.fill : "none"} fillOpacity={0.35} markerEnd={s.d.ar ? "url(#wb-arrow)" : undefined} stroke={s.d.er ? "#ffffff" : s.d.c || "#1b3a57"} strokeOpacity={s.d.hl ? 0.35 : s.d.o || 1} strokeWidth={(s.d.w || 4) * (s.d.hl ? 3 : 1) * (s.d.er ? 4 : 1)} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {labelled.map((s) => <text key={`n${s.id}`} x={(s.d.pts?.[0] || 0) * WB_W + 8} y={(s.d.pts?.[1] || 0) * WB_H - 10} fontSize={17} fontWeight={700} fill="#475569" stroke="#fff" strokeWidth={4} paintOrder="stroke" data-testid="wb-name">{s.author}</text>)}
      {extra}
    </svg>
  );
}

export const strokesOf = (state: ActivityState): WbStroke[] => state.items.filter((i) => i.kind === "stroke" || i.kind === "note" || (i.kind === "pic" && i.img)).map((i) => ({ id: i.id, pid: i.pid, author: i.author, kind: i.kind, d: i.kind === "pic" ? { ...i.data, src: activityApi.imgUrl(state.code, i.img!) } : i.data }));

/** Interactive board: draws locally, sends each finished stroke. */
function Board({ code, who, state, reload, canDraw, isHost }: { code: string; who: Who; state: ActivityState; reload: () => void; canDraw: boolean; isHost: boolean }) {
  const { tr } = useTr();
  const o = state.settings.options;
  const [tool, setTool] = useState<Tool>("pen");
  const [fill, setFill] = useState(false);
  const [font, setFont] = useState("Nunito");
  const [noteBg, setNoteBg] = useState("");
  const start = useRef<[number, number] | null>(null);
  const SHAPES: Tool[] = ["line", "arrow", "rect", "ellipse", "tri"];
  const shapePts = (a: [number, number], x: number, y: number): number[] => {
    const [x0, y0] = a; const r4 = (v: number) => Math.round(v * 10000) / 10000;
    if (tool === "line" || tool === "arrow") return [x0, y0, x, y];
    if (tool === "rect") return [x0, y0, x, y0, x, y, x0, y];
    if (tool === "tri") return [(x0 + x) / 2, y0, x, y, x0, y];
    const cx = (x0 + x) / 2, cy = (y0 + y) / 2, rx = Math.abs(x - x0) / 2, ry = Math.abs(y - y0) / 2;
    return Array.from({ length: 40 }, (_, i) => [r4(cx + rx * Math.cos((i / 40) * Math.PI * 2)), r4(cy + ry * Math.sin((i / 40) * Math.PI * 2))]).flat();
  };
  const strokeData = (pts: number[]) => ({ pts, c: color, w: tool === "pencil" ? Math.max(1, Math.round(width / 2)) : tool === "brush" ? width * 2.5 : width, hl: tool === "hl", er: tool === "er", ...(tool === "pencil" ? { o: 0.75 } : tool === "brush" ? { o: 0.9 } : {}), ...(SHAPES.includes(tool) && tool !== "line" && tool !== "arrow" ? { cl: true, ...(fill ? { fill: color } : {}) } : {}), ...(tool === "arrow" ? { ar: true } : {}) });
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
      if (t) send({ kind: "note", text: t.slice(0, 200), x, y, c: color, w: width * 3 + 12, f: font, ...(noteBg ? { bg: noteBg } : {}) } as never, { id: `tmp${Date.now()}`, pid: "me", author: "", kind: "note", d: { text: t, x, y, c: color, w: width * 3 + 12, f: font, bg: noteBg || undefined } });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    start.current = [x, y];
    setCur([x, y]);
  };
  const move = (e: React.PointerEvent) => {
    if (!cur) return;
    const [x, y] = pt(e);
    if (SHAPES.includes(tool) && start.current) { setCur(shapePts(start.current, x, y)); return; }
    const lx = cur[cur.length - 2], ly = cur[cur.length - 1];
    if (Math.hypot((x - lx) * WB_W, (y - ly) * WB_H) < 4 || cur.length >= 1600) return;
    setCur([...cur, x, y]);
  };
  const up = () => {
    if (!cur) return;
    const pts = cur; setCur(null);
    if (pts.length < 4 && SHAPES.includes(tool)) return;
    const d = strokeData(pts);
    send({ kind: "stroke", ...d } as never, { id: `tmp${Date.now()}`, pid: "me", author: "", kind: "stroke", d });
  };
  const all = [...strokesOf(state), ...pending, ...(cur ? [{ id: "cur", pid: "me", author: "", kind: "stroke", d: strokeData(cur) }] : [])];
  const btn = (on: boolean) => `${hostChip(on)} !px-3`;
  return (
    <div className="space-y-2" data-testid="wb">
      {canDraw && (
        <div className="glass flex flex-wrap items-center gap-1.5 rounded-2xl p-2" data-focus-keep data-testid="wb-tools">
          <button type="button" className={btn(tool === "pen")} onClick={() => setTool("pen")} data-testid="wb-pen">🖊️ {tr("Pen", "قلم")}</button>
          <button type="button" className={btn(tool === "pencil")} onClick={() => setTool("pencil")} data-testid="wb-pencil">✏️ {tr("Pencil", "رصاص")}</button>
          <button type="button" className={btn(tool === "brush")} onClick={() => setTool("brush")} data-testid="wb-brush">🖌️ {tr("Brush", "فرشاة")}</button>
          <button type="button" className={btn(tool === "hl")} onClick={() => setTool("hl")}>🖍️ {tr("Highlighter", "محدد")}</button>
          <button type="button" className={btn(tool === "er")} onClick={() => setTool("er")}>🧽 {tr("Eraser", "ممحاة")}</button>
          <button type="button" className={btn(tool === "text")} onClick={() => setTool("text")} data-testid="wb-text">🔤 {tr("Text", "نص")}</button>
          {tool === "text" && <><select className="rounded-full border border-black/10 bg-white px-2 py-1 text-sm text-[#1b2f44]" value={font} onChange={(e) => setFont(e.target.value)} aria-label={tr("Font", "الخط")} data-testid="wb-font">{WB_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select>
            <select className="rounded-full border border-black/10 bg-white px-2 py-1 text-sm text-[#1b2f44]" value={noteBg} onChange={(e) => setNoteBg(e.target.value)} aria-label={tr("Highlight", "تظليل")} data-testid="wb-notebg"><option value="">{tr("No highlight", "بدون تظليل")}</option><option value="#fef08a">🟨</option><option value="#bbf7d0">🟩</option><option value="#bfdbfe">🟦</option><option value="#fbcfe8">🟪</option></select></>}
          <span className="mx-1 h-6 w-px bg-black/15" aria-hidden />
          {([["line", "╱", "Line", "خط"], ["arrow", "➜", "Arrow", "سهم"], ["rect", "▭", "Rectangle", "مستطيل"], ["ellipse", "◯", "Circle", "دائرة"], ["tri", "△", "Triangle", "مثلث"]] as [Tool, string, string, string][]).map(([k, ic, en, ar]) => <button key={k} type="button" className={btn(tool === k)} onClick={() => setTool(k)} title={tr(en, ar)} aria-label={tr(en, ar)} data-testid={`wb-${k}`}>{ic}</button>)}
          <button type="button" className={btn(fill)} onClick={() => setFill(!fill)} title={tr("Fill shapes", "تعبئة الأشكال")} data-testid="wb-fill">🎨 {tr("Fill", "تعبئة")}</button>
          <span className="mx-1 h-6 w-px bg-black/15" aria-hidden />
          {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-sun ring-2 ring-sun" : "border-black/10"}`} style={{ background: c }} aria-label={c} />)}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded-full" aria-label={tr("Any colour", "أي لون")} data-testid="wb-color" />
          <span className="mx-1 h-6 w-px bg-black/15" aria-hidden />
          {WIDTHS.map((w) => <button key={w} type="button" onClick={() => setWidth(w)} className={btn(width === w)} aria-label={tr(`Thickness ${w}`, `السماكة ${w}`)}><span className="inline-block rounded-full bg-current" style={{ width: w + 4, height: w + 4 }} /></button>)}
          <span className="mx-1 h-6 w-px bg-black/15" aria-hidden />
          {isHost && <label className={btn(false) + " cursor-pointer"} title={tr("Add a picture everyone sees", "أضف صورة يراها الجميع")} data-testid="wb-pic-add">🖼️ {tr("Picture", "صورة")}<input type="file" accept="image/*" className="hidden" data-testid="wb-pic-input" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setErr("");
            try {
              const bmp = await createImageBitmap(f); const ar = (bmp.width / bmp.height) / (WB_W / WB_H);
              const w = ar >= 1 ? 0.5 : 0.5 * ar, h = ar >= 1 ? 0.5 / ar : 0.5;
              const image = await compressImage(f);
              await activityApi.post(code, who, { kind: "pic", image, x: (1 - w) / 2, y: (1 - h) / 2, w, h } as never); await reload();
            } catch (er) { setErr(actErr(er, tr)); }
          }} /></label>}
          <button type="button" className={btn(false)} onClick={() => activityApi.post(code, who, { kind: "undo" }).then(reload).catch((e) => setErr(actErr(e, tr)))} data-testid="wb-undo">↶ {tr("Undo", "تراجع")}</button>
          {isHost && "hostKey" in who && <button type="button" className={btn(false)} onClick={async () => { if (!confirm(tr("Clear the whole board?", "مسح السبورة كلها؟"))) return; await activityApi.moderate(code, who.hostKey, "clear", { kind: "stroke" }).catch(() => undefined); await activityApi.moderate(code, who.hostKey, "clear", { kind: "note" }).catch(() => undefined); await activityApi.moderate(code, who.hostKey, "clear", { kind: "pic" }).catch(() => undefined); reload(); }} data-testid="wb-clear">🗑️ {tr("Clear", "مسح")}</button>}
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
      <WbExtras code={code} title={state.title || ""} />
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

/** t429: share link (students + teachers join with it and draw together), screen recording, colourful print with QR. */
function WbExtras({ code, title }: { code: string; title: string }) {
  const { tr } = useTr();
  const [msg, setMsg] = useState("");
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const link = typeof window !== "undefined" ? `${location.origin}/join?code=${encodeURIComponent(code)}` : "";
  const share = async () => { try { if (navigator.share) await navigator.share({ title: title || "Whiteboard", url: link }); else { await navigator.clipboard.writeText(link); setMsg(tr("Link copied — anyone with it (students or teachers) joins this board.", "نُسخ الرابط — من يملكه (طلاب أو معلمون) ينضم لهذه السبورة.")); } } catch { /* cancelled */ } };
  const record = async () => {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const r = new MediaRecorder(stream); const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(parts, { type: "video/webm" })); a.download = `whiteboard-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm`; a.click(); setRec(null); setMsg(tr("Recording saved to your downloads.", "حُفظ التسجيل في التنزيلات.")); };
      stream.getVideoTracks()[0].onended = () => r.state !== "inactive" && r.stop();
      r.start(1000); setRec(r); setMsg(tr("Recording… press ⏹ to stop.", "جارٍ التسجيل… اضغط ⏹ للإيقاف."));
    } catch { setMsg(tr("Screen recording isn't available in this browser.", "تسجيل الشاشة غير متاح في هذا المتصفح.")); }
  };
  const print = () => {
    const svg = document.querySelector("[data-testid=wb-art]")?.outerHTML || ""; const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${(title || "Whiteboard").replace(/</g, "")}</title><style>@page{size:A4 landscape;margin:8mm}body{margin:0;font-family:Nunito,Arial,sans-serif}.f{border:6px solid #1b3a57;border-radius:22px;padding:10px;background:linear-gradient(135deg,#fdf0c4,#fff,#dbe7f3)}.h{display:flex;align-items:center;gap:12px;margin-bottom:8px}.h b{flex:1;font-size:22px;color:#1b3a57}.c{border-radius:14px;overflow:hidden;border:3px solid #f5c542}svg{width:100%;height:auto;display:block}</style></head><body><div class="f"><div class="h"><b>🖍️ ${(title || "Whiteboard").replace(/</g, "")}</b><span>${new Date().toLocaleDateString("en-GB")}</span>${qrSvg(link, 84)}</div><div class="c">${svg}</div></div><script>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  };
  return <div className="flex flex-wrap items-center gap-2" data-focus-keep data-testid="wb-extras">
    <button type="button" className={hostChip(false)} onClick={share} data-testid="wb-share">🔗 {tr("Share link (students & teachers)", "رابط المشاركة (طلاب ومعلمون)")}</button>
    <button type="button" className={hostChip(!!rec)} onClick={record} data-testid="wb-rec">{rec ? "⏹ " + tr("Stop recording", "إيقاف التسجيل") : "🎥 " + tr("Record screen", "تسجيل الشاشة")}</button>
    <button type="button" className={hostChip(false)} onClick={print} data-testid="wb-print">🖨 {tr("Colour print + QR", "طباعة ملوّنة + QR")}</button>
    {msg && <span className="text-xs font-semibold opacity-80" role="status">{msg}</span>}
  </div>;
}
