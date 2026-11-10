/** Branded HTML email (navy + yellow, logo, footer with contact@). Inline styles only (email clients). */
// Per deployment (worker variables MAIL_* / SITE_*; Admin → Site & branding → Email sender overrides). School defaults.
import {
  DEFAULT_MAIL_HEADER, DEFAULT_MAIL_LOGO_PNG, DEFAULT_MAIL_SUN, defaultMailFooter, mailFooterLine, mailLogoUrl, safeMailColor, siteLabel as hostLabel,
  type MailSenderType, type MailSenders,
} from "./identity";
export type { MailSenderType, MailSenders } from "./identity";

export let SITE_URL = "https://www.shaiqmuhammad.com";
export let CONTACT = "contact@shaiqmuhammad.com";
export let INFO = "info@shaiqmuhammad.com";
export let FROM_NAME = "Shaiq Muhammad";
export let SITE_NAME = "Shaiq Muhammad";
export let MAIL_HEADER = DEFAULT_MAIL_HEADER;
export let MAIL_SUN = DEFAULT_MAIL_SUN;
let LOGO_PATH = "";
let SITE_LOGO_PATH = "";
let SITE_LOGO_PNG_PATH = "";
let FOOTER_RAW = "";
export let MAIL_LOGO = `${SITE_URL}${DEFAULT_MAIL_LOGO_PNG}`;
export let MAIL_FOOTER = defaultMailFooter(CONTACT, SITE_URL);
export let MAIL_SENDERS: MailSenders = {};
export let MAIL_EXTRA_ALLOWED: string[] = [];

export function setMailIdentity(m: {
  siteUrl?: string;
  contact?: string;
  info?: string;
  fromName?: string;
  siteName?: string;
  header?: string;
  sun?: string;
  logoPath?: string;
  siteLogoPath?: string;
  siteLogoPngPath?: string;
  footer?: string;
  senders?: MailSenders;
  allowedFrom?: string[];
}) {
  if (m.siteUrl) SITE_URL = m.siteUrl.replace(/\/+$/, "");
  if (m.contact !== undefined) CONTACT = m.contact;
  if (m.info !== undefined) INFO = m.info || m.contact || "";
  if (m.fromName) FROM_NAME = m.fromName;
  if (m.siteName) SITE_NAME = m.siteName;
  if (m.header !== undefined) MAIL_HEADER = safeMailColor(m.header, DEFAULT_MAIL_HEADER);
  if (m.sun !== undefined) MAIL_SUN = safeMailColor(m.sun, DEFAULT_MAIL_SUN);
  if (m.logoPath !== undefined) LOGO_PATH = m.logoPath || "";
  if (m.siteLogoPath !== undefined) SITE_LOGO_PATH = m.siteLogoPath || "";
  if (m.siteLogoPngPath !== undefined) SITE_LOGO_PNG_PATH = m.siteLogoPngPath || "";
  MAIL_LOGO = mailLogoUrl(SITE_URL, LOGO_PATH, SITE_LOGO_PATH, SITE_LOGO_PNG_PATH);
  if (m.footer !== undefined) FOOTER_RAW = m.footer || "";
  MAIL_FOOTER = mailFooterLine(FOOTER_RAW, CONTACT, SITE_URL);
  if (m.senders !== undefined) MAIL_SENDERS = m.senders || {};
  if (m.allowedFrom !== undefined) MAIL_EXTRA_ALLOWED = m.allowedFrom || [];
  DEFAULT_SIG = { ...DEFAULT_SIG, name: FROM_NAME, email: CONTACT, website: SITE_URL };
}

const siteLabel = () => hostLabel(SITE_URL);

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function footerHtml(color: string) {
  let html = esc(MAIL_FOOTER);
  if (CONTACT) html = html.split(esc(CONTACT)).join(`<a href="mailto:${esc(CONTACT)}" style="color:${color};font-weight:700">${esc(CONTACT)}</a>`);
  const host = esc(siteLabel());
  if (host) html = html.split(host).join(`<a href="${SITE_URL}" style="color:${color}">${host}</a>`);
  return html;
}

export type Branded = { preheader?: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; rtl?: boolean; note?: string };

export function renderEmail(e: Branded) {
  const dir = e.rtl ? "rtl" : "ltr";
  const align = e.rtl ? "right" : "left";
  const header = MAIL_HEADER;
  const sun = MAIL_SUN;
  const paras = e.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#1f2d3d;white-space:pre-wrap">${esc(p)}</p>`).join("");
  const btn = e.button ? `<p style="margin:22px 0"><a href="${esc(e.button.url)}" style="display:inline-block;background:${sun};color:${header};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:16px">${esc(e.button.label)}</a></p>` : "";
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(e.heading)}</title></head>
<body style="margin:0;background:#f3f6fa;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(e.preheader || e.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 18px rgba(27,58,87,.08)">
<tr><td style="background:${header};padding:18px 24px;text-align:${align}">
<a href="${SITE_URL}" style="text-decoration:none;color:#ffffff"><img src="${esc(MAIL_LOGO)}" width="40" height="40" alt="" style="vertical-align:middle;border-radius:50%;border:2px solid ${sun};background:#fff">
<span style="vertical-align:middle;margin:0 10px;font-size:18px;font-weight:700;color:#ffffff">${esc(SITE_NAME)}</span></a>
</td></tr>
<tr><td style="height:4px;background:${sun}"></td></tr>
<tr><td dir="${dir}" style="padding:28px 26px 10px;text-align:${align}">
<h1 style="margin:0 0 16px;font-size:22px;color:${header}">${esc(e.heading)}</h1>${paras}${btn}
${e.note ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7a8c">${esc(e.note)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 26px 24px;border-top:1px solid #e6ebf1;font-size:13px;color:#6b7a8c;text-align:center">
${footerHtml(header)}
</td></tr></table></td></tr></table></body></html>`;
}

export function renderText(e: Branded) {
  return [e.heading, "", ...e.paragraphs, ...(e.button ? ["", `${e.button.label}: ${e.button.url}`] : []), ...(e.note ? ["", e.note] : []), "", "—", `${SITE_NAME} · ${SITE_URL}`, MAIL_FOOTER].join("\n");
}

export type Signature = { on: boolean; name: string; title: string; email: string; website: string; phone?: string; logo: boolean };
export let DEFAULT_SIG: Signature = { on: true, name: "Shaiq Muhammad", title: "Teacher", email: CONTACT, website: SITE_URL, logo: true };
export function parseSig(raw: string): Signature {
  try { const j = JSON.parse(raw); return { ...DEFAULT_SIG, ...j, on: j.on !== false, logo: j.logo !== false }; } catch { return DEFAULT_SIG; }
}
export function sigHtml(s: Signature): string {
  const site = s.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const sun = MAIL_SUN;
  const header = MAIL_HEADER;
  return `<table cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:3px solid ${sun};padding-top:12px;font-family:Segoe UI,Helvetica,Arial,sans-serif"><tr>${s.logo ? `<td style="padding-right:12px;vertical-align:top"><img src="${esc(MAIL_LOGO)}" width="54" height="54" alt="" style="border-radius:50%;border:2px solid ${sun};background:#fff"></td>` : ""}<td style="vertical-align:top;font-size:13px;line-height:1.5;color:${header}"><div style="font-size:16px;font-weight:800;color:#13283d">${esc(s.name)}</div>${s.title ? `<div style="color:#5b6b7b">${esc(s.title)}</div>` : ""}<div><a href="mailto:${esc(s.email)}" style="color:${header};font-weight:700;text-decoration:none">${esc(s.email)}</a>${s.phone ? ` · ${esc(s.phone)}` : ""}</div>${s.website ? `<div><a href="${esc(s.website)}" style="color:#c9971a;text-decoration:none;font-weight:700">${esc(site)}</a></div>` : ""}</td></tr></table>`;
}
export function sigText(s: Signature): string {
  return ["", "--", s.name, s.title, s.email + (s.phone ? ` · ${s.phone}` : ""), s.website].filter((x, i) => i < 2 || !!x).join("\n");
}
