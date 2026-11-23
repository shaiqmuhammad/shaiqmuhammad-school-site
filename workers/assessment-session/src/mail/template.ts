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
  // One pass, so the website name inside contact@… is not linked a second time.
  const contact = CONTACT ? esc(CONTACT) : "";
  const host = esc(siteLabel());
  const keys = [contact, host].filter(Boolean).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const text = esc(MAIL_FOOTER);
  if (!keys.length) return text;
  return text.replace(new RegExp(keys.join("|"), "g"), (m) =>
    m === contact
      ? `<a class="em-link" href="mailto:${m}" style="color:${color};font-weight:700">${m}</a>`
      : `<a class="em-link" href="${esc(SITE_URL)}" style="color:${color}">${m}</a>`);
}

const FONT = "Segoe UI,Helvetica,Arial,sans-serif";
const INK = "#1f2d3d";
const MUTED = "#5b6b7b";

/** Dark-mode overrides for mail apps that honour prefers-color-scheme (Apple Mail, iOS, Outlook.com, Gmail app). Inline styles stay as the light fallback. */
const DARK_CSS = "@media (prefers-color-scheme:dark){.em-bg{background:#0e1722!important}.em-card{background:#162231!important}.em-text{color:#e8eef5!important}.em-muted{color:#a6b5c5!important}.em-h{color:#f5c542!important}.em-rule{border-color:#2b3b4d!important}.em-fact{background:#1c2c3d!important}.em-link{color:#f5c542!important}.em-name{color:#ffffff!important}}";

function head(title: string, dir: string) {
  return `<!doctype html><html dir="${dir}" lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(title)}</title><style>${DARK_CSS}</style></head>`;
}

/** The signature at the end of every branded email: logo, school name, contact@ and website link. */
export function brandSignature(rtl = false): string {
  const header = MAIL_HEADER;
  const sun = MAIL_SUN;
  const align = rtl ? "right" : "left";
  const site = esc(siteLabel());
  const pad = rtl ? "padding-left:12px" : "padding-right:12px";
  return `<table role="presentation" cellpadding="0" cellspacing="0" class="em-rule" style="margin-top:22px;border-top:3px solid ${sun};padding-top:14px;font-family:${FONT};width:100%"><tr><td style="${pad};vertical-align:top;width:52px"><img src="${esc(MAIL_LOGO)}" width="48" height="48" alt="" style="display:block;border-radius:50%;border:2px solid ${sun};background:#ffffff"></td><td style="vertical-align:top;text-align:${align};font-size:13px;line-height:1.55;color:${MUTED}" class="em-muted"><div class="em-name" style="font-size:16px;font-weight:800;color:${header}">${esc(SITE_NAME)}</div>${CONTACT ? `<div><a class="em-link" href="mailto:${esc(CONTACT)}" style="color:${header};font-weight:700;text-decoration:none">${esc(CONTACT)}</a></div>` : ""}<div><a class="em-link" href="${esc(SITE_URL)}" style="color:#8a6200;font-weight:700;text-decoration:none">${site}</a></div></td></tr></table>`;
}

function brandHeader(rtl: boolean) {
  const align = rtl ? "right" : "left";
  return `<tr><td style="background:${MAIL_HEADER};padding:18px 24px;text-align:${align}">
<a href="${esc(SITE_URL)}" style="text-decoration:none;color:#ffffff"><img src="${esc(MAIL_LOGO)}" width="40" height="40" alt="" style="vertical-align:middle;border-radius:50%;border:2px solid ${MAIL_SUN};background:#fff">
<span style="vertical-align:middle;margin:0 10px;font-size:18px;font-weight:700;color:#ffffff">${esc(SITE_NAME)}</span></a>
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${MAIL_SUN}">&nbsp;</td></tr>`;
}

function brandFooter() {
  return `<tr><td class="em-rule em-muted" style="padding:18px 26px 24px;border-top:1px solid #e6ebf1;font-size:13px;line-height:1.5;color:#5b6b7b;text-align:center">${footerHtml(MAIL_HEADER)}</td></tr>`;
}

function shell(title: string, dir: string, preheader: string, inner: string) {
  return `${head(title, dir)}
<body class="em-bg" style="margin:0;background:#f3f6fa;font-family:${FONT}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" style="background:#f3f6fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-card" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 18px rgba(27,58,87,.08)">
${inner}
</table></td></tr></table></body></html>`;
}

export type Fact = { label: string; value: string };
export type Branded = { preheader?: string; heading: string; paragraphs: string[]; facts?: Fact[]; button?: { label: string; url: string }; rtl?: boolean; note?: string; signature?: boolean };

function factsHtml(facts: Fact[], align: string) {
  const rows = facts.map((f) => `<tr><td class="em-muted" style="padding:6px 12px 6px 0;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap;text-align:${align}">${esc(f.label)}</td><td class="em-text" style="padding:6px 0;font-size:15px;color:${INK};text-align:${align};word-break:break-word">${esc(f.value)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-fact" style="margin:0 0 18px;background:#f3f6fa;border-radius:12px;border-left:4px solid ${MAIL_SUN}"><tr><td style="padding:10px 16px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table></td></tr></table>`;
}

export function renderEmail(e: Branded) {
  const dir = e.rtl ? "rtl" : "ltr";
  const align = e.rtl ? "right" : "left";
  const header = MAIL_HEADER;
  const sun = MAIL_SUN;
  const paras = e.paragraphs.map((p) => `<p class="em-text" style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(p)}</p>`).join("");
  const btn = e.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:${sun};border-radius:999px"><a href="${esc(e.button.url)}" style="display:inline-block;background:${sun};color:${header};font-weight:700;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:16px">${esc(e.button.label)}</a></td></tr></table>` : "";
  const inner = `${brandHeader(!!e.rtl)}
<tr><td dir="${dir}" style="padding:28px 26px 8px;text-align:${align}">
<h1 class="em-h" style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${header}">${esc(e.heading)}</h1>${e.facts?.length ? factsHtml(e.facts, align) : ""}${paras}${btn}
${e.note ? `<p class="em-muted" style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#5b6b7b">${esc(e.note)}</p>` : ""}
</td></tr>
${e.signature === false ? "" : `<tr><td dir="${dir}" style="padding:0 26px 22px">${brandSignature(!!e.rtl)}</td></tr>`}
${brandFooter()}`;
  return shell(e.heading, dir, e.preheader || e.heading, inner);
}

export function renderText(e: Branded) {
  return [
    e.heading, "",
    ...(e.facts?.length ? [...e.facts.map((f) => `${f.label}: ${f.value}`), ""] : []),
    ...e.paragraphs,
    ...(e.button ? ["", `${e.button.label}: ${e.button.url}`] : []),
    ...(e.note ? ["", e.note] : []),
    ...(e.signature === false ? [] : ["", "--", SITE_NAME, ...(CONTACT ? [CONTACT] : []), SITE_URL]),
    "", MAIL_FOOTER,
  ].join("\n");
}

/** New enquiry shown to the team: who wrote, how to answer, the message itself. */
export function enquiryMail(m: { name: string; email: string; subject: string; message: string }): Branded {
  return {
    heading: m.subject || "New enquiry",
    preheader: `${m.name}: ${m.message.replace(/\s+/g, " ").slice(0, 90)}`,
    facts: [{ label: "From", value: m.name }, { label: "Email", value: m.email }],
    paragraphs: [m.message],
    button: { label: "Reply to " + m.name.split(" ")[0], url: `mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "your message"))}` },
    note: "Replying to this email answers the sender directly.",
    signature: false,
  };
}

/** Personal mail (compose / reply / forward): the same branded frame around the written text and the sender's signature. */
export function renderPersonalEmail(m: { subject: string; text: string; sigHtml?: string }) {
  const body = `<tr><td style="padding:26px 26px 6px;text-align:left"><div class="em-text" style="font-size:16px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(m.text)}</div>${m.sigHtml ? `<div style="margin-top:6px">${m.sigHtml}</div>` : ""}</td></tr><tr><td style="height:18px;line-height:18px;font-size:0">&nbsp;</td></tr>`;
  const pre = m.text.replace(/\s+/g, " ").trim().slice(0, 110) || m.subject;
  return shell(m.subject || SITE_NAME, "ltr", pre, `${brandHeader(false)}\n${body}\n${brandFooter()}`);
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
  return `<table cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:3px solid ${sun};padding-top:12px;font-family:Segoe UI,Helvetica,Arial,sans-serif"><tr>${s.logo ? `<td style="padding-right:12px;vertical-align:top"><img src="${esc(MAIL_LOGO)}" width="54" height="54" alt="" style="border-radius:50%;border:2px solid ${sun};background:#fff"></td>` : ""}<td class="em-muted" style="vertical-align:top;font-size:13px;line-height:1.5;color:${header}"><div class="em-name" style="font-size:16px;font-weight:800;color:#13283d">${esc(s.name)}</div>${s.title ? `<div class="em-muted" style="color:#5b6b7b">${esc(s.title)}</div>` : ""}<div><a class="em-link" href="mailto:${esc(s.email)}" style="color:${header};font-weight:700;text-decoration:none">${esc(s.email)}</a>${s.phone ? ` · ${esc(s.phone)}` : ""}</div>${s.website ? `<div><a class="em-link" href="${esc(s.website)}" style="color:#8a6200;text-decoration:none;font-weight:700">${esc(site)}</a></div>` : ""}</td></tr></table>`;
}
export function sigText(s: Signature): string {
  return ["", "--", s.name, s.title, s.email + (s.phone ? ` · ${s.phone}` : ""), s.website].filter((x, i) => i < 2 || !!x).join("\n");
}
