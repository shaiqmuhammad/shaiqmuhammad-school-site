/**
 * Site name, tagline, colours and main address set in Admin → Settings gear → Site & branding.
 * Saved on the school server (not in the build), read by every page at runtime and cached on the device,
 * so changes show without rebuilding the website.
 */
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { siteConfig } from "@/content/site";

export type SiteTheme = { preset: string; header: string; sun: string; mode: "light" | "dark" };
export type SiteIdentity = {
  nameEn: string;
  nameAr: string;
  taglineEn: string;
  taglineAr: string;
  theme: SiteTheme;
  /** Main site address without https:// ("" = www.shaiqmuhammad.com). */
  canonical: string;
  updatedAt?: number;
};

export const DEFAULT_HEADER = "#1b3a57";
export const DEFAULT_SUN = "#f3c969";
export const DEFAULT_HOST = "www.shaiqmuhammad.com";

export const THEME_PRESETS: { id: string; en: string; ar: string; header: string; sun: string }[] = [
  { id: "classic", en: "Classic navy", ar: "كحلي كلاسيكي", header: DEFAULT_HEADER, sun: DEFAULT_SUN },
  { id: "teal", en: "Teal", ar: "أزرق مخضر", header: "#155e63", sun: "#f2c14e" },
  { id: "forest", en: "Forest green", ar: "أخضر", header: "#1f4d3a", sun: "#e9c46a" },
  { id: "royal", en: "Royal purple", ar: "بنفسجي ملكي", header: "#3b2c6e", sun: "#f4b942" },
  { id: "maroon", en: "Maroon", ar: "عنابي", header: "#6b1f2a", sun: "#f1c27d" },
  { id: "charcoal", en: "Charcoal", ar: "فحمي", header: "#2f3640", sun: "#f5a623" },
  { id: "ocean", en: "Ocean blue", ar: "أزرق محيطي", header: "#0b4f8a", sun: "#ffd166" },
];

export const emptyIdentity: SiteIdentity = {
  nameEn: "",
  nameAr: "",
  taglineEn: "",
  taglineAr: "",
  theme: { preset: "classic", header: "", sun: "", mode: "light" },
  canonical: "",
};

const HEX = /^#[0-9a-f]{6}$/i;
export function normalizeIdentity(raw: unknown): SiteIdentity {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const th = (r.theme && typeof r.theme === "object" ? r.theme : {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return {
    nameEn: s(r.nameEn, 60),
    nameAr: s(r.nameAr, 60),
    taglineEn: s(r.taglineEn, 140),
    taglineAr: s(r.taglineAr, 140),
    theme: {
      preset: s(th.preset, 30),
      header: HEX.test(s(th.header, 7)) ? s(th.header, 7).toLowerCase() : "",
      sun: HEX.test(s(th.sun, 7)) ? s(th.sun, 7).toLowerCase() : "",
      mode: th.mode === "dark" ? "dark" : "light",
    },
    canonical: /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s(r.canonical, 253)) ? s(r.canonical, 253) : "",
    updatedAt: Number(r.updatedAt) || 0,
  };
}

/* ---------- colour maths ---------- */
const toRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
function lum(h: string): number {
  const [r, g, b] = toRgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio (1–21). Body text needs 4.5 or more. */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export type ContrastWarning = { en: string; ar: string; ratio: number };
export function contrastWarnings(header: string, sun: string): ContrastWarning[] {
  const out: ContrastWarning[] = [];
  const w = contrast(header, "#ffffff");
  if (w < 4.5) out.push({ en: "White text on the main colour is hard to read — pick a darker main colour.", ar: "النص الأبيض على اللون الرئيسي صعب القراءة — اختر لونًا أغمق.", ratio: w });
  const d = contrast(sun, "#0b1b2b");
  if (d < 4.5) out.push({ en: "Dark text on the accent colour is hard to read — pick a lighter, brighter accent.", ar: "النص الداكن على لون التمييز صعب القراءة — اختر لونًا أفتح.", ratio: d });
  const s = contrast(sun, header);
  if (s < 2.2) out.push({ en: "The accent colour does not stand out from the main colour.", ar: "لون التمييز لا يظهر بوضوح على اللون الرئيسي.", ratio: s });
  return out;
}

/** CSS variable overrides for the chosen colours (empty string = defaults from globals.css). */
export function themeCss(theme: SiteTheme): string {
  const header = HEX.test(theme.header) ? theme.header : "";
  const sun = HEX.test(theme.sun) ? theme.sun : "";
  if (!header && !sun) return "";
  const h = header || DEFAULT_HEADER;
  const y = sun || DEFAULT_SUN;
  const light = [
    `--navy:${h}`, `--navy-deep:${mix(h, "#000000", 0.12)}`, `--heading:${h}`, `--primary:${h}`, `--header:${h}`, `--footer:${mix(h, "#000000", 0.12)}`,
    `--yellow:${y}`, `--yellow-border:${mix(y, "#000000", 0.08)}`, `--yellow-hover:${mix(y, "#ffffff", 0.25)}`, `--accent:${mix(y, "#000000", 0.05)}`,
    `--ring:${mix(y, "#000000", 0.05)}`, `--cta:${y}`, `--cta-border:${mix(y, "#000000", 0.08)}`, `--cta-foreground:${h}`,
    `--card-border:${h}1f`, `--accent-soft:${mix(y, "#ffffff", 0.88)}`, `--cream:${mix(y, "#ffffff", 0.88)}`,
  ].join(";");
  const dark = [
    `--navy:${h}`, `--navy-deep:${mix(h, "#000000", 0.12)}`, `--header:${mix(h, "#000000", 0.4)}`, `--footer:${mix(h, "#000000", 0.55)}`,
    `--background:${mix(h, "#000000", 0.62)}`, `--card-solid:${mix(h, "#000000", 0.35)}`,
    `--primary:${y}`, `--primary-foreground:${mix(h, "#000000", 0.12)}`, `--accent:${y}`, `--ring:${y}`, `--gold:${y}`,
    `--yellow:${y}`, `--yellow-border:${mix(y, "#000000", 0.08)}`, `--yellow-hover:${mix(y, "#ffffff", 0.25)}`, `--cta:${y}`,
  ].join(";");
  return `:root{${light}}.dark{${dark}}`;
}

/* ---------- loading ---------- */
import { IDENTITY_CACHE_KEY } from "@/lib/siteOrigin";
export { IDENTITY_CACHE_KEY };
export const IDENTITY_EVENT = "sm-site-identity";

export function cachedIdentity(): SiteIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(IDENTITY_CACHE_KEY);
    return raw ? normalizeIdentity(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function cacheIdentity(i: SiteIdentity | null) {
  try {
    if (i) localStorage.setItem(IDENTITY_CACHE_KEY, JSON.stringify(i));
    else localStorage.removeItem(IDENTITY_CACHE_KEY);
    window.dispatchEvent(new CustomEvent(IDENTITY_EVENT));
  } catch {
    // storage unavailable
  }
}
export async function fetchIdentity(): Promise<SiteIdentity | null> {
  const res = await fetch(`${ASSESSMENT_API_BASE}/api/admin/brand`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const d = (await res.json()) as { brand?: unknown };
  return d.brand ? normalizeIdentity(d.brand) : null;
}

export const displayName = (i: SiteIdentity | null, lang: string) => (lang === "ar" ? i?.nameAr || i?.nameEn : i?.nameEn) || siteConfig.name;
export const displayTagline = (i: SiteIdentity | null, lang: string) => (lang === "ar" ? i?.taglineAr || "" : i?.taglineEn || "");

export { siteOrigin } from "@/lib/siteOrigin";
