export type SiteSettings = {
  tawkPropertyId: string;
  tawkWidgetId: string;
};

export const SETTINGS_PATH = "/content/settings.json";
export const GITHUB_SETTINGS_PATH = "public/content/settings.json";

export const emptySettings: SiteSettings = {
  tawkPropertyId: "",
  tawkWidgetId: "",
};

export function normalizeSettings(raw: Partial<SiteSettings> | null | undefined): SiteSettings {
  return {
    tawkPropertyId: String(raw?.tawkPropertyId || "").trim(),
    tawkWidgetId: String(raw?.tawkWidgetId || "").trim(),
  };
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
