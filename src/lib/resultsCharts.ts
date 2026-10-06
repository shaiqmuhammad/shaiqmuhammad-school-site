import type { ResultRow } from "@/lib/groupSession";
import type { Quiz } from "@/lib/quiz";

/** Class-results charts as plain SVG strings: shown on screen and reused for Excel / PowerPoint / PDF downloads. */

export type QuestionStat = { index: number; prompt: string; correct: number; wrong: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const FONT = "Arial, 'Noto Sans Arabic', Tahoma, sans-serif";

export function classAverage(rows: ResultRow[]): number {
  return rows.length ? Math.round((rows.reduce((a, r) => a + r.percentage, 0) / rows.length) * 10) / 10 : 0;
}

/** Correct vs wrong (wrong includes unanswered) for every question, from the teacher's per-question detail. */
export function questionStats(rows: ResultRow[], quiz?: Quiz): QuestionStat[] {
  if (!quiz) return [];
  return quiz.questions.map((q, index) => {
    let correct = 0;
    let wrong = 0;
    for (const r of rows) {
      const d = r.details?.find((x) => x.questionId === q.id);
      if (!d) continue;
      if (d.isCorrect) correct++;
      else wrong++;
    }
    return { index, prompt: q.prompt, correct, wrong };
  });
}

/** Horizontal bar per student (percentage) with a dashed class-average line. */
export function barChartSvg(items: { label: string; value: number }[], average: number, opts: { text?: string; title?: string; avgLabel?: string } = {}): string {
  const text = opts.text ?? "#0f172a";
  const W = 820;
  const left = 190;
  const right = 60;
  const top = opts.title ? 54 : 24;
  const rowH = 30;
  const H = top + Math.max(1, items.length) * rowH + 40;
  const plot = W - left - right;
  const x = (v: number) => left + (Math.max(0, Math.min(100, v)) / 100) * plot;
  const parts: string[] = [];
  if (opts.title) parts.push(`<text x="${left}" y="30" font-size="18" font-weight="700" fill="${text}">${esc(opts.title)}</text>`);
  for (const t of [0, 25, 50, 75, 100]) {
    parts.push(`<line x1="${x(t)}" y1="${top - 6}" x2="${x(t)}" y2="${H - 30}" stroke="${text}" stroke-opacity="0.12"/>`);
    parts.push(`<text x="${x(t)}" y="${H - 12}" font-size="12" text-anchor="middle" fill="${text}" fill-opacity="0.7">${t}%</text>`);
  }
  items.forEach((it, i) => {
    const y = top + i * rowH;
    const color = it.value >= 80 ? "#059669" : it.value >= 50 ? "#0d9488" : "#e11d48";
    parts.push(`<text x="${left - 10}" y="${y + 19}" font-size="14" text-anchor="end" fill="${text}">${esc(cut(it.label, 24))}</text>`);
    parts.push(`<rect x="${left}" y="${y + 5}" width="${Math.max(2, x(it.value) - left)}" height="${rowH - 10}" rx="5" fill="${color}"/>`);
    parts.push(`<text x="${x(it.value) + 6}" y="${y + 19}" font-size="13" font-weight="700" fill="${text}">${it.value}%</text>`);
  });
  const ax = x(average);
  parts.push(`<line x1="${ax}" y1="${top - 10}" x2="${ax}" y2="${H - 30}" stroke="#f59e0b" stroke-width="3" stroke-dasharray="7 5"/>`);
  parts.push(`<text x="${Math.min(ax + 6, W - 150)}" y="${top - 12}" font-size="13" font-weight="700" fill="#b45309">${esc(opts.avgLabel ?? "Class average")} ${average}%</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">${parts.join("")}</svg>`;
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => [cx + r * Math.sin(a * 2 * Math.PI), cy - r * Math.cos(a * 2 * Math.PI)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** One donut per question (green = correct, red = wrong or unanswered), in a grid. */
export function donutGridSvg(stats: QuestionStat[], opts: { text?: string; cols?: number; qLabel?: string; legend?: [string, string] } = {}): string {
  const text = opts.text ?? "#0f172a";
  const cols = Math.max(1, Math.min(opts.cols ?? 5, stats.length || 1));
  const cell = 160;
  const rows = Math.max(1, Math.ceil(stats.length / cols));
  const W = cols * cell;
  const H = rows * cell + 34;
  const parts: string[] = [];
  const [lc, lw] = opts.legend ?? ["Correct", "Wrong"];
  parts.push(`<rect x="8" y="10" width="14" height="14" rx="3" fill="#10b981"/><text x="28" y="22" font-size="13" fill="${text}">${esc(lc)}</text>`);
  parts.push(`<rect x="120" y="10" width="14" height="14" rx="3" fill="#f43f5e"/><text x="140" y="22" font-size="13" fill="${text}">${esc(lw)}</text>`);
  stats.forEach((s, i) => {
    const cx = (i % cols) * cell + cell / 2;
    const cy = 34 + Math.floor(i / cols) * cell + 64;
    const total = s.correct + s.wrong;
    const share = total ? s.correct / total : 0;
    const r = 46;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${total ? "#f43f5e" : "#cbd5e1"}" stroke-width="18"/>`);
    if (share >= 0.999) parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#10b981" stroke-width="18"/>`);
    else if (share > 0) parts.push(`<path d="${arc(cx, cy, r, 0, share)}" fill="none" stroke="#10b981" stroke-width="18"/>`);
    parts.push(`<text x="${cx}" y="${cy - 2}" font-size="15" font-weight="700" text-anchor="middle" fill="${text}">${esc(opts.qLabel ?? "Q")}${s.index + 1}</text>`);
    parts.push(`<text x="${cx}" y="${cy + 16}" font-size="13" text-anchor="middle" fill="${text}">${total ? Math.round(share * 100) : 0}%</text>`);
    parts.push(`<text x="${cx}" y="${cy + r + 30}" font-size="12" text-anchor="middle" fill="${text}" fill-opacity="0.75">✓ ${s.correct}   ✗ ${s.wrong}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">${parts.join("")}</svg>`;
}

/** SVG markup → PNG data URL (white background) for Excel / PowerPoint / PDF. */
export async function svgToPngDataUrl(svg: string, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 400;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h };
}
