/** Caps and checks for live recordings and Library PPT/PDF uploads. Keep R2 use inside the free tier. */

export const MAX_UPLOAD_SLIDES = 40;
export const MAX_REC_BYTES = 200 * 1024 * 1024;
export const MAX_REC_CHUNK = 1_500_000;
export const MAX_REC_PARTS = 200;
export const REC_EXPIRE_DAYS = 60;

export function uploadFileKind(name: string, type = ""): "pptx" | "pdf" | "ppt" | "" {
  const n = String(name || "").trim().toLowerCase();
  const t = String(type || "").toLowerCase();
  if (n.endsWith(".pptx") || t.includes("presentationml.presentation")) return "pptx";
  if (n.endsWith(".pdf") || t === "application/pdf") return "pdf";
  if (n.endsWith(".ppt") || t === "application/vnd.ms-powerpoint") return "ppt";
  return "";
}

export function recOverCap(used: number, incoming: number, cap = MAX_REC_BYTES): boolean {
  return Math.max(0, Number(used) || 0) + Math.max(0, Number(incoming) || 0) > cap;
}

type SlideEl = { id: string; t: string; src?: string; text?: string; [k: string]: unknown };
export type LiveUploadSlide = { id: string; bg: string; els: SlideEl[] };

export function normalizeUploadSlides(raw: unknown, cap = MAX_UPLOAD_SLIDES): LiveUploadSlide[] {
  if (!Array.isArray(raw)) return [];
  const out: LiveUploadSlide[] = [];
  for (const s of raw.slice(0, cap)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const id = String(o.id || "").trim().slice(0, 40) || `s${out.length}`;
    const els: SlideEl[] = [];
    if (Array.isArray(o.els)) {
      for (const e of o.els.slice(0, 40)) {
        if (!e || typeof e !== "object") continue;
        const el = e as Record<string, unknown>;
        const eid = String(el.id || "").trim().slice(0, 40);
        const t = String(el.t || "").trim().slice(0, 12);
        if (!eid || !t) continue;
        const clean: SlideEl = {
          id: eid,
          t,
          x: Number(el.x) || 0,
          y: Number(el.y) || 0,
          w: Number(el.w) || 0,
          h: Number(el.h) || 0,
        };
        if (typeof el.src === "string") clean.src = el.src.slice(0, 80);
        if (typeof el.text === "string") clean.text = el.text.slice(0, 2000);
        if (typeof el.html === "string") clean.html = el.html.slice(0, 4000);
        if (typeof el.color === "string") clean.color = el.color.slice(0, 40);
        if (typeof el.bg === "string") clean.bg = el.bg.slice(0, 40);
        if (typeof el.font === "string") clean.font = el.font.slice(0, 80);
        if (typeof el.size === "number") clean.size = el.size;
        if (el.bold === true) clean.bold = true;
        if (el.italic === true) clean.italic = true;
        if (el.align === "start" || el.align === "center" || el.align === "end") clean.align = el.align;
        if (typeof el.rot === "number") clean.rot = el.rot;
        els.push(clean);
      }
    }
    out.push({ id, bg: String(o.bg || "#ffffff").slice(0, 40), els });
  }
  return out;
}
