export type SiteSettings = {
  tawkPropertyId: string;
  tawkWidgetId: string;
  /** Teacher WhatsApp number in international format, e.g. +971545705552. Empty = hide WhatsApp. */
  whatsappNumber: string;
};

export const DEFAULT_WHATSAPP_NUMBER = "+971545705552";

export const SETTINGS_PATH = "/content/settings.json";
export const GITHUB_SETTINGS_PATH = "public/content/settings.json";

export const emptySettings: SiteSettings = {
  tawkPropertyId: "",
  tawkWidgetId: "",
  whatsappNumber: DEFAULT_WHATSAPP_NUMBER,
};

export function normalizeSettings(raw: Partial<SiteSettings> | null | undefined): SiteSettings {
  return {
    tawkPropertyId: String(raw?.tawkPropertyId || "").trim(),
    tawkWidgetId: String(raw?.tawkWidgetId || "").trim(),
    whatsappNumber:
      raw?.whatsappNumber === undefined || raw?.whatsappNumber === null
        ? DEFAULT_WHATSAPP_NUMBER
        : String(raw.whatsappNumber).trim(),
  };
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
  return {
    propertyId: settings?.tawkPropertyId || "",
    widgetId: settings?.tawkWidgetId || "",
  };
}
