export type SiteSettings = {
  tawkPropertyId: string;
  tawkWidgetId: string;
  /** Teacher WhatsApp number in international format, e.g. +971545705552. Empty = hide WhatsApp. */
  whatsappNumber: string;
  /** Public social profile URLs (https://…). Empty = no icon in the footer. */
  social: SocialLinks;
  /** Uploaded branding (files committed under public/brand/). Empty paths = built-in defaults. */
  brand: BrandSettings;
};

export const SOCIAL_KEYS = ["facebook", "instagram", "tiktok", "x", "linkedin"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type SocialLinks = Record<SocialKey, string>;

export type BrandSettings = {
  /** Site path of the uploaded logo, e.g. "/brand/logo.png". "" = default /logo.svg. */
  logoPath: string;
  /** Site path of the uploaded favicon source, e.g. "/brand/favicon.svg". "" = default icons. */
  faviconPath: string;
  /** 512px PNG rendered in the browser from the favicon upload (used by scripts/gen-icons.mjs). */
  faviconPngPath: string;
  /** Changes on every upload; appended as ?v= so browsers/CDN pick up the new file. */
  version: string;
};

export const DEFAULT_LOGO_URL = "/logo.svg";
export const BRAND_DIR = "public/brand";

export const emptySocial: SocialLinks = { facebook: "", instagram: "", tiktok: "", x: "", linkedin: "" };
export const emptyBrand: BrandSettings = { logoPath: "", faviconPath: "", faviconPngPath: "", version: "" };

export const DEFAULT_WHATSAPP_NUMBER = "+971545705552";
/** Tawk.to live chat IDs (embed https://embed.tawk.to/<property>/<widget>). */
export const DEFAULT_TAWK_PROPERTY_ID = "6aba72c8a233173448726f9c";
export const DEFAULT_TAWK_WIDGET_ID = "1k3k50np0";

export const SETTINGS_PATH = "/content/settings.json";
export const GITHUB_SETTINGS_PATH = "public/content/settings.json";

export const emptySettings: SiteSettings = {
  tawkPropertyId: DEFAULT_TAWK_PROPERTY_ID,
  tawkWidgetId: DEFAULT_TAWK_WIDGET_ID,
  whatsappNumber: DEFAULT_WHATSAPP_NUMBER,
  social: emptySocial,
  brand: emptyBrand,
};

/** Missing field = code default; an explicit "" (set in admin) turns the feature off. */
function withDefault(value: unknown, fallback: string): string {
  return value === undefined || value === null ? fallback : String(value).trim();
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Only root-relative /brand/… paths are accepted for uploaded branding. */
function brandPath(value: unknown): string {
  const v = str(value);
  return /^\/brand\/[A-Za-z0-9._-]+$/.test(v) ? v : "";
}

export function normalizeSettings(
  raw: (Partial<Omit<SiteSettings, "social" | "brand">> & { social?: Partial<SocialLinks>; brand?: Partial<BrandSettings> }) | null | undefined,
): SiteSettings {
  const social = { ...emptySocial };
  for (const k of SOCIAL_KEYS) social[k] = str(raw?.social?.[k]);
  return {
    tawkPropertyId: withDefault(raw?.tawkPropertyId, DEFAULT_TAWK_PROPERTY_ID),
    tawkWidgetId: withDefault(raw?.tawkWidgetId, DEFAULT_TAWK_WIDGET_ID),
    whatsappNumber: withDefault(raw?.whatsappNumber, DEFAULT_WHATSAPP_NUMBER),
    social,
    brand: {
      logoPath: brandPath(raw?.brand?.logoPath),
      faviconPath: brandPath(raw?.brand?.faviconPath),
      faviconPngPath: brandPath(raw?.brand?.faviconPngPath),
      version: str(raw?.brand?.version).replace(/[^A-Za-z0-9-]/g, "").slice(0, 32),
    },
  };
}

/** A usable public profile URL (http/https only), or "" to hide the icon. */
export function safeSocialUrl(url: string): string {
  const v = url.trim();
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Public URL for an uploaded brand file with a cache-busting version, or the fallback. */
export function brandUrl(path: string, version: string, fallback: string): string {
  if (!path) return fallback;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

/** wa.me link for a number (digits only), or "" when no number is set. */
export function whatsappLink(number: string, text?: string): string {
  const digits = number.replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

let cachedSettings: Promise<SiteSettings> | null = null;

/** Client-side: load settings.json once per page and share it between widgets. */
export function loadSiteSettingsCached(): Promise<SiteSettings> {
  if (typeof window === "undefined") return loadSiteSettings();
  if (!cachedSettings) cachedSettings = loadSiteSettings();
  return cachedSettings;
}

export async function loadSiteSettings(): Promise<SiteSettings> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  try {
    const res = await fetch(`${base}${SETTINGS_PATH}`, { cache: "no-store" });
    if (!res.ok) return emptySettings;
    return normalizeSettings(await res.json());
  } catch {
    return emptySettings;
  }
}

/** Env IDs win over content settings when both are set. */
export function resolveTawkIds(settings?: SiteSettings | null): { propertyId: string; widgetId: string } {
  const envP = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim() || "";
  const envW = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim() || "";
  if (envP && envW) return { propertyId: envP, widgetId: envW };
  const s = settings ?? emptySettings;
  return { propertyId: s.tawkPropertyId, widgetId: s.tawkWidgetId };
}
