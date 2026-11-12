"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { enterFullscreen, exitFullscreen } from "@/components/FocusMode";
import { setPageFocus, usePageFocus } from "@/components/FullscreenToggle";
import { qrSvg } from "@/lib/qrLocal";
import { actErr, hostChip, saveOptions, useTr, type Tr } from "@/components/activity/common";
import { activityApi, compressImage, type ActivityItem, type ActivityState, type Who } from "@/lib/activity";

/** Live whiteboard: fast canvas ink (smart-board friendly), pages, patterns, and per-student write access. */
export const WB_W = 1600, WB_H = 1000;
const COLORS = ["#1b3a57", "#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0f172a", "#f5c542", "#db2777", "#0891b2", "#65a30d", "#ffffff"];
const WB_FONTS = ["Nunito", "Amiri", "Tajawal", "Noto Sans Arabic", "Georgia", "Comic Sans MS", "Courier New", "Arial"];
type Tool = "hand" | "pen" | "pencil" | "brush" | "paint" | "qalam" | "hl" | "er" | "text" | "line" | "arrow" | "rect" | "ellipse" | "tri";
const WIDTHS = [3, 6, 12, 20];
const SHAPES: Tool[] = ["line", "arrow", "rect", "ellipse", "tri"];
export const WB_BGS: [string, string, string][] = [
  ["blank", "Blank", "فارغة"], ["lined", "Lined", "مسطّرة"], ["linedrtl", "Lined (Arabic)", "مسطّرة (عربي)"], ["grid", "Grid", "شبكة"], ["graph", "Graph paper", "ورق بياني"], ["dots", "Dots", "نقاط"],
  ["callig", "Arabic calligraphy", "خط عربي"], ["music", "Handwriting lines", "أسطر الخط"],
  ["venn", "Venn", "مخطط فن"], ["venn3", "Venn (3)", "مخطط فن (٣)"], ["tchart", "T-chart", "جدول T"], ["kwl", "K · W · L", "أعرف · أريد · تعلّمت"],
  ["stw", "See · Think · Wonder", "أرى · أفكر · أتساءل"], ["cer", "Claim · Evidence · Reasoning", "ادعاء · دليل · تعليل"],
  ["frayer", "Frayer model", "نموذج فراير"], ["plusminus", "Plus / Minus / Interesting", "زائد / ناقص / مثير"], ["twocol", "Two columns", "عمودان"],
  ["four", "4 boxes", "٤ مربعات"], ["mind", "Mind map centre", "مركز خريطة ذهنية"], ["cycle", "Cycle", "دورة"], ["story", "Storyboard", "لوحة قصة"],
  ["cornell", "Cornell notes", "ملاحظات كورنيل"], ["timeline", "Timeline", "خط زمني"], ["flow", "Flow chart", "مخطط انسيابي"], ["exit", "Exit ticket", "بطاقة خروج"],
  ["iso", "Isometric dots", "نقاط متساوية"], ["cream", "Cream paper", "ورق كريمي"], ["chalk", "Chalkboard", "سبورة طباشير"], ["navy", "Navy board", "سبورة كحلية"],
];
export type WbStroke = { id: string; pid: string; author: string; kind: string; d: ActivityItem["data"] & { text?: string; h?: number; src?: string; pg?: number; ws?: number[]; tool?: string } };

export const pageOf = (s: { d?: { pg?: number } }) => Math.max(0, Math.floor(Number(s.d?.pg) || 0));
export const writersOf = (o: Record<string, unknown>) => (Array.isArray(o.writers) ? o.writers.map((x) => String(x)) : []);
export const studentMayDraw = (o: Record<string, unknown>, pid: string) => o.draw === true || writersOf(o).includes(pid);
export const pagesOf = (o: Record<string, unknown>) => Math.max(1, Math.min(30, Math.floor(Number(o.pages) || 1)));
export const bgOf = (o: Record<string, unknown>, page: number) => {
  const bgs = Array.isArray(o.bgs) ? o.bgs : [];
  return String(bgs[page] || o.bg || "blank");
};
const WbFillCtx = createContext(false);

const boardFill = (bg: string) => bg === "chalk" ? "#1a3d2a" : bg === "navy" ? "#15344c" : bg === "cream" ? "#fbf4e4" : "#ffffff";
const darkBg = (bg: string) => bg === "chalk" || bg === "navy";

function Background({ bg, tr }: { bg: string; tr: Tr }) {
  const dark = darkBg(bg);
  const L = dark ? "rgba(255,255,255,0.22)" : "#c7d4e2", T = dark ? "#f8fafc" : "#1b3a57";
  const label = (x: number, y: number, t: string) => <text x={x} y={y} textAnchor="middle" fontSize={30} fontWeight={800} fill={T} opacity={0.8}>{t}</text>;
  if (bg === "lined" || bg === "linedrtl") return <g>{Array.from({ length: 19 }, (_, i) => <line key={i} x1={0} x2={WB_W} y1={60 + i * 50} y2={60 + i * 50} stroke={L} strokeWidth={2} />)}<line x1={bg === "linedrtl" ? 1480 : 120} x2={bg === "linedrtl" ? 1480 : 120} y1={0} y2={WB_H} stroke="#fda4af" strokeWidth={3} /></g>;
  if (bg === "grid") return <g>{Array.from({ length: 33 }, (_, i) => <line key={`v${i}`} x1={i * 50} x2={i * 50} y1={0} y2={WB_H} stroke={L} />)}{Array.from({ length: 21 }, (_, i) => <line key={`h${i}`} y1={i * 50} y2={i * 50} x1={0} x2={WB_W} stroke={L} />)}</g>;
  if (bg === "graph") return <g>{Array.from({ length: 81 }, (_, i) => <line key={`v${i}`} x1={i * 20} x2={i * 20} y1={0} y2={WB_H} stroke={i % 5 ? (dark ? "rgba(255,255,255,0.08)" : "#e2e8f0") : L} />)}{Array.from({ length: 51 }, (_, i) => <line key={`h${i}`} y1={i * 20} y2={i * 20} x1={0} x2={WB_W} stroke={i % 5 ? (dark ? "rgba(255,255,255,0.08)" : "#e2e8f0") : L} />)}</g>;
  if (bg === "dots") return <g>{Array.from({ length: 31 * 19 }, (_, k) => <circle key={k} cx={50 + (k % 31) * 50} cy={50 + Math.floor(k / 31) * 50} r={3} fill={L} />)}</g>;
  if (bg === "callig") return <g>{Array.from({ length: 8 }, (_, i) => { const y = 70 + i * 118; return <g key={i}><line x1={40} x2={1560} y1={y} y2={y} stroke={L} strokeWidth={2} /><line x1={40} x2={1560} y1={y + 28} y2={y + 28} stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="8 7" /><line x1={40} x2={1560} y1={y + 56} y2={y + 56} stroke={T} strokeOpacity={0.55} strokeWidth={2.5} /><line x1={40} x2={1560} y1={y + 84} y2={y + 84} stroke={L} strokeWidth={2} /></g>; })}</g>;
  if (bg === "venn") return <g><circle cx={620} cy={520} r={380} fill="#0284c7" fillOpacity={0.08} stroke="#0284c7" strokeWidth={5} /><circle cx={980} cy={520} r={380} fill="#d97706" fillOpacity={0.08} stroke="#d97706" strokeWidth={5} />{label(450, 110, "A")}{label(1150, 110, "B")}{label(800, 90, tr("Both", "كلاهما"))}</g>;
  if (bg === "tchart") return <g><line x1={800} x2={800} y1={40} y2={960} stroke={T} strokeWidth={6} /><line x1={60} x2={1540} y1={150} y2={150} stroke={T} strokeWidth={6} />{label(430, 115, tr("For / Yes", "مع / نعم"))}{label(1170, 115, tr("Against / No", "ضد / لا"))}</g>;
  if (bg === "kwl") return <g>{[533, 1066].map((x) => <line key={x} x1={x} x2={x} y1={40} y2={960} stroke={T} strokeWidth={5} />)}<line x1={30} x2={1570} y1={150} y2={150} stroke={T} strokeWidth={5} />{label(266, 115, tr("K — I know", "أعرف"))}{label(800, 115, tr("W — I want to know", "أريد أن أعرف"))}{label(1333, 115, tr("L — I learned", "تعلّمت"))}</g>;
  if (bg === "stw") return <g>{[533, 1066].map((x) => <line key={x} x1={x} x2={x} y1={40} y2={960} stroke={T} strokeWidth={5} />)}<line x1={30} x2={1570} y1={150} y2={150} stroke={T} strokeWidth={5} />{label(266, 115, tr("See", "أرى"))}{label(800, 115, tr("Think", "أفكر"))}{label(1333, 115, tr("Wonder", "أتساءل"))}</g>;
  if (bg === "cer") return <g>{[533, 1066].map((x) => <line key={x} x1={x} x2={x} y1={40} y2={960} stroke={T} strokeWidth={5} />)}<line x1={30} x2={1570} y1={150} y2={150} stroke={T} strokeWidth={5} />{label(266, 115, tr("Claim", "الادعاء"))}{label(800, 115, tr("Evidence", "الدليل"))}{label(1333, 115, tr("Reasoning", "التعليل"))}</g>;
  if (bg === "plusminus") return <g>{[533, 1066].map((x) => <line key={x} x1={x} x2={x} y1={40} y2={960} stroke={T} strokeWidth={5} />)}<line x1={30} x2={1570} y1={150} y2={150} stroke={T} strokeWidth={5} />{label(266, 115, "+")}{label(800, 115, "−")}{label(1333, 115, tr("Interesting", "مثير"))}</g>;
  if (bg === "twocol") return <g><line x1={800} x2={800} y1={40} y2={960} stroke={T} strokeWidth={6} /><line x1={60} x2={1540} y1={140} y2={140} stroke={T} strokeWidth={6} />{label(400, 105, tr("Column A", "العمود أ"))}{label(1200, 105, tr("Column B", "العمود ب"))}</g>;
  if (bg === "frayer") return <g><line x1={800} x2={800} y1={30} y2={970} stroke={T} strokeWidth={5} /><line x1={30} x2={1570} y1={500} y2={500} stroke={T} strokeWidth={5} /><rect x={560} y={360} width={480} height={280} rx={24} fill={dark ? "#15344c" : "#fff"} stroke="#f5c542" strokeWidth={8} />{label(400, 80, tr("Definition", "التعريف"))}{label(1200, 80, tr("Characteristics", "الخصائص"))}{label(400, 940, tr("Examples", "أمثلة"))}{label(1200, 940, tr("Non-examples", "ليست أمثلة"))}{label(800, 510, tr("Word", "الكلمة"))}</g>;
  if (bg === "mind") return <g><ellipse cx={800} cy={500} rx={230} ry={120} fill="#1b3a57" stroke="#f5c542" strokeWidth={8} />{[0, 60, 120, 180, 240, 300].map((a) => { const r = (a * Math.PI) / 180; return <line key={a} x1={800 + 240 * Math.cos(r)} y1={500 + 130 * Math.sin(r)} x2={800 + 560 * Math.cos(r)} y2={500 + 400 * Math.sin(r)} stroke={L} strokeWidth={5} strokeDasharray="14 12" />; })}</g>;
  if (bg === "music") return <g>{Array.from({ length: 9 }, (_, i) => { const y = 90 + i * 105; return <g key={i}><line x1={40} x2={1560} y1={y} y2={y} stroke={L} strokeWidth={2} /><line x1={40} x2={1560} y1={y + 35} y2={y + 35} stroke="#93c5fd" strokeWidth={2} strokeDasharray="10 8" /><line x1={40} x2={1560} y1={y + 70} y2={y + 70} stroke="#1b3a57" strokeOpacity={0.5} strokeWidth={2.5} /></g>; })}</g>;
  if (bg === "iso") return <g>{Array.from({ length: 34 * 23 }, (_, k) => { const r = Math.floor(k / 34), c = k % 34; return <circle key={k} cx={20 + c * 48 + (r % 2 ? 24 : 0)} cy={20 + r * 42} r={3} fill={L} />; })}</g>;
  if (bg === "cornell") return <g><line x1={430} x2={430} y1={150} y2={780} stroke={T} strokeWidth={5} /><line x1={30} x2={1570} y1={150} y2={150} stroke={T} strokeWidth={5} /><line x1={30} x2={1570} y1={780} y2={780} stroke={T} strokeWidth={5} />{label(230, 115, tr("Cues", "إشارات"))}{label(1000, 115, tr("Notes", "ملاحظات"))}{label(800, 830, tr("Summary", "الخلاصة"))}</g>;
  if (bg === "timeline") return <g><line x1={80} x2={1520} y1={500} y2={500} stroke={T} strokeWidth={8} /><path d="M1520 470 L1570 500 L1520 530 Z" fill={T} />{[200, 480, 760, 1040, 1320].map((x) => <g key={x}><circle cx={x} cy={500} r={18} fill="#f5c542" stroke={T} strokeWidth={5} /><line x1={x} x2={x} y1={x % 560 === 200 ? 300 : 520} y2={x % 560 === 200 ? 480 : 700} stroke={L} strokeWidth={4} strokeDasharray="10 8" /></g>)}</g>;
  if (bg === "flow") return <g>{[160, 620, 1080].map((x, i) => <g key={x}><rect x={x} y={380} width={360} height={240} rx={30} fill={["#0284c7", "#7c3aed", "#059669"][i]} fillOpacity={0.08} stroke={["#0284c7", "#7c3aed", "#059669"][i]} strokeWidth={5} />{i < 2 && <path d={`M${x + 370} 500 H${x + 450} M${x + 430} 480 L${x + 455} 500 L${x + 430} 520`} stroke={T} strokeWidth={6} fill="none" />}</g>)}</g>;
  if (bg === "cycle") return <g><ellipse cx={800} cy={500} rx={520} ry={340} fill="none" stroke={T} strokeWidth={6} strokeDasharray="16 14" />{[0, 120, 240].map((a, i) => { const r = ((a - 90) * Math.PI) / 180; return <g key={a}><circle cx={800 + 420 * Math.cos(r)} cy={500 + 260 * Math.sin(r)} r={90} fill={["#0284c7", "#d97706", "#059669"][i]} fillOpacity={0.15} stroke={["#0284c7", "#d97706", "#059669"][i]} strokeWidth={5} />{label(800 + 420 * Math.cos(r), 500 + 260 * Math.sin(r) + 10, String(i + 1))}</g>; })}</g>;
  if (bg === "story") return <g>{[0, 1].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={40 + c * 520} y={40 + r * 480} width={480} height={440} rx={18} fill="none" stroke={T} strokeWidth={4} />))}</g>;
  if (bg === "exit") return <g><rect x={80} y={80} width={1440} height={840} rx={28} fill="none" stroke={T} strokeWidth={6} />{label(800, 160, tr("Exit ticket", "بطاقة خروج"))}<line x1={140} x2={1460} y1={280} y2={280} stroke={L} strokeWidth={3} /><line x1={140} x2={1460} y1={480} y2={480} stroke={L} strokeWidth={3} /><line x1={140} x2={1460} y1={680} y2={680} stroke={L} strokeWidth={3} /></g>;
  if (bg === "venn3") return <g><circle cx={640} cy={400} r={300} fill="#0284c7" fillOpacity={0.08} stroke="#0284c7" strokeWidth={5} /><circle cx={960} cy={400} r={300} fill="#d97706" fillOpacity={0.08} stroke="#d97706" strokeWidth={5} /><circle cx={800} cy={640} r={300} fill="#059669" fillOpacity={0.08} stroke="#059669" strokeWidth={5} />{label(480, 160, "A")}{label(1120, 160, "B")}{label(800, 975, "C")}</g>;
  if (bg === "four") return <g><line x1={800} x2={800} y1={30} y2={970} stroke={T} strokeWidth={5} /><line x1={30} x2={1570} y1={500} y2={500} stroke={T} strokeWidth={5} /></g>;
  return null;
}

const pathOf = (pts: number[]) => {
  if (pts.length < 2) return "";
  const X = (i: number) => (pts[i] * WB_W).toFixed(1), Y = (i: number) => (pts[i + 1] * WB_H).toFixed(1);
  if (pts.length === 2) return `M${X(0)} ${Y(0)}l0.1 0`;
  if (pts.length === 4) return `M${X(0)} ${Y(0)}L${X(2)} ${Y(2)}`;
  let s = `M${X(0)} ${Y(0)}`;
  for (let i = 2; i < pts.length - 2; i += 2) s += `Q${X(i)} ${Y(i)} ${(((pts[i] + pts[i + 2]) / 2) * WB_W).toFixed(1)} ${(((pts[i + 1] + pts[i + 3]) / 2) * WB_H).toFixed(1)}`;
  return s + `L${X(pts.length - 2)} ${Y(pts.length - 2)}`;
};

function StrokeSvg({ s }: { s: WbStroke }) {
  const pts = s.d.pts || [], ws = s.d.ws, hl = !!s.d.hl, er = !!s.d.er;
  if (er) return null;
  const color = s.d.c || "#1b3a57";
  const op = hl ? 0.35 : s.d.o || 1;
  const base = (s.d.w || 4) * (hl ? 3 : 1) * (er ? 4 : 1);
  if (ws && ws.length >= 2 && pts.length >= 4 && !s.d.cl) {
    return <g>{Array.from({ length: Math.floor(pts.length / 2) - 1 }, (_, i) => <path key={i} d={`M${(pts[i * 2] * WB_W).toFixed(1)} ${(pts[i * 2 + 1] * WB_H).toFixed(1)}L${(pts[i * 2 + 2] * WB_W).toFixed(1)} ${(pts[i * 2 + 3] * WB_H).toFixed(1)}`} fill="none" stroke={color} strokeOpacity={op} strokeWidth={ws[i] || base} strokeLinecap="round" strokeLinejoin="round" />)}</g>;
  }
  return <path d={pathOf(pts) + (s.d.cl ? "Z" : "")} fill={s.d.fill && s.d.cl ? s.d.fill : "none"} fillOpacity={0.35} markerEnd={s.d.ar ? "url(#wb-arrow)" : undefined} stroke={color} strokeOpacity={op} strokeWidth={base} strokeLinecap="round" strokeLinejoin="round" />;
}

/** The board art (live and printable share this). `centre` = prompt text drawn in the mind-map centre. */
export function BoardArt({ strokes, bg, names, centre, tr, extra, inkOnCanvas }: { strokes: WbStroke[]; bg: string; names: boolean; centre?: string; tr: Tr; extra?: React.ReactNode; inkOnCanvas?: boolean }) {
  const firstOf = new Set<string>(); const labelled: WbStroke[] = [];
  if (names) for (const s of strokes) if (s.kind === "stroke" && s.pid !== "host" && !s.d.er && !firstOf.has(s.pid)) { firstOf.add(s.pid); labelled.push(s); }
  return (
    <svg viewBox={`0 0 ${WB_W} ${WB_H}`} className="block h-auto w-full" data-testid="wb-art">
      <defs><marker id="wb-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke" /></marker></defs>
      <rect width={WB_W} height={WB_H} fill={boardFill(bg)} />
      <Background bg={bg} tr={tr} />
      {bg === "mind" && centre && <foreignObject x={590} y={400} width={420} height={200}><div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#f5c542", fontWeight: 800, fontSize: 30, textAlign: "center", lineHeight: 1.15 }} dir="auto">{centre}</div></foreignObject>}
      {strokes.map((s) => s.kind === "pic" ? (
        <image key={s.id} data-wb-id={s.id} href={s.d.src} x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H} width={(s.d.w || 0.4) * WB_W} height={(s.d.h || 0.4) * WB_H} preserveAspectRatio="xMidYMid meet" data-testid="wb-pic" />
      ) : s.kind === "note" ? (
        <g key={s.id} data-wb-id={s.id}>
          {s.d.bg && <rect x={(s.d.x || 0) * WB_W - 8} y={(s.d.y || 0) * WB_H - 6} width={String(s.d.text || "").length * (s.d.w || 22) * 0.95 + 16} height={(s.d.w || 22) * 1.6 * 1.25 + 8} rx={10} fill={s.d.bg} />}
          <text x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H} fontSize={(s.d.w || 22) * 1.6} fontWeight={700} fill={s.d.c || (darkBg(bg) ? "#f8fafc" : "#1b3a57")} fontFamily={s.d.f || undefined} dominantBaseline="hanging">{s.d.text}</text>
          {names && s.pid !== "host" && <text x={(s.d.x || 0) * WB_W} y={(s.d.y || 0) * WB_H - 6} fontSize={16} fill="#64748b" fontWeight={600}>{s.author}</text>}
        </g>
      ) : inkOnCanvas ? null : (
        <g key={s.id} data-wb-id={s.id}><StrokeSvg s={s} /></g>
      ))}
      {labelled.map((s) => <text key={`n${s.id}`} x={(s.d.pts?.[0] || 0) * WB_W + 8} y={(s.d.pts?.[1] || 0) * WB_H - 10} fontSize={17} fontWeight={700} fill="#475569" stroke="#fff" strokeWidth={4} paintOrder="stroke" data-testid="wb-name">{s.author}</text>)}
      {extra}
    </svg>
  );
}

export const strokesOf = (state: ActivityState): WbStroke[] => state.items.filter((i) => i.kind === "stroke" || i.kind === "note" || (i.kind === "pic" && i.img)).map((i) => ({ id: i.id, pid: i.pid, author: i.author, kind: i.kind, d: i.kind === "pic" ? { ...i.data, src: activityApi.imgUrl(state.code, i.img!) } : i.data }));

function distSeg(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function hitItem(strokes: WbStroke[], x: number, y: number): WbStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s.id.startsWith("tmp")) continue;
    if (s.kind === "pic") {
      const px = s.d.x || 0, py = s.d.y || 0, w = s.d.w || 0.4, h = s.d.h || 0.4;
      if (x >= px && x <= px + w && y >= py && y <= py + h) return s;
    } else if (s.kind === "note") {
      const px = s.d.x || 0, py = s.d.y || 0, fs = s.d.w || 22;
      const tw = (String(s.d.text || "").length * fs * 0.6 + 16) / WB_W;
      const th = (fs * 2 + 10) / WB_H;
      if (x >= px - 8 / WB_W && x <= px + Math.max(0.06, tw) && y >= py - 8 / WB_H && y <= py + Math.max(0.04, th)) return s;
    } else {
      const pts = s.d.pts || [];
      const thresh = 16 / Math.min(WB_W, WB_H);
      for (let j = 0; j + 3 < pts.length; j += 2) {
        if (distSeg(x, y, pts[j], pts[j + 1], pts[j + 2], pts[j + 3]) < thresh) return s;
      }
      if (pts.length >= 2 && Math.hypot(x - pts[0], y - pts[1]) < thresh) return s;
    }
  }
  return null;
}

function rdpKeep(pts: number[], eps: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const keep = new Array(n).fill(false);
  keep[0] = keep[n - 1] = true;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distSeg(pts[i * 2], pts[i * 2 + 1], pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > eps) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
}

function paintInk(ctx: CanvasRenderingContext2D, s: WbStroke, cssW: number, cssH: number) {
  const pts = s.d.pts || [];
  if (pts.length < 2 || s.kind !== "stroke") return;
  const X = (i: number) => pts[i] * cssW, Y = (i: number) => pts[i + 1] * cssH;
  const er = !!s.d.er, hl = !!s.d.hl, tool = s.d.tool;
  const color = er ? "#000000" : s.d.c || "#1b3a57";
  const base = (s.d.w || 4) * (hl ? 3 : 1) * (er ? 4 : 1);
  const ws = s.d.ws;
  ctx.save();
  ctx.globalCompositeOperation = er ? "destination-out" : "source-over";
  if (tool === "paint" && !er) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < pts.length; i += 2) { ctx.beginPath(); ctx.arc(X(i), Y(i), (ws?.[i / 2] || base) * 0.7, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return;
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = hl ? 0.35 : s.d.o || 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (ws && ws.length >= 2 && pts.length >= 4 && !s.d.cl) {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      ctx.beginPath();
      ctx.lineWidth = ws[i / 2] || base;
      ctx.moveTo(X(i), Y(i));
      ctx.lineTo(X(i + 2), Y(i + 2));
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = base;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    if (pts.length === 2) ctx.lineTo(X(0) + 0.15, Y(0));
    else {
      for (let i = 2; i < pts.length - 2; i += 2) ctx.quadraticCurveTo(X(i), Y(i), (pts[i] + pts[i + 2]) / 2 * cssW, (pts[i + 1] + pts[i + 3]) / 2 * cssH);
      ctx.lineTo(X(pts.length - 2), Y(pts.length - 2));
    }
    if (s.d.cl) ctx.closePath();
    ctx.stroke();
    if (s.d.fill && s.d.cl) { ctx.fillStyle = s.d.fill; ctx.globalAlpha = 0.35; ctx.fill(); }
    if (s.d.ar && pts.length >= 4) {
      const x0 = X(pts.length - 4), y0 = Y(pts.length - 4), x1 = X(pts.length - 2), y1 = Y(pts.length - 2);
      const ang = Math.atan2(y1 - y0, x1 - x0), len = 14 + base;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - len * Math.cos(ang - 0.4), y1 - len * Math.sin(ang - 0.4));
      ctx.lineTo(x1 - len * Math.cos(ang + 0.4), y1 - len * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
      ctx.fill();
    }
  }
  ctx.restore();
}

function tipWidth(tool: Tool, base: number, e: PointerEvent, prev: [number, number] | null): number {
  const pr = e.pointerType === "pen" && e.pressure > 0 && e.pressure < 0.99 ? e.pressure : -1;
  let m = 1;
  if (pr >= 0) m = 0.35 + pr * 1.2;
  else if (prev) {
    const spd = Math.hypot((e.clientX - prev[0]), (e.clientY - prev[1]));
    m = 0.55 + 0.45 / (1 + spd / 14);
  }
  if (tool === "qalam" && prev) {
    const ang = Math.atan2(e.clientY - prev[1], e.clientX - prev[0]);
    m = 0.22 + Math.abs(Math.sin(ang + Math.PI / 5)) * 1.2;
  }
  if (tool === "paint") return base * 2.4 * m;
  if (tool === "brush") return base * 2.2 * m;
  if (tool === "pencil") return Math.max(1, base * 0.45 * m);
  if (tool === "qalam") return base * 1.7 * m;
  if (tool === "hl" || tool === "er") return base;
  return base * m;
}

function sameInk(a: WbStroke, b: WbStroke) {
  const ap = a.d.pts || [], bp = b.d.pts || [];
  return a.kind === b.kind && ap.length === bp.length && ap[0] === bp[0] && ap[1] === bp[1] && ap[ap.length - 2] === bp[bp.length - 2] && pageOf(a) === pageOf(b);
}

function Board({ code, who, state, reload, canDraw, isHost }: { code: string; who: Who; state: ActivityState; reload: () => void; canDraw: boolean; isHost: boolean }) {
  const { tr } = useTr();
  const o = state.settings.options;
  const pageCount = pagesOf(o);
  const [page, setPage] = useState(Math.min(pageCount - 1, Math.max(0, Number(o.page) || 0)));
  const [tool, setTool] = useState<Tool>("pen");
  const [fill, setFill] = useState(false);
  const [font, setFont] = useState("Nunito");
  const [noteBg, setNoteBg] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [pending, setPending] = useState<WbStroke[]>([]);
  const [err, setErr] = useState("");
  const start = useRef<[number, number] | null>(null);
  const curRef = useRef<number[] | null>(null);
  const curWs = useRef<number[]>([]);
  const ptr = useRef<number | null>(null);
  const lastScreen = useRef<[number, number] | null>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: string; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const raf = useRef(0);
  const svgBox = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panDrag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const ptrType = useRef<string | null>(null);
  const upRef = useRef<(e?: React.PointerEvent | PointerEvent) => void>(() => undefined);
  const [grabbing, setGrabbing] = useState(false);
  const pageRef = useRef(page);
  pageRef.current = page;
  const bg = bgOf(o, page);
  const shapePts = (a: [number, number], x: number, y: number): number[] => {
    const [x0, y0] = a; const r4 = (v: number) => Math.round(v * 10000) / 10000;
    if (tool === "line" || tool === "arrow") return [x0, y0, x, y];
    if (tool === "rect") return [x0, y0, x, y0, x, y, x0, y];
    if (tool === "tri") return [(x0 + x) / 2, y0, x, y, x0, y];
    const cx = (x0 + x) / 2, cy = (y0 + y) / 2, rx = Math.abs(x - x0) / 2, ry = Math.abs(y - y0) / 2;
    return Array.from({ length: 40 }, (_, i) => [r4(cx + rx * Math.cos((i / 40) * Math.PI * 2)), r4(cy + ry * Math.sin((i / 40) * Math.PI * 2))]).flat();
  };
  const strokeData = (pts: number[], ws?: number[]) => ({
    pts, c: color,
    w: tool === "pencil" ? Math.max(1, Math.round(width / 2)) : tool === "brush" || tool === "paint" ? width * 2.2 : tool === "qalam" ? width * 1.4 : width,
    hl: tool === "hl", er: tool === "er", pg: pageRef.current, tool,
    ...(ws && ws.length === pts.length / 2 ? { ws } : {}),
    ...(tool === "pencil" ? { o: 0.72 } : tool === "brush" ? { o: 0.88 } : {}),
    ...(SHAPES.includes(tool) && tool !== "line" && tool !== "arrow" ? { cl: true, ...(fill ? { fill: color } : {}) } : {}),
    ...(tool === "arrow" ? { ar: true } : {}),
  });
  const pt = (e: { clientX: number; clientY: number }) => {
    const r = (stageRef.current || svgBox.current)?.getBoundingClientRect();
    const w = r?.width || 1, h = r?.height || 1;
    return [Math.max(0, Math.min(1, (e.clientX - (r?.left || 0)) / w)), Math.max(0, Math.min(1, (e.clientY - (r?.top || 0)) / h))] as [number, number];
  };
  const cssSize = () => { const r = (stageRef.current || svgBox.current)?.getBoundingClientRect(); return [r?.width || 1, r?.height || 1] as [number, number]; };
  const all = [...strokesOf(state), ...pending];
  const onPage = all.filter((s) => pageOf(s) === page);
  const inkList = useRef(onPage);
  inkList.current = onPage;
  const fitAndPaint = () => {
    const box = stageRef.current || svgBox.current, ink = inkRef.current, live = liveRef.current;
    if (!box || !ink || !live) return;
    const r = box.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [ink, live]) {
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      c.style.width = `${r.width}px`; c.style.height = `${r.height}px`;
      const ctx = c.getContext("2d"); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ctx = ink.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, r.width, r.height);
    for (const s of inkList.current) paintInk(ctx, s, r.width, r.height);
  };
  const paintLive = () => {
    raf.current = 0;
    const live = liveRef.current, box = stageRef.current || svgBox.current;
    if (!live || !box) return;
    const r = box.getBoundingClientRect();
    const ctx = live.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, r.width, r.height);
    const pts = curRef.current;
    if (!pts || pts.length < 2) return;
    const dummy: WbStroke = { id: "live", pid: "me", author: "", kind: "stroke", d: strokeData(pts, curWs.current) };
    if (tool === "er") {
      const ink = inkRef.current?.getContext("2d");
      if (ink) { fitAndPaint(); paintInk(ink, dummy, r.width, r.height); }
      return;
    }
    paintInk(ctx, dummy, r.width, r.height);
  };
  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(paintLive); };
  useEffect(() => { fitAndPaint(); }, [onPage, page, bg]);
  useEffect(() => {
    const box = stageRef.current || svgBox.current; if (!box) return;
    const ro = new ResizeObserver(() => fitAndPaint());
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setPending((p) => p.filter((local) => !strokesOf(state).some((s) => sameInk(s, local)))); }, [state.items]);
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);

  const send = async (p: Parameters<typeof activityApi.post>[2], local: WbStroke) => {
    setPending((x) => [...x, local]); setErr("");
    try { await activityApi.post(code, who, p); } catch (e) { setErr(actErr(e, tr)); setPending((x) => x.filter((st) => st.id !== local.id)); }
  };
  const capturePtr = (id: number) => {
    const el = svgBox.current;
    if (!el) return;
    try { el.setPointerCapture(id); } catch { /* pointer already gone (some IR frames) */ }
  };
  const releasePtr = (id: number | null) => {
    const el = svgBox.current;
    if (!el || id == null) return;
    try { if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id); } catch { /* */ }
  };
  const abortStroke = () => {
    curRef.current = null;
    start.current = null;
    curWs.current = [];
    lastScreen.current = null;
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    const live = liveRef.current; if (live) { const r = cssSize(); live.getContext("2d")?.clearRect(0, 0, r[0], r[1]); }
    panDrag.current = null;
    if (dragRef.current) {
      const d = dragRef.current; dragRef.current = null;
      const node = svgBox.current?.querySelector(`[data-wb-id="${d.id}"]`);
      if (node) node.removeAttribute("transform");
    }
    setGrabbing(false);
  };
  const down = (e: React.PointerEvent) => {
    if (!canDraw) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    // Do not require isPrimary: IR smart-boards and Windows Ink often report the
    // stylus or a later finger as a non-primary pointer (hover, palm, or a
    // companion mouse pointer is already "primary"), which used to drop the stroke.
    if (ptr.current != null && ptr.current !== e.pointerId) {
      if (e.pointerType === "pen" && ptrType.current !== "pen") {
        const old = ptr.current;
        abortStroke();
        releasePtr(old);
        ptr.current = null;
        ptrType.current = null;
      } else {
        return;
      }
    }
    e.preventDefault();
    const [x, y] = pt(e);
    ptr.current = e.pointerId;
    ptrType.current = e.pointerType;
    lastScreen.current = [e.clientX, e.clientY];
    if (tool === "hand") {
      const hit = hitItem(onPage, x, y);
      if (hit) {
        const mine = hit.pid === "me" || ("pid" in who && hit.pid === who.pid);
        if (isHost || mine) {
          capturePtr(e.pointerId);
          dragRef.current = { id: hit.id, x0: x, y0: y, dx: 0, dy: 0 };
          return;
        }
      }
      const box = svgBox.current;
      if (!box) return;
      capturePtr(e.pointerId);
      panDrag.current = { x: e.clientX, y: e.clientY, sl: box.scrollLeft, st: box.scrollTop };
      setGrabbing(true);
      return;
    }
    if (tool === "text") {
      const t = window.prompt(tr("Text to add on the board:", "النص لإضافته على السبورة:"))?.trim();
      if (t) send({ kind: "note", text: t.slice(0, 200), x, y, c: color, w: width * 3 + 12, f: font, pg: page, ...(noteBg ? { bg: noteBg } : {}) } as never, { id: `tmp${Date.now()}`, pid: "me", author: "", kind: "note", d: { text: t, x, y, c: color, w: width * 3 + 12, f: font, bg: noteBg || undefined, pg: page } });
      return;
    }
    capturePtr(e.pointerId);
    start.current = [x, y];
    curRef.current = [x, y];
    curWs.current = [tipWidth(tool, width, e.nativeEvent, null)];
    schedule();
  };
  const move = (e: React.PointerEvent) => {
    if (ptr.current != null && e.pointerId !== ptr.current) return;
    if (ptr.current === e.pointerId) e.preventDefault();
    if (panDrag.current && svgBox.current) {
      const d = panDrag.current;
      svgBox.current.scrollLeft = d.sl - (e.clientX - d.x);
      svgBox.current.scrollTop = d.st - (e.clientY - d.y);
      return;
    }
    if (dragRef.current) {
      const [x, y] = pt(e);
      const d = dragRef.current;
      d.dx = x - d.x0; d.dy = y - d.y0;
      const node = svgBox.current?.querySelector(`[data-wb-id="${d.id}"]`);
      if (node) node.setAttribute("transform", `translate(${d.dx * WB_W} ${d.dy * WB_H})`);
      return;
    }
    if (!curRef.current) return;
    let evs: PointerEvent[];
    try {
      evs = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
      if (!evs.length) evs = [e.nativeEvent];
    } catch {
      evs = [e.nativeEvent];
    }
    const pts = curRef.current;
    for (const ev of evs) {
      const [x, y] = pt(ev);
      if (SHAPES.includes(tool) && start.current) { const next = shapePts(start.current, x, y); pts.length = 0; pts.push(...next); curWs.current = []; continue; }
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
      if (pts.length >= 2 && Math.hypot((x - lx) * WB_W, (y - ly) * WB_H) < 1.4) continue;
      if (pts.length >= 4000) continue;
      pts.push(x, y);
      curWs.current.push(tipWidth(tool, width, ev, lastScreen.current));
      lastScreen.current = [ev.clientX, ev.clientY];
    }
    schedule();
  };
  const up = (e?: React.PointerEvent | PointerEvent) => {
    if (e && ptr.current != null && e.pointerId !== ptr.current) return;
    const id = ptr.current;
    ptr.current = null;
    ptrType.current = null;
    lastScreen.current = null;
    releasePtr(e?.pointerId ?? id);
    if (panDrag.current) { panDrag.current = null; setGrabbing(false); return; }
    if (dragRef.current) {
      const d = dragRef.current; dragRef.current = null;
      const node = svgBox.current?.querySelector(`[data-wb-id="${d.id}"]`);
      if (node) node.removeAttribute("transform");
      if (Math.hypot(d.dx * WB_W, d.dy * WB_H) < 4) return;
      activityApi.post(code, who, { kind: "move", id: d.id, dx: d.dx, dy: d.dy }).then(reload).catch((er) => setErr(actErr(er, tr)));
      return;
    }
    const pts = curRef.current; const rawWs = curWs.current.slice();
    curRef.current = null; start.current = null; curWs.current = [];
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    const live = liveRef.current; if (live) { const r = cssSize(); live.getContext("2d")?.clearRect(0, 0, r[0], r[1]); }
    if (!pts) return;
    if (pts.length < 4 && SHAPES.includes(tool)) return;
    const keep = SHAPES.includes(tool) ? pts.map((_, i) => i).filter((i) => i % 2 === 0).map((i) => i / 2) : rdpKeep(pts, 0.00115);
    const slim: number[] = []; const slimW: number[] = [];
    for (const i of keep) { slim.push(Math.round(pts[i * 2] * 10000) / 10000, Math.round(pts[i * 2 + 1] * 10000) / 10000); if (rawWs[i] != null) slimW.push(Math.round(rawWs[i] * 10) / 10); }
    const data = strokeData(slim, !SHAPES.includes(tool) && slimW.length === slim.length / 2 ? slimW : undefined);
    send({ kind: "stroke", ...data } as never, { id: `tmp${Date.now()}`, pid: "me", author: "", kind: "stroke", d: data });
  };
  upRef.current = up;
  useEffect(() => {
    const box = svgBox.current;
    if (!box || !canDraw) return;
    const opts: AddEventListenerOptions = { passive: false, capture: true };
    const block = (ev: Event) => { ev.preventDefault(); };
    // Native non-passive listeners: React's delegated events cannot always
    // preventDefault on touch, so the page/board would still scroll and cancel the pointer.
    box.addEventListener("touchstart", block, opts);
    box.addEventListener("touchmove", block, opts);
    box.addEventListener("pointerdown", block, opts);
    const onMove = (ev: Event) => { if (ptr.current != null) ev.preventDefault(); };
    box.addEventListener("pointermove", onMove, opts);
    const onLost = (ev: PointerEvent) => { if (ptr.current === ev.pointerId) upRef.current(ev); };
    box.addEventListener("lostpointercapture", onLost);
    const onCtx = (ev: Event) => ev.preventDefault();
    box.addEventListener("contextmenu", onCtx);
    return () => {
      box.removeEventListener("touchstart", block, opts);
      box.removeEventListener("touchmove", block, opts);
      box.removeEventListener("pointerdown", block, opts);
      box.removeEventListener("pointermove", onMove, opts);
      box.removeEventListener("lostpointercapture", onLost);
      box.removeEventListener("contextmenu", onCtx);
    };
  }, [canDraw]);
  const goPage = (i: number) => {
    const n = Math.max(0, Math.min(pageCount - 1, i));
    setPage(n);
    if (isHost && "hostKey" in who) saveOptions(code, who.hostKey, state, { page: n }).catch(() => undefined);
  };
  const setPageBg = (next: string) => {
    if (!("hostKey" in who)) return;
    const bgs = Array.from({ length: pageCount }, (_, i) => bgOf(o, i));
    bgs[page] = next;
    saveOptions(code, who.hostKey, state, { bg: page === 0 ? next : String(o.bg || next), bgs }).then(reload);
    if (darkBg(next) && color === "#1b3a57") setColor("#ffffff");
    if (!darkBg(next) && color === "#ffffff") setColor("#1b3a57");
  };
  const addPage = () => {
    if (!("hostKey" in who) || pageCount >= 30) return;
    const bgs = Array.from({ length: pageCount + 1 }, (_, i) => i === pageCount ? bgOf(o, page) : bgOf(o, i));
    saveOptions(code, who.hostKey, state, { pages: pageCount + 1, page: pageCount, bgs }).then(() => { setPage(pageCount); reload(); });
  };
  const removePage = () => {
    if (!("hostKey" in who) || pageCount <= 1) return;
    const last = pageCount - 1;
    if (all.some((s) => pageOf(s) === last) && !confirm(tr("Remove the last page? Writing on it will be hidden.", "حذف الصفحة الأخيرة؟ ستُخفى الكتابة عليها."))) return;
    const next = Math.min(page, last - 1);
    saveOptions(code, who.hostKey, state, { pages: last, page: next }).then(() => { setPage(next); reload(); });
  };
  const btn = (on: boolean) => `${hostChip(on)} !px-3`;
  const fillScreen = useContext(WbFillCtx);
  return (
    <div className={fillScreen ? "flex h-full min-h-0 flex-col gap-2" : "space-y-2"} data-testid="wb">
      {canDraw && (
        <div className="glass flex shrink-0 flex-wrap items-center gap-1.5 rounded-2xl p-2" data-focus-keep data-testid="wb-tools">
          <button type="button" className={btn(tool === "hand")} onClick={() => setTool("hand")} data-testid="wb-hand">✋ {tr("Hand", "يد")}</button>
          <button type="button" className={btn(tool === "pen")} onClick={() => setTool("pen")} data-testid="wb-pen">🖊️ {tr("Pen", "قلم")}</button>
          <button type="button" className={btn(tool === "pencil")} onClick={() => setTool("pencil")} data-testid="wb-pencil">✏️ {tr("Pencil", "رصاص")}</button>
          <button type="button" className={btn(tool === "brush")} onClick={() => setTool("brush")} data-testid="wb-brush">🖌️ {tr("Brush", "فرشاة")}</button>
          <button type="button" className={btn(tool === "paint")} onClick={() => setTool("paint")} data-testid="wb-paint">🎨 {tr("Paint", "تلوين")}</button>
          <button type="button" className={btn(tool === "qalam")} onClick={() => setTool("qalam")} data-testid="wb-qalam">🪶 {tr("Arabic pen", "قلم خط")}</button>
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
              await activityApi.post(code, who, { kind: "pic", image, x: (1 - w) / 2, y: (1 - h) / 2, w, h, pg: page } as never); await reload();
            } catch (er) { setErr(actErr(er, tr)); }
          }} /></label>}
          <button type="button" className={btn(false)} onClick={() => activityApi.post(code, who, { kind: "undo" }).then(reload).catch((e) => setErr(actErr(e, tr)))} data-testid="wb-undo">↶ {tr("Undo", "تراجع")}</button>
          {isHost && "hostKey" in who && <button type="button" className={btn(false)} onClick={async () => { if (!confirm(tr("Clear the whole board?", "مسح السبورة كلها؟"))) return; await activityApi.moderate(code, who.hostKey, "clear", { kind: "stroke" }).catch(() => undefined); await activityApi.moderate(code, who.hostKey, "clear", { kind: "note" }).catch(() => undefined); await activityApi.moderate(code, who.hostKey, "clear", { kind: "pic" }).catch(() => undefined); reload(); }} data-testid="wb-clear">🗑️ {tr("Clear", "مسح")}</button>}
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5" data-focus-keep data-testid="wb-pages">
        <button type="button" className={btn(false)} disabled={page <= 0} onClick={() => goPage(page - 1)} aria-label={tr("Previous page", "الصفحة السابقة")}>◀</button>
        {Array.from({ length: pageCount }, (_, i) => <button key={i} type="button" className={btn(page === i)} onClick={() => goPage(i)} data-testid={`wb-page-${i}`}>{i + 1}</button>)}
        <button type="button" className={btn(false)} disabled={page >= pageCount - 1} onClick={() => goPage(page + 1)} aria-label={tr("Next page", "الصفحة التالية")}>▶</button>
        {isHost && "hostKey" in who && <>
          <button type="button" className={btn(false)} onClick={addPage} data-testid="wb-page-add">＋ {tr("Add page", "إضافة صفحة")}</button>
          {pageCount > 1 && <button type="button" className={btn(false)} onClick={removePage} data-testid="wb-page-del">{tr("Remove last page", "حذف الصفحة الأخيرة")}</button>}
          <label className="inline-flex items-center gap-1 text-sm font-bold">🧩 {tr("Pattern", "النمط")}
            <select className="max-w-[16rem] rounded-full border border-black/10 bg-white px-2 py-1 text-sm text-[#1b2f44]" value={bg} onChange={(e) => setPageBg(e.target.value)} data-testid="wb-bg">
              {WB_BGS.map(([k, en, ar]) => <option key={k} value={k}>{tr(en, ar)}</option>)}
            </select>
          </label>
        </>}
      </div>
      <div ref={svgBox} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={canDraw ? (e) => e.preventDefault() : undefined} onWheel={(e) => { if (curRef.current || dragRef.current || panDrag.current) return; const box = svgBox.current; if (box && box.scrollHeight > box.clientHeight + 4) { const atTop = box.scrollTop <= 0 && e.deltaY < 0; const atBot = box.scrollTop + box.clientHeight >= box.scrollHeight - 2 && e.deltaY > 0; if (!atTop && !atBot) { e.preventDefault(); box.scrollTop += e.deltaY; return; } } if (pageCount < 2) return; if (Math.abs(e.deltaY) < 24) return; goPage(page + (e.deltaY > 0 ? 1 : -1)); }} className={`relative overflow-auto rounded-[24px] shadow-xl ring-4 ring-[#1b3a57]/80 ${fillScreen ? "min-h-0 flex-1 max-h-none" : "max-h-[min(70vh,calc(100dvh-14rem))]"} ${canDraw ? `wb-draw-surface ${tool === "hand" ? (grabbing ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair"}` : ""}`} style={canDraw ? { touchAction: "none", overscrollBehavior: "none", userSelect: "none", WebkitUserSelect: "none" } : undefined} data-testid="wb-board">
        <div ref={stageRef} className="relative w-full" data-testid="wb-stage">
          {(state.prompt || state.title) && (
            <div className="pointer-events-none absolute start-3 top-3 z-10 max-w-[min(36rem,78%)] rounded-2xl bg-[#10263b]/90 px-4 py-2 text-white shadow-lg" data-testid="wb-prompt">
              {state.title && <p className="text-sm font-bold text-white/80" dir="auto">{state.title}</p>}
              {state.prompt && <p className="text-xl font-extrabold leading-snug text-white sm:text-2xl" dir="auto">{state.prompt}</p>}
            </div>
          )}
          <BoardArt strokes={onPage} bg={bg} names={o.labels !== false && !state.settings.hideNames} centre={state.prompt || state.title} tr={tr} inkOnCanvas extra={<path fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />} />
          <canvas ref={inkRef} className="pointer-events-none absolute inset-0 h-full w-full bg-transparent" data-testid="wb-ink" />
          <canvas ref={liveRef} className="pointer-events-none absolute inset-0 h-full w-full bg-transparent" data-testid="wb-live" />
        </div>
      </div>
      {!canDraw && <p className="text-center text-sm font-semibold opacity-80" data-testid="wb-viewonly">👀 {tr("Watching the board — your teacher will let you draw when it's your turn.", "تشاهد السبورة — سيسمح لك المعلم بالرسم عندما يحين دورك.")}</p>}
      {err && <p className="text-sm font-semibold text-rose-700" role="alert">{err}</p>}
    </div>
  );
}

export function WhiteboardStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const pid = "pid" in who ? who.pid : "";
  return <Board code={code} who={who} state={state} reload={reload} canDraw={!closed && studentMayDraw(state.settings.options, pid)} isHost={false} />;
}


/** Minimize / restore, detach into a Document Picture-in-Picture window, plus Full screen and Focus. */
function WbChrome({ children }: { children: ReactNode }) {
  const { tr } = useTr();
  const [min, setMin] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [pipMsg, setPipMsg] = useState("");
  const [fill, setFill] = useState(false);
  const fillRef = useRef(false);
  fillRef.current = fill;
  const pipRef = useRef<Window | null>(null);
  pipRef.current = pip;
  const focusOn = usePageFocus();
  useEffect(() => () => { try { pip?.close(); } catch { /* */ } }, [pip]);
  const popOut = async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window>; window?: Window | null } }).documentPictureInPicture;
    if (!dpip) { setPipMsg(tr("Pop-out needs Chrome or Edge (version 116 or newer).", "النافذة العائمة تحتاج كروم أو إيدج (116 أو أحدث).")); return; }
    try {
      if (dpip.window) { dpip.window.focus(); return; }
      const w = await dpip.requestWindow({ width: 1100, height: 740 });
      for (const el of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) w.document.head.appendChild(el.cloneNode(true));
      w.document.documentElement.className = document.documentElement.className.replace(/\bdark\b/, "");
      w.document.body.style.margin = "0";
      w.document.body.style.background = "#fff";
      w.document.title = tr("Whiteboard", "السبورة");
      w.addEventListener("pagehide", () => { setPip(null); setFill(false); });
      setPip(w); setPipMsg(""); setMin(false);
    } catch { setPipMsg(tr("The browser blocked the pop-out window.", "منع المتصفح النافذة العائمة.")); }
  };
  const hostDoc = () => pipRef.current?.document ?? document;
  const leaveFill = (keepFocusFs = false) => {
    setFill(false);
    document.documentElement.classList.remove("wb-board-fill");
    const pop = pipRef.current;
    if (pop?.document.fullscreenElement) pop.document.exitFullscreen?.().catch(() => undefined);
    if (keepFocusFs || document.documentElement.classList.contains("page-focus")) return;
    if (document.fullscreenElement) exitFullscreen();
  };
  const goFill = () => {
    if (fill) { leaveFill(true); return; }
    setMin(false);
    setFill(true);
    if (!pip) document.documentElement.classList.add("wb-board-fill");
    const d = hostDoc();
    const root = d.documentElement;
    if (d.fullscreenEnabled) root.requestFullscreen?.().catch(() => undefined);
    else if (!pip) enterFullscreen();
  };
  const goFocus = () => {
    const next = !focusOn;
    setPageFocus(next);
    setMin(false);
    if (next) {
      enterFullscreen();
      const d = pip?.document;
      if (d?.fullscreenEnabled) d.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      exitFullscreen();
      if (pip?.document.fullscreenElement) pip.document.exitFullscreen?.().catch(() => undefined);
    }
  };
  useEffect(() => {
    if (!fill && !focusOn) return;
    const d = hostDoc();
    const onFs = () => { if (!d.fullscreenElement && !document.fullscreenElement && fillRef.current) leaveFill(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fillRef.current) leaveFill();
    };
    d.addEventListener("fullscreenchange", onFs);
    document.addEventListener("fullscreenchange", onFs);
    d.addEventListener("keydown", onKey);
    if (d !== document) document.addEventListener("keydown", onKey);
    return () => {
      d.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("fullscreenchange", onFs);
      d.removeEventListener("keydown", onKey);
      if (d !== document) document.removeEventListener("keydown", onKey);
    };
  }, [fill, focusOn, pip]);
  useEffect(() => () => { document.documentElement.classList.remove("wb-board-fill"); }, []);
  const chip = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold text-[#f5c542] hover:bg-white/10";
  const bar = (
    <div className={`flex flex-wrap items-center gap-1 bg-[#1b3a57] px-3 py-1.5 text-white ${pip || min || fill ? "" : "rounded-t-2xl"}`} data-focus-keep data-testid="wb-chrome">
      <span className="min-w-0 flex-1 text-xs font-extrabold uppercase tracking-wider text-[#f5c542]">✏️ {tr("Whiteboard", "السبورة")}</span>
      <button type="button" className={chip} onClick={goFill} aria-pressed={fill} title={fill ? tr("Exit full screen (Esc)", "إنهاء ملء الشاشة (Esc)") : tr("Full screen — whiteboard fills the screen", "ملء الشاشة — السبورة تملأ الشاشة")} aria-label={fill ? tr("Exit full screen", "إنهاء ملء الشاشة") : tr("Full screen", "ملء الشاشة")} data-testid="wb-full">⛶ {fill ? tr("Exit full screen", "إنهاء ملء الشاشة") : tr("Full screen", "ملء الشاشة")}</button>
      <button type="button" className={chip} onClick={goFocus} aria-pressed={focusOn} title={tr("Focus — hide menus and bars", "وضع التركيز — إخفاء القوائم")} aria-label={focusOn ? tr("Exit Focus", "إنهاء التركيز") : tr("Focus", "تركيز")} data-testid="wb-focus">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>{focusOn ? tr("Exit Focus", "إنهاء التركيز") : tr("Focus", "تركيز")}
      </button>
      {(fill || focusOn) && <button type="button" className={chip + " ring-1 ring-[#f5c542]/60"} onClick={() => { if (fill) leaveFill(); if (focusOn) { setPageFocus(false); exitFullscreen(); if (pip?.document.fullscreenElement) pip.document.exitFullscreen?.().catch(() => undefined); } }} title={tr("Exit (Esc)", "خروج (Esc)")} aria-label={tr("Exit (Esc)", "خروج (Esc)")} data-testid="wb-fill-exit">✕ {tr("Exit", "خروج")}</button>}
      <button type="button" className="rounded-full px-1.5 text-sm" hidden={!!pip} onClick={() => setMin((v) => !v)} title={min ? tr("Restore whiteboard", "إظهار السبورة") : tr("Minimize whiteboard", "تصغير السبورة")} aria-label={min ? tr("Restore whiteboard", "إظهار السبورة") : tr("Minimize whiteboard", "تصغير السبورة")} data-testid="wb-min">{min ? "▢" : "▭"}</button>
      <button type="button" className="rounded-full px-1.5 text-sm" onClick={() => (pip ? pip.close() : popOut())} title={pip ? tr("Back to the page", "العودة إلى الصفحة") : tr("Pop out (stays on top)", "نافذة عائمة (فوق التطبيقات)")} aria-label={pip ? tr("Back to the page", "العودة إلى الصفحة") : tr("Pop out (stays on top)", "نافذة عائمة")} data-testid="wb-popout">{pip ? "↩" : "⧉"}</button>
    </div>
  );
  const filling = fill && !pip;
  const ui = (
    <WbFillCtx.Provider value={fill || !!pip}>
    <div className={`${pip || filling ? "relative flex h-full min-h-0 w-full flex-col bg-white dark:bg-[#0d1b2a]" : "overflow-hidden rounded-3xl ring-1 ring-black/10 dark:ring-white/15"} ${filling ? "fixed inset-0 z-[2400] h-dvh w-dvw rounded-none" : ""} ${pip ? "h-screen w-screen" : ""}`} data-wb-fill={fill || undefined} data-testid="wb-frame">
      {bar}
      {pipMsg && !pip && <p className="bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900" role="status" data-testid="wb-pip-msg">{pipMsg}</p>}
      {!min && <div className={pip || filling ? "flex min-h-0 flex-1 flex-col overflow-hidden p-2" : "p-1"}>{children}</div>}
    </div>
    </WbFillCtx.Provider>
  );
  if (pip) return <>{createPortal(ui, pip.document.body)}<button type="button" onClick={() => pip.close()} className="rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-extrabold text-[#f5c542] shadow-lg" data-testid="wb-pip-placeholder">⧉ {tr("Whiteboard is in the pop-out window — tap to bring back", "السبورة في النافذة العائمة — اضغط لإرجاعها")}</button></>;
  return ui;
}

export function WhiteboardHost({ code, hostKey, state, reload }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const o = state.settings.options;
  const writers = writersOf(o);
  const allOn = o.draw === true;
  const active = state.participants.filter((p) => !p.removed);
  const grant = (pid: string) => {
    if (allOn) return;
    saveOptions(code, hostKey, state, { writers: [...new Set([...writers, pid])] }).then(reload);
  };
  const revoke = (pid: string) => {
    if (allOn) saveOptions(code, hostKey, state, { draw: false, writers: active.filter((p) => p.id !== pid).map((p) => p.id) }).then(reload);
    else saveOptions(code, hostKey, state, { writers: writers.filter((id) => id !== pid) }).then(reload);
  };
  const allowAll = () => saveOptions(code, hostKey, state, { draw: true, writers: [] }).then(reload);
  const revokeAll = () => saveOptions(code, hostKey, state, { draw: false, writers: [] }).then(reload);
  return (
    <div className="space-y-3">
      <WbChrome>
      <Board code={code} who={{ hostKey }} state={state} reload={reload} canDraw isHost />
      </WbChrome>
      <div className="flex flex-wrap items-center gap-2" data-focus-keep data-testid="wb-access">
        <button type="button" className={hostChip(allOn)} onClick={allowAll} data-testid="wb-draw">🖐️ {tr("Everyone can write", "الجميع يمكنهم الكتابة")}</button>
        <button type="button" className={hostChip(!allOn && writers.length === 0)} onClick={revokeAll} data-testid="wb-draw-none">🚫 {tr("Take access back from all", "سحب الإذن من الجميع")}</button>
        <button type="button" className={hostChip(o.labels !== false)} onClick={() => saveOptions(code, hostKey, state, { labels: o.labels === false }).then(reload)}>🏷️ {tr("Names on the board", "الأسماء على السبورة")}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="wb-writers">
        <span className="text-sm font-bold">{tr("Let a student write:", "اسمح لطالب بالكتابة:")}</span>
        {active.length === 0 ? <span className="text-sm opacity-70">{tr("Students appear here after they join — tap a name to give or take write access.", "يظهر الطلاب هنا بعد انضمامهم — اضغط على اسم لإعطاء إذن الكتابة أو سحبه.")}</span> : active.map((p) => {
          const on = allOn || writers.includes(p.id);
          return <button key={p.id} type="button" className={hostChip(on)} onClick={() => on ? revoke(p.id) : grant(p.id)} data-testid={`wb-write-${p.id}`}>{on ? "✍️" : "👀"} {p.name}</button>;
        })}
      </div>
      <WbExtras code={code} title={state.title || ""} />
      <p className="text-xs opacity-70">{tr("Tip: writing follows your finger, stylus or smart-board pen. Add pages or change the pattern whenever you like. Save & print keeps the board as drawn.", "نصيحة: الكتابة تتبع إصبعك أو القلم أو السبورة الذكية. أضف صفحات أو غيّر النمط متى شئت. الحفظ والطباعة يبقيان السبورة كما رُسمت.")}</p>
    </div>
  );
}

export function WhiteboardOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{tr("Board pattern", "نمط السبورة")}</p>
      <div className="flex flex-wrap gap-1.5">
        {WB_BGS.map(([k, en, ar]) => <button key={k} type="button" className={hostChip(String(options.bg || "blank") === k)} onClick={() => setOptions({ ...options, bg: k })} data-testid={`wb-opt-${k}`}>{tr(en, ar)}</button>)}
      </div>
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={options.draw !== false} onChange={(e) => setOptions({ ...options, draw: e.target.checked, ...(e.target.checked ? { writers: [] } : {}) })} />{tr("Students can draw and write too", "يمكن للطلاب الرسم والكتابة أيضًا")}</label>
    </div>
  );
}

/** Share link, screen recording, colourful print with QR. */
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
    const svg = document.querySelector("[data-testid=wb-art]")?.outerHTML || "";
    const ink = document.querySelector("[data-testid=wb-ink]") as HTMLCanvasElement | null;
    const overlay = ink && ink.width ? `<img alt="" src="${ink.toDataURL("image/png")}" style="position:absolute;inset:0;width:100%;height:100%"/>` : "";
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${(title || "Whiteboard").replace(/</g, "")}</title><style>@page{size:A4 landscape;margin:8mm}body{margin:0;font-family:Nunito,Arial,sans-serif}.f{border:6px solid #1b3a57;border-radius:22px;padding:10px;background:linear-gradient(135deg,#fdf0c4,#fff,#dbe7f3)}.h{display:flex;align-items:center;gap:12px;margin-bottom:8px}.h b{flex:1;font-size:22px;color:#1b3a57}.c{position:relative;border-radius:14px;overflow:hidden;border:3px solid #f5c542}svg{width:100%;height:auto;display:block}</style></head><body><div class="f"><div class="h"><b>🖍️ ${(title || "Whiteboard").replace(/</g, "")}</b><span>${new Date().toLocaleDateString("en-GB")}</span>${qrSvg(link, 84)}</div><div class="c">${svg}${overlay}</div></div><script>setTimeout(()=>print(),400)<\\/script></body></html>`);
    w.document.close();
  };
  return <div className="flex flex-wrap items-center gap-2" data-focus-keep data-testid="wb-extras">
    <button type="button" className={hostChip(false)} onClick={share} data-testid="wb-share">🔗 {tr("Share link (students & teachers)", "رابط المشاركة (طلاب ومعلمون)")}</button>
    <button type="button" className={hostChip(!!rec)} onClick={record} data-testid="wb-rec">{rec ? "⏹ " + tr("Stop recording", "إيقاف التسجيل") : "🎥 " + tr("Record screen", "تسجيل الشاشة")}</button>
    <button type="button" className={hostChip(false)} onClick={print} data-testid="wb-print">🖨 {tr("Colour print + QR", "طباعة ملوّنة + QR")}</button>
    {msg && <span className="text-xs font-semibold opacity-80" role="status">{msg}</span>}
  </div>;
}
