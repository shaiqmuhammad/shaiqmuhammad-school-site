import { readFileSync } from "fs";
import { join } from "path";
import { emptySettings, normalizeSettings, type SiteSettings } from "@/lib/siteSettings";

/** Build-time read of public/content/settings.json (every admin publish triggers a rebuild). */
export function loadSiteSettingsSync(): SiteSettings {
  try {
    const raw = readFileSync(join(process.cwd(), "public", "content", "settings.json"), "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return emptySettings;
  }
}
