/** Branded HTML email (navy + yellow, logo, footer with contact@). Inline styles only (email clients). */
export const SITE_URL = "https://www.shaiqmuhammad.com";
export const CONTACT = "contact@shaiqmuhammad.com";
export const INFO = "info@shaiqmuhammad.com";

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type Branded = { preheader?: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; rtl?: boolean; note?: string };

export function renderEmail(e: Branded) {
  const dir = e.rtl ? "rtl" : "ltr";
  const align = e.rtl ? "right" : "left";
  const paras = e.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#1f2d3d;white-space:pre-wrap">${esc(p)}</p>`).join("");
  const btn = e.button ? `<p style="margin:22px 0"><a href="${esc(e.button.url)}" style="display:inline-block;background:#f5c542;color:#1b3a57;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:16px">${esc(e.button.label)}</a></p>` : "";
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(e.heading)}</title></head>
<body style="margin:0;background:#f3f6fa;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(e.preheader || e.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 18px rgba(27,58,87,.08)">
<tr><td style="background:#1b3a57;padding:18px 24px;text-align:${align}">
<a href="${SITE_URL}" style="text-decoration:none;color:#ffffff"><img src="${SITE_URL}/logo.svg" width="40" height="40" alt="" style="vertical-align:middle;border-radius:50%;border:2px solid #f5c542;background:#fff">
<span style="vertical-align:middle;margin:0 10px;font-size:18px;font-weight:700;color:#ffffff">Shaiq Muhammad</span></a>
</td></tr>
<tr><td style="height:4px;background:#f5c542"></td></tr>
<tr><td dir="${dir}" style="padding:28px 26px 10px;text-align:${align}">
<h1 style="margin:0 0 16px;font-size:22px;color:#1b3a57">${esc(e.heading)}</h1>${paras}${btn}
${e.note ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7a8c">${esc(e.note)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 26px 24px;border-top:1px solid #e6ebf1;font-size:13px;color:#6b7a8c;text-align:center">
Questions? Write to <a href="mailto:${CONTACT}" style="color:#1b3a57;font-weight:700">${CONTACT}</a> · <a href="${SITE_URL}" style="color:#1b3a57">shaiqmuhammad.com</a>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderText(e: Branded) {
  return [e.heading, "", ...e.paragraphs, ...(e.button ? ["", `${e.button.label}: ${e.button.url}`] : []), ...(e.note ? ["", e.note] : []), "", "—", `Shaiq Muhammad · ${SITE_URL}`, `Questions: ${CONTACT}`].join("\n");
}

export type Signature = { on: boolean; name: string; title: string; email: string; website: string; phone?: string; logo: boolean };
export const DEFAULT_SIG: Signature = { on: true, name: "Shaiq Muhammad", title: "Teacher", email: CONTACT, website: SITE_URL, logo: true };
export function parseSig(raw: string): Signature {
  try { const j = JSON.parse(raw); return { ...DEFAULT_SIG, ...j, on: j.on !== false, logo: j.logo !== false }; } catch { return DEFAULT_SIG; }
}
export function sigHtml(s: Signature): string {
  const site = s.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `<table cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:3px solid #f5c542;padding-top:12px;font-family:Segoe UI,Helvetica,Arial,sans-serif"><tr>${s.logo ? `<td style="padding-right:12px;vertical-align:top"><img src="${SITE_URL}/logo.svg" width="54" height="54" alt="" style="border-radius:50%;border:2px solid #f5c542;background:#fff"></td>` : ""}<td style="vertical-align:top;font-size:13px;line-height:1.5;color:#1b3a57"><div style="font-size:16px;font-weight:800;color:#13283d">${esc(s.name)}</div>${s.title ? `<div style="color:#5b6b7b">${esc(s.title)}</div>` : ""}<div><a href="mailto:${esc(s.email)}" style="color:#1b3a57;font-weight:700;text-decoration:none">${esc(s.email)}</a>${s.phone ? ` · ${esc(s.phone)}` : ""}</div>${s.website ? `<div><a href="${esc(s.website)}" style="color:#c9971a;text-decoration:none;font-weight:700">${esc(site)}</a></div>` : ""}</td></tr></table>`;
}
export function sigText(s: Signature): string {
  return ["", "--", s.name, s.title, s.email + (s.phone ? ` · ${s.phone}` : ""), s.website].filter((x, i) => i < 2 || !!x).join("\n");
}
