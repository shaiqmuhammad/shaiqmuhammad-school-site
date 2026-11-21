/** t682: types + client-side photo shrink (EXIF orientation) for the Homework Correction System. */
export type HwPhoto = { id: string; w: number; h: number; kind?: "photo" | "render" };

/** Raster pages of typed / slide work (not the student's camera photos). */
export function isWorkPage(p: { id: string; kind?: string }): boolean {
  return p.kind === "render" || p.id.startsWith("wr_");
}

/** Stable blob id for a rendered work page (unique across submissions). */
export function workPageId(subId: string, slot: string): string {
  return (`wr_${subId}_${slot}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}
export type HwStroke = { c: string; w: number; d: number[]; tool: "pen" | "hi" };
export type HwText = { id: string; x: number; y: number; text: string; c: string; size: number };
export type HwStamp = { id: string; x: number; y: number; code: string; en: string; ar: string; color: string };
export type HwPage = { strokes: HwStroke[]; texts: HwText[]; stamps: HwStamp[] };
export type HwAnnot = { pages: Record<string, HwPage>; next: string[]; done?: boolean; at?: number; by?: string };
export type CorrCode = { id: string; en: string; ar: string; color: string };

export const emptyPage = (): HwPage => ({ strokes: [], texts: [], stamps: [] });
export const emptyAnnot = (): HwAnnot => ({ pages: {}, next: [] });

export const DEFAULT_CODES: CorrCode[] = [
  { id: "ok", en: "Great", ar: "رائع", color: "#059669" },
  { id: "star", en: "Excellent", ar: "ممتاز", color: "#d97706" },
  { id: "sa", en: "SA", ar: "تقييم ذاتي", color: "#0d9488" },
  { id: "pa", en: "PA", ar: "تقييم الأقران", color: "#7c3aed" },
  { id: "sp", en: "Spelling", ar: "إملاء", color: "#e11d48" },
  { id: "p", en: "Punctuation", ar: "ترقيم", color: "#ea580c" },
  { id: "c", en: "Capital letter", ar: "حرف كبير", color: "#0284c7" },
  { id: "gr", en: "Grammar", ar: "نحو", color: "#7c3aed" },
  { id: "chk", en: "Please check", ar: "راجع", color: "#ca8a04" },
  { id: "nw", en: "Neater writing", ar: "خط أوضح", color: "#0f766e" },
];

export const NEXT_STEPS: { g: "up" | "next"; en: string; ar: string }[] = [
  { g: "up", en: "MashaAllah, beautiful work!", ar: "ما شاء الله، عمل جميل!" },
  { g: "up", en: "I can see you tried hard — well done.", ar: "أرى أنك اجتهدت — أحسنت." },
  { g: "up", en: "Your handwriting is clear and neat.", ar: "خطك واضح ومرتب." },
  { g: "up", en: "Excellent effort. Keep it up!", ar: "جهد ممتاز. استمر!" },
  { g: "up", en: "I like how carefully you presented this.", ar: "أعجبني حرصك في عرض هذا العمل." },
  { g: "next", en: "Please check the highlighted parts and try again.", ar: "راجع الأجزاء المظللّة وحاول مجددًا." },
  { g: "next", en: "Write the correction neatly next to the mark.", ar: "اكتب التصحيح بجانب العلامة بخط واضح." },
  { g: "next", en: "Remember full stops and capital letters.", ar: "تذكّر النقطة والحرف الكبير." },
  { g: "next", en: "Read the question again carefully.", ar: "اقرأ السؤال مرة أخرى بتمعّن." },
  { g: "next", en: "Show your working clearly.", ar: "أظهر خطوات الحل بوضوح." },
  { g: "next", en: "Check spelling in the words I marked.", ar: "راجع إملاء الكلمات التي حدّدتها." },
];

const MAX_EDGE = 1920;
const MAX_DATA = 1_200_000; // ~900 KB JPEG; stays under the 1.6 MB upload cap

/** Decode a phone photo honouring EXIF orientation so portrait/landscape matches how it was taken. */
export async function decodePhoto(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions); } catch { /* Safari / HEIC fallback */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("decode")); img.src = url; });
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 4000); }
}

/** Resize + JPEG-compress in the browser. Returns a binary blob plus the oriented pixel size. */
export async function shrinkHwPhoto(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await decodePhoto(file);
  let max = MAX_EDGE;
  for (let pass = 0; pass < 4; pass++, max = Math.round(max * 0.75)) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.84, 0.72, 0.6, 0.48]) {
      const u = c.toDataURL("image/jpeg", q);
      if (u.startsWith("data:image/jpeg") && u.length <= MAX_DATA) {
        const bin = atob(u.split(",")[1] || "");
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { blob: new Blob([bytes], { type: "image/jpeg" }), w: c.width, h: c.height };
      }
    }
  }
  throw new Error("too_big");
}

export function pageOf(annot: HwAnnot | null | undefined, id: string): HwPage {
  return annot?.pages?.[id] || emptyPage();
}


/** JPEG-compress a canvas so it stays under the homework photo upload cap. */
export async function jpegFromCanvas(c: HTMLCanvasElement): Promise<{ blob: Blob; w: number; h: number }> {
  for (const q of [0.84, 0.72, 0.6, 0.48, 0.36]) {
    const u = c.toDataURL("image/jpeg", q);
    if (u.startsWith("data:image/jpeg") && u.length <= MAX_DATA) {
      const bin = atob(u.split(",")[1] || "");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { blob: new Blob([bytes], { type: "image/jpeg" }), w: c.width, h: c.height };
    }
  }
  throw new Error("too_big");
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const raw = (text || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const para of raw) {
    const words = para.length ? para.split(/(\s+)/) : [""];
    let line = "";
    for (const w of words) {
      const next = line + w;
      if (ctx.measureText(next).width <= maxW || !line) line = next;
      else { out.push(line); line = w.trimStart(); if (out.length >= maxLines) return out; }
    }
    out.push(line);
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}

/** Paint a portrait A4-like page of a question, typed answer, or a simple homework slide. */
export async function paintWorkPage(opts: {
  title: string;
  kicker?: string;
  question?: string;
  body?: string;
  image?: string;
  audioNote?: boolean;
}): Promise<{ blob: Blob; w: number; h: number }> {
  const W = 1240, H = 1754, pad = 64;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6f3ea";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1b3a57";
  ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = "#f5c542";
  ctx.fillRect(0, 110, W, 8);
  const ar = /[\u0600-\u06FF]/.test((opts.title || "") + (opts.question || "") + (opts.body || "") + (opts.kicker || ""));
  ctx.fillStyle = "#f5c542";
  ctx.font = "800 28px Nunito, Tajawal, Arial, sans-serif";
  ctx.textAlign = ar ? "right" : "left";
  ctx.textBaseline = "middle";
  const titleX = ar ? W - pad : pad;
  ctx.fillText((opts.title || "Homework").slice(0, 80), titleX, 48, W - pad * 2);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 20px Nunito, Tajawal, Arial, sans-serif";
  ctx.fillText((opts.kicker || "Student work").slice(0, 60), titleX, 84, W - pad * 2);
  let y = 150;
  const maxW = W - pad * 2;
  const textX = ar ? W - pad : pad;
  ctx.textAlign = ar ? "right" : "left";
  if (opts.question) {
    ctx.fillStyle = "#1b3a57";
    ctx.font = "700 28px Nunito, Tajawal, Arial, sans-serif";
    for (const line of wrapLines(ctx, opts.question, maxW, 8)) {
      ctx.fillText(line, textX, y + 28, maxW);
      y += 40;
    }
    y += 12;
  }
  if (opts.image) {
    const img = await loadImg(opts.image);
    if (img && img.naturalWidth) {
      const boxW = maxW, boxH = Math.min(620, H - y - 220);
      const k = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
      const dw = Math.round(img.naturalWidth * k), dh = Math.round(img.naturalHeight * k);
      const dx = ar ? W - pad - dw : pad;
      ctx.fillStyle = "#fff";
      ctx.fillRect(dx, y, dw, dh);
      ctx.drawImage(img, dx, y, dw, dh);
      y += dh + 24;
    }
  }
  if (opts.body) {
    ctx.fillStyle = "#ffffff";
    const boxH = Math.max(280, H - y - pad - (opts.audioNote ? 80 : 0));
    roundRect(ctx, pad, y, maxW, boxH, 24);
    ctx.fill();
    ctx.strokeStyle = "#d6c9a8";
    ctx.lineWidth = 3;
    ctx.stroke();
    y += 28;
    ctx.fillStyle = "#0f172a";
    ctx.font = "500 28px Nunito, Tajawal, Arial, sans-serif";
    const lines = wrapLines(ctx, opts.body, maxW - 48, Math.floor((boxH - 48) / 40));
    const bx = ar ? W - pad - 24 : pad + 24;
    for (const line of lines) {
      ctx.fillText(line, bx, y + 24, maxW - 48);
      y += 40;
    }
  } else if (opts.audioNote) {
    ctx.fillStyle = "#1b3a57";
    ctx.font = "700 32px Nunito, Tajawal, Arial, sans-serif";
    ctx.fillText(ar ? "تم تسليم إجابة صوتية" : "A voice answer was submitted", textX, y + 40, maxW);
  }
  return jpegFromCanvas(c);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
