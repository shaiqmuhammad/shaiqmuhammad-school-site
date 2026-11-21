/** Shared classroom shape kinds (keep in sync with src/lib/liveShapes.ts). */

export const LIVE_SHAPE_KINDS = [
  "rect", "circle", "line", "arrow", "triangle", "star", "hexagon",
  "table",
  "numberline", "axes", "angle", "fraction", "cube", "cylinder", "cone", "protractor", "ruler",
  "beaker", "flask", "testtube", "atom", "magnet", "battery", "resistor", "bulb", "switch", "cycle", "flow",
] as const;

export type LiveShapeKind = (typeof LIVE_SHAPE_KINDS)[number];

export type LiveShape = {
  id: string;
  kind: LiveShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
  by: string;
  rows?: number;
  cols?: number;
};

export const LIVE_SHAPE_KIND_SET = new Set<string>(LIVE_SHAPE_KINDS);

function str(v: unknown, n: number) {
  return String(v ?? "").trim().slice(0, n);
}

function clampGrid(n: unknown, fallback = 3) {
  const v = Math.trunc(Number(n) || fallback);
  return Math.max(1, Math.min(12, v));
}

export function normalizeLiveShape(x: LiveShape, fallbackId: string): LiveShape {
  const kind = LIVE_SHAPE_KIND_SET.has(String(x.kind)) ? x.kind as LiveShapeKind : "rect";
  const out: LiveShape = {
    id: str(x.id, 40) || fallbackId,
    kind,
    x: Math.max(0, Math.min(100, Number(x.x) || 0)),
    y: Math.max(0, Math.min(100, Number(x.y) || 0)),
    w: Math.max(0, Math.min(100, Number(x.w) || 0)),
    h: Math.max(0, Math.min(100, Number(x.h) || 0)),
    c: str(x.c, 20) || "#1b3a57",
    by: str(x.by, 40),
  };
  if (kind === "table" || kind === "fraction") {
    out.rows = clampGrid(x.rows, kind === "fraction" ? 4 : 3);
    out.cols = clampGrid(x.cols, kind === "fraction" ? 1 : 3);
  }
  return out;
}

export function normalizeLiveShapes(list: LiveShape[], newId: () => string): LiveShape[] {
  return list.slice(-80).map((x) => normalizeLiveShape(x, newId()));
}
