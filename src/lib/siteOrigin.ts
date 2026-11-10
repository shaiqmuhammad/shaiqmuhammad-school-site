/** Device cache of Admin → Site & branding (written by lib/siteIdentity.ts). */
export const IDENTITY_CACHE_KEY = "sm_site_identity_v1";
const DEFAULT_HOST = "www.shaiqmuhammad.com";

function savedHost(): string {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(IDENTITY_CACHE_KEY) : null;
    const h = raw ? String((JSON.parse(raw) as { canonical?: string }).canonical || "") : "";
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : "";
  } catch {
    return "";
  }
}

/**
 * Main site address for links people open elsewhere (QR codes, join / shared / printed links).
 * On the live site: the main address saved in Admin (only saved once it really serves this site), default
 * www.shaiqmuhammad.com. On any other host (local preview, pages.dev) that host, so links keep working there.
 */
export function siteOrigin(): string {
  const saved = savedHost();
  if (typeof window === "undefined") return `https://${saved || DEFAULT_HOST}`;
  const host = window.location.hostname;
  if (/(^|\.)shaiqmuhammad\.com$/.test(host)) return `https://${saved || DEFAULT_HOST}`;
  if (saved && (host === saved || host === saved.replace(/^www\./, "") || `www.${host}` === saved)) return `https://${saved}`;
  return window.location.origin;
}
