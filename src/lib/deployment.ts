/**
 * Per-deployment settings for this ONE codebase (the school site and copies such as Al-Mudarris).
 * Set as build-time environment variables in the deployment (Cloudflare Pages → Settings → Variables, or the
 * copy's build script). Every value has the school default, so the school build needs none of them.
 *
 *   NEXT_PUBLIC_SITE_ID            text in /site-id.txt (school: shaiqmuhammad-school-site)
 *   NEXT_PUBLIC_ASSESSMENT_API_URL its own worker ("" = same origin, when the worker also serves the site)
 *   NEXT_PUBLIC_DEFAULT_HOST       main address used for links until Admin picks another
 *   NEXT_PUBLIC_SITE_ADDRESSES     comma list of addresses that belong to this site (shown in Admin → Main address)
 *   NEXT_PUBLIC_SITE_NAME / _NAME_AR / _SHORT_NAME / _TAGLINE / _EMAIL / _DOMAIN   built-in name and contact
 *   NEXT_PUBLIC_LOGO_URL / NEXT_PUBLIC_FAVICON_URL   default logo and favicon when settings.json brand paths are empty
 */
const env = (v: string | undefined, def: string) => (v === undefined || v === "" ? def : v);

/** Root-relative public path only (e.g. /logo.svg). Anything else falls back to the default. */
function publicPath(v: string | undefined, def: string): string {
  const raw = env(v, def);
  return /^\/[A-Za-z0-9._/-]+$/.test(raw) && !raw.includes("..") ? raw : def;
}

export const SITE_ID = env(process.env.NEXT_PUBLIC_SITE_ID, "shaiqmuhammad-school-site");
export const IS_SCHOOL = SITE_ID === "shaiqmuhammad-school-site";
export const API_BASE = (process.env.NEXT_PUBLIC_ASSESSMENT_API_URL ?? "https://assessment-session.shaiqmuhammad.workers.dev").replace(/\/$/, "");
export const DEFAULT_HOST = env(process.env.NEXT_PUBLIC_DEFAULT_HOST, "www.shaiqmuhammad.com");
export const SITE_ADDRESSES = env(process.env.NEXT_PUBLIC_SITE_ADDRESSES, "www.shaiqmuhammad.com,shaiqmuhammad.com,www.almudarris.com,almudarris.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
/** Hosts that are this site's own built-in family (links on them use the saved main address). */
export const OWN_HOSTS = [DEFAULT_HOST, DEFAULT_HOST.replace(/^www\./, "")];

export const SITE_TEXT = {
  name: env(process.env.NEXT_PUBLIC_SITE_NAME, "Shaiq Muhammad"),
  nameAr: env(process.env.NEXT_PUBLIC_SITE_NAME_AR, ""),
  shortName: env(process.env.NEXT_PUBLIC_SITE_SHORT_NAME, "SM Learn"),
  domain: env(process.env.NEXT_PUBLIC_SITE_DOMAIN, "shaiqmuhammad.com"),
  tagline: env(process.env.NEXT_PUBLIC_SITE_TAGLINE, "A calm learning home for students of Shaiq Muhammad"),
  email: env(process.env.NEXT_PUBLIC_SITE_EMAIL, "contact@shaiqmuhammad.com"),
};

/** Default logo / favicon for this deployment when settings.json has empty brand.logoPath / faviconPath.
 *  A site copy can overlay public/logo.svg and public/favicon.svg, and/or set these env vars. */
export const SITE_LOGO = publicPath(process.env.NEXT_PUBLIC_LOGO_URL, "/logo.svg");
export const SITE_FAVICON = publicPath(process.env.NEXT_PUBLIC_FAVICON_URL, "/favicon.svg");

