/**
 * Pure helpers for outgoing-mail identity (From, logo URL, footer).
 * Used by the worker template and by unit tests — no I/O, no secrets.
 */

export const EMAIL_RE = /^[^\s@<>"]{1,64}@[a-z0-9.-]+\.[a-z]{2,24}$/i;

/** Colours used in emails today when Admin has not set a theme. Keep these so existing mail does not change. */
export const DEFAULT_MAIL_HEADER = "#1b3a57";
export const DEFAULT_MAIL_SUN = "#f5c542";

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^\/(logo\.(svg|png|jpe?g)|brand\/[A-Za-z0-9._-]+)$/i;

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function safeMailColor(v: string | undefined, fallback: string): string {
  const s = (v || "").trim().toLowerCase();
  return HEX.test(s) ? s : fallback;
}

/** Root-relative logo path we will put on the live site; anything else is ignored. */
export function safeLogoPath(path: string | undefined): string {
  const p = (path || "").trim();
  return LOGO.test(p) ? p : "";
}

export function mailLogoUrl(siteUrl: string, logoPath?: string, siteLogoPath?: string): string {
  const base = siteUrl.replace(/\/+$/, "") || "https://www.shaiqmuhammad.com";
  const path = safeLogoPath(logoPath) || safeLogoPath(siteLogoPath) || "/logo.svg";
  return `${base}${path}`;
}

export function siteLabel(siteUrl: string): string {
  return siteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

export function defaultMailFooter(contact: string, siteUrl: string): string {
  const c = contact.trim();
  return c ? `Questions? Write to ${c} · ${siteLabel(siteUrl)}` : `Questions? ${siteLabel(siteUrl)}`;
}

/** Custom footer line, or the same default wording emails use today. */
export function mailFooterLine(footer: string | undefined, contact: string, siteUrl: string): string {
  const f = (footer || "").trim();
  return f || defaultMailFooter(contact, siteUrl);
}

export function uniqueEmails(...lists: (string | undefined)[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const v = (raw || "").trim().toLowerCase();
      if (!isEmail(v) || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Addresses the admin UI may show as allowed From values (never includes a private Apple ID). */
export function publicAllowedFrom(opts: { mailContact?: string; mailInfo?: string; contact?: string; info?: string; extra?: string }): string[] {
  const extra = (opts.extra || "").split(",").map((s) => s.trim());
  return uniqueEmails([opts.mailContact, opts.mailInfo, opts.contact, opts.info], extra);
}

/**
 * Pick a From address iCloud will accept. If `wanted` is not on the allowed list
 * (Apple account + aliases, plus any MAIL_ALLOWED_FROM values), fall back to the
 * authenticated SMTP user, then the first allowed address.
 */
export function resolveFrom(wanted: string, allowed: string[], authAddress: string): { from: string; fellBack: boolean } {
  const want = wanted.trim().toLowerCase();
  const allow = uniqueEmails(allowed, [authAddress]);
  if (want && allow.includes(want)) return { from: want, fellBack: false };
  const auth = authAddress.trim().toLowerCase();
  const fallback = (auth && allow.includes(auth) ? auth : allow[0]) || auth || want;
  return { from: fallback, fellBack: Boolean(want && fallback && want !== fallback) || (!want && Boolean(fallback)) ? Boolean(want && want !== fallback) : false };
}
