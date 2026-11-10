/**
 * Per-deployment settings (one codebase, several independent sites).
 * Plain worker variables (not secrets); every one has the school default, so the school worker needs none.
 *
 *   SITE_ID          text served by the website at /site-id.txt (school: "shaiqmuhammad-school-site")
 *   SITE_ORIGINS     comma list of the site's own browser origins (always allowed)
 *   SITE_CANDIDATES  comma list of other addresses that are allowed ONLY while they really serve this
 *                    website (checked live at /site-id.txt, re-checked every 10 minutes)
 *   SITE_URL         default main address for links (QR codes, emails) until Admin picks another one
 *   SITE_NAME        name used in emails / notifications / the two-step app label
 *   CONTENT_REPO / CONTENT_BRANCH   where Admin → publish writes (only when GITHUB_PAT is set)
 *   MAIL_CONTACT / MAIL_INFO / MAIL_FROM_NAME   email sender defaults (Admin → Site & branding can override)
 *   MAIL_ALLOWED_FROM  comma list of extra From addresses this mailbox may send as (iCloud aliases)
 */
import { setMailIdentity } from "./mail/template";

export type DeployEnv = {
  SITE_ID?: string;
  SITE_ORIGINS?: string;
  SITE_CANDIDATES?: string;
  SITE_URL?: string;
  SITE_NAME?: string;
  CONTENT_REPO?: string;
  CONTENT_BRANCH?: string;
  MAIL_CONTACT?: string;
  MAIL_INFO?: string;
  MAIL_FROM_NAME?: string;
  MAIL_ALLOWED_FROM?: string;
  YT_HANDLE?: string;
};

const list = (v: string | undefined, def: string[]) => {
  const out = (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return v === undefined ? def : out;
};
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export const DEPLOY = {
  siteId: "shaiqmuhammad-school-site",
  origins: ["https://www.shaiqmuhammad.com", "https://shaiqmuhammad.com"],
  candidates: ["almudarris.com", "www.almudarris.com"],
  siteUrl: "https://www.shaiqmuhammad.com",
  siteName: "Shaiq Muhammad",
  repo: "shaiqmuhammad/shaiqmuhammad-school-site",
  branch: "main",
  mailContact: "contact@shaiqmuhammad.com",
  mailInfo: "info@shaiqmuhammad.com",
  mailFromName: "Shaiq Muhammad",
  ytHandle: "@shaiqmuhammad",
};
/** Static website files when this worker also serves the site (copies such as Al-Mudarris); null for the school. */
export let ASSETS: { fetch(r: Request | string): Promise<Response> } | null = null;
let applied = false;

/** Reads the worker variables once per isolate. */
export function initDeployment(env: unknown): void {
  if (applied) return;
  applied = true;
  const e = (env || {}) as DeployEnv;
  ASSETS = ((env || {}) as { ASSETS?: typeof ASSETS }).ASSETS || null;
  const s = (v: string | undefined, def: string, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : def);
  DEPLOY.siteId = s(e.SITE_ID, DEPLOY.siteId, 80);
  DEPLOY.origins = list(e.SITE_ORIGINS, DEPLOY.origins).filter((o) => /^https:\/\/[a-z0-9.-]+$/.test(o));
  DEPLOY.candidates = list(e.SITE_CANDIDATES, DEPLOY.candidates).filter((h) => HOST.test(h));
  DEPLOY.siteUrl = s(e.SITE_URL, DEPLOY.siteUrl).replace(/\/+$/, "");
  DEPLOY.siteName = s(e.SITE_NAME, DEPLOY.siteName, 60);
  DEPLOY.repo = s(e.CONTENT_REPO, DEPLOY.repo, 120);
  DEPLOY.branch = s(e.CONTENT_BRANCH, DEPLOY.branch, 120);
  DEPLOY.mailContact = s(e.MAIL_CONTACT, e.SITE_ID ? "" : DEPLOY.mailContact, 120);
  DEPLOY.mailInfo = s(e.MAIL_INFO, e.SITE_ID ? "" : DEPLOY.mailInfo, 120);
  DEPLOY.mailFromName = s(e.MAIL_FROM_NAME, DEPLOY.siteName, 80);
  DEPLOY.ytHandle = e.YT_HANDLE !== undefined ? (/^@[\w.-]{2,60}$/.test(e.YT_HANDLE.trim()) ? e.YT_HANDLE.trim() : "") : DEPLOY.ytHandle;
  setMailIdentity({ siteUrl: DEPLOY.siteUrl, contact: DEPLOY.mailContact, info: DEPLOY.mailInfo, fromName: DEPLOY.mailFromName, siteName: DEPLOY.siteName });
}

/** Bare hosts that belong to this deployment by configuration (from SITE_ORIGINS). */
export const ownHosts = () => DEPLOY.origins.map((o) => o.replace(/^https:\/\//, ""));

/* ---- live check: does an address really serve THIS website? ---- */
const seen = new Map<string, { ok: boolean; at: number }>();
export async function servesThisSite(host: string, force = false): Promise<boolean> {
  const c = seen.get(host);
  const ttl = c?.ok ? 600_000 : 120_000;
  if (!force && c && Date.now() - c.at < ttl) return c.ok;
  let ok = false;
  try {
    // A worker can't fetch its own address: when it serves the site itself, its own addresses are answered from its files.
    const self = ASSETS && DEPLOY.origins.includes(`https://${host}`);
    const r = self ? await ASSETS!.fetch(new Request(`https://${host}/site-id.txt`)) : await fetch(`https://${host}/site-id.txt?t=${Date.now()}`, { redirect: "follow", signal: AbortSignal.timeout(6000), cf: { cacheTtl: 0 } } as RequestInit);
    ok = r.ok && (await r.text()).trim().split(/\r?\n/)[0].trim() === DEPLOY.siteId;
  } catch {
    ok = false;
  }
  seen.set(host, { ok, at: Date.now() });
  return ok;
}
/** Synchronous view of the last live check (used by CORS). */
export const verifiedCandidate = (host: string) => DEPLOY.candidates.includes(host) && Boolean(seen.get(host)?.ok);
/** Before CORS is decided for a request from a candidate address: make sure its live check is fresh. */
export async function refreshCandidate(origin: string | null): Promise<void> {
  const m = origin ? /^https:\/\/([a-z0-9.-]+)$/.exec(origin) : null;
  if (m && DEPLOY.candidates.includes(m[1])) await servesThisSite(m[1]).catch(() => false);
}
