/** t682: types + client-side photo shrink (EXIF orientation) for the Homework Correction System. */
export type HwPhoto = { id: string; w: number; h: number };
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
