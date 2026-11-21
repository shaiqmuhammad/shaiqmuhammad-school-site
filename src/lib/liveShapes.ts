/** Shared classroom shape kinds (stage drawings, synced through the room). */

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

export function asLiveShapeKind(v: unknown): LiveShapeKind {
  const s = String(v || "");
  return LIVE_SHAPE_KIND_SET.has(s) ? s as LiveShapeKind : "rect";
}

export function clampGrid(n: unknown, fallback = 3) {
  const v = Math.trunc(Number(n) || fallback);
  return Math.max(1, Math.min(12, v));
}
