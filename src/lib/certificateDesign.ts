"use client";

import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { loadCertificateTemplate, type CertificateTemplate } from "@/lib/quiz";

/** Named certificate designs kept on the server (Worker SiteKV). The PDF is drawn on a canvas from a design. */
export type CertLayout = "classic" | "modern" | "elegant" | "banner";
export type CertBorder = "single" | "double" | "thick" | "dashed" | "ornate" | "none";
export type CertLabelLang = "en" | "ar" | "both";

export type CertDesign = {
  id: string;
  name: string;
  layout: CertLayout;
  borderStyle: CertBorder;
  bgColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  titleFont: string;
  bodyFont: string;
  titleFontAr: string;
  bodyFontAr: string;
  labelLang: CertLabelLang;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  schoolName: string;
  footerText: string;
  showPosition: boolean;
  showSignature: boolean;
  signatureName: string;
  signatureTitle: string;
  /** Small logo above the title (data URL or URL). */
  logoUrl: string;
  /** Large faint background watermark. opacity 0–100 (%), size = % of the page height. */
  watermark: { src: string; opacity: number; size: number };
};

export type CertCollection = { designs: CertDesign[]; defaultId: string; assign: Record<string, { individual?: string; group?: string }> };

type FontDef = { label: string; family: string; file: string; weight: string; style?: string };
export const LATIN_FONTS: Record<string, FontDef> = {
  nunito: { label: "Nunito (clean)", family: "Nunito", file: "nunito.woff2", weight: "600 800" },
  playfair: { label: "Playfair Display (elegant serif)", family: "Playfair Display", file: "playfair-700.woff2", weight: "700" },
  lora: { label: "Lora (book serif)", family: "Lora", file: "lora.woff2", weight: "500 700" },
  vibes: { label: "Great Vibes (script)", family: "Great Vibes", file: "vibes-400.woff2", weight: "400" },
};
export const ARABIC_FONTS: Record<string, FontDef> = {
  cairo: { label: "Cairo (modern)", family: "Cairo", file: "cairo.woff2", weight: "600 800" },
  amiri: { label: "Amiri (classic Naskh)", family: "Amiri", file: "amiri-700.woff2", weight: "700" },
  naskh: { label: "Noto Naskh (readable)", family: "Noto Naskh Arabic", file: "naskh.woff2", weight: "500 700" },
  ruqaa: { label: "Aref Ruqaa (calligraphic)", family: "Aref Ruqaa", file: "ruqaa-700.woff2", weight: "700" },
};
export const LAYOUT_LABELS: Record<CertLayout, string> = { classic: "Classic (centred)", modern: "Modern (side band)", elegant: "Elegant (ornate corners)", banner: "Banner (coloured header)" };
export const BORDER_LABELS: Record<CertBorder, string> = { single: "Single line", double: "Double line", thick: "Thick + thin", dashed: "Dashed", ornate: "Ornate corners", none: "No border" };

export const DEFAULT_DESIGN: CertDesign = {
  id: "classic",
  name: "Classic (default)",
  layout: "classic",
  borderStyle: "double",
  bgColor: "#fffdf7",
  borderColor: "#0f766e",
  textColor: "#1f2937",
  accentColor: "#b8860b",
  titleFont: "playfair",
  bodyFont: "nunito",
  titleFontAr: "amiri",
  bodyFontAr: "cairo",
  labelLang: "en",
  title: "Certificate of Achievement",
  titleAr: "شهادة تقدير",
  subtitle: "This certifies successful completion of the assessment",
  subtitleAr: "تشهد هذه الشهادة بإتمام التقييم بنجاح",
  schoolName: "Shaiq Muhammad Learning Platform",
  footerText: "",
  showPosition: true,
  showSignature: false,
  signatureName: "",
  signatureTitle: "Islamic Studies Teacher",
  logoUrl: "",
  watermark: { src: "", opacity: 12, size: 70 },
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const col = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : d);
const s = (v: unknown, d: string, n = 300) => (typeof v === "string" ? v.slice(0, n) : d);

export function normalizeDesign(raw: Partial<CertDesign> | null | undefined, fallbackId = "design"): CertDesign {
  const d = DEFAULT_DESIGN;
  const w = (raw?.watermark || {}) as Partial<CertDesign["watermark"]>;
  return {
    id: s(raw?.id, fallbackId, 60) || fallbackId,
    name: s(raw?.name, "Untitled design", 60).trim() || "Untitled design",
    layout: pick(raw?.layout, ["classic", "modern", "elegant", "banner"] as const, d.layout),
    borderStyle: pick(raw?.borderStyle, ["single", "double", "thick", "dashed", "ornate", "none"] as const, d.borderStyle),
    bgColor: col(raw?.bgColor, d.bgColor),
    borderColor: col(raw?.borderColor, d.borderColor),
    textColor: col(raw?.textColor, d.textColor),
    accentColor: col(raw?.accentColor, d.accentColor),
    titleFont: raw?.titleFont && raw.titleFont in LATIN_FONTS ? raw.titleFont : d.titleFont,
    bodyFont: raw?.bodyFont && raw.bodyFont in LATIN_FONTS ? raw.bodyFont : d.bodyFont,
    titleFontAr: raw?.titleFontAr && raw.titleFontAr in ARABIC_FONTS ? raw.titleFontAr : d.titleFontAr,
    bodyFontAr: raw?.bodyFontAr && raw.bodyFontAr in ARABIC_FONTS ? raw.bodyFontAr : d.bodyFontAr,
    labelLang: pick(raw?.labelLang, ["en", "ar", "both"] as const, d.labelLang),
    title: s(raw?.title, d.title, 120),
    titleAr: s(raw?.titleAr, d.titleAr, 120),
    subtitle: s(raw?.subtitle, d.subtitle, 300),
    subtitleAr: s(raw?.subtitleAr, d.subtitleAr, 300),
    schoolName: s(raw?.schoolName, d.schoolName, 120),
    footerText: s(raw?.footerText, "", 200),
    showPosition: raw?.showPosition !== false,
    showSignature: raw?.showSignature === true,
    signatureName: s(raw?.signatureName, "", 80),
    signatureTitle: s(raw?.signatureTitle, d.signatureTitle, 80),
    logoUrl: s(raw?.logoUrl, "", 700_000),
    watermark: {
      src: s(w.src, "", 900_000),
      opacity: Math.max(0, Math.min(100, Number(w.opacity ?? d.watermark.opacity))),
      size: Math.max(10, Math.min(150, Number(w.size ?? d.watermark.size))),
    },
  };
}

export function designFromLegacy(t: CertificateTemplate): CertDesign {
  return normalizeDesign({ ...DEFAULT_DESIGN, id: "classic", name: "Classic (default)", title: t.title, subtitle: t.subtitle, schoolName: t.schoolName, borderColor: t.borderColor, footerText: t.footerText, logoUrl: t.logoUrl, showPosition: t.showPosition });
}

// ---------- server collection ----------
const API = `${ASSESSMENT_API_BASE}/api/cert`;
let cache: { at: number; p: Promise<CertCollection> } | null = null;

export async function loadCertCollection(force = false): Promise<CertCollection> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.p;
  const p = (async () => {
    let raw: Partial<CertCollection> | null = null;
    try {
      const r = await fetch(`${API}/designs`, { cache: "no-store" });
      if (r.ok) raw = (await r.json()) as Partial<CertCollection>;
    } catch { /* offline: fall back below */ }
    let designs = (Array.isArray(raw?.designs) ? raw!.designs! : []).map((d, i) => normalizeDesign(d, `design-${i}`));
    if (!designs.length) designs = [designFromLegacy(await loadCertificateTemplate().catch(() => ({ title: "", subtitle: "", schoolName: "", borderColor: "", footerText: "", logoUrl: "", showPosition: true })))];
    const defaultId = designs.some((d) => d.id === raw?.defaultId) ? String(raw?.defaultId) : designs[0].id;
    return { designs, defaultId, assign: raw?.assign && typeof raw.assign === "object" ? raw.assign : {} } as CertCollection;
  })();
  cache = { at: Date.now(), p };
  return p;
}

export async function saveCertCollection(c: CertCollection): Promise<{ ok: boolean; error?: string }> {
  const session = getServerSession();
  if (!session) return { ok: false, error: "Not signed in for publishing on this device. Sign out and sign in again." };
  try {
    const r = await fetch(`${API}/admin/save`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify(c) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return { ok: false, error: r.status === 413 ? "Too large — use smaller logo/watermark images." : j.error || `Server error ${r.status}` };
    cache = null;
    return { ok: true };
  } catch {
    return { ok: false, error: "Can't reach the server." };
  }
}

export function designFor(c: CertCollection, quizId: string | undefined, kind: "individual" | "group"): CertDesign {
  const id = (quizId && c.assign[quizId]?.[kind]) || c.defaultId;
  return c.designs.find((d) => d.id === id) || c.designs.find((d) => d.id === c.defaultId) || c.designs[0];
}

// ---------- rendering ----------
const loadedFonts = new Set<string>();
async function ensureFont(def: FontDef) {
  const key = def.family + def.weight;
  if (loadedFonts.has(key) || typeof document === "undefined") return;
  loadedFonts.add(key);
  try {
    const face = new FontFace(def.family, `url(/uploads/certfonts/${def.file}) format("woff2")`, { weight: def.weight, style: "normal" });
    document.fonts.add(await face.load());
  } catch { loadedFonts.delete(key); }
}
export async function ensureDesignFonts(d: CertDesign) {
  await Promise.all([LATIN_FONTS[d.titleFont], LATIN_FONTS[d.bodyFont], ARABIC_FONTS[d.titleFontAr], ARABIC_FONTS[d.bodyFontAr]].map((f) => f && ensureFont(f)));
}

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const t = setTimeout(() => resolve(null), 6000);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = src;
    });
    if (imgCache.size > 12) imgCache.clear();
    imgCache.set(src, p);
  }
  return p;
}

export type CertData = { name: string; quizTitle: string; score: number; maxScore: number; percentage: number; finishedAt: string; positionLabel?: string };
export const PAGE_W = 842;
export const PAGE_H = 595;
const AR = /[\u0600-\u06FF]/;

const LBL = {
  assessment: ["Assessment", "التقييم"],
  marks: ["Marks obtained", "الدرجة المحصّلة"],
  position: ["Position", "الترتيب"],
  date: ["Date", "التاريخ"],
} as const;

/** Draw the certificate into `canvas` (sized PAGE_W×PAGE_H at `scale`). Fonts are loaded first. */
export async function renderCertificate(canvas: HTMLCanvasElement, d: CertDesign, data: CertData, scale = 2): Promise<void> {
  await ensureDesignFonts(d);
  const [logo, wm] = await Promise.all([loadImg(d.logoUrl), loadImg(d.watermark.src)]);
  canvas.width = Math.round(PAGE_W * scale);
  canvas.height = Math.round(PAGE_H * scale);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.fillStyle = d.bgColor;
  g.fillRect(0, 0, PAGE_W, PAGE_H);

  // watermark (centred, behind everything)
  if (wm && d.watermark.opacity > 0) {
    const h = (PAGE_H * d.watermark.size) / 100;
    const w = (wm.naturalWidth / wm.naturalHeight) * h;
    g.save();
    g.globalAlpha = d.watermark.opacity / 100;
    g.drawImage(wm, PAGE_W / 2 - w / 2, PAGE_H / 2 - h / 2, w, h);
    g.restore();
  }

  const latT = LATIN_FONTS[d.titleFont].family, latB = LATIN_FONTS[d.bodyFont].family;
  const arT = ARABIC_FONTS[d.titleFontAr].family, arB = ARABIC_FONTS[d.bodyFontAr].family;
  const titleStack = `"${latT}","${arT}",serif`;
  const bodyStack = `"${latB}","${arB}",sans-serif`;
  const arTitleStack = `"${arT}","${latT}",serif`;
  const arBodyStack = `"${arB}","${latB}",sans-serif`;

  // layout geometry: content centre x and top offset
  const bandW = d.layout === "modern" ? 130 : 0;
  const bannerH = d.layout === "banner" ? 104 : 0;
  const cx = bandW + (PAGE_W - bandW) / 2;
  const M = 26;

  // layout decorations
  if (d.layout === "modern") {
    g.fillStyle = d.borderColor;
    g.fillRect(0, 0, bandW, PAGE_H);
    g.fillStyle = d.accentColor;
    g.fillRect(bandW, 0, 6, PAGE_H);
    g.fillStyle = "rgba(255,255,255,.14)";
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(bandW / 2, 90 + i * 100, 26, 0, Math.PI * 2); g.fill(); }
  }
  if (d.layout === "banner") {
    g.fillStyle = d.borderColor;
    g.fillRect(0, 0, PAGE_W, bannerH);
    g.fillStyle = d.accentColor;
    g.fillRect(0, bannerH, PAGE_W, 5);
  }

  // border
  const rectB = (inset: number, w: number, color: string, dash: number[] = []) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash);
    g.strokeRect(inset, inset, PAGE_W - inset * 2, PAGE_H - inset * 2); g.restore();
  };
  const bc = d.borderColor;
  if (d.borderStyle === "single") rectB(M, 3, bc);
  else if (d.borderStyle === "double") { rectB(M - 4, 4, bc); rectB(M + 8, 1.5, bc); }
  else if (d.borderStyle === "thick") { rectB(M - 6, 10, bc); rectB(M + 10, 1.5, d.accentColor); }
  else if (d.borderStyle === "dashed") rectB(M, 3, bc, [12, 7]);
  else if (d.borderStyle === "ornate") rectB(M, 2.5, bc);
  if (d.borderStyle === "ornate" || d.layout === "elegant") {
    const corner = (x: number, y: number, sx: number, sy: number) => {
      g.save(); g.translate(x, y); g.scale(sx, sy); g.strokeStyle = d.accentColor; g.fillStyle = d.accentColor; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 34, 0, Math.PI / 2); g.stroke();
      g.beginPath(); g.arc(0, 0, 22, 0, Math.PI / 2); g.stroke();
      g.beginPath(); g.arc(10, 10, 4, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    const k = M + 3;
    corner(k, k, 1, 1); corner(PAGE_W - k, k, -1, 1); corner(k, PAGE_H - k, 1, -1); corner(PAGE_W - k, PAGE_H - k, -1, -1);
  }

  const text = (t: string, y: number, size: number, color: string, stack: string, weight = 700, x = cx, align: CanvasTextAlign = "center", maxW = PAGE_W - bandW - 120) => {
    if (!t) return;
    g.save();
    g.fillStyle = color; g.textAlign = align; g.textBaseline = "alphabetic";
    g.direction = AR.test(t) ? "rtl" : "ltr";
    let sz = size;
    g.font = `${weight} ${sz}px ${stack}`;
    while (g.measureText(t).width > maxW && sz > 9) { sz -= 1; g.font = `${weight} ${sz}px ${stack}`; }
    g.fillText(t, x, y);
    g.restore();
  };
  const wrapLines = (t: string, size: number, stack: string, weight: number, maxW: number): string[] => {
    g.save(); g.font = `${weight} ${size}px ${stack}`;
    const words = t.split(/\s+/); const lines: string[] = []; let cur = "";
    for (const w of words) { const n = cur ? cur + " " + w : w; if (g.measureText(n).width > maxW && cur) { lines.push(cur); cur = w; } else cur = n; }
    if (cur) lines.push(cur); g.restore(); return lines.slice(0, 3);
  };

  const lang = d.labelLang;
  let y = bannerH ? 0 : 0;
  // header logo
  let top = bannerH ? bannerH + 22 : 52;
  if (logo && !bannerH) {
    const h = 54; const w = Math.min(170, (logo.naturalWidth / logo.naturalHeight) * h);
    g.drawImage(logo, cx - w / 2, top, w, h); top += h + 8;
  } else if (logo && bannerH) {
    const h = 58; const w = Math.min(170, (logo.naturalWidth / logo.naturalHeight) * h);
    g.drawImage(logo, 54, (bannerH - h) / 2, w, h);
  }
  const titleColor = d.layout === "banner" ? "#ffffff" : d.layout === "modern" ? d.borderColor : d.textColor;
  // title block
  if (d.layout === "banner") {
    const t1 = lang === "ar" ? d.titleAr || d.title : d.title;
    if (lang === "both") { text(d.title, 52, 34, titleColor, titleStack, 700); text(d.titleAr, 88, 26, titleColor, arTitleStack, 700); }
    else text(t1, 66, 38, titleColor, lang === "ar" ? arTitleStack : titleStack, 700);
    y = top + 28;
  } else {
    y = top + 34;
    if (lang === "ar") { text(d.titleAr || d.title, y, 40, titleColor, arTitleStack); y += 6; }
    else { text(d.title, y, 38, titleColor, titleStack); if (lang === "both") { y += 36; text(d.titleAr, y, 28, d.accentColor, arTitleStack); } }
  }
  // accent rule
  y += 16;
  g.fillStyle = d.accentColor; g.fillRect(cx - 60, y, 120, 3); y += 26;
  // subtitle
  const subs: [string, boolean][] = lang === "ar" ? [[d.subtitleAr || d.subtitle, true]] : lang === "both" ? [[d.subtitle, false], [d.subtitleAr, true]] : [[d.subtitle, false]];
  for (const [st, isAr] of subs) {
    for (const ln of wrapLines(st, 13, isAr ? arBodyStack : bodyStack, 600, PAGE_W - bandW - 190)) { text(ln, y, 13.5, d.textColor, isAr ? arBodyStack : bodyStack, 600); y += 19; }
  }
  y += 22;
  // student name
  text(data.name || "Student", y + 12, 40, d.accentColor, AR.test(data.name || "") ? arTitleStack : titleStack, 700, cx, "center", PAGE_W - bandW - 170);
  y += 24;
  g.fillStyle = d.borderColor; g.fillRect(cx - 150, y, 300, 1.4); y += 34;

  const L = (k: keyof typeof LBL) => (lang === "ar" ? LBL[k][1] : lang === "both" ? `${LBL[k][0]} · ${LBL[k][1]}` : LBL[k][0]);
  const stackFor = lang === "ar" ? arBodyStack : bodyStack;
  text(`${L("assessment")}: ${data.quizTitle}`, y, 15, d.textColor, stackFor, 600); y += 31;
  text(`${L("marks")}: ${data.score}/${data.maxScore} (${data.percentage}%)`, y, 20, d.textColor, stackFor, 800); y += 28;
  if (d.showPosition && data.positionLabel) { text(`${L("position")}: ${data.positionLabel}`, y, 14, d.textColor, stackFor, 600); y += 25; }
  const dateStr = new Date(data.finishedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  text(`${L("date")}: ${dateStr}`, y, 13, d.textColor, stackFor, 600);

  // signature
  if (d.showSignature && (d.signatureName || d.signatureTitle)) {
    const sx = PAGE_W - 150 - 20; const sy = PAGE_H - 118;
    g.fillStyle = d.textColor; g.fillRect(sx - 90, sy, 180, 1.2);
    text(d.signatureName, sy - 8, 17, d.textColor, d.signatureName && AR.test(d.signatureName) ? arTitleStack : `"${LATIN_FONTS.vibes.family}",${titleStack}`, 700, sx, "center", 180);
    text(d.signatureTitle, sy + 17, 11, d.textColor, bodyStack, 600, sx, "center", 180);
  }
  // footer
  text(d.schoolName, PAGE_H - 78, 15, d.borderColor, AR.test(d.schoolName) ? arBodyStack : bodyStack, 800, cx, "center", PAGE_W - bandW - 360);
  if (d.footerText) text(d.footerText, PAGE_H - 58, 11, "#6b7280", AR.test(d.footerText) ? arBodyStack : bodyStack, 600, cx, "center", PAGE_W - bandW - 360);
}

export const SAMPLE_DATA: CertData = { name: "Aisha Khan", quizTitle: "Year 6 – Prayer of the Latecomer", score: 14, maxScore: 15, percentage: 93.3, finishedAt: new Date().toISOString(), positionLabel: "1 of 24" };

export function newDesignId(): string { return `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }
