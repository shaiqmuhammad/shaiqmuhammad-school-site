/** Live IMAP mailbox for contact@ (iCloud) + SMTP sending. No local cache: every call talks to iCloud. */
import { classifyParts, decodeTextPart, decodeTransfer, flattenStructure, parseEnvelope, withImap, type ImapAccount, type Tok } from "./imap";
import { latin1ToBytes } from "./socket";
import { buildMime, sendMail, type OutMail } from "./smtp";
import { CONTACT, INFO, renderEmail, renderText, type Branded } from "./template";

export interface MailEnv {
  ICLOUD_APPLE_ID?: string;
  ICLOUD_SMTP_USER?: string;
  ICLOUD_APP_PASSWORD?: string;
}

/** The Apple account also holds arabzmart.com + personal mail: the server only ever lists/opens mail to/from contact@shaiqmuhammad.com (IMAP SEARCH). */
const C = '"contact@shaiqmuhammad.com"';
const SCOPE = `OR OR OR OR TO ${C} CC ${C} FROM ${C} HEADER Delivered-To ${C} HEADER X-Original-To ${C}`;
export const mailReady = (env: MailEnv) => Boolean((env.ICLOUD_SMTP_USER || env.ICLOUD_APPLE_ID) && env.ICLOUD_APP_PASSWORD);
const imapAcct = (env: MailEnv): ImapAccount => ({ host: "imap.mail.me.com", port: 993, user: (env.ICLOUD_SMTP_USER || env.ICLOUD_APPLE_ID || ""), pass: env.ICLOUD_APP_PASSWORD || "" });
const smtpAcct = (env: MailEnv) => ({ host: "smtp.mail.me.com", port: 587, user: (env.ICLOUD_SMTP_USER || env.ICLOUD_APPLE_ID || ""), pass: env.ICLOUD_APP_PASSWORD || "" });

function bodyValue(map: Map<string, Tok>, part: string) {
  for (const [k, v] of map) if (k.startsWith(`BODY[${part}]`)) return typeof v === "string" ? v : "";
  return "";
}
function flags(t: Tok | undefined) {
  const f = (Array.isArray(t) ? t : []).map((x) => String(x).toLowerCase());
  return { seen: f.includes("\\seen"), flagged: f.includes("\\flagged"), answered: f.includes("\\answered") };
}
const fmt = (l: { name: string; addr: string }[]) => l.map((a) => (a.name ? `${a.name} <${a.addr}>` : a.addr)).join(", ");

export function sanitizeHtml(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|embed|applet|noscript|frameset|form|svg|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|iframe|object|embed|applet|frame|frameset|form|base|link|meta|svg)\b[^>]*>/gi, "")
    .replace(/\s(on[a-z]+|srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href|background|action)\s*=\s*(["']?)\s*(javascript|vbscript|data:text\/html)[^"'\s>]*/gi, "$1=$2#");
}

export async function folders(env: MailEnv) {
  return withImap(imapAcct(env), async (s) => {
    const list = await s.list();
    const out = [];
    for (const f of list) {
      try {
        await s.select(f.path, true);
        out.push({ path: f.path, name: f.name, total: (await s.uidSearch(SCOPE)).length, unread: (await s.uidSearch(`UNSEEN ${SCOPE}`)).length });
      } catch { out.push({ path: f.path, name: f.name, total: 0, unread: 0 }); }
    }
    const order = (n: string) => (/^inbox$/i.test(n) ? 0 : /sent/i.test(n) ? 1 : /draft/i.test(n) ? 2 : /junk|spam/i.test(n) ? 4 : /trash|deleted/i.test(n) ? 5 : 3);
    return out.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name));
  });
}

export async function unreadInbox(env: MailEnv) {
  return withImap(imapAcct(env), async (s) => {
    await s.select("INBOX", true);
    return (await s.uidSearch(`UNSEEN ${SCOPE}`)).length;
  });
}

export async function listMessages(env: MailEnv, folder: string, page = 0, size = 30) {
  return withImap(imapAcct(env), async (s) => {
    await s.select(folder, true);
    const uids = (await s.uidSearch(SCOPE)).reverse();
    const slice = uids.slice(page * size, page * size + size);
    if (!slice.length) return { total: uids.length, items: [] };
    const rows = await s.uidFetch(slice.join(","), "UID FLAGS INTERNALDATE RFC822.SIZE ENVELOPE BODYSTRUCTURE");
    const items = rows.map((m) => {
      const env2 = parseEnvelope(m.get("ENVELOPE") ?? undefined);
      const { files } = classifyParts(flattenStructure(m.get("BODYSTRUCTURE") ?? undefined));
      return { uid: Number(m.get("UID")), subject: env2.subject, from: fmt(env2.from), to: fmt(env2.to), date: env2.date || String(m.get("INTERNALDATE") || ""), attachments: files.filter((f) => !f.cid).length, ...flags(m.get("FLAGS") ?? undefined) };
    }).sort((a, b) => b.uid - a.uid);
    return { total: uids.length, items };
  });
}

export async function getMessage(env: MailEnv, folder: string, uid: number) {
  return withImap(imapAcct(env), async (s) => {
    await s.select(folder, false);
    if (!(await s.uidSearch(`UID ${uid} ${SCOPE}`)).includes(uid)) return null;
    const [m] = await s.uidFetch(String(uid), "UID FLAGS ENVELOPE BODYSTRUCTURE");
    if (!m) return null;
    const env2 = parseEnvelope(m.get("ENVELOPE") ?? undefined);
    const { html, plain, files } = classifyParts(flattenStructure(m.get("BODYSTRUCTURE") ?? undefined));
    const parts = [html?.part, plain?.part].filter(Boolean) as string[];
    let htmlBody = "", textBody = "";
    if (parts.length) {
      const [b] = await s.uidFetch(String(uid), `UID ${parts.map((p) => `BODY[${p}]<0.400000>`).join(" ")}`); // marks \Seen
      if (b) {
        if (html) htmlBody = sanitizeHtml(decodeTextPart(bodyValue(b, html.part), html));
        if (plain) textBody = decodeTextPart(bodyValue(b, plain.part), plain);
      }
    }
    return {
      uid, subject: env2.subject, from: fmt(env2.from), fromAddr: env2.from[0]?.addr || "", to: fmt(env2.to), cc: fmt(env2.cc), replyTo: fmt(env2.replyTo), date: env2.date, messageId: env2.messageId,
      html: htmlBody, text: textBody, attachments: files.map((f) => ({ part: f.part, filename: f.filename || `attachment-${f.part}`, mime: f.type, size: f.size })),
    };
  });
}

export async function getPart(env: MailEnv, folder: string, uid: number, part: string) {
  return withImap(imapAcct(env), async (s) => {
    await s.select(folder, true);
    if (!(await s.uidSearch(`UID ${uid} ${SCOPE}`)).includes(uid)) return null;
    const [m] = await s.uidFetch(String(uid), "UID BODYSTRUCTURE");
    const info = flattenStructure(m?.get("BODYSTRUCTURE") ?? undefined).find((p) => p.part === part);
    if (!info) return null;
    const [b] = await s.uidFetch(String(uid), `UID BODY.PEEK[${part}]`);
    return { bytes: latin1ToBytes(decodeTransfer(b ? bodyValue(b, part) : "", info.encoding)), mime: info.type || "application/octet-stream", filename: info.filename || `attachment-${part}` };
  });
}

export async function setSeen(env: MailEnv, folder: string, uids: number[], seen: boolean) {
  return withImap(imapAcct(env), async (s) => { await s.select(folder); await s.store(uids, seen ? "+" : "-", ["\\Seen"]); });
}

/** Personal mail from contact@ (compose/reply); a copy is saved to Sent. */
export async function sendPersonal(env: MailEnv, m: { to: string[]; cc?: string[]; subject: string; text: string; inReplyTo?: string; attachments?: OutMail["attachments"] }) {
  const html = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap">${m.text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</div>`;
  const { raw } = await sendMail(smtpAcct(env), { from: CONTACT, fromName: "Shaiq Muhammad", to: m.to, cc: m.cc, subject: m.subject, text: m.text, html, attachments: m.attachments, headers: m.inReplyTo ? { "In-Reply-To": m.inReplyTo, References: m.inReplyTo } : undefined });
  await withImap(imapAcct(env), async (s) => {
    const sent = (await s.list()).find((f) => f.flags.includes("\\sent") || /^sent( messages)?$/i.test(f.name));
    if (sent) await s.append(sent.path, raw);
  }).catch(() => undefined);
}

/** Automatic, no-reply style mail from info@ with Reply-To contact@. Silently skipped when mail isn't configured. */
export async function sendAuto(env: MailEnv, to: string | string[], subject: string, e: Branded): Promise<boolean> {
  if (!mailReady(env)) return false;
  const list = (Array.isArray(to) ? to : [to]).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if (!list.length) return false;
  await sendMail(smtpAcct(env), { from: INFO, fromName: "Shaiq Muhammad (no-reply)", to: list, replyTo: CONTACT, subject, text: renderText(e), html: renderEmail(e) });
  return true;
}

/** Contact-form message -> placed straight into contact@'s INBOX (unread) via IMAP APPEND.
 * (SMTP from our own account to itself is filed as Junk by iCloud.) Reply-To = the sender. */
export async function sendToContact(env: MailEnv, m: { name: string; email: string; subject: string; message: string }) {
  const raw = buildMime({
    from: INFO, fromName: `${m.name.replace(/[",:;<>@]/g, " ").slice(0, 60)} (website)`, to: [CONTACT], replyTo: m.email,
    subject: `[Contact] ${m.subject || "New message"}`.slice(0, 200),
    text: `From: ${m.name} <${m.email}>\n\n${m.message}`,
    html: renderEmail({ heading: m.subject || "New contact message", paragraphs: [`From: ${m.name} <${m.email}>`, m.message], note: "Reply to this email to answer the sender directly." }),
  });
  await withImap(imapAcct(env), (s) => s.append("INBOX", raw, []));
}
