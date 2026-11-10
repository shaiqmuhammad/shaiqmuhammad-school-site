/**
 * Pure helpers for outgoing-mail identity (From, logo URL, footer, sender types).
 * Used by the worker template and by unit tests — no I/O, no secrets.
 */

export const EMAIL_RE = /^[^\s@<>"]{1,64}@[a-z0-9.-]+\.[a-z]{2,24}$/i;

/** Colours used in emails today when Admin has not set a theme. Keep these so existing mail does not change. */
export const DEFAULT_MAIL_HEADER = "#1b3a57";
export const DEFAULT_MAIL_SUN = "#f5c542";

/** Built-in PNG generated at prebuild from the site logo (many mail apps cannot show SVG). */
export const DEFAULT_MAIL_LOGO_PNG = "/logo-email.png";

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^\/(logo(-email)?\.(svg|png|jpe?g)|brand\/[A-Za-z0-9._-]+)$/i;

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

export const isRasterLogo = (path: string) => /\.(png|jpe?g)$/i.test(path);
export const isSvgLogo = (path: string) => /\.svg$/i.test(path);

/**
 * Absolute https URL for the image at the top of emails.
 * Optional email-logo override first; otherwise the Logo & icons upload.
 * SVG is replaced by a PNG companion (published or built-in /logo-email.png) because many mail apps cannot show SVG.
 */
export function mailLogoUrl(siteUrl: string, emailLogoPath?: string, siteLogoPath?: string, siteLogoPngPath?: string): string {
  const base = siteUrl.replace(/\/+$/, "") || "https://www.shaiqmuhammad.com";
  const png = safeLogoPath(siteLogoPngPath) || DEFAULT_MAIL_LOGO_PNG;
  const rasterOrPng = (p: string) => (isRasterLogo(p) ? p : png);
  const override = safeLogoPath(emailLogoPath);
  if (override) return `${base}${rasterOrPng(override)}`;
  const site = safeLogoPath(siteLogoPath);
  if (site) return `${base}${rasterOrPng(site)}`;
  return `${base}${png}`;
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

/** Built-in From addresses shown as quick-picks (iCloud aliases Shaiq has named). */
export const MAIL_QUICK_PICKS: { id: string; email: string; en: string; ar: string }[] = [
  { id: "alm-support", email: "support@almudarris.com", en: "Support · almudarris.com", ar: "الدعم · almudarris.com" },
  { id: "alm-admin", email: "admin@almudarris.com", en: "Admin · almudarris.com", ar: "الإدارة · almudarris.com" },
  { id: "alm-billing", email: "billings@almudarris.com", en: "Billing · almudarris.com", ar: "الفوترة · almudarris.com" },
  { id: "icloud", email: "shaiqmuhammad@icloud.com", en: "iCloud", ar: "iCloud" },
  { id: "info", email: "info@shaiqmuhammad.com", en: "Info · shaiqmuhammad.com", ar: "المعلومات · shaiqmuhammad.com" },
  { id: "support", email: "support@shaiqmuhammad.com", en: "Support · shaiqmuhammad.com", ar: "الدعم · shaiqmuhammad.com" },
  { id: "contact", email: "contact@shaiqmuhammad.com", en: "Contact · shaiqmuhammad.com", ar: "التواصل · shaiqmuhammad.com" },
];

export const BUILTIN_ALLOWED_FROM = MAIL_QUICK_PICKS.map((p) => p.email);

export const MAIL_SENDER_TYPES = ["notify", "account", "billing", "reports", "contact"] as const;
export type MailSenderType = (typeof MAIL_SENDER_TYPES)[number];

/** Sensible From defaults per kind of outgoing mail (editable in Site & branding). */
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

export type MailSenders = Partial<Record<MailSenderType, string>>;

/** Chosen From for a mail type, or that type's default, or the site's default From. */
export function senderForType(type: MailSenderType, senders: MailSenders | undefined, fallbackInfo: string): string {
  const wanted = (senders?.[type] || "").trim() || MAIL_SENDER_DEFAULTS[type] || fallbackInfo;
  return wanted.trim();
}

export function normAllowedList(raw: unknown, max = 20): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return uniqueEmails(list.map((v) => (typeof v === "string" ? v : "")).slice(0, max * 2)).slice(0, max);
}

export function normSenders(raw: unknown): MailSenders {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: MailSenders = {};
  for (const k of MAIL_SENDER_TYPES) {
    const v = typeof r[k] === "string" ? r[k].trim().toLowerCase() : "";
    if (isEmail(v)) out[k] = v;
  }
  return out;
}

/** Addresses the admin UI may show as allowed From values (never a private Apple ID unless it is a named pick). */
export function publicAllowedFrom(opts: {
  mailContact?: string;
  mailInfo?: string;
  contact?: string;
  info?: string;
  extra?: string;
  saved?: string[];
}): string[] {
  const extra = (opts.extra || "").split(",").map((s) => s.trim());
  return uniqueEmails(
    BUILTIN_ALLOWED_FROM,
    [opts.mailContact, opts.mailInfo, opts.contact, opts.info],
    extra,
    opts.saved || [],
  );
}

/**
 * Pick a From address iCloud will accept. If `wanted` is not on the allowed list
 * (Apple account + aliases, plus MAIL_ALLOWED_FROM and addresses saved in Site & branding),
 * fall back to the authenticated SMTP user, then the first allowed address.
 */
export function resolveFrom(wanted: string, allowed: string[], authAddress: string): { from: string; fellBack: boolean } {
  const want = wanted.trim().toLowerCase();
  const allow = uniqueEmails(allowed, [authAddress]);
  if (want && allow.includes(want)) return { from: want, fellBack: false };
  const auth = authAddress.trim().toLowerCase();
  const fallback = (auth && allow.includes(auth) ? auth : allow[0]) || auth || want;
  return { from: fallback, fellBack: Boolean(want && fallback && want !== fallback) };
}
