/**
 * Site name, tagline, colours and main address set in Admin → Settings gear → Site & branding.
 * Saved on the school server (not in the build), read by every page at runtime and cached on the device,
 * so changes show without rebuilding the website.
 */
import { IS_SCHOOL } from "@/lib/deployment";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { siteConfig } from "@/content/site";

export type SiteTheme = { preset: string; header: string; sun: string; mode: "light" | "dark"; /** Optional heading colour. Dark mode stays white unless this colour is still easy to read. */ heading?: string; /** Optional subheading / muted colour. */ sub?: string };
export type ColourCombo = { id: string; label: string; header: string; sun: string; heading: string; sub: string };
export type SiteIdentity = {
  nameEn: string;
  nameAr: string;
  taglineEn: string;
  taglineAr: string;
  theme: SiteTheme;
  /** Main site address without https:// ("" = the deployment's default, school: www.shaiqmuhammad.com). */
  canonical: string;
  /** Email identity shown on automatic emails ("" = deployment default). */
  mail?: MailIdentity;
  /** Saved branding presets (applied with one click, e.g. together with a main-address switch). */
  presets?: BrandPreset[];
  /** Saved colour combinations (header, accent, heading, subheading) — names stay as they are. */
  combos?: ColourCombo[];
  updatedAt?: number;
};
export type BrandPreset = { id: string; label: string; nameEn: string; nameAr: string; taglineEn: string; taglineAr: string; theme: SiteTheme };

export const DEFAULT_HEADER = "#1b3a57";
export const DEFAULT_SUN = "#f3c969";
/** Email template defaults (unchanged from the original navy / yellow used in mail today). */
export const DEFAULT_MAIL_HEADER = "#1b3a57";
export const DEFAULT_MAIL_SUN = "#f5c542";
export { DEFAULT_HOST } from "@/lib/deployment";

export const THEME_PRESETS: { id: string; en: string; ar: string; header: string; sun: string }[] = [
  { id: "classic", en: "Classic navy", ar: "كحلي كلاسيكي", header: DEFAULT_HEADER, sun: DEFAULT_SUN },
  { id: "teal", en: "Teal", ar: "أزرق مخضر", header: "#155e63", sun: "#f2c14e" },
  { id: "forest", en: "Forest green", ar: "أخضر", header: "#1f4d3a", sun: "#e9c46a" },
  { id: "royal", en: "Royal purple", ar: "بنفسجي ملكي", header: "#3b2c6e", sun: "#f4b942" },
  { id: "maroon", en: "Maroon", ar: "عنابي", header: "#6b1f2a", sun: "#f1c27d" },
  { id: "charcoal", en: "Charcoal", ar: "فحمي", header: "#2f3640", sun: "#f5a623" },
  { id: "ocean", en: "Ocean blue", ar: "أزرق محيطي", header: "#0b4f8a", sun: "#ffd166" },
  { id: "oasis", en: "Oasis", ar: "واحة", header: "#0f6e6e", sun: "#f4d35e" },
  { id: "sunrise", en: "Sunrise", ar: "شروق", header: "#9a3412", sun: "#fdba74" },
  { id: "indigo", en: "Indigo", ar: "نيلي", header: "#312e81", sun: "#fde68a" },
  { id: "olive", en: "Olive & gold", ar: "زيتوني وذهبي", header: "#3f6212", sun: "#facc15" },
  { id: "plum", en: "Plum", ar: "خوخي", header: "#6b2142", sun: "#f9a8d4" },
  { id: "slate", en: "Slate", ar: "رمادي", header: "#1e293b", sun: "#fbbf24" },
  { id: "lagoon", en: "Lagoon", ar: "بحيرة", header: "#0e7490", sun: "#fde047" },
  { id: "emerald", en: "Emerald", ar: "زمردي", header: "#065f46", sun: "#fef08a" },
  { id: "cobalt", en: "Cobalt", ar: "كوبالت", header: "#1e3a8a", sun: "#fcd34d" },
  { id: "sand", en: "Desert sand", ar: "رمال", header: "#7c2d12", sun: "#fcd34d" },
];


/** Keep address lists in sync with workers/assessment-session/src/mail/identity.ts */
export const MAIL_EMAIL_RE = /^[^\s@<>"]{1,64}@[a-z0-9.-]+\.[a-z]{2,24}$/i;
export function isMailAddress(v: string): boolean {
  return MAIL_EMAIL_RE.test(v.trim());
}

export const MAIL_QUICK_PICKS: { id: string; email: string; en: string; ar: string }[] = [
  { id: "alm-support", email: "support@almudarris.com", en: "Support · almudarris.com", ar: "الدعم · almudarris.com" },
  { id: "alm-admin", email: "admin@almudarris.com", en: "Admin · almudarris.com", ar: "الإدارة · almudarris.com" },
  { id: "alm-billing", email: "billings@almudarris.com", en: "Billing · almudarris.com", ar: "الفوترة · almudarris.com" },
  { id: "icloud", email: "shaiqmuhammad@icloud.com", en: "iCloud", ar: "iCloud" },
  { id: "info", email: "info@shaiqmuhammad.com", en: "Info · shaiqmuhammad.com", ar: "المعلومات · shaiqmuhammad.com" },
  { id: "support", email: "support@shaiqmuhammad.com", en: "Support · shaiqmuhammad.com", ar: "الدعم · shaiqmuhammad.com" },
  { id: "contact", email: "contact@shaiqmuhammad.com", en: "Contact · shaiqmuhammad.com", ar: "التواصل · shaiqmuhammad.com" },
];

export const MAIL_SENDER_TYPES = ["notify", "account", "billing", "reports", "contact"] as const;
export type MailSenderType = (typeof MAIL_SENDER_TYPES)[number];
export const MAIL_SENDER_DEFAULTS: Record<MailSenderType, string> = {
  notify: "support@almudarris.com",
  account: "admin@almudarris.com",
  billing: "billings@almudarris.com",
  reports: "billings@almudarris.com",
  contact: "support@almudarris.com",
};
export const MAIL_SENDER_LABELS: Record<MailSenderType, { en: string; ar: string }> = {
  notify: { en: "Notifications & reminders", ar: "الإشعارات والتذكيرات" },
  account: { en: "Account & security", ar: "الحساب والأمان" },
  billing: { en: "Billing & receipts", ar: "الفوترة والإيصالات" },
  reports: { en: "Reports", ar: "التقارير" },
  contact: { en: "Replies & contact", ar: "الردود والتواصل" },
};

export type MailIdentity = {
  fromName: string;
  contact: string;
  info: string;
  footer?: string;
  logoPath?: string;
  siteLogoPath?: string;
  siteLogoPngPath?: string;
  senders?: Partial<Record<MailSenderType, string>>;
  allowedFrom?: string[];
};

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
      heading: HEX.test(s(th.heading, 7)) ? s(th.heading, 7).toLowerCase() : "",
      sub: HEX.test(s(th.sub, 7)) ? s(th.sub, 7).toLowerCase() : "",
    },
    canonical: /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s(r.canonical, 253)) ? s(r.canonical, 253) : "",
    mail: (() => {
      const m = (r.mail && typeof r.mail === "object" ? r.mail : {}) as Record<string, unknown>;
      const logo = (v: unknown) => { const p = s(v, 80); return /^\/(logo(-email)?\.(svg|png|jpe?g)|brand\/[A-Za-z0-9._-]+)$/i.test(p) ? p : ""; };
      const senders: MailIdentity["senders"] = {};
      const rawSenders = (m.senders && typeof m.senders === "object" ? m.senders : {}) as Record<string, unknown>;
      for (const typ of MAIL_SENDER_TYPES) {
        const v = typeof rawSenders[typ] === "string" ? rawSenders[typ].trim().toLowerCase() : "";
        if (isMailAddress(v)) senders[typ] = v;
      }
      const allowedRaw = Array.isArray(m.allowedFrom) ? m.allowedFrom : typeof m.allowedFrom === "string" ? String(m.allowedFrom).split(",") : [];
      const allowedFrom: string[] = [];
      const seen = new Set<string>();
      for (const raw of allowedRaw.slice(0, 40)) {
        const v = (typeof raw === "string" ? raw : "").trim().toLowerCase();
        if (!isMailAddress(v) || seen.has(v)) continue;
        seen.add(v);
        allowedFrom.push(v);
        if (allowedFrom.length >= 20) break;
      }
      return { fromName: s(m.fromName, 60), contact: s(m.contact, 120), info: s(m.info, 120), footer: s(m.footer, 200), logoPath: logo(m.logoPath), siteLogoPath: logo(m.siteLogoPath), siteLogoPngPath: logo(m.siteLogoPngPath), senders, allowedFrom };
    })(),
    presets: Array.isArray(r.presets) ? (r.presets as unknown[]).slice(0, 8).map((p) => {
      const q = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const t = (q.theme && typeof q.theme === "object" ? q.theme : {}) as Record<string, unknown>;
      return { id: s(q.id, 30), label: s(q.label, 40), nameEn: s(q.nameEn, 60), nameAr: s(q.nameAr, 60), taglineEn: s(q.taglineEn, 140), taglineAr: s(q.taglineAr, 140),
        theme: { preset: s(t.preset, 30), header: HEX.test(s(t.header, 7)) ? s(t.header, 7).toLowerCase() : "", sun: HEX.test(s(t.sun, 7)) ? s(t.sun, 7).toLowerCase() : "", mode: t.mode === "dark" ? "dark" : "light", heading: HEX.test(s(t.heading, 7)) ? s(t.heading, 7).toLowerCase() : "", sub: HEX.test(s(t.sub, 7)) ? s(t.sub, 7).toLowerCase() : "" } as SiteTheme };
    }) : [],
    combos: Array.isArray(r.combos) ? (r.combos as unknown[]).slice(0, 16).map((p, i) => {
      const q = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const hex = (v: unknown) => (HEX.test(s(v, 7)) ? s(v, 7).toLowerCase() : "");
      return { id: s(q.id, 30) || `c${i + 1}`, label: s(q.label, 40) || `Combo ${i + 1}`, header: hex(q.header) || DEFAULT_HEADER, sun: hex(q.sun) || DEFAULT_SUN, heading: hex(q.heading), sub: hex(q.sub) };
    }).filter((c) => c.label) : [],
    updatedAt: Number(r.updatedAt) || 0,
  };
}

/** Built-in presets (always offered); saved presets with the same id replace them. */
export const BUILTIN_PRESETS: BrandPreset[] = [
  { id: "shaiq", label: IS_SCHOOL ? "Shaiq Muhammad" : "Original", nameEn: "", nameAr: "", taglineEn: "", taglineAr: "", theme: { preset: "classic", header: "", sun: "", mode: "light" } },
  { id: "almudarris", label: "Al-Mudarris", nameEn: "Al-Mudarris", nameAr: "المدرّس", taglineEn: "Learning platform", taglineAr: "منصة تعليمية", theme: { preset: "teal", header: "#155e63", sun: "#f2c14e", mode: "light" } },
];
export function allPresets(i: SiteIdentity | null): BrandPreset[] {
  const saved = (i?.presets || []).filter((p) => p.id);
  return [...BUILTIN_PRESETS.filter((b) => !saved.some((p) => p.id === b.id)), ...saved];
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
const onBg = (color: string, bg: string, fallback: string) => (HEX.test(color) && contrast(color, bg) >= 4.5 ? color : fallback);
export function themeCss(theme: SiteTheme): string {
  const header = HEX.test(theme.header) ? theme.header : "";
  const sun = HEX.test(theme.sun) ? theme.sun : "";
  const heading = HEX.test(theme.heading || "") ? theme.heading! : "";
  const sub = HEX.test(theme.sub || "") ? theme.sub! : "";
  if (!header && !sun && !heading && !sub) return "";
  const h = header || DEFAULT_HEADER;
  const y = sun || DEFAULT_SUN;
  const darkBg = mix(h, "#000000", 0.62);
  const lightHeading = onBg(heading || h, "#ffffff", onBg(h, "#ffffff", "#1b2f44"));
  const lightSub = onBg(sub, "#ffffff", "#586a7d");
  // Dark mode titles stay white unless the chosen heading is still easy to read on the dark page.
  const darkHeading = onBg(heading, darkBg, "#ffffff");
  const darkSub = onBg(sub, darkBg, "#c5d4e4");
  const light = [
    `--navy:${h}`, `--navy-deep:${mix(h, "#000000", 0.12)}`, `--heading:${lightHeading}`, `--muted:${lightSub}`, `--primary:${h}`, `--header:${h}`, `--footer:${mix(h, "#000000", 0.12)}`,
    `--yellow:${y}`, `--yellow-border:${mix(y, "#000000", 0.08)}`, `--yellow-hover:${mix(y, "#ffffff", 0.25)}`, `--accent:${mix(y, "#000000", 0.05)}`,
    `--ring:${mix(y, "#000000", 0.05)}`, `--cta:${y}`, `--cta-border:${mix(y, "#000000", 0.08)}`, `--cta-foreground:${onBg(h, y, "#1b2f44")}`,
    `--card-border:${h}1f`, `--accent-soft:${mix(y, "#ffffff", 0.88)}`, `--cream:${mix(y, "#ffffff", 0.88)}`,
  ].join(";");
  const dark = [
    `--navy:${h}`, `--navy-deep:${mix(h, "#000000", 0.12)}`, `--heading:${darkHeading}`, `--foreground:#e8eef5`, `--muted:${darkSub}`,
    `--header:${mix(h, "#000000", 0.4)}`, `--footer:${mix(h, "#000000", 0.55)}`,
    `--background:${darkBg}`, `--card-solid:${mix(h, "#000000", 0.35)}`, `--card-border:rgba(255,255,255,.18)`,
    `--primary:${y}`, `--primary-foreground:${onBg("#10263b", y, "#10263b")}`, `--accent:${y}`, `--ring:${y}`, `--gold:${y}`,
    `--yellow:${y}`, `--yellow-border:${mix(y, "#000000", 0.08)}`, `--yellow-hover:${mix(y, "#ffffff", 0.25)}`, `--cta:${y}`, `--cta-foreground:${onBg("#10263b", y, "#10263b")}`,
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
